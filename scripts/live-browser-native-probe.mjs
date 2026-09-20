// Real, isolated headless Chrome playback -> Windows loopback -> packaged live UI.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { createHiddenNativeHarness } from './hidden-native-harness.mjs';

const root = resolve(import.meta.dirname, '..');
const reportPath = resolve(root, process.argv[2] ?? 'docs/review-evidence/live-chrome-native.json');
const report = { status: 'running', rawCapturedAudioSaved: false, checks: {}, errors: [] };
report.probeSha256 = createHash('sha256')
  .update(await readFile(import.meta.filename))
  .digest('hex');
let server, browser, harness, page;
try {
  server = await chromium.launchServer({
    channel: 'chrome',
    headless: true,
    ignoreDefaultArgs: ['--mute-audio'],
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  browser = await chromium.connect(server.wsEndpoint());
  const playback = await browser.newPage();
  await playback.goto('about:blank');
  await playback.evaluate(async () => {
    const context = new AudioContext();
    const gain = context.createGain();
    gain.gain.value = 0.04;
    gain.connect(context.destination);
    const oscillators = [130.812783, 164.813778, 195.997718].map((frequency) => {
      const oscillator = context.createOscillator();
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start();
      return oscillator;
    });
    window.fixture = { context, oscillators };
    await context.resume();
  });
  harness = await createHiddenNativeHarness(
    resolve(root, 'apps/desktop/src-tauri/target/continuation-clean/release/harmonia.exe'),
  );
  page = await harness.launch();
  report.native = harness.details;
  page.on('pageerror', (error) => report.errors.push(error.message));
  await page.getByText('More', { exact: true }).click();
  await page.getByRole('button', { name: 'Listen Live', exact: true }).click();
  await page.getByRole('heading', { name: 'Listen Live', exact: true }).waitFor();
  await page.evaluate(() => {
    window.captureEvidence = {
      frames: 0,
      nonzeroFrames: 0,
      maxBlocks: 0,
      maxFrames: 0,
      ids: [],
      errors: [],
    };
    const callbacks = window.__TAURI_INTERNALS__.callbacks;
    const set = callbacks.set.bind(callbacks);
    callbacks.set = (id, callback) =>
      set(id, (result) => {
        if (result && typeof result === 'object' && Array.isArray(result.blocks)) {
          const evidence = window.captureEvidence;
          evidence.maxBlocks = Math.max(evidence.maxBlocks, result.blocks.length);
          if (!evidence.ids.includes(result.captureId)) evidence.ids.push(result.captureId);
          if (result.error) evidence.errors.push(result.error);
          for (const block of result.blocks) {
            evidence.frames += block.frameCount;
            evidence.maxFrames = Math.max(evidence.maxFrames, block.frameCount);
            if (block.samples.some((value) => Math.abs(value) > 0.00001))
              evidence.nonzeroFrames += block.frameCount;
          }
        }
        callback(result);
      });
  });
  const { stdout } = await promisify(execFile)(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-Command',
      'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress',
    ],
    { windowsHide: true, timeout: 10000 },
  );
  const processes = JSON.parse(stdout);
  const owned = new Set([server.process().pid]);
  for (let before = -1; before !== owned.size;) {
    before = owned.size;
    for (const process of processes)
      if (owned.has(process.ParentProcessId)) owned.add(process.ProcessId);
  }
  let source;
  for (let attempt = 0; attempt < 20; attempt++) {
    const sources = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('capture_sources'));
    source = sources.find(
      (item) => item.kind === 'process' && item.available && owned.has(item.pid),
    );
    if (source) break;
    await delay(100);
  }
  assert.ok(source, 'Owned Chrome audio session must be discoverable');
  report.chromeSource = source;
  await page.getByRole('button', { name: 'Refresh sources', exact: true }).click();
  await page.getByLabel('Audio source', { exact: true }).selectOption(source.id);
  await page.getByRole('button', { name: 'Start listening', exact: true }).click();
  const chord = async (name) =>
    page.waitForFunction(
      (value) =>
        document.querySelector('[data-testid="live-current-chord"]')?.textContent === value,
      name,
      { polling: 100, timeout: 10000 },
    );
  await chord('C');
  report.checks.chromeChordC = true;
  await playback.evaluate(() => window.fixture.context.suspend());
  await chord('—');
  report.checks.actualPlaybackPauseClears = true;
  await playback.evaluate(async () => {
    [195.997718, 246.941651, 293.664768].forEach((frequency, index) =>
      window.fixture.oscillators[index].frequency.setValueAtTime(
        frequency,
        window.fixture.context.currentTime,
      ),
    );
    await window.fixture.context.resume();
  });
  await chord('G');
  report.checks.chromeResumeChordG = true;
  await page.getByRole('button', { name: 'Stop listening', exact: true }).click();
  await page.getByRole('button', { name: 'Start listening', exact: true }).waitFor();
  await chord('—');
  report.checks.stop = true;
  // Explicit whole-system mode is within the user's requested native acceptance.
  // Other local audio may be mixed in: assert transport/UI, not a known chord label.
  const before = await page.evaluate(() => window.captureEvidence.nonzeroFrames);
  await page.getByLabel('Audio source', { exact: true }).selectOption('default:render');
  await page.getByRole('button', { name: 'Start listening', exact: true }).click();
  await page.waitForFunction(
    (prior) =>
      window.captureEvidence.nonzeroFrames > prior + 24000 &&
      document.querySelector('[data-testid="live-current-chord"]')?.textContent !== '—',
    before,
    { polling: 100, timeout: 10000 },
  );
  report.checks.systemOutputRealPcmAndChord = true;
  await page.getByRole('button', { name: 'Stop listening', exact: true }).click();
  await page.getByRole('button', { name: 'Start listening', exact: true }).waitFor();
  await chord('—');
  report.pcm = await page.evaluate(() => window.captureEvidence);
  assert.ok(report.pcm.maxBlocks <= 4 && report.pcm.maxFrames <= 960);
  assert.equal(report.pcm.errors.length, 0);
  assert.equal(report.errors.length, 0);
  report.status = 'passed_chrome_and_system_native';
} catch (error) {
  report.status = 'failed';
  report.failure = String(error);
  if (page)
    report.diagnostic = await page
      .evaluate(() => ({ text: document.body.innerText, pcm: window.captureEvidence }))
      .catch(() => null);
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  if (harness) report.cleanup = await harness.close();
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
console.log(JSON.stringify(report, null, 2));
if (report.status === 'failed') process.exitCode = 1;
