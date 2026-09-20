import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

async function mockNativeCapture(page: Page) {
  await page.addInitScript(() => {
    const control = {
      mode: 'audio',
      starts: [] as string[],
      stops: [] as string[],
      stopError: false,
      captureId: '',
      sequence: 0,
    };
    const scope = window as unknown as {
      isTauri: boolean;
      captureTest: typeof control;
      __TAURI_INTERNALS__: {
        invoke(command: string, args: Record<string, string>): Promise<unknown>;
      };
    };
    scope.isTauri = true;
    scope.captureTest = control;
    scope.__TAURI_INTERNALS__ = {
      async invoke(command, args) {
        if (command === 'list_saved_tracks') return { records: [], issues: [] };
        if (command === 'save_track') return;
        if (command === 'capture_sources')
          return [
            {
              id: 'test-process',
              label: 'Controlled test application',
              kind: 'process',
              pid: 123,
              available: true,
            },
            { id: 'test-system', label: 'Controlled test output', kind: 'system', available: true },
            {
              id: 'unavailable',
              label: 'Unavailable test application',
              kind: 'process',
              available: false,
              reason: 'Source exited',
            },
          ];
        if (command === 'capture_start') {
          control.starts.push(args.sourceId);
          control.captureId = `test-capture-${control.starts.length}`;
          control.sequence = 0;
          return { captureId: control.captureId, sampleRate: 48000, channels: 2, blockFrames: 960 };
        }
        if (command === 'capture_stop') {
          if (control.stopError) throw new Error('Controlled capture stop failure');
          control.stops.push(args.captureId);
          return;
        }
        if (command === 'capture_read') {
          if (control.mode === 'ended')
            return { captureId: args.captureId, status: 'ended', blocks: [] };
          if (control.mode === 'error')
            return {
              captureId: args.captureId,
              status: 'error',
              blocks: [],
              error: 'Controlled output device disconnected',
            };
          const blocks = Array.from({ length: 4 }, () => {
            const sequence = control.sequence++;
            const firstFrame = sequence * 960;
            const samples = Array.from({ length: 1920 }, (_, index) => {
              if (control.mode === 'silence') return 0;
              const time = (firstFrame + Math.floor(index / 2)) / 48000;
              return (
                [130.8128, 164.8138, 195.9977].reduce(
                  (sum, hz) => sum + Math.sin(2 * Math.PI * hz * time),
                  0,
                ) * 0.16
              );
            });
            return {
              captureId: args.captureId,
              sampleRate: 48000,
              channels: 2,
              blockFrames: 960,
              sequence,
              firstFrame,
              frameCount: 960,
              devicePosition: firstFrame,
              qpc100ns: String(sequence * 200000),
              timestampValid: true,
              silent: control.mode === 'silence',
              discontinuity: false,
              droppedFramesBefore: 0,
              samples,
            };
          });
          return { captureId: args.captureId, status: 'capturing', blocks };
        }
        throw new Error(`Unexpected test native command: ${command}`);
      },
    };
  });
}

test('live app source runs actual stream worker, clears silence and stops before file navigation', async ({
  page,
}) => {
  await mockNativeCapture(page);
  await page.goto('/');
  await page.getByText('More', { exact: true }).click();
  await page.getByRole('button', { name: 'Listen Live', exact: true }).click();
  const source = page.getByLabel('Audio source', { exact: true });
  await expect(source).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Start listening', exact: true })).toBeDisabled();
  await source.selectOption('test-process');
  await expect(page.getByText(/not an individual browser tab/)).toBeVisible();
  await page.getByRole('button', { name: 'Start listening', exact: true }).click();
  const current = page.getByTestId('live-current-chord');
  await expect(current).not.toHaveText('—');
  await expect(page.getByText(/Model score .*uncalibrated/)).toBeVisible();
  await expect(page.getByText(/Analysis lookahead/)).toBeVisible();
  await expect(page.getByLabel('Playback position')).toHaveCount(0);
  await page.evaluate(() => {
    (window as unknown as { captureTest: { mode: string } }).captureTest.mode = 'silence';
  });
  await expect(current).toHaveText('—');
  await expect(page.getByText('No accessible audio', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { captureTest: { mode: string } }).captureTest.mode = 'audio';
  });
  await expect(current).not.toHaveText('—');
  await page.getByText('More', { exact: true }).click();
  await page.getByRole('button', { name: 'File analysis', exact: true }).click();
  await page.getByRole('button', { name: 'Earlier analysis profiles', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Explore the demo' })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { captureTest: { stops: string[] } }).captureTest.stops,
    ),
  ).toEqual(['test-capture-1']);
  await page.getByText('More', { exact: true }).click();
  await page.getByRole('button', { name: 'Listen Live', exact: true }).click();
  await source.selectOption('test-system');
  await expect(
    page.getByText('Captures the mix playing through this output device.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Start listening', exact: true }).click();
  await expect(current).not.toHaveText('—');
  await page.evaluate(() => {
    (window as unknown as { captureTest: { mode: string } }).captureTest.mode = 'ended';
  });
  await expect(page.getByText('Audio source ended', { exact: true })).toBeVisible();
  await expect(current).toHaveText('—');
});

