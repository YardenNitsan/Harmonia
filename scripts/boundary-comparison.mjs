// Isolated B001 adapter; never opens the desktop or modifies the application bundle.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'vite';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const [command, inputPath, outputPath] = process.argv.slice(2);
if (command === 'bundle') {
  await build({
    configFile: false,
    logLevel: 'error',
    build: {
      outDir: resolve(inputPath),
      emptyOutDir: false,
      minify: false,
      target: 'es2022',
      lib: {
        entry: resolve(root, 'scripts/boundary-comparison-worker.ts'),
        formats: ['es'],
        fileName: () => 'worker.js',
      },
    },
  });
} else if (command === 'run') {
  const request = JSON.parse(await readFile(inputPath, 'utf8'));
  const bundle = await readFile(request.bundle);
  if (createHash('sha256').update(bundle).digest('hex') !== request.bundle_sha256)
    throw new Error('Frozen bundle hash changed');
  const assets = new Map([
    ['/', ['text/html', Buffer.from('<!doctype html><title>B001 isolated validation</title>')]],
    ['/worker.js', ['text/javascript', bundle]],
  ]);
  for (const track of request.tracks) {
    const bytes = await readFile(track.audio);
    if (createHash('sha256').update(bytes).digest('hex') !== track.audio_sha256)
      throw new Error('Audio source hash changed');
    assets.set(`/audio/${track.composition}.wav`, ['audio/wav', bytes]);
  }
  const config = JSON.parse(
    await readFile(resolve(root, 'apps/desktop/src-tauri/tauri.conf.json')),
  );
  const csp = Object.entries(config.app.security.csp)
    .map(([key, value]) => `${key} ${value}`)
    .join('; ');
  const server = createServer((req, res) => {
    const asset = assets.get(req.url);
    if (!asset) return void res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': asset[0], 'Content-Security-Policy': csp });
    res.end(asset[1]);
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  let browser;
  const report = {
    status: 'running',
    tracks: [],
    page_errors: [],
    gpu_disabled: true,
    timing_scope:
      'Baseline analyzeFeatures includes rhythm/key/analysis assembly; candidate is segmentation only. No relative speedup claim.',
  };
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu'] });
    report.browser = browser.version();
    const page = await browser.newPage();
    page.on('pageerror', (error) => report.page_errors.push(error.message));
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.route('**/*', (route) =>
      route
        .request()
        .url()
        .startsWith(origin + '/')
        ? route.continue()
        : route.abort(),
    );
    await page.goto(origin);
    await page.evaluate(() => {
      window.b001Worker = new Worker('/worker.js', { type: 'module' });
      window.b001Request = (data) =>
        new Promise((resolveResult, reject) => {
          const timer = setTimeout(
            () => reject(new Error('B001 worker exceeded 60 seconds')),
            60000,
          );
          window.b001Worker.onmessage = (event) => {
            clearTimeout(timer);
            event.data.ok ? resolveResult(event.data) : reject(new Error(event.data.error));
          };
          window.b001Worker.onerror = (event) => {
            clearTimeout(timer);
            reject(new Error(event.message));
          };
          window.b001Worker.postMessage(data, [data.samples.buffer]);
        });
    });
    report.warmup = await page.evaluate(() =>
      window.b001Request({
        samples: Float32Array.from({ length: 22050 }, (_, i) => Math.sin(i * 0.12) * 0.1),
        fingerprint: 'constructed-warmup',
        warmup: true,
      }),
    );
    for (const track of request.tracks) {
      const result = await page.evaluate(async (track) => {
        const started = performance.now();
        const bytes = await (await fetch(`/audio/${track.composition}.wav`)).arrayBuffer();
        const offline = new OfflineAudioContext(1, 1, 22050);
        const decoded = await offline.decodeAudioData(bytes.slice(0));
        const ordinary = new AudioContext({ sampleRate: 22050 });
        let parity = true;
        try {
          const reference = await ordinary.decodeAudioData(bytes.slice(0));
          if (
            decoded.sampleRate !== 22050 ||
            decoded.numberOfChannels !== 1 ||
            decoded.length !== reference.length ||
            decoded.length !== track.source_frames ||
            reference.numberOfChannels !== 1 ||
            reference.sampleRate !== 22050
          )
            parity = false;
          const a = decoded.getChannelData(0),
            b = reference.getChannelData(0);
          if (!a.every((value, i) => Number.isFinite(value) && value === b[i])) parity = false;
        } finally {
          await ordinary.close();
        }
        if (!parity)
          throw new Error('Offline/ordinary browser decode parity failed; no inference permitted');
        const decodeMs = performance.now() - started;
        const result = await window.b001Request({
          samples: decoded.getChannelData(0),
          fingerprint: track.audio_sha256,
          warmup: false,
        });
        return {
          ...result,
          decode_contract_parity: true,
          decode_and_parity_ms: decodeMs,
          decoded_rate: decoded.sampleRate,
          decoded_channels: decoded.numberOfChannels,
          decoded_samples: decoded.length,
        };
      }, track);
      report.tracks.push({ composition: track.composition, ...result });
    }
    report.status = 'completed';
    await page.evaluate(() => window.b001Worker.terminate());
    if (report.page_errors.length) throw new Error('Browser page errors');
  } catch (error) {
    report.status = 'failed';
    report.error = String(error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await new Promise((done) => server.close(done));
    await mkdir(resolve(outputPath, '..'), { recursive: true });
    await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  }
} else throw new Error('Usage: boundary-comparison.mjs bundle DIRECTORY | run REQUEST REPORT');
