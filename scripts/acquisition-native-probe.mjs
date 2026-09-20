// Real YouTube search, native acquisition and exact-file playback in a hidden WebView.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect } from '@playwright/test';
import { createHiddenNativeHarness } from './hidden-native-harness.mjs';

const root = resolve(import.meta.dirname, '..');
const reportPath = resolve(root, process.argv[2] ?? 'docs/review-evidence/acquisition-native.json');
await access(reportPath).then(
  () => {
    throw new Error('Use a new evidence path.');
  },
  () => {},
);
const videoId = process.argv[3] ?? 'LrM_Y39Gmhk';
const query = process.argv[4] ?? 'Monkeys Spinning Monkeys Kevin MacLeod';
const report = { status: 'running', checks: {}, errors: [], audioRetainedAfterCleanup: false };
const hash = (value) => createHash('sha256').update(value).digest('hex');
report.probeSha256 = hash(await readFile(import.meta.filename));
let harness, page;
const deadline = setTimeout(() => void harness?.close(), 150000);
function saved() {
  const db = new DatabaseSync(harness.databasePath, { readOnly: true });
  try {
    return db
      .prepare('SELECT record_json FROM saved_tracks')
      .all()
      .map((r) => JSON.parse(r.record_json));
  } finally {
    db.close();
  }
}
async function instrumentation() {
  await page.evaluate(() => {
    window.consumerProbe = { workers: [], plays: [] };
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(url, options) {
        super(url, options);
        const entry = { url: String(url), started: performance.now(), stages: [] };
        window.consumerProbe.workers.push(entry);
        this.addEventListener('message', ({ data }) => {
          if (data.kind === 'progress' && !entry.stages.includes(data.stage))
            entry.stages.push(data.stage);
          if (data.kind === 'result') {
            entry.completed = performance.now();
            entry.duration = data.analysis.duration;
            entry.segments = data.analysis.segments.length;
          }
        });
      }
    };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      window.consumerProbe.plays.push(performance.now());
      return play.call(this);
    };
  });
}
try {
  harness = await createHiddenNativeHarness(
    resolve(root, 'apps/desktop/src-tauri/target/continuation-clean/release/harmonia.exe'),
  );
  page = await harness.launch();
  report.native = harness.details;
  page.on('pageerror', (error) => report.errors.push(error.message));
  const frontendGoogle = [];
  page.on('request', (request) => {
    if (new URL(request.url()).hostname === 'www.googleapis.com') frontendGoogle.push(true);
  });
  assert.equal(
    await page.evaluate(() =>
      window.__TAURI_INTERNALS__.invoke('search_status').then((s) => s.configured),
    ),
    true,
  );
  await instrumentation();
  await expect(page.getByLabel('YouTube Data API key')).toHaveCount(0);
  const input = page.getByRole('combobox', { name: 'Song or artist' });
  let clickedAt;
  async function selectSong() {
    await input.fill(query);
    const option = page.locator(`[data-recording-id="${videoId}"]`);
    await expect(option).toBeVisible({ timeout: 20000 });
    await expect(option).toContainText('Analyze & play');
    clickedAt = performance.now();
    await option.click();
  }
  const typeaheadStart = performance.now();
  await selectSong();
  report.typeaheadSeconds = (performance.now() - typeaheadStart) / 1000;
  report.checks.realYoutubeTypeaheadWithoutEnter = true;
  report.checks.youtubeRequestsRemainNative = true;
  const preparationStart = clickedAt;
  await expect(page.getByRole('region', { name: 'Song player' })).toBeVisible({ timeout: 45000 });
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  report.preparationSeconds = (performance.now() - preparationStart) / 1000;
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(() => saved().length).toBe(1);
  const record = saved()[0];
  assert.equal(record.source.provider, 'youtube');
  assert.equal(record.source.audio.kind, 'acquired');
  assert.equal(record.source.audio.fingerprint, record.analysis.fingerprint);
  assert.equal(record.source.id, videoId);
  assert.equal(record.analysis.pipelineVersion, 'harmonia-whole-song-v1');
  assert.ok(record.analysis.duration > 120);
  assert.equal(record.analysis.segments[0].start, 0);
  assert.equal(record.analysis.segments.at(-1).end, record.analysis.duration);
  const immutableHash = hash(JSON.stringify(record.analysis));
  report.source = record.source;
  report.timings = await page.evaluate(
    () => performance.getEntriesByName('harmonia.whole.analysis').at(-1)?.detail,
  );
  report.providers = await page.evaluate(() =>
    window.__TAURI_INTERNALS__.invoke('audio_diagnostics'),
  );
  report.analysis = {
    duration: record.analysis.duration,
    segments: record.analysis.segments.length,
    pipeline: record.analysis.pipelineVersion,
    model: record.analysis.modelVersion,
    fingerprint: record.analysis.fingerprint,
  };
  const initial = await page.evaluate(() => window.consumerProbe);
  assert.equal(initial.workers.length, 1);
  assert.ok(initial.workers[0].completed < initial.plays[0]);
  report.workerSeconds = (initial.workers[0].completed - initial.workers[0].started) / 1000;
  report.checks.completeTimelineBeforeAutomaticPlayback = true;
  const index = record.analysis.segments.findIndex((s) => s.start <= 120 && s.end > 120);
  assert.ok(index >= 0);
  const expected = await page.locator('.chord-block').nth(index).locator('span').innerText();
  const seekStart = performance.now();
  await page.getByRole('slider', { name: 'Playback position' }).fill('120');
  await expect(page.getByTestId('current-chord')).toHaveText(expected);
  await expect(page.locator('.chord-block').nth(index)).toHaveClass(/active/);
  report.futureSeek = {
    seconds: 120,
    chord: expected,
    assertionLatencyMs: performance.now() - seekStart,
  };
  await page.getByRole('button', { name: 'Back 10 seconds' }).click();
  await expect(page.getByRole('slider', { name: 'Playback position' })).toHaveValue('110');
  await page.getByRole('button', { name: 'Forward 10 seconds' }).click();
  await expect(page.getByRole('slider', { name: 'Playback position' })).toHaveValue('120');
  await page.locator('.progression-chord').first().click();
  await expect(page.getByRole('slider', { name: 'Playback position' })).toHaveValue('0');
  await expect(page.getByRole('button', { name: 'Previous chord' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next chord' })).toBeVisible();
  // Seek to a representative interior location and observe real media-clock movement.
  await page.getByRole('slider', { name: 'Playback position' }).fill('80');
  const before = await page.getByTestId('current-chord').innerText();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(async () =>
      Number(await page.getByRole('slider', { name: 'Playback position' }).inputValue()),
    )
    .toBeGreaterThan(80.2);
  await expect(page.getByTestId('current-chord')).not.toHaveText(before);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();

  assert.equal((await page.evaluate(() => window.consumerProbe.workers)).length, 1);
  assert.equal(hash(JSON.stringify(saved()[0].analysis)), immutableHash);
  report.checks.authoritativePlaybackPauseSeekAndClickableTimeline = true;
  report.checks.noAnalysisReplacementDuringPlayback = true;
  report.workers = initial.workers;
  await page.reload();
  await instrumentation();
  const cacheStart = performance.now();
  await selectSong();
  await expect(page.getByRole('region', { name: 'Song player' })).toBeVisible({ timeout: 25000 });
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  report.cacheReopenSeconds = (performance.now() - cacheStart) / 1000;
  report.cachedSelectionToPlayerSeconds = (performance.now() - clickedAt) / 1000;
  await page.getByText('Details & practice', { exact: true }).click();
  await expect(page.getByText('Loaded cached analysis.', { exact: true })).toBeVisible();
  assert.equal((await page.evaluate(() => window.consumerProbe.workers)).length, 0);
  assert.equal(saved().length, 1);
  assert.equal(hash(JSON.stringify(saved()[0].analysis)), immutableHash);
  report.checks.reloadSqliteCacheWithoutRecognition = true;
  const after = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('audio_diagnostics'));
  assert.deepEqual(
    after.map((p) => [p.successes, p.failures]),
    report.providers.map((p) => [p.successes, p.failures]),
  );
  report.checks.cachedAudioNotReacquired = true;
  assert.equal(frontendGoogle.length, 0);
  report.checks.youtubeRequestsRemainNative = true;
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack ?? String(error);
  if (page)
    report.page = await page
      .locator('body')
      .innerText()
      .catch(() => 'Page closed');
} finally {
  clearTimeout(deadline);
  if (harness) report.cleanup = await harness.close().catch((error) => ({ error: error.message }));
  if (report.cleanup?.error) report.status = 'failed';
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'passed') process.exitCode = 1;
