import { writeFile, mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect, wavFile } from './fixtures';

test('analysis stays interactive under simulated four-times CPU slowdown', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open a song' })).toBeVisible();
  await page.evaluate(() => {
    const metrics = { frames: [] as number[], longTasks: [] as number[], running: true };
    (window as unknown as { measure: typeof metrics }).measure = metrics;
    let last = performance.now();
    const tick = (now: number) => {
      metrics.frames.push(now - last);
      last = now;
      if (metrics.running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) metrics.longTasks.push(entry.duration);
    }).observe({ entryTypes: ['longtask'] });
  });
  const temporary = await mkdtemp(join(tmpdir(), 'harmonia-performance-'));
  const audioPath = join(temporary, 'cpu-profile.wav');
  await writeFile(audioPath, wavFile('cpu-profile.wav', 30).buffer);
  const start = performance.now();
  try {
    await page.getByLabel('Import audio file').setInputFiles(audioPath);
    await expect(page.getByTestId('track-title')).toHaveText('cpu-profile.wav', { timeout: 60000 });
  } finally {
    await unlink(audioPath);
    await rmdir(temporary);
  }
  const elapsed = performance.now() - start;
  const metrics = await page.evaluate(() => {
    const metrics = (
      window as unknown as { measure: { frames: number[]; longTasks: number[]; running: boolean } }
    ).measure;
    metrics.running = false;
    return metrics;
  });
  const sorted = metrics.frames.slice(2).sort((a, b) => a - b);
  const report = {
    environment:
      'Headless Chrome; developer PC; 4x CDP CPU throttle (not low-end hardware validation)',
    audio_seconds: 30,
    import_to_ready_ms: elapsed,
    frame_count: sorted.length,
    frame_median_ms: sorted[Math.floor(sorted.length * 0.5)],
    frame_p95_ms: sorted[Math.floor(sorted.length * 0.95)],
    frame_max_ms: Math.max(...sorted),
    long_tasks_ms: metrics.longTasks,
  };
  await writeFile(
    'docs/review-evidence/browser-performance.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  expect(sorted.length).toBeGreaterThan(10);
  expect(report.frame_p95_ms).toBeLessThan(150);
});
