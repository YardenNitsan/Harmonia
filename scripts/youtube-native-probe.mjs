// Live diagnostic using ONLY the marked hidden-validation executable mode.
// No production navigation/CSP/capability changes. Run: node scripts/youtube-native-probe.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import ts from 'typescript';
import { createHiddenNativeHarness } from './hidden-native-harness.mjs';
import { readNativeRecords } from '../packages/persistence/native-probe.mjs';

const root = resolve(import.meta.dirname, '..');
const executable = resolve(
  root,
  'apps/desktop/src-tauri/target/continuation-clean/release/harmonia.exe',
);
const reportPath = resolve(root, 'docs/review-evidence/youtube-native-probe.json');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const source = await readFile(resolve(root, 'packages/providers/youtube.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: 'youtube.ts',
  reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
assert.equal(
  compiled.diagnostics?.filter((entry) => entry.category === ts.DiagnosticCategory.Error).length,
  0,
);
const csp =
  "default-src 'none'; script-src 'self' https://www.youtube.com https://s.ytimg.com; frame-src https://www.youtube.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://www.youtube.com; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'";
const boot = `import { YouTubeProvider } from '/youtube.mjs';
window.probe = {ready:false,playConfirmed:false,errors:[],states:[],cspViolations:[],gesture:null};
const failure=(via,error)=>probe.errors.push({via,code:error.code??null,sdkCode:error.sdkCode??null,message:error.message});
document.addEventListener('securitypolicyviolation',event=>probe.cspViolations.push({directive:event.effectiveDirective,blocked:event.blockedURI}));
window.onYouTubeIframeAPIReady=async()=>{
  try {
    window.provider=new YouTubeProvider((host,options)=>{
      window.sdkPlayer=new YT.Player(host,{...options,events:{...options.events,onStateChange:event=>{probe.states.push(event.data);options.events.onStateChange(event);}}});
      return sdkPlayer;
    },{origin:location.origin});
    provider.onError(error=>failure('subscription',error));
    await provider.load('M7lc1UVf-VE',document.querySelector('#player'));
    sdkPlayer.mute();probe.ready=true;document.querySelector('#play').disabled=false;
  } catch(error){failure('load',error);}
};
document.querySelector('#play').onclick=async event=>{
  probe.gesture={trusted:event.isTrusted,active:navigator.userActivation.isActive};
  try {await provider.play();probe.playConfirmed=true;}catch(error){failure('play',error);}
};
const sdk=document.createElement('script');sdk.src='https://www.youtube.com/iframe_api';
sdk.onerror=()=>failure('sdk',new Error('Official SDK failed to load'));document.head.append(sdk);`;
const assets = new Map([
  [
    '/',
    [
      'text/html; charset=utf-8',
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Hidden native YouTube diagnostic</title></head><body><h1>Official player fixture</h1><div id="player"></div><button id="play" disabled>Play</button><script type="module" src="/boot.mjs"></script></body></html>',
    ],
  ],
  ['/boot.mjs', ['text/javascript; charset=utf-8', boot]],
  ['/youtube.mjs', ['text/javascript; charset=utf-8', compiled.outputText]],
]);
const report = {
  startedAt: new Date().toISOString(),
  passed: false,
  purpose:
    'Hidden isolated WebView2 feasibility and remote-origin IPC denial, not product integration',
  limitations: [
    'CDP navigates only an isolated hidden validation WebView; no production navigation/CSP/capability changes',
    'Muted brief SDK control check, not visible user-facing or audible playback acceptance',
    'Automatic loopback HTTP Referer is observed, never overridden; installed-app identity compliance remains unverified',
    'No raw audio access, downloading, analysis, credentials, catalog search or user library',
  ],
  source: 'https://developers.google.com/youtube/iframe_api_reference',
  video: 'M7lc1UVf-VE',
  adapterSha256: hash(source),
  adapterModuleSha256: hash(compiled.outputText),
  scriptSha256: hash(await readFile(import.meta.filename)),
  harnessSha256: hash(await readFile(resolve(root, 'scripts/hidden-native-harness.mjs'))),
  typescriptVersion: ts.version,
  csp,
  pageErrors: [],
  failedRequests: [],
  clientIdentification: [],
};
const server = createServer((request, response) => {
  const expectedHost = `127.0.0.1:${server.address()?.port}`;
  const asset =
    request.method === 'GET' && request.headers.host === expectedHost
      ? assets.get(request.url)
      : null;
  response.setHeader('Content-Security-Policy', csp);
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (!asset) {
    response.writeHead(404).end();
    return;
  }
  response.setHeader('Content-Type', asset[0]);
  response.end(asset[1]);
});
const now = new Date().toISOString();
const sentinel = {
  track: {
    id: 'native-youtube-sentinel',
    name: 'Isolated IPC sentinel',
    fingerprint: 'native-youtube-sentinel',
    duration: 1,
    importedAt: now,
    favorite: false,
  },
  analysis: {
    id: 'native-youtube-sentinel:fast',
    fingerprint: 'native-youtube-sentinel',
    profile: 'fast',
    modelVersion: 'probe-only',
    pipelineVersion: 'probe-only',
    duration: 1,
    segments: [
      { id: 'segment-0', start: 0, end: 1, chord: { kind: 'none' }, score: 1, alternatives: [] },
    ],
    beats: [],
    tempo: null,
    meter: null,
    key: null,
    waveform: [0],
    boundaries: [],
    createdAt: now,
    calibration: 'uncalibrated',
    warnings: [],
  },
  corrections: [],
};
let harness, page;
let aborted = false;
let rejectInterrupt;
const interruption = new Promise((_, reject) => {
  rejectInterrupt = reject;
});
const interrupt = () => {
  aborted = true;
  rejectInterrupt(new Error('Native YouTube probe interrupted'));
};
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
const watchdog = setTimeout(() => {
  aborted = true;
  rejectInterrupt(new Error('Native YouTube probe exceeded 80 seconds'));
}, 80000);
async function probeNative() {
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  report.origin = `http://127.0.0.1:${server.address().port}`;
  if (aborted) throw new Error('Probe interrupted before native launch');
  harness = await createHiddenNativeHarness(executable);
  if (aborted) throw new Error('Probe interrupted before native launch');
  page = await harness.launch();
  report.native = harness.details;
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    if (report.failedRequests.length < 30)
      report.failedRequests.push({
        host: new URL(request.url()).hostname,
        error: request.failure()?.errorText,
      });
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      url.hostname === 'www.youtube.com' &&
      ['/iframe_api', '/embed/M7lc1UVf-VE'].includes(url.pathname)
    )
      report.clientIdentification.push({
        path: url.pathname,
        referer: request.headers().referer ?? null,
        origin: request.headers().origin ?? null,
      });
  });
  await page.waitForFunction(() => typeof window.__TAURI_INTERNALS__?.invoke === 'function', null, {
    polling: 100,
    timeout: 10000,
  });
  report.privilegedControl = await page.evaluate(async (record) => {
    await window.__TAURI_INTERNALS__.invoke('save_track', { record });
    const result = await window.__TAURI_INTERNALS__.invoke('list_saved_tracks');
    return { records: result.records.length, sentinel: result.records[0]?.analysis.id };
  }, sentinel);
  assert.deepEqual(report.privilegedControl, { records: 1, sentinel: sentinel.analysis.id });
  assert.deepEqual(readNativeRecords(harness.databasePath), [sentinel]);
  await page.goto(report.origin, { waitUntil: 'domcontentloaded', timeout: 10000 });
  report.ipcDenials = await page.evaluate(async (record) => {
    const results = [];
    for (const [command, args] of [
      ['list_saved_tracks', {}],
      [
        'save_track',
        { record: { ...record, track: { ...record.track, name: 'Unexpected remote overwrite' } } },
      ],
      ['delete_track', { id: record.analysis.id }],
    ]) {
      if (typeof window.__TAURI_INTERNALS__?.invoke !== 'function') {
        results.push({ command, denied: true, mechanism: 'bridge-unavailable' });
        continue;
      }
      let timer;
      try {
        const outcome = await Promise.race([
          window.__TAURI_INTERNALS__
            .invoke(command, args)
            .then(() => ({ allowed: true }))
            .catch((error) => ({ error: String(error) })),
          new Promise((resolve) => {
            timer = setTimeout(() => resolve({ timeout: true }), 5000);
          }),
        ]);
        results.push({
          command,
          ...outcome,
          denied:
            typeof outcome.error === 'string' &&
            /not allowed|not permitted|denied|not authorized|no capability/i.test(outcome.error),
        });
      } finally {
        clearTimeout(timer);
      }
    }
    return results;
  }, sentinel);
  report.sentinelPreserved = isDeepStrictEqual(readNativeRecords(harness.databasePath), [sentinel]);
  assert.ok(
    report.ipcDenials.every((result) => result.denied),
    'Every remote database command must be denied, not merely time out',
  );
  assert.equal(report.sentinelPreserved, true);
  const until = (fn, arg = null, timeout = 15000) =>
    page.waitForFunction(fn, arg, { polling: 100, timeout });
  await until(() => window.probe?.ready || window.probe?.errors.length, null, 20000);
  report.ready = await page.evaluate(() => ({
    ready: probe.ready,
    status: provider?.status,
    errors: probe.errors,
  }));
  assert.equal(report.ready.ready, true);
  assert.equal(report.ready.status, 'ready');
  assert.deepEqual(report.ready.errors, []);
  report.frame = await page.locator('iframe').boundingBox();
  assert.ok(report.frame?.width >= 480 && report.frame.height >= 270);
  await until(() => sdkPlayer.isMuted(), null, 5000);
  await page.getByRole('button', { name: 'Play', exact: true }).click({ force: true });
  await until(() => probe.playConfirmed || probe.errors.length, null, 18000);
  report.play = await page.evaluate(() => ({
    confirmed: probe.playConfirmed,
    playing: provider.playing,
    gesture: probe.gesture,
    muted: sdkPlayer.isMuted(),
    position: provider.position,
    errors: probe.errors,
  }));
  assert.equal(report.play.confirmed, true);
  assert.equal(report.play.playing, true);
  assert.equal(report.play.muted, true);
  assert.deepEqual(report.play.gesture, { trusted: true, active: true });
  assert.deepEqual(report.play.errors, []);
  await until((start) => provider.position > start + 0.5, report.play.position, 7000);
  report.clock = await page.evaluate(() => ({
    position: provider.position,
    duration: provider.duration,
  }));
  assert.ok(Number.isFinite(report.clock.duration) && report.clock.duration > 5);
  await page.evaluate(() => provider.pause());
  await until(() => provider.status === 'paused', null, 5000);
  await page.evaluate(() => provider.seek(5));
  await until(() => Math.abs(provider.position - 5) < 1, null, 5000);
  report.seek = await page.evaluate(() => ({
    position: provider.position,
    status: provider.status,
  }));
  assert.equal(report.seek.status, 'paused');
  await page.evaluate(() => provider.dispose());
  report.dispose = await page.evaluate(() => ({
    status: provider.status,
    available: provider.available,
    iframeCount: document.querySelectorAll('iframe').length,
  }));
  assert.deepEqual(report.dispose, { status: 'disposed', available: false, iframeCount: 0 });
  report.api = await page.evaluate(() => probe);
  assert.deepEqual(report.api.errors, []);
  assert.deepEqual(report.pageErrors, []);
  report.passed = true;
}
try {
  await Promise.race([probeNative(), interruption]);
} catch (error) {
  report.error = error.stack ?? String(error);
  if (page && !page.isClosed())
    try {
      report.api = await page.evaluate(() => window.probe ?? null);
    } catch {}
} finally {
  aborted = true;
  clearTimeout(watchdog);
  try {
    if (harness) report.cleanup = await harness.close();
  } catch (error) {
    report.cleanupError = String(error);
    report.retainedTemporaryDirectory = harness.dataDir;
    report.passed = false;
  }
  if (server.listening) {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
  report.serverClosed = !server.listening;
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
  report.finishedAt = new Date().toISOString();
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
if (!report.passed) process.exitCode = 1;
