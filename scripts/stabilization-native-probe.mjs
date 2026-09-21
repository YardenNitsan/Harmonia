// Real YouTube search, native acquisition and exact-file playback in a hidden WebView.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect } from '@playwright/test';
import { createHiddenNativeHarness } from './hidden-native-harness.mjs';

const root = resolve(import.meta.dirname, '..');
const reportPath = resolve(
  root,
  process.argv[2] ?? 'docs/review-evidence/stabilization-native.json',
);
await access(reportPath).then(
  () => {
    throw new Error('Use a new evidence path.');
  },
  () => {},
);
// Optional retained acquisition manifest selects a different exact regression input.
// Historical default is retained for reproducibility; current work passes Killer Queen.
const fixture = process.argv[3]
  ? JSON.parse(await readFile(resolve(root, process.argv[3]), 'utf8'))
  : null;
const videoId = fixture?.videoId ?? 'rm9coqlk8fY';
const query = fixture?.title ?? "Bob Dylan Knockin' On Heaven's Door";
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
  const userCache = resolve(process.env.APPDATA, 'local.harmonia.desktop/acquired-audio');
  const token =
    fixture?.cacheToken ?? '3235fef6dced89f29947b6cfc661fafa39727a1609033b6f38901548739650a1';
  assert.match(token, /^[a-f0-9]{64}$/);
  const audio = await readFile(resolve(userCache, token + '.audio'));
  assert.equal(
    hash(audio),
    fixture?.fingerprint ?? '1df50037c17822f83f5162dda09b86663fa030a448bf9f758f837a44827d409b',
  );
  const cache = resolve(harness.dataDir, 'acquired-audio');
  await mkdir(cache, { recursive: true });
  await copyFile(resolve(userCache, token + '.audio'), resolve(cache, token + '.audio'));
  await copyFile(resolve(userCache, token + '.json'), resolve(cache, token + '.json'));
  report.checks.exactOriginalAudioReused = true;
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
  assert.match(record.analysis.pipelineVersion, /^harmonia-whole-song-lv-v[12]$/);
  assert.match(record.analysis.modelVersion, /^lv-chordia-1.1.0-submission-native-v[12]$/);
  assert.ok(record.analysis.duration > 120);
  assert.equal(record.analysis.segments[0].start, 0);
  assert.equal(record.analysis.segments.at(-1).end, record.analysis.duration);
  const immutableHash = hash(JSON.stringify(record.analysis));
  await expect(page.getByRole('region', { name: 'Practice tools' })).toBeVisible();
  await expect(page.getByLabel('Chord notation')).toBeVisible();
  await expect(page.getByLabel('Playback speed')).toBeVisible();
  await expect(page.getByLabel('Volume', { exact: true })).toBeVisible();
  const practiceLibrary = page.getByRole('region', { name: 'Chord Library' });
  await expect(practiceLibrary).toBeVisible();
  const cards = practiceLibrary.getByTestId('practice-chord-card');
  const cardCounts = await cards.evaluateAll((nodes) =>
    nodes.map((node) => Number(node.getAttribute('data-count'))),
  );
  assert.equal(
    cardCounts.reduce((sum, count) => sum + count, 0),
    record.analysis.segments.filter((s) => s.chord.kind === 'chord').length,
  );
  await expect(practiceLibrary.getByRole('img', { name: /Guitar voicing/ }).first()).toBeVisible();
  await expect(practiceLibrary.getByRole('img', { name: /Piano voicing/ }).first()).toBeVisible();
  const lastOccurrence = practiceLibrary.getByRole('button', { name: /Jump to .* at/ }).last();
  const occurrenceTime = Number(await lastOccurrence.getAttribute('data-start'));
  await lastOccurrence.click();
  await expect(page.getByLabel('Playback position')).toHaveValue(
    String(Number(occurrenceTime.toFixed(2))),
  );
  assert.equal(hash(JSON.stringify(saved()[0].analysis)), immutableHash);
  report.practice = {
    uniqueChords: cardCounts.length,
    appearances: cardCounts.reduce((sum, count) => sum + count, 0),
    occurrenceSeek: occurrenceTime,
  };
  report.checks.visiblePracticeLibraryAndOccurrenceSeek = true;
  report.source = record.source;
  report.timings = await page.evaluate(
    () => performance.getEntriesByName('harmonia.whole.analysis').at(-1)?.detail,
  );
  report.providers = await page.evaluate(() =>
    window.__TAURI_INTERNALS__.invoke('audio_diagnostics'),
  );
  const lengths = record.analysis.segments.map((s) => s.end - s.start).sort((a, b) => a - b);
  const pct = (predicate) =>
    (100 * record.analysis.segments.filter((s) => predicate(s.chord)).length) / lengths.length;
  report.sanity = {
    segmentCount: lengths.length,
    medianSeconds: lengths[Math.floor(lengths.length / 2)],
    meanSeconds: record.analysis.duration / lengths.length,
    changesPerMinute: ((lengths.length - 1) * 60) / record.analysis.duration,
    sub200msPercent: (100 * lengths.filter((n) => n < 0.2).length) / lengths.length,
    extensionsPercent: pct(
      (c) => c.kind === 'chord' && (c.extensions.length > 0 || c.addedTones.length > 0),
    ),
    alterationsPercent: pct((c) => c.kind === 'chord' && c.alterations.length > 0),
    slashPercent: pct((c) => c.kind === 'chord' && c.bass !== null),
  };
  if (!fixture)
    assert.ok(
      report.sanity.medianSeconds > 0.5,
      'Bob regression must contain stable musical regions',
    );
  if (!fixture)
    assert.ok(
      report.sanity.sub200msPercent < 10,
      'Bob output must not be dominated by frame changes',
    );
  const labels = await page.locator('.progression-chord strong').allTextContents();
  report.excerpts = record.analysis.segments
    .slice(0, 25)
    .map((s, i) => ({ start: s.start, end: s.end, label: labels[i] }));
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
  async function assertFollow() {
    await expect
      .poll(() =>
        page.locator('.progression-scroll').evaluate((el) => {
          const active = el.querySelector('.active'),
            box = el.getBoundingClientRect(),
            a = active.getBoundingClientRect();
          const target = Math.max(
            0,
            Math.min(
              el.scrollWidth - el.clientWidth,
              el.scrollLeft + a.left - box.left + a.width / 2 - box.width / 2,
            ),
          );
          return Math.abs(el.scrollLeft - target);
        }),
      )
      .toBeLessThan(2);
    await expect(page.locator('.progression-chord.active strong')).toHaveText(
      await page.getByTestId('current-chord').innerText(),
    );
  }
  await assertFollow();
  await page.getByRole('slider', { name: 'Playback position' }).fill('5');
  await page.getByRole('slider', { name: 'Playback position' }).fill('130');
  await assertFollow();
  report.checks.lateSeekCentersProgression = true;
  await page.getByRole('slider', { name: 'Playback position' }).fill('120');
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
  await assertFollow();
  report.checks.playbackCentersProgression = true;
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
  await expect(page.getByRole('region', { name: 'Practice tools' })).toBeVisible();
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