test('failed native stop keeps live ownership visible and prevents file playback mode', async ({
  page,
}) => {
  await mockNativeCapture(page);
  await page.goto('/');
  await page.getByText('More', { exact: true }).click();
  await page.getByRole('button', { name: 'Listen Live', exact: true }).click();
  await page.getByLabel('Audio source', { exact: true }).selectOption('test-process');
  await page.getByRole('button', { name: 'Start listening', exact: true }).click();
  await expect(page.getByTestId('live-current-chord')).not.toHaveText('—');
  await page.evaluate(() => {
    (window as unknown as { captureTest: { stopError: boolean } }).captureTest.stopError = true;
  });
  await page.getByText('More', { exact: true }).click();
  await page.getByRole('button', { name: 'File analysis', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Controlled capture stop failure');
  await expect(page.getByRole('heading', { name: 'Listen Live', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop listening', exact: true })).toBeVisible();
  await expect(page.getByTestId('live-current-chord')).toHaveText('—');
  await page.evaluate(() => {
    (window as unknown as { captureTest: { stopError: boolean } }).captureTest.stopError = false;
  });
  await page.getByRole('button', { name: 'Stop listening', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start listening', exact: true })).toBeVisible();
});

test('experimental Listen Live is explicitly selected and browser preview does not invent capture sources', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('More', { exact: true }).click();
  await page.getByRole('button', { name: 'Listen Live', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Listen Live', exact: true })).toBeVisible({
    timeout: 3000,
  });
  await expect(page.getByLabel('Audio source', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start listening', exact: true })).toBeDisabled();
  await expect(page.getByText(/Windows desktop app/i)).toBeVisible();
  await expect(page.getByLabel('Playback position')).toHaveCount(0);
  await expect(page.getByText('Upcoming unavailable during live listening.')).toBeVisible();
  await page.getByText('More', { exact: true }).click();
  await page.getByRole('button', { name: 'File analysis', exact: true }).click();
  await page.getByRole('button', { name: 'Earlier analysis profiles', exact: true }).click();
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await expect(page.getByTestId('current-chord')).toHaveText('Cmaj7');
  await page.getByRole('button', { name: 'Edit current chord' }).click();
  await page.getByLabel('Chord symbol').fill('Dm7');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await page.getByText('More', { exact: true }).click();
  await page.getByRole('button', { name: 'Listen Live', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Listen Live', exact: true })).toBeVisible();
  await page.getByText('More', { exact: true }).click();
  await page.getByRole('button', { name: 'File analysis', exact: true }).click();
  await page.getByRole('button', { name: 'Earlier analysis profiles', exact: true }).click();
  await expect(page.getByTestId('current-chord')).toHaveText('Dm7');
});

test.describe('compact live workspace', () => {
  test.use({
    viewport: { width: 800, height: 700 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  test('live source controls fit compact high-DPI keyboard navigation', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 700 });
    await page.goto('/');
    await page.getByText('More', { exact: true }).click();
    await page.getByRole('button', { name: 'Listen Live', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Listen Live', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(await page.evaluate(() => devicePixelRatio)).toBe(2);
    const refresh = page.getByRole('button', { name: 'Refresh sources', exact: true });
    await refresh.focus();
    await page.keyboard.press('Enter');
    await expect(refresh).toBeFocused();
    await expect(page.getByRole('button', { name: 'Start listening', exact: true })).toBeDisabled();
  });
});
