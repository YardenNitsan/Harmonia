// Production browser benchmark. Procedural recordings test latency, never recognition quality.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { cpus, totalmem } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, process.argv[2] ?? 'docs/review-evidence/whole-song-performance.json');
await access(output).then(
  () => {
    throw new Error('Use a new evidence path');
  },
  () => {},
);
const report = {
  kind: 'production-chrome-procedural-latency',
  createdAt: new Date().toISOString(),
  cpu: cpus()[0].model,
  logicalCpus: cpus().length,
  ramBytes: totalmem(),
  frontendSha256: createHash('sha256')
    .update(await readFile(resolve(root, 'apps/desktop/dist/index.html')))
    .digest('hex'),
  accuracyEvidence: false,
  recordings: [],
};
function fixture(seconds) {
  const rate = 22050,
    samples = seconds * rate;
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(samples * 2, 40);
  const chords = [
    [48, 60, 64, 67],
    [45, 57, 60, 64],
    [43, 55, 59, 62],
    [41, 53, 57, 60],
  ];
  for (let i = 0; i < samples; i++) {
    const time = i / rate,
      local = time % 2;
    const envelope = Math.min(1, local / 0.02, (2 - local) / 0.04);
    const value =
      chords[Math.floor(time / 2) % chords.length].reduce(
        (sum, midi) => sum + Math.sin(2 * Math.PI * 440 * 2 ** ((midi - 69) / 12) * time),
        0,
      ) / 4;
    bytes.writeInt16LE(Math.round(value * envelope * 24000), 44 + i * 2);
  }
  return { name: `benchmark-${seconds}.wav`, mimeType: 'audio/wav', buffer: bytes };
}
const fixtures = [30, 240, 600].map((duration) => ({ duration, file: fixture(duration) }));
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--config',
    'apps/desktop/vite.config.ts',
    '--host',
    '127.0.0.1',
    '--port',
    '1437',
    '--strictPort',
  ],
  { cwd: root, windowsHide: true, stdio: 'ignore' },
);
let browser;
try {
  for (let attempt = 0; ; attempt++) {
    if (server.exitCode !== null) throw new Error('Benchmark preview server exited');
    if (
      await fetch('http://127.0.0.1:1437').then(
        (r) => r.ok,
        () => false,
      )
    )
      break;
    if (attempt > 100) throw new Error('Benchmark preview did not start');
    await delay(100);
  }
  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  for (const { duration, file } of fixtures) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.benchmark = { results: [], decode: [], plays: [] };
      const WorkerClass = window.Worker;
      window.Worker = class extends WorkerClass {
        constructor(url, options) {
          super(url, options);
          this.addEventListener('message', ({ data }) => {
            if (data.kind === 'result')
              window.benchmark.results.push({
                timings: data.timings,
                duration: data.analysis.duration,
                segments: data.analysis.segments.length,
                completed: performance.now(),
              });
          });
        }
      };
      const decode = AudioContext.prototype.decodeAudioData;
      AudioContext.prototype.decodeAudioData = async function (bytes) {
        const started = performance.now();
        const result = await decode.call(this, bytes);
        window.benchmark.decode.push(performance.now() - started);
        return result;
      };
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        window.benchmark.plays.push(performance.now());
        return play.call(this);
      };
    });
    await page.goto('http://127.0.0.1:1437');
    const started = performance.now();
    await page.getByLabel('Whole-song audio file').setInputFiles(file);
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible({
      timeout: 120000,
    });
    const clickToReadyMs = performance.now() - started;
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const measured = await page.evaluate(() => window.benchmark);
    assert.equal(measured.results.length, 1);
    assert.equal(measured.decode.length, 1);
    assert.equal(measured.results[0].duration, duration);
    assert.ok(measured.plays[0] >= measured.results[0].completed);
    await page
      .getByRole('slider', { name: 'Playback position' })
      .fill(String(Math.min(duration - 1, 120)));
    await expect(page.getByTestId('current-chord')).not.toHaveText('—');
    const cacheStarted = performance.now();
    await page.getByLabel('Whole-song audio file').setInputFiles(file);
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible({
      timeout: 10000,
    });
    const cacheReopenMs = performance.now() - cacheStarted;
    const cached = await page.evaluate(() => window.benchmark);
    assert.equal(cached.results.length, 1);
    assert.equal(cached.decode.length, 1);
    report.recordings.push({
      durationSeconds: duration,
      acquisitionMs: 0,
      acquisitionSource: 'generated local WAV, no network',
      format: 'PCM16 mono WAV 22050 Hz',
      decodeMs: measured.decode[0],
      ...measured.results[0].timings,
      clickToReadyMs,
      cacheReopenMs,
      segments: measured.results[0].segments,
      decodeCalls: 1,
      playbackAfterCompleteTimeline: true,
      cacheSkippedDecodeAndWorker: true,
    });
    console.log(JSON.stringify(report.recordings.at(-1)));
    await context.close();
  }
  report.status = 'passed';
} finally {
  await browser?.close();
  server.kill();
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
}
