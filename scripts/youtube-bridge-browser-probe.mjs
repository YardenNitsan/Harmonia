// Isolated browser integration test. No remote SDK, app launch, IPC or product mutation.
// Run: node scripts/youtube-bridge-browser-probe.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const reportPath = resolve(root, 'docs/review-evidence/youtube-bridge-browser-probe.json');
const configBytes = await readFile(resolve(root, 'apps/desktop/src-tauri/tauri.conf.json'));
const originalPolicy = JSON.parse(configBytes).app.security.csp;
const policy = (value) =>
  Object.entries(value)
    .map(([key, rule]) => `${key} ${rule}`)
    .join('; ');
const modules = new Map();
const sources = {};
for (const name of ['youtube', 'youtube-bridge-protocol', 'youtube-bridge', 'youtube-endpoint']) {
  const path = `packages/providers/${name}.ts`;
  const source = await readFile(resolve(root, path), 'utf8');
  const compiled = ts.transpileModule(source, {
    fileName: `${name}.ts`,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  assert.equal(
    compiled.diagnostics.filter((d) => d.category === ts.DiagnosticCategory.Error).length,
    0,
  );
  modules.set(`/${name}`, ['text/javascript', compiled.outputText]);
  sources[path] = { source_sha256: sha256(source), module_sha256: sha256(compiled.outputText) };
}
for (const name of ['parent', 'child']) {
  const path = `scripts/fixtures/youtube-bridge-${name}.mjs`;
  const source = await readFile(resolve(root, path), 'utf8');
  sources[path] = { source_sha256: sha256(source) };
  modules.set(`/${name}.mjs`, ['text/javascript', source]);
}
const report = {
  purpose: 'Actual cross-origin iframe/postMessage with real bridge and injected deterministic SDK',
  started_at: new Date().toISOString(),
  passed: false,
  product_embedding_gate_passed: false,
  limitations: [
    'Unchanged production CSP blocks embedding; candidate policy is test-only.',
    'Headless Chrome HTTP loopback origins, not native custom-protocol iframe ACL validation.',
    'SDK is deterministic: no live provider, audible playback, client identity or release acceptance.',
    'Fixture pagehide hook disposes the endpoint on navigation/removal; future host must supply it.',
    'Session tokens bind stale messages, not trust in the isolated remote SDK context.',
  ],
  sources,
  probe_source_sha256: sha256(await readFile(import.meta.filename)),
  production_config_sha256: sha256(configBytes),
  typescript_version: ts.version,
  node_version: process.version,
  checks: [],
  page_errors: [],
  unexpected_network: [],
  cleanup_errors: [],
};
let parentOrigin, childOrigin, candidatePolicy, endpointPolicy;
const baselinePolicy = policy(originalPolicy);
const assetsSeen = {};
const html = (role) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Bridge test ${role}</title></head><body data-child-origin="${childOrigin}" data-parent-origin="${parentOrigin}"><script type="module" src="/${role}.mjs"></script></body></html>`;
function serverFor(role) {
  return createServer((request, response) => {
    let asset;
    if (request.method === 'GET') {
      asset = modules.get(request.url);
      if (request.url === '/parent.html' || request.url === '/baseline.html')
        asset = role === 'parent' ? ['text/html', html('parent')] : undefined;
      if (request.url === '/child.html')
        asset = role === 'child' ? ['text/html', html('child')] : undefined;
      if (request.url === '/blank.html')
        asset = ['text/html', '<!doctype html><title>Inert test document</title>'];
    }
    response.setHeader(
      'Content-Security-Policy',
      role === 'child'
        ? endpointPolicy
        : request.url === '/baseline.html'
          ? baselinePolicy
          : candidatePolicy,
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (!asset) {
      response.writeHead(404).end();
      return;
    }
    assetsSeen[`${role}${request.url}`] = sha256(asset[1]);
    response.setHeader('Content-Type', `${asset[0]}; charset=utf-8`);
    response.end(asset[1]);
  });
}
const parentServer = serverFor('parent'),
  childServer = serverFor('child');
const listen = (server) =>
  new Promise((yes, no) => {
    server.once('error', no);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', no);
      yes(`http://127.0.0.1:${server.address().port}`);
    });
  });
