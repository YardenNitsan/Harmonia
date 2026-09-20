// Research acceptance probe: exported LV network + supplied Torch reference,
// using the same local CPU/WASM runtime and CSP as the desktop application.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const [modelPath, fixturePath, reportPath] = process.argv.slice(2);
if (!modelPath || !fixturePath || !reportPath) {
  throw new Error('Usage: node scripts/lv-runtime-probe.mjs MODEL.onnx FIXTURE.json REPORT.json');
}
const root = resolve(import.meta.dirname, '..');
const model = await readFile(resolve(modelPath));
const fixture = await readFile(resolve(fixturePath));
const config = JSON.parse(await readFile(resolve(root, 'apps/desktop/src-tauri/tauri.conf.json')));
const csp = Object.entries(config.app.security.csp)
  .map(([directive, values]) => `${directive} ${values}`)
  .join('; ');
const worker = `
import * as ort from '/ort.wasm.min.mjs';
onmessage = async () => {
  let session;
  const start = performance.now();
  try {
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = '/';
    const fixture = await (await fetch('/fixture.json')).json();
    session = await ort.InferenceSession.create('/model.onnx', { executionProviders: ['wasm'] });
    const initialized = performance.now();
    const input = new ort.Tensor('float32', new Float32Array(fixture.input), [1, fixture.frames, 288]);
    const outputs = await session.run({ cqt: input });
    const inferred = performance.now();
    const heads = {};
    for (const [name, output] of Object.entries(outputs)) {
      const reference = fixture.expected[name];
      if (!reference || reference.length !== output.data.length) throw new Error('Output shape mismatch: ' + name);
      let maxAbsoluteError = 0, violations = 0;
      for (let i = 0; i < reference.length; i++) {
        const error = Math.abs(output.data[i] - reference[i]);
        maxAbsoluteError = Math.max(maxAbsoluteError, error);
        if (!Number.isFinite(error) || error > 5e-5 + 5e-4 * Math.abs(reference[i])) violations++;
      }
      heads[name] = { shape: output.dims, maxAbsoluteError, violations };
      output.dispose();
    }
    input.dispose();
    postMessage({ passed: Object.values(heads).every(head => head.violations === 0), frames: fixture.frames,
      initializationMs: initialized - start, inferenceMs: inferred - initialized, heads });
  } catch (error) {
    postMessage({ passed: false, error: String(error), elapsedMs: performance.now() - start });
  } finally {
    if (session) await session.release();
  }
};`;
const assets = new Map([
  ['/', ['text/html', Buffer.from('<!doctype html><title>Hidden LV runtime probe</title>')]],
  ['/worker.mjs', ['text/javascript', Buffer.from(worker)]],
  ['/model.onnx', ['application/octet-stream', model]],
  ['/fixture.json', ['application/json', fixture]],
]);
for (const name of [
  'ort.wasm.min.mjs',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
]) {
  assets.set('/' + name, [
    name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
    await readFile(resolve(root, 'node_modules/onnxruntime-web/dist', name)),
  ]);
}
const server = createServer((request, response) => {
  const asset = assets.get(request.url);
  if (!asset) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'Content-Type': asset[0], 'Content-Security-Policy': csp });
  response.end(asset[1]);
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser;
const report = {
  startedAt: new Date().toISOString(),
  purpose:
    'Procedural first-network browser CPU/WASM parity; no audio, CQT extraction, ensemble or quality evidence',
  modelSha256: createHash('sha256').update(model).digest('hex'),
  fixtureSha256: createHash('sha256').update(fixture).digest('hex'),
  environment: 'Headless installed Chrome, one WASM thread, desktop CSP, module worker',
  pageErrors: [],
};
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  report.result = await page.evaluate(
    () =>
      new Promise((done) => {
        const worker = new Worker('/worker.mjs', { type: 'module' });
        const finish = (result) => {
          clearTimeout(deadline);
          worker.terminate();
          done(result);
        };
        const deadline = setTimeout(
          () => finish({ passed: false, error: 'Probe exceeded 60 seconds' }),
          60000,
        );
        worker.onmessage = (event) => finish(event.data);
        worker.onerror = (event) => finish({ passed: false, error: event.message });
        worker.postMessage({});
      }),
  );
} finally {
  if (browser) await browser.close();
  await new Promise((done) => server.close(done));
}
report.passed = report.result?.passed === true && report.pageErrors.length === 0;
await writeFile(resolve(reportPath), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
