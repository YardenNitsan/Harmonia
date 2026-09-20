// Explicit live-network diagnostic. No Harmonia app, IPC, library or credentials.
// Run: node scripts/youtube-provider-probe.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const reportPath = resolve(root, 'docs/review-evidence/youtube-adapter-probe.json');
const source = await readFile(resolve(root, 'packages/providers/youtube.ts'), 'utf8');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const compiled = ts.transpileModule(source, {
  fileName: 'youtube.ts',
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  reportDiagnostics: true,
});
assert.equal(
  compiled.diagnostics?.filter((entry) => entry.category === ts.DiagnosticCategory.Error).length,
  0,
  'Adapter transpilation must succeed',
);
const csp = [
  "default-src 'none'",
  "script-src 'self' https://www.youtube.com https://s.ytimg.com",
  'frame-src https://www.youtube.com',
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://www.youtube.com",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');
const boot = `
import { YouTubeProvider } from '/youtube.mjs';
const probe = window.probe = {
  ready: false, playConfirmed: false, errors: [], sdkStates: [], cspViolations: [],
  userGesture: null, muted: false,
};
document.addEventListener('securitypolicyviolation', event => {
  probe.cspViolations.push({ directive: event.effectiveDirective, blocked: event.blockedURI });
});
const failure = (via, error) => {
  probe.errors.push({ via, code: error.code ?? null, sdkCode: error.sdkCode ?? null, message: error.message });
};
window.onYouTubeIframeAPIReady = async () => {
  try {
    const provider = window.provider = new YouTubeProvider((host, options) => {
      window.sdkPlayer = new YT.Player(host, {
        ...options,
        events: {
          ...options.events,
          onStateChange: event => {
            probe.sdkStates.push(event.data);
            options.events.onStateChange(event);
          },
        },
      });
      return window.sdkPlayer;
    }, { origin: location.origin });
    provider.onError(error => failure('subscription', error));
    await provider.load('M7lc1UVf-VE', document.querySelector('#player'));
    sdkPlayer.mute();
    probe.muted = sdkPlayer.isMuted();
    probe.ready = true;
    document.querySelector('#play').disabled = false;
  } catch (error) { failure('load', error); }
};
document.querySelector('#play').onclick = async event => {
  probe.userGesture = { trusted: event.isTrusted, active: navigator.userActivation.isActive };
  try { await provider.play(); probe.playConfirmed = true; }
  catch (error) { failure('play', error); }
};
const sdk = document.createElement('script');
sdk.src = 'https://www.youtube.com/iframe_api';
sdk.onerror = () => failure('sdk', new Error('Official YouTube SDK failed to load.'));
document.head.append(sdk);
`;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Isolated YouTube adapter probe</title></head><body>
<h1>Official public player</h1><div id="player"></div><button id="play" disabled>Play</button>
<script type="module" src="/boot.mjs"></script></body></html>`;
const assets = new Map([
  ['/', ['text/html; charset=utf-8', html]],
  ['/boot.mjs', ['text/javascript; charset=utf-8', boot]],
  ['/youtube.mjs', ['text/javascript; charset=utf-8', compiled.outputText]],
]);
const report = {
  purpose: 'Live official YouTube IFrame SDK through the actual injected Harmonia adapter',
  limitations: [
    'Isolated headless installed Chrome, not Harmonia UI or the native desktop shell',
    'Muted control/clock validation, not audible playback validation',
    'One official public sample; failure branches are covered separately by adapter unit tests',
    'No analysis, audio capture, offline copying, credentials, catalog search or user library',
  ],
  video: 'M7lc1UVf-VE',
  sample_source: 'https://developers.google.com/youtube/iframe_api_reference',
  adapter_source: 'packages/providers/youtube.ts',
  adapter_source_sha256: sha256(source),
  adapter_module_sha256: sha256(compiled.outputText),
  probe_source_sha256: sha256(await readFile(import.meta.filename)),
  typescript_version: ts.version,
  node_version: process.version,
  started_at: new Date().toISOString(),
  passed: false,
  csp,
  requests_failed: [],
  page_errors: [],
  cleanup_errors: [],
};
const server = createServer((request, response) => {
  const asset = request.method === 'GET' ? assets.get(request.url) : undefined;
  response.setHeader('Content-Security-Policy', csp);
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-store');
  if (!asset) {
    response.writeHead(404).end();
    return;
  }
  response.setHeader('Content-Type', asset[0]);
  response.end(asset[1]);
});
let browser;
let page;
try {
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  report.origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  report.browser_version = browser.version();
  page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  page.on('pageerror', (error) => report.page_errors.push(error.message));
  page.on('requestfailed', (request) => {
    if (report.requests_failed.length < 30)
      report.requests_failed.push({
        host: new URL(request.url()).hostname,
        error: request.failure()?.errorText,
      });
  });
  await page.goto(report.origin, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForFunction(() => window.probe?.ready || window.probe?.errors.length, null, {
    timeout: 25000,
  });
  report.ready = await page.evaluate(() => ({
    ready: probe.ready,
    available: provider.available,
    status: provider.status,
    capabilities: provider.capabilities,
    errors: probe.errors,
  }));
  assert.equal(report.ready.ready, true, 'Adapter must resolve load');
  assert.equal(report.ready.available, true);
  assert.equal(report.ready.status, 'ready');
  assert.equal(report.ready.capabilities.rawAnalysisAvailable, false);
  assert.equal(report.ready.capabilities.offlineAvailable, false);
  assert.deepEqual(report.ready.errors, []);
  report.frame = await page.locator('iframe').boundingBox();
  assert.ok(report.frame?.width >= 480 && report.frame.height >= 270);
  assert.ok(await page.locator('iframe').isVisible());
  // SDK commands are asynchronous; wait for its mute acknowledgement before play.
  await page.waitForFunction(() => sdkPlayer.isMuted(), null, { timeout: 5000 });
  await page.evaluate(() => {
    probe.muted = sdkPlayer.isMuted();
  });

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(() => probe.playConfirmed || probe.errors.length, null, {
    timeout: 20000,
  });
  report.play = await page.evaluate(() => ({
    confirmed: probe.playConfirmed,
    playing: provider.playing,
    gesture: probe.userGesture,
    muted: probe.muted,
    initialPosition: provider.position,
    errors: probe.errors,
  }));
  assert.equal(report.play.confirmed, true);
  assert.equal(report.play.playing, true);
  assert.equal(report.play.muted, true);
  assert.deepEqual(report.play.gesture, { trusted: true, active: true });
  assert.deepEqual(report.play.errors, []);
  await page.waitForFunction(
    (start) => provider.position > start + 0.5,
    report.play.initialPosition,
    {
      timeout: 7000,
    },
  );
  report.clock = await page.evaluate(() => ({
    position: provider.position,
    duration: provider.duration,
  }));
  assert.ok(Number.isFinite(report.clock.duration) && report.clock.duration > 5);
  await page.evaluate(() => provider.pause());
  await page.waitForFunction(() => provider.status === 'paused', null, { timeout: 5000 });
  const pausedPosition = await page.evaluate(() => provider.position);
  await page.waitForTimeout(450);
  report.pause = await page.evaluate(() => ({
    position: provider.position,
    playing: provider.playing,
  }));
  report.pause.driftSeconds = Math.abs(report.pause.position - pausedPosition);
  assert.equal(report.pause.playing, false);
  assert.ok(report.pause.driftSeconds < 0.15, 'Paused adapter clock must stay stationary');
  await page.evaluate(() => provider.seek(5));
  await page.waitForFunction(() => Math.abs(provider.position - 5) < 1, null, { timeout: 5000 });
  report.seek = await page.evaluate(() => ({
    position: provider.position,
    status: provider.status,
  }));
  assert.equal(report.seek.status, 'paused', 'A paused seek must preserve paused state');
  await page.evaluate(() => provider.dispose());
  report.dispose = await page.evaluate(() => ({
    status: provider.status,
    available: provider.available,
    iframeCount: document.querySelectorAll('iframe').length,
    position: provider.position,
  }));
  assert.deepEqual(report.dispose, {
    status: 'disposed',
    available: false,
    iframeCount: 0,
    position: 0,
  });
  report.api = await page.evaluate(() => probe);
  assert.deepEqual(report.api.errors, []);
  assert.deepEqual(report.api.cspViolations, []);
  assert.deepEqual(report.page_errors, []);
  report.passed = true;
} catch (error) {
  report.error = error.message;
  if (page && !page.isClosed()) {
    try {
      report.api = await page.evaluate(() => window.probe ?? null);
    } catch (snapshotError) {
      report.snapshot_error = snapshotError.message;
    }
  }
} finally {
  if (page && !page.isClosed()) {
    try {
      await page.evaluate(() => window.provider?.dispose());
    } catch (error) {
      report.cleanup_errors.push(error.message);
    }
  }
  if (browser) {
    try {
      await browser.close();
    } catch (error) {
      report.cleanup_errors.push(error.message);
    }
  }
  if (server.listening) {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
  report.cleanup = {
    browserClosed: !browser?.isConnected(),
    serverClosed: !server.listening,
  };
  report.passed &&=
    report.cleanup.browserClosed && report.cleanup.serverClosed && !report.cleanup_errors.length;
  report.finished_at = new Date().toISOString();
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
if (!report.passed) process.exitCode = 1;