let browser;
const closeServer = (server) =>
  new Promise((yes, no) => {
    if (!server.listening) return yes();
    server.closeAllConnections();
    server.close((error) => (error ? no(error) : yes()));
  });
try {
  parentOrigin = await listen(parentServer);
  childOrigin = await listen(childServer);
  candidatePolicy = policy({ ...originalPolicy, 'frame-src': `'self' ${childOrigin}` });
  endpointPolicy = `default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; frame-ancestors ${parentOrigin}; base-uri 'none'; object-src 'none'; form-action 'none'`;
  report.policies = Object.fromEntries(
    Object.entries({
      baseline: baselinePolicy,
      candidate: candidatePolicy,
      endpoint: endpointPolicy,
    }).map(([key, value]) => [key, { value, sha256: sha256(value) }]),
  );
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  report.browser_version = browser.version();
  const context = await browser.newContext();
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if ([parentOrigin, childOrigin].includes(url.origin)) return route.continue();
    report.unexpected_network.push(url.href);
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', (error) => report.page_errors.push(error.message));
  const check = (name) => report.checks.push(name);
  await page.goto(`${parentOrigin}/baseline.html`);
  await page.waitForFunction(() => probe.violations.some((v) => v.directive === 'frame-src'));
  report.baseline_embedding = await page.evaluate(() => ({
    violations: probe.violations,
    state: readState(),
  }));
  assert.equal(report.baseline_embedding.state.available, false);
  check(
    'Unchanged production CSP rejects cross-origin child; product embedding gate remains false',
  );

  const fresh = async (load = true) => {
    await page.goto(`${parentOrigin}/parent.html`);
    await page.waitForFunction(() => Boolean(window.provider));
    const child = await page.locator('iframe').contentFrame();
    await child.locator('body').waitFor();
    const frame = page
      .frames()
      .find((entry) => entry.url().startsWith(`${childOrigin}/child.html`));
    assert.ok(frame);
    await frame.waitForFunction(() => probe.ready);
    if (load) await page.evaluate(() => provider.load('M7lc1UVf-VE'));
    return frame;
  };
  let child = await fresh();
  assert.deepEqual(await page.evaluate(() => readState()), {
    status: 'ready',
    available: true,
    playing: false,
    position: 0,
    duration: 120,
    error: null,
  });
  assert.equal(await child.evaluate(() => probe.options.origin), childOrigin);
  await page.evaluate(() => provider.play());
  await page.waitForFunction(() => provider.playing && provider.position > 0.2);
  await page.evaluate(() => provider.pause());
  await page.waitForFunction(() => provider.status === 'paused');
  await page.evaluate(() => provider.seek(12));
  await page.waitForFunction(() => provider.position === 12);
  check('Cross-origin load, actual PLAYING acknowledgement, clock, duration, pause and seek');

  const binding = await page.evaluate(() => probe.sent.find((m) => m.op === 'load'));
  const fakeSnapshot = {
    protocol: binding.protocol,
    session: binding.session,
    generation: binding.generation,
    kind: 'snapshot',
    snapshot: {
      sequence: 999999,
      status: 'playing',
      available: true,
      position: 99,
      duration: 120,
      error: null,
    },
  };
  const childSend = async (messages) =>
    child.evaluate(
      ({ messages, target }) => {
        for (const message of messages) parent.postMessage(message, target);
      },
      { messages, target: parentOrigin },
    );
  await childSend([
    '{',
    'x'.repeat(2049),
    JSON.stringify({ ...fakeSnapshot, extra: true }),
    JSON.stringify({ ...fakeSnapshot, session: '00000000-0000-4000-8000-000000000001' }),
    JSON.stringify({ ...fakeSnapshot, generation: '00000000-0000-4000-8000-000000000002' }),
    JSON.stringify({ ...fakeSnapshot, snapshot: { ...fakeSnapshot.snapshot, position: Infinity } }),
    JSON.stringify({ ...fakeSnapshot, snapshot: { ...fakeSnapshot.snapshot, sequence: 1 } }),
  ]);
  await page.evaluate(() => provider.seek(13));
  await page.waitForFunction(() => provider.position === 13);
  check(
    'Pinned child cannot inject malformed, oversized, extra-key, wrong-session, stale-generation, invalid-clock or old-sequence snapshots',
  );

  // Real sibling window, correct endpoint origin, wrong WindowProxy identity.
  await page.evaluate((origin) => {
    const attack = document.createElement('iframe');
    attack.id = 'attacker';
    attack.src = origin + '/blank.html';
    document.body.append(attack);
  }, childOrigin);
  await page.locator('#attacker').contentFrame().locator('body').waitFor();
  const attacker = page.frames().find((frame) => frame.url() === `${childOrigin}/blank.html`);
  assert.ok(attacker);
  await attacker.evaluate(({ message, target }) => parent.postMessage(message, target), {
    message: JSON.stringify(fakeSnapshot),
    target: parentOrigin,
  });
  await page.evaluate(() => provider.seek(14));
  await page.waitForFunction(() => provider.position === 14);
  assert.ok(
    await page.evaluate(
      (origin) => probe.received.some((e) => e.origin === origin && !e.expectedSource),
      childOrigin,
    ),
  );
  check('Correct-origin sibling snapshot rejected by source identity');

  // Endpoint receives a correct-parent-origin message from the wrong sibling source.
  await page.evaluate((origin) => {
    const f = document.createElement('iframe');
    f.id = 'parent-attacker';
    f.src = origin + '/blank.html';
    document.body.append(f);
  }, parentOrigin);
  await page.locator('#parent-attacker').contentFrame().locator('body').waitFor();
  const parentAttacker = page.frames().find((f) => f.url() === `${parentOrigin}/blank.html`);
  const forgedSeek = JSON.stringify({
    ...binding,
    op: 'seek',
    videoId: undefined,
    id: 1000000,
    seconds: 99,
  });
  await parentAttacker.evaluate(
    ({ message, target }) => parent.playerFrame.contentWindow.postMessage(message, target),
    { message: forgedSeek, target: childOrigin },
  );
  await child.evaluate(({ message, target }) => window.postMessage(message, target), {
    message: forgedSeek,
    target: childOrigin,
  });
  await page.evaluate(
    ({ message, target }) => playerFrame.contentWindow.postMessage(message, target),
    { message: 'x'.repeat(2049), target: childOrigin },
  );
  await page.evaluate(() => provider.seek(15));
  await page.waitForFunction(() => provider.position === 15);
  assert.ok(
    await child.evaluate(
      (origin) => probe.received.some((e) => e.origin === origin && !e.expectedSource),
      parentOrigin,
    ),
  );
  check(
    'Endpoint rejects same-origin wrong source, wrong-origin sender and oversized requests without poisoning request IDs',
  );

  await child.evaluate(() => {
    probe.holdPlay = true;
  });
  await page.evaluate(() => {
    window.pendingPlay = provider.play().then(
      () => 'resolved',
      (e) => e.code,
    );
  });
  await child.waitForFunction(() => probe.playAttempts === 2);
  await page.evaluate(() => provider.load('abcdefghijk'));
  assert.equal(await page.evaluate(() => pendingPlay), 'cancelled');
  await childSend([JSON.stringify(fakeSnapshot)]);
  await page.evaluate(() => provider.seek(16));
  await page.waitForFunction(() => provider.position === 16);
  assert.equal(await child.evaluate(() => probe.destroyed), 1);
  check('Replacement cancels pending play, destroys old SDK instance and rejects prior generation');
  await page.evaluate(() => provider.dispose());
  await child.waitForFunction(() => probe.destroyed === probe.created && probe.listeners === 0);
  assert.equal(await page.evaluate(() => probe.listeners), 0);
  check('Explicit disposal removes both bridge listeners and destroys owned SDK player');

  child = await fresh();
  await page.evaluate(() => provider.play());
  await page.evaluate(() => {
    probe.dropOutgoing = true;
  });
  await child.waitForFunction(() => probe.destroyed === 1 && probe.listeners === 0, null, {
    timeout: 8000,
  });
  await page.waitForFunction(() => provider.error?.code === 'offline');
  assert.equal(await child.evaluate(() => probe.playing), false);
  check(
    'Parent transport disappearance expires endpoint lease, pauses/destroys player and reports offline',
  );

  child = await fresh();
  await child.evaluate(() => {
    probe.holdPlay = true;
  });
  await page.evaluate(() => {
    window.pendingPlay = provider.play().then(
      () => 'resolved',
      (e) => e.code,
    );
    probe.dropOutgoing = true;
  });
  await child.waitForFunction(() => probe.destroyed === 1 && probe.listeners === 0, null, {
    timeout: 8000,
  });
  assert.equal(await page.evaluate(() => pendingPlay), 'offline');
  check('Lease disposal also rejects a pending PLAYING acknowledgement');

  child = await fresh(false);
  await child.evaluate(() => {
    probe.holdReady = true;
  });
  await page.evaluate(() => {
    window.pendingLoad = provider.load('M7lc1UVf-VE').then(
      () => 'resolved',
      (e) => e.code,
    );
    probe.dropOutgoing = true;
  });
  await child.waitForFunction(() => probe.created === 1);
  await child.waitForFunction(() => probe.destroyed === 1 && probe.listeners === 0, null, {
    timeout: 8000,
  });
  assert.equal(await page.evaluate(() => pendingLoad), 'offline');
  check('Lease expiry destroys pending SDK initialization and rejects pending load');

  child = await fresh();
  await page.evaluate(() => provider.play());
  // Same WindowProxy navigates to the parent's origin. Source still matches,
  // origin does not: this independently tests the origin half of the contract.
  const navigationBinding = await page.evaluate(() => probe.sent.find((m) => m.op === 'load'));
  const navigationSpoof = {
    ...fakeSnapshot,
    session: navigationBinding.session,
    generation: navigationBinding.generation,
  };
  await child.evaluate(() => {
    probe.dropOutgoing = true;
  });
  await child.goto(`${parentOrigin}/blank.html`);
  await child.evaluate(({ message, target }) => parent.postMessage(message, target), {
    message: JSON.stringify(navigationSpoof),
    target: parentOrigin,
  });
  await page.waitForFunction(() =>
    probe.received.some((e) => e.origin === location.origin && e.expectedSource),
  );
  await page.waitForFunction(() => probe.lifecycle.length > 0);
  const navigated = await page.evaluate(() => ({ lifecycle: probe.lifecycle, state: readState() }));
  assert.equal(navigated.lifecycle[0].playing, false);
  assert.equal(navigated.lifecycle[0].destroyed, 1);
  assert.notEqual(navigated.state.position, 99);
  assert.equal(navigated.state.available, true);
  await page.waitForFunction(() => provider.error?.code === 'offline');
  check(
    'Child navigation stops playback via lifecycle hook; same source with wrong origin rejected',
  );

  child = await fresh();
  await page.evaluate(() => provider.play());
  await page.evaluate(() => playerFrame.remove());
  await page.waitForFunction(() => probe.lifecycle.length > 0);
  const removed = await page.evaluate(() => probe.lifecycle[0]);
  assert.equal(removed.destroyed, 1);
  assert.equal(removed.playing, false);
  await page.waitForFunction(() => provider.error?.code === 'offline');
  check('Iframe disappearance invokes host disposal and leaves proxy offline');
  await page.evaluate(() => provider.dispose());
  assert.equal(await page.evaluate(() => probe.listeners), 0);
  assert.deepEqual(report.page_errors, []);
  assert.deepEqual(report.unexpected_network, []);
  assert.equal(
    sha256(await readFile(resolve(root, 'apps/desktop/src-tauri/tauri.conf.json'))),
    report.production_config_sha256,
  );
  report.passed = true;
} catch (error) {
  report.error = { message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  for (const [name, close] of [
    ['browser', () => browser?.close()],
    ['parent_server', () => closeServer(parentServer)],
    ['child_server', () => closeServer(childServer)],
  ]) {
    try {
      await close();
    } catch (error) {
      report.cleanup_errors.push({ name, message: error.message });
    }
  }
  report.fixed_assets_sha256 = assetsSeen;
  report.cleanup = {
    browser_closed: !browser?.isConnected(),
    parent_server_closed: !parentServer.listening,
    child_server_closed: !childServer.listening,
  };
  if (report.cleanup_errors.length || Object.values(report.cleanup).some((value) => !value)) {
    report.passed = false;
    process.exitCode = 1;
  }
  report.finished_at = new Date().toISOString();
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      passed: report.passed,
      product_embedding_gate_passed: false,
      checks: report.checks.length,
      report: reportPath,
      error: report.error?.message,
      cleanup: report.cleanup,
    }),
  );
}
