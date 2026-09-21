import { test, expect, wavFile } from './fixtures';

test('consumer home offers one search field and keeps experimental tools in More', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('combobox', { name: 'Song or artist' })).toBeVisible();
  await expect(page.getByLabel('YouTube Data API key')).toHaveCount(0);
  await expect(page.getByLabel('Music source')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Listen Live', exact: true })).not.toBeVisible();
  await page.getByText('More', { exact: true }).click();
  await page.getByRole('button', { name: 'Listen Live', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Listen Live', exact: true })).toBeVisible();
});

test('prepared consumer player autoplays a complete timeline and supports future seek', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = window.Worker;
    let count = 0;
    Object.defineProperty(window, 'createdAnalysisWorkers', { get: () => count });
    window.Worker = class extends original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        count++;
      }
    };
  });
  await page.goto('/');
  await page.getByLabel('Whole-song audio file').setInputFiles(wavFile('prepared-song.wav', 180));
  await expect(page.getByRole('region', { name: 'Song player' })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const workerCount = await page.evaluate(() => Reflect.get(window, 'createdAnalysisWorkers'));
  expect(workerCount).toBeGreaterThan(0);
  await page.getByRole('slider', { name: 'Playback position' }).fill('120');
  await expect(page.getByRole('slider', { name: 'Playback position' })).toHaveValue('120');
  await expect(page.getByTestId('current-chord')).not.toHaveText('—');
  await expect(page.locator('.progression-chord.active')).toHaveAttribute('aria-current', 'true');
  expect(await page.locator('.progression-chord').count()).toBe(
    await page.locator('.chord-block').count(),
  );
  await expect(page.getByTestId('next-change')).toContainText(/Next change in/);
  await page.getByRole('button', { name: 'Forward 10 seconds' }).click();
  await expect(page.getByRole('slider', { name: 'Playback position' })).toHaveValue('130');
  await page.getByRole('button', { name: 'Back 10 seconds' }).click();
  await expect(page.getByRole('slider', { name: 'Playback position' })).toHaveValue('120');
  const chord = page
    .getByRole('region', { name: 'Complete chord progression' })
    .getByRole('button')
    .first();
  await chord.click();
  await expect(page.getByRole('slider', { name: 'Playback position' })).toHaveValue('0');
  expect(await page.evaluate(() => Reflect.get(window, 'createdAnalysisWorkers'))).toBe(
    workerCount,
  );
  await expect(page.getByRole('region', { name: 'Practice tools' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit current chord' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

// This mocks the configured native API boundary, not a live YouTube response.
// Native HTTP/configuration behavior has separate adapter and native tests.
async function configuredSearchMock(page: import('@playwright/test').Page) {
  await page.route('https://commons.wikimedia.org/w/api.php?*', (route) =>
    route.fulfill({ json: { query: { pages: {} } } }),
  );
  await page.addInitScript(() => {
    const calls: string[] = [];
    const completed: string[] = [];
    Object.assign(window, {
      isTauri: true,
      mockedSearchCalls: calls,
      mockedSearchCompleted: completed,
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args: { query?: string } = {}) => {
          if (command === 'list_saved_tracks') return { records: [], issues: [] };
          if (command === 'capture_sources') return [];
          if (command === 'search_status') return { configured: true };
          if (command === 'search_cancel') return;
          if (command === 'audio_acquire') throw { code: 'unavailable', message: 'Unavailable' };
          if (command === 'audio_cancel') return;
          if (command === 'youtube_search') {
            const query = args.query ?? '';
            calls.push(query);
            if (query === 'old') await new Promise((resolve) => setTimeout(resolve, 1100));
            completed.push(query);
            return [0, 1].map((index) => ({
              id: `${query}-${index}`,
              provider: 'youtube',
              title: `${query} song ${index + 1}`,
              artist: 'Mock artist',
              duration: 183,
              thumbnail: null,
              pageUrl: 'https://www.youtube.com/watch?v=mockVideo01',
              audio: null,
            }));
          }
          throw new Error(`Unexpected mocked command: ${command}`);
        },
      },
    });
  });
}

test('typing retains spaces and caret position through delayed search updates', async ({
  page,
}) => {
  await configuredSearchMock(page);
  await page.goto('/');
  const input = page.getByRole('combobox', { name: 'Song or artist' });
  await input.pressSequentially('old ');
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, 'mockedSearchCalls')))
    .toEqual(['old']);
  await expect(input).toHaveValue('old ');
  await expect
    .poll(() => input.evaluate((node) => (node as HTMLInputElement).selectionStart))
    .toBe(4);
  await input.pressSequentially('song');
  // Edit in the middle, then let both the stale and current response finish.
  await input.press('Home');
  await input.press('ArrowRight');
  await input.pressSequentially(' ');
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, 'mockedSearchCompleted')))
    .toContain('old');
  await expect(page.getByRole('option').first()).toContainText('o ld song');
  await expect(input).toHaveValue('o ld song');
  await expect
    .poll(() => input.evaluate((node) => (node as HTMLInputElement).selectionStart))
    .toBe(2);
  await input.fill('שיר הנושא ');
  await expect(page.getByRole('option').first()).toContainText('שיר הנושא');
  await expect(input).toHaveValue('שיר הנושא ');
});

test('configured API mock: debounce, stale response protection, arrows, Escape and Enter', async ({
  page,
}) => {
  await configuredSearchMock(page);
  await page.goto('/');
  const input = page.getByRole('combobox', { name: 'Song or artist' });
  await input.fill('o');
  await input.fill('ol');
  await input.fill('old');
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, 'mockedSearchCalls')))
    .toEqual(['old']);
  await input.fill('new');
  await expect(page.getByRole('option')).toHaveCount(2);
  await expect(page.getByRole('option').first()).toContainText('new song 1');
  await expect(page.getByRole('option').first()).toContainText('Analyze & play');
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, 'mockedSearchCompleted')))
    .toContain('old');
  await expect(page.getByRole('option').first()).toContainText('new song 1');
  await input.press('ArrowDown');
  await expect(page.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
  await input.press('ArrowDown');
  await expect(page.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true');
  await input.press('ArrowUp');
  await input.press('Escape');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await input.press('ArrowUp');
  await input.press('Enter');
  await expect(page.getByRole('alert')).toContainText(
    'This song could not be prepared right now. Try again later.',
  );
  await expect(page.getByRole('region', { name: 'Song player' })).toHaveCount(0);
  await input.fill('clicked');
  await page.getByRole('option').filter({ hasText: 'clicked song 1' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'This song could not be prepared right now. Try again later.',
  );
});

test('blocked autoplay keeps the prepared song available for Play', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLMediaElement.prototype.play;
    let deny = true;
    HTMLMediaElement.prototype.play = function () {
      if (deny) {
        deny = false;
        return Promise.reject(new DOMException('Autoplay blocked', 'NotAllowedError'));
      }
      return original.call(this);
    };
  });
  await page.goto('/');
  await page.getByLabel('Whole-song audio file').setInputFiles(wavFile('play-retry.wav', 12));
  await expect(page.getByRole('region', { name: 'Song player' })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Ready to listen. Press Play to start.')).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});
