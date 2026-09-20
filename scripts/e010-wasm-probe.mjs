import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { lifecyclePassed } from './e010-wasm-checks.mjs';

const root = resolve(import.meta.dirname, '..');
const [requestPath, outputPath] = process.argv.slice(2);
if (!requestPath || !outputPath)
  throw new Error('Expected request manifest and new evidence directory');
const request = JSON.parse(await readFile(requestPath, 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const [path, expected] of Object.entries(request.frozen_files)) {
  if (hash(await readFile(path)) !== expected) throw new Error('Frozen input changed: ' + path);
}
const native = JSON.parse(await readFile(resolve(root, 'apps/desktop/src-tauri/tauri.conf.json')));
const csp = Object.entries(native.app.security.csp)
  .map(([key, value]) => `${key} ${value}`)
  .join('; ');
const assets = new Map([
  ['/', ['text/html', Buffer.from('<!doctype html><title>Isolated E010 WASM parity</title>')]],
]);
const add = async (url, path, mime) => assets.set(url, [mime, await readFile(path)]);
for (const name of ['e010-wasm-worker.mjs', 'e010-wasm-checks.mjs'])
  await add('/' + name, resolve(root, 'scripts', name), 'text/javascript');
for (const name of [
  'ort.wasm.min.mjs',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
])
  await add(
    '/' + name,
    resolve(root, 'node_modules/onnxruntime-web/dist', name),
    name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
  );
await add('/model.onnx', request.model.path, 'application/octet-stream');
let total = 0;
for (const record of request.cases) {
  if (record.bytes > 8 * 1024 * 1024 || (total += record.bytes) > 32 * 1024 * 1024)
    throw new Error('Reference byte cap exceeded');
  await add(`/cases/${record.id}.bin`, record.path, 'application/octet-stream');
  if (hash(assets.get(`/cases/${record.id}.bin`)[1]) !== record.sha256)
    throw new Error('Reference hash mismatch');
}
const report = {
  study_id: request.study_id,
  status: 'running',
  cases: [],
  pageErrors: [],
  requests: [],
  externalRequests: [],
  cspViolations: [],
  csp,
  cleanup: {},
  model_sha256: request.model.sha256,
  request_sha256: hash(await readFile(requestPath)),
  precision: 'float32 network; float64 quality; int64 triad',
  production_approved: false,
};
const server = createServer((req, res) => {
  report.requests.push(req.url);
  const asset = req.method === 'GET' ? assets.get(req.url) : undefined;
  if (!asset) return void res.writeHead(404).end();
  res.writeHead(200, {
    'Content-Type': asset[0],
    'Content-Length': asset[1].length,
    'Content-Security-Policy': csp,
  });
  res.end(asset[1]);
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser, page;
try {
  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--disable-gpu'],
    timeout: 30000,
  });
  report.browser = browser.version();
  const context = await browser.newContext();
  page = await context.newPage();
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await context.route('**/*', (route) => {
    if (
      route
        .request()
        .url()
        .startsWith(origin + '/')
    )
      return route.continue();
    report.externalRequests.push(route.request().url());
    return route.abort();
  });
  await page.goto(origin, { timeout: 30000 });
  await page.evaluate(() => {
    window.e010Csp = [];
    document.addEventListener('securitypolicyviolation', (event) =>
      window.e010Csp.push({ directive: event.effectiveDirective, blocked: event.blockedURI }),
    );
    window.e010Worker = new Worker('/e010-wasm-worker.mjs', { type: 'module' });
    let next = 0;
    window.e010Request = (data, timeout = 60000) =>
      new Promise((resolveResult) => {
        const id = ++next;
        let finished = false;
        const finish = (result) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          resolveResult(result);
        };
        const timer = setTimeout(
          () => finish({ passed: false, error: 'Worker request timeout' }),
          timeout,
        );
        window.e010Worker.onmessage = (event) => {
          if (event.data.id === id) finish(event.data);
        };
        window.e010Worker.onerror = (event) => finish({ passed: false, error: event.message });
        window.e010Worker.postMessage({ ...data, id });
      });
  });
  report.initialization = await page.evaluate(
    (model) => window.e010Request({ command: 'init', model }),
    request.model,
  );
  if (!report.initialization.passed) throw new Error('WASM initialization failed');
  for (const record of request.cases) {
    const result = await page.evaluate(
      (record) => window.e010Request({ command: 'case', record }),
      record,
    );
    result.case = record.id;
    report.cases.push(result);
    await writeFile(
      resolve(outputPath, `browser-case-${report.cases.length}.json`),
      JSON.stringify(result, null, 2) + '\n',
      { flag: 'wx' },
    );
    if (!result.passed) throw new Error('Browser parity failed: ' + record.id);
  }
  report.status = 'passed_wasm_parity_only';
} catch (error) {
  report.status = 'failed';
  report.error = String(error);
} finally {
  if (page) {
    try {
      report.cspViolations = await page.evaluate(() => window.e010Csp ?? []);
      report.cleanup.session = await page.evaluate(() =>
        window.e010Request?.({ command: 'close' }, 3000),
      );
      await page.evaluate(() => window.e010Worker?.terminate());
      report.cleanup.workerTerminated = true;
    } catch (error) {
      report.cleanup.workerError = String(error);
    }
  }
  if (browser) {
    try {
      await browser.close();
      report.cleanup.browserClosed = true;
    } catch (error) {
      report.cleanup.browserError = String(error);
    }
  }
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  report.cleanup.serverClosed = true;
}
if (!lifecyclePassed(report)) report.status = 'failed';
report.unexecuted = request.cases
  .filter((record) => !report.cases.some((result) => result.case === record.id))
  .map((record) => record.id);
await writeFile(
  resolve(outputPath, 'browser-report.json'),
  JSON.stringify(report, null, 2) + '\n',
  { flag: 'wx' },
);
if (report.status !== 'passed_wasm_parity_only') process.exitCode = 1;
