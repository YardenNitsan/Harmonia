// Real permitted catalog -> complete worker analysis -> hidden packaged playback.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect } from '@playwright/test';
import { createHiddenNativeHarness } from './hidden-native-harness.mjs';

const root = resolve(import.meta.dirname, '..');
const reportPath = resolve(root, process.argv[2] ?? 'docs/review-evidence/search-native.json');
const report = { status: 'running', audioSaved: false, checks: {}, errors: [] };
report.probeSha256 = createHash('sha256')
  .update(await readFile(import.meta.filename))
  .digest('hex');
let harness, page;
const timeout = setTimeout(() => {
  void harness?.close();
}, 85000);
function saved() {
  const db = new DatabaseSync(harness.databasePath, { readOnly: true });
  try {
    return db
      .prepare('SELECT record_json FROM saved_tracks')
      .all()
      .map((row) => JSON.parse(row.record_json));
  } finally {
    db.close();
  }
}
try {
  harness = await createHiddenNativeHarness(
    resolve(root, 'apps/desktop/src-tauri/target/continuation-clean/release/harmonia.exe'),
  );
  page = await harness.launch();
  report.native = harness.details;
  page.on('pageerror', (error) => report.errors.push(error.message));
  const sources = [];
  page.on('response', async (response) => {
    if (response.url().startsWith('https://commons.wikimedia.org/w/api.php')) {
      try {
        const body = await response.json();
        for (const record of Object.values(body.query?.pages ?? {})) {
          if (record.pageid === 28670309) sources.push(record);
        }
      } catch {
        /* Network errors are reported by the user flow. */
      }
    }
  });
  async function search() {
    await page.getByRole('searchbox', { name: 'Song or artist' }).fill('Greensleeves');
    await page.getByRole('button', { name: 'Search songs', exact: true }).click();
    const card = page.locator('.song-result').filter({ hasText: 'Julien Grandgagnage' });
    await expect(card).toHaveCount(1, { timeout: 20000 });
    return card;
  }
  await page.evaluate(() => {
    window.probeWorkers = [];
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(url, options) {
        super(url, options);
        const entry = { url: String(url), started: performance.now(), stages: [] };
        window.probeWorkers.push(entry);
        this.addEventListener('message', ({ data }) => {
          if (data.kind === 'progress') entry.stages.push(data.stage);
          if (data.kind === 'result') entry.completed = performance.now();
        });
      }
    };
  });
  const card = await search();
  report.result = await card.innerText();
  const started = performance.now();
  await card.getByRole('button', { name: 'Analyze song' }).click();
  await expect(page.getByRole('heading', { name: 'Analyzing song…' })).toBeVisible();
  await expect(page.getByText(/Complete timeline ready/)).toBeVisible({ timeout: 45000 });
  report.preparationSeconds = (performance.now() - started) / 1000;
  report.readyText = await page.getByText(/Complete timeline ready/).innerText();
  await expect(page.getByRole('slider', { name: 'Playback position' })).toHaveValue('0');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await expect.poll(() => saved().length).toBe(1);
  const record = saved()[0];
  assert.equal(record.analysis.pipelineVersion, 'harmonia-whole-song-v1');
  assert.equal(record.analysis.modelVersion, 'dsp-whole-song-v1');
  assert.ok(record.analysis.duration > 120);
  assert.equal(record.analysis.segments[0].start, 0);
  assert.equal(record.analysis.segments.at(-1).end, record.analysis.duration);
  report.analysis = {
    id: record.analysis.id,
    fingerprint: record.track.fingerprint,
    duration: record.analysis.duration,
    segments: record.analysis.segments.length,
  };
  report.checks.completeTimelineBeforePlayback = true;
  const future = 80;
  const index = record.analysis.segments.findIndex(
    (segment) => segment.start <= future && segment.end > future,
  );
  assert.ok(index >= 0);
  const expected = await page.locator('.chord-block').nth(index).locator('span').innerText();
  await page.getByRole('slider', { name: 'Playback position' }).fill(String(future));
  await expect(page.getByTestId('current-chord')).toHaveText(expected);
  report.futureLookup = {
    seconds: future,
    chord: expected,
    segment: record.analysis.segments[index],
  };
  report.checks.neverPlayedFutureSeek = true;
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(async () =>
      Number(await page.getByRole('slider', { name: 'Playback position' }).inputValue()),
    )
    .toBeGreaterThan(80.2);
  await expect(page.getByTestId('current-chord')).not.toHaveText(expected);
  report.checks.chordChangesDuringPlayback = true;
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  report.checks.playPauseAuthoritativeClock = true;
  report.workers = await page.evaluate(() => window.probeWorkers);
  assert.equal(
    report.workers.filter((worker) => worker.url.includes('whole-song-worker')).length,
    1,
  );
  // Reload discards controller memory, so reuse must come from native SQLite.
  await page.reload();
  await (await search()).getByRole('button', { name: 'Analyze song' }).click();
  await expect(page.getByText(/Loaded cached analysis · exact recording/)).toBeVisible({
    timeout: 25000,
  });
  assert.equal(saved().length, 1);
  assert.equal(saved()[0].analysis.id, record.analysis.id);
  report.checks.reloadSqliteCacheReuse = true;
  report.cacheReadyText = await page.getByText(/Complete timeline ready/).innerText();
  report.source = sources.at(-1);
  assert.ok(report.source, 'Record exact official source/license metadata');
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
  clearTimeout(timeout);
  if (harness) report.cleanup = await harness.close().catch((error) => ({ error: error.message }));
  if (report.cleanup?.error) report.status = 'failed';
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'passed') process.exitCode = 1;
