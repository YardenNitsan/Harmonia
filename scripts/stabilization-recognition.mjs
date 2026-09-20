// Fixed-byte recognition evidence. No providers, desktop windows, training or test-set access.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, dirname } from 'node:path';
import { chromium } from '@playwright/test';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..');
const [requestPath, outputPath] = process.argv.slice(2).map((p) => resolve(p));
assert.ok(requestPath && outputPath, 'Pass frozen request JSON and unused output JSON');
await access(outputPath).then(
  () => {
    throw new Error('Evidence exists');
  },
  () => {},
);
const request = JSON.parse(await readFile(requestPath, 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const directory = resolve(root, '.superpowers/stabilization', `bundle-${Date.now()}`);
await mkdir(directory, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  build: {
    outDir: directory,
    minify: false,
    target: 'es2022',
    lib: {
      entry: resolve(root, 'scripts/stabilization-worker.ts'),
      formats: ['es'],
      fileName: () => 'worker.js',
    },
  },
});
const bundle = await readFile(resolve(directory, 'worker.js'));
const assets = new Map([
  ['/', ['text/html', Buffer.from('<!doctype html><title>Stabilization</title>')]],
  ['/worker.js', ['text/javascript', bundle]],
]);
for (let i = 0; i < request.tracks.length; i++) {
  const track = request.tracks[i];
  const bytes = await readFile(track.audio);
  assert.equal(hash(bytes), track.audio_sha256, 'Exact audio changed');
  assets.set(`/audio/${i}`, [track.mime ?? 'audio/wav', bytes]);
}
const server = createServer((req, res) => {
  const asset = assets.get(req.url);
  if (!asset) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': asset[0] });
  res.end(asset[1]);
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser;
const report = { bundleSha256: hash(bundle), tracks: [] };
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
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
  for (let i = 0; i < request.tracks.length; i++) {
    const track = request.tracks[i];
    const result = await page.evaluate(
      async ({ i, fingerprint, retain }) => {
        const bytes = await (await fetch(`/audio/${i}`)).arrayBuffer();
        const started = performance.now();
        const context = new OfflineAudioContext(1, 1, 22050);
        const decoded = await context.decodeAudioData(bytes);
        const samples = new Float32Array(decoded.length);
        for (let c = 0; c < decoded.numberOfChannels; c++) {
          const values = decoded.getChannelData(c);
          for (let n = 0; n < samples.length; n++)
            samples[n] += values[n] / decoded.numberOfChannels;
        }
        const decodeMs = performance.now() - started;
        let pcm;
        if (retain) {
          const b = new Uint8Array(samples.buffer);
          let str = '';
          for (let n = 0; n < b.length; n += 16384)
            str += String.fromCharCode(...b.subarray(n, n + 16384));
          pcm = btoa(str);
        }
        const worker = new Worker('/worker.js', { type: 'module' });
        const inferenceStarted = performance.now();
        const result = await new Promise((done, reject) => {
          worker.onmessage = ({ data }) =>
            data.error ? reject(new Error(data.error)) : done(data);
          worker.onerror = (e) => reject(new Error(e.message));
          worker.postMessage({ samples, fingerprint, retainFeatures: retain }, [samples.buffer]);
        });
        worker.terminate();
        return {
          ...result,
          decodeMs,
          totalMs: decodeMs + performance.now() - inferenceStarted,
          pcm,
        };
      },
      { i, fingerprint: track.audio_sha256, retain: Boolean(track.retain) },
    );
    if (track.retain) {
      const prefix = resolve(track.retain);
      await mkdir(dirname(prefix), { recursive: true });
      await writeFile(prefix + '.f32', Buffer.from(result.pcm, 'base64'), { flag: 'wx' });
      await writeFile(prefix + '.features.json', JSON.stringify(result.features), { flag: 'wx' });
    }
    delete result.pcm;
    delete result.features;
    const segments = result.analysis.segments;
    const lengths = segments.map((s) => s.end - s.start).sort((a, b) => a - b);
    const duration = result.analysis.duration;
    const pct = (test) => (100 * segments.filter((s) => test(s.chord)).length) / segments.length;
    const structural = segments.filter(
      (s, n) =>
        n === 0 ||
        JSON.stringify({ ...s.chord, bass: null }) !==
          JSON.stringify({ ...segments[n - 1].chord, bass: null }),
    ).length;
    const stats = {
      segmentCount: segments.length,
      medianSeconds: lengths[Math.floor(lengths.length / 2)],
      meanSeconds: duration / segments.length,
      changesPerMinute: ((segments.length - 1) * 60) / duration,
      sub200msPercent: (100 * lengths.filter((n) => n < 0.2).length) / lengths.length,
      extensionsPercent: pct(
        (c) => c.kind === 'chord' && (c.extensions.length > 0 || c.addedTones.length > 0),
      ),
      alterationsPercent: pct((c) => c.kind === 'chord' && c.alterations.length > 0),
      slashPercent: pct((c) => c.kind === 'chord' && c.bass !== null),
      structuralRegionCountIgnoringBass: structural,
    };
    report.tracks.push({
      id: track.id ?? track.composition,
      audioSha256: track.audio_sha256,
      stats,
      ...result,
    });
    console.log(
      JSON.stringify({ id: track.id ?? track.composition, stats, totalMs: result.totalMs }),
    );
  }
  report.status = 'passed';
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
