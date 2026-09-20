import { writeFile, mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, wavFile, exportedRecord } from './fixtures';

interface FrameProbe {
  frames: number[];
  longTasks: number[];
  started: number;
  frame: number;
  observer: PerformanceObserver;
}
type MeasuredWindow = Window & { frameProbe: FrameProbe };

async function startProbe(page: Page) {
  await page.evaluate(() => {
    const probe: FrameProbe = {
      frames: [],
      longTasks: [],
      started: performance.now(),
      frame: 0,
      observer: new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) probe.longTasks.push(entry.duration);
      }),
    };
    (window as unknown as MeasuredWindow).frameProbe = probe;
    let previous: number | undefined;
    const tick = (now: number) => {
      if (previous !== undefined) probe.frames.push(now - previous);
      previous = now;
      probe.frame = requestAnimationFrame(tick);
    };
    probe.observer.observe({ entryTypes: ['longtask'] });
    probe.frame = requestAnimationFrame(tick);
  });
}

async function stopProbe(page: Page) {
  const sample = await page.evaluate(() => {
    const probe = (window as unknown as MeasuredWindow).frameProbe;
    cancelAnimationFrame(probe.frame);
    for (const entry of probe.observer.takeRecords()) probe.longTasks.push(entry.duration);
    probe.observer.disconnect();
    return {
      elapsed_ms: performance.now() - probe.started,
      frames: probe.frames,
      long_tasks_ms: probe.longTasks,
    };
  });
  const frames = sample.frames.sort((a, b) => a - b);
  return {
    elapsed_ms: sample.elapsed_ms,
    frame_count: frames.length,
    frame_median_ms: frames[Math.floor(frames.length * 0.5)] ?? null,
    frame_p95_ms: frames[Math.floor(frames.length * 0.95)] ?? null,
    frame_max_ms: frames.at(-1) ?? null,
    long_tasks_ms: sample.long_tasks_ms,
  };
}

for (const profile of ['fast', 'accurate'] as const) {
  test(`${profile} CPU analysis, playback, seeking, resize and cache under four-times slowdown`, async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(120000);
    const cdp = await context.newCDPSession(page);
    const temporary = await mkdtemp(join(tmpdir(), 'harmonia-performance-'));
    const name = `cpu-${profile}.wav`;
    const audioPath = join(temporary, name);
    await writeFile(audioPath, wavFile(name, 30).buffer);
    try {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.goto('/');
      await page.getByRole('button', { name: 'File analysis', exact: true }).click();
      await page.getByRole('button', { name: 'Earlier analysis profiles', exact: true }).click();
      await page.getByLabel('Analysis profile').selectOption(profile);
      await startProbe(page);
      await page.getByLabel('Import audio file').setInputFiles(audioPath);
      await expect(page.getByTestId('track-title')).toHaveText(name, { timeout: 90000 });
      await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
      const analysis = await stopProbe(page);
      const original = await exportedRecord(page);
      expect(original.analysis.profile).toBe(profile);
      expect(original.analysis.modelVersion).toBe(
        profile === 'accurate' ? 'E004-transposition-tcn' : 'dsp-template-v1',
      );

      await startProbe(page);
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await expect
        .poll(async () => Number(await page.getByLabel('Playback position').inputValue()))
        .toBeGreaterThan(1);
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      const playback = await stopProbe(page);

      await startProbe(page);
      for (const position of [22, 3, 18, 1, 27, 6, 14, 0]) {
        await page.getByLabel('Playback position').fill(String(position));
        await expect
          .poll(async () => Number(await page.getByLabel('Playback position').inputValue()))
          .toBeCloseTo(position, 1);
      }
      const seeking = await stopProbe(page);

      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await startProbe(page);
      for (const width of [800, 1280, 1920, 2560, 1920, 1280, 800]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(page.getByTestId('current-chord')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
      const resizing = await stopProbe(page);
      await page.getByRole('button', { name: 'Pause', exact: true }).click();

      await page.reload();
      await page.getByRole('button', { name: 'File analysis', exact: true }).click();
      await page.getByRole('button', { name: 'Earlier analysis profiles', exact: true }).click();
      const saved = page.getByRole('button', { name: `Open analysis: ${name}`, exact: true });
      await expect(saved).toBeVisible();
      await startProbe(page);
      await saved.click();
      await expect(page.getByTestId('track-title')).toHaveText(name);
      await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
      const savedReopen = await stopProbe(page);

      await startProbe(page);
      await page.getByLabel('Import audio file').setInputFiles(audioPath);
      await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
      await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
      const cachedReimport = await stopProbe(page);
      expect((await exportedRecord(page)).analysis).toEqual(original.analysis);

      const report = {
        environment:
          'Headless Chrome; developer PC; CDP CPU throttle rate 4; not actual low-end hardware validation',
        limitations:
          'CDP throttling does not emulate RAM, storage, GPU, thermal limits or independently establish worker slowdown. Timings include browser automation actions. Synthetic audio is interaction evidence only.',
        runtime:
          profile === 'accurate'
            ? 'CPU WASM, one ONNX thread; existing runtime configuration'
            : 'CPU DSP in import worker',
        audio_seconds: 30,
        profile,
        phases: {
          analysis,
          playback,
          seeking,
          resizing,
          saved_reopen: savedReopen,
          cached_reimport: cachedReimport,
        },
      };
      const json = JSON.stringify(report, null, 2) + '\n';
      await writeFile(`docs/review-evidence/browser-performance-${profile}.json`, json);
      await testInfo.attach(`browser-performance-${profile}`, {
        body: json,
        contentType: 'application/json',
      });
      expect(playback.frame_count).toBeGreaterThan(10);
      for (const [phase, sample] of Object.entries(report.phases)) {
        if (sample.frame_count >= 10)
          expect(
            sample.frame_p95_ms,
            `${phase} broad responsiveness regression ceiling`,
          ).toBeLessThan(150);
      }
    } finally {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await cdp.detach();
      await unlink(audioPath);
      await rmdir(temporary);
    }
  });
}
