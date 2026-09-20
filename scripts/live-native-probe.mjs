// Controlled real WASAPI PCM -> shipped worker -> UI. Never captures an unselected process.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createHiddenNativeHarness } from './hidden-native-harness.mjs';

const root = resolve(import.meta.dirname, '..');
const executable = resolve(
  root,
  'apps/desktop/src-tauri/target/continuation-clean/release/harmonia.exe',
);
const reportPath = resolve(root, process.argv[2] ?? 'docs/review-evidence/live-native-mvp.json');
const report = {
  status: 'running',
  controlledGeneratedAudioOnly: true,
  rawCapturedAudioSaved: false,
  checks: {},
  errors: [],
  sourceHashes: {},
};
for (const file of [
  'scripts/live-native-probe.mjs',
  'scripts/live-tone-fixture.py',
  'scripts/hidden-native-harness.mjs',
])
  report.sourceHashes[file] = createHash('sha256')
    .update(await readFile(resolve(root, file)))
    .digest('hex');
const python = execFileSync(
  resolve(root, 'ml/.venv/Scripts/python.exe'),
  ['-c', 'import sys; print(sys._base_executable)'],
  { windowsHide: true, encoding: 'utf8' },
).trim();
const children = [];
let harness, page;
async function tone(args) {
  const child = spawn(
    python,
    ['-u', resolve(root, 'scripts/live-tone-fixture.py'), '--seconds', '50', ...args],
    { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  children.push(child);
  let output = '',
    errors = '';
  child.stderr.on('data', (data) => {
    errors += data;
  });
  const started = new Promise((yes, no) => {
    child.stdout.on('data', (data) => {
      output += data;
      if (output.includes('\n')) {
        try {
          yes(JSON.parse(output.split('\n')[0]));
        } catch (error) {
          no(error);
        }
      }
    });
    child.once('error', no);
    child.once('exit', (code) => {
      if (!output.includes('\n')) no(new Error(`Tone helper exited ${code}: ${errors}`));
    });
  });
  const info = await Promise.race([
    started,
    delay(15000).then(() => {
      throw new Error('Tone initialization timeout');
    }),
  ]);
  assert.equal(info.pid, child.pid);
  return child;
}
try {
  harness = await createHiddenNativeHarness(executable);
  page = await harness.launch();
  report.native = harness.details;
  await page.getByRole('button', { name: 'Listen Live', exact: true }).click();
  await page.getByRole('heading', { name: 'Listen Live', exact: true }).waitFor();
  page.on('pageerror', (error) => report.errors.push(error.message));
  report.console = [];
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) report.console.push(message.text());
  });
  await page.evaluate(() => {
    const internal = window.__TAURI_INTERNALS__;
    window.captureEvidence = {
      batches: 0,
      frames: 0,
      nonzeroFrames: 0,
      maxBlocks: 0,
      maxFrames: 0,
      statuses: [],
      observedIds: [],
      errors: [],
    };
    // Tauri deliberately makes invoke immutable. Observe its callback Map without
    // replacing transport, results, permissions or application behavior.
    const callbacks = internal.callbacks;
    const originalSet = callbacks.set.bind(callbacks);
    callbacks.set = (id, callback) =>
      originalSet(id, (result) => {
        if (result && typeof result === 'object' && Array.isArray(result.blocks)) {
          const evidence = window.captureEvidence;
          evidence.batches++;
          evidence.maxBlocks = Math.max(evidence.maxBlocks, result.blocks.length);
          if (!evidence.statuses.includes(result.status)) evidence.statuses.push(result.status);
          if (!evidence.observedIds.includes(result.captureId))
            evidence.observedIds.push(result.captureId);
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
  const other = await tone(['--frequencies', '184.997211,233.081881,277.182631']);
  const selected = await tone(['--sequence']);
  const sources = async () =>
    page.evaluate(() => window.__TAURI_INTERNALS__.invoke('capture_sources'));
  let inventory, chosen, opposing;
  for (let attempt = 0; attempt < 25; attempt++) {
    inventory = await sources();
    chosen = inventory.find((source) => source.pid === selected.pid && source.available);
    opposing = inventory.find((source) => source.pid === other.pid && source.available);
    if (chosen && opposing) break;
    await delay(100);
  }
  assert.ok(chosen && opposing, 'Both owned audio-producing processes must be discoverable');
  report.sources = [chosen, opposing];
  report.checks.discovery = true;
  await page.getByRole('button', { name: 'Refresh sources', exact: true }).click();
  await page.getByLabel('Audio source', { exact: true }).selectOption(chosen.id);
  const began = Date.now();
  await page.getByRole('button', { name: 'Start listening', exact: true }).click();
  const current = page.getByTestId('live-current-chord');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="live-current-chord"]')?.textContent === 'C',
    null,
    { timeout: 10000, polling: 100 },
  );
  report.checks.firstRealChord = await current.textContent();
  report.firstDisplayAfterStartMs = Date.now() - began;
  await page.getByText('No accessible audio', { exact: true }).waitFor({ timeout: 22000 });
  assert.equal(await current.textContent(), '—');
  assert.equal(
    other.exitCode,
    null,
    'Other process must still play while selected process is silent',
  );
  report.checks.processIsolationDuringSelectedSilence = true;
  await page.waitForFunction(
    () => document.querySelector('[data-testid="live-current-chord"]')?.textContent === 'G',
    null,
    { timeout: 10000, polling: 100 },
  );
  report.checks.resumeChangedChord = await current.textContent();
  report.recent = await page.getByLabel('Recent live chords').innerText();
  assert.match(report.recent, /C/);
  assert.match(report.recent, /G/);
  await page.getByRole('button', { name: 'Stop listening', exact: true }).click();
  await page.getByRole('button', { name: 'Start listening', exact: true }).waitFor();
  assert.equal(await current.textContent(), '—');
  report.checks.stopClearsChord = true;
  await page.getByLabel('Audio source', { exact: true }).selectOption(opposing.id);
  await page.getByRole('button', { name: 'Start listening', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="live-current-chord"]')?.textContent === 'F#',
    null,
    { timeout: 10000, polling: 100 },
  );
  report.checks.switchProcessChord = await current.textContent();
  const ended = once(other, 'exit');
  other.kill();
  await ended;
  await page.getByText('Audio source ended', { exact: true }).waitFor();
  assert.equal(await current.textContent(), '—');
  report.checks.sourceExit = true;
  report.pcm = await page.evaluate(() => window.captureEvidence);
  assert.ok(report.pcm.nonzeroFrames > 48000);
  assert.ok(report.pcm.maxBlocks <= 4 && report.pcm.maxFrames <= 960);
  assert.equal(report.errors.length, 0);
  report.checks.boundedTransport = true;
  // Endpoint mix is tested only if no unrelated application is actively rendering.
  const finalSources = await sources();
  const unrelated = finalSources.filter(
    (source) =>
      source.kind === 'process' &&
      source.active &&
      !children.some((child) => child.pid === source.pid),
  );
  if (!unrelated.length) {
    await page.getByRole('button', { name: 'Refresh sources', exact: true }).click();
    await page.getByLabel('Audio source', { exact: true }).selectOption('default:render');
    await page.getByRole('button', { name: 'Start listening', exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="live-current-chord"]')?.textContent === 'G',
      null,
      { timeout: 10000, polling: 100 },
    );
    report.checks.systemOutput = true;
    await page.getByRole('button', { name: 'Stop listening', exact: true }).click();
  } else report.checks.systemOutput = 'Skipped: unrelated active audio; process capture verified';
  report.status = 'passed_live_mvp_controlled_native';
} catch (error) {
  report.status = 'failed';
  report.failure = String(error);
  if (page) {
    report.diagnostic = await page
      .evaluate(() => ({ text: document.body.innerText, pcm: window.captureEvidence }))
      .catch(() => null);
  }
} finally {
  for (const child of children)
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  if (harness) report.cleanup = await harness.close();
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
console.log(JSON.stringify(report, null, 2));
if (report.status === 'failed') process.exitCode = 1;
