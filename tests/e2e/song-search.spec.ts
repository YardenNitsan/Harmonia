import { test, expect, wavFile } from './fixtures';

async function mockCatalog(page: import('@playwright/test').Page) {
  const audio = wavFile('Catalog-fixture.wav', 6);
  const url = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Catalog-fixture.wav';
  await page.route('https://commons.wikimedia.org/w/api.php?*', (route) =>
    route.fulfill({
      json: {
        query: {
          pages: {
            '123': {
              pageid: 123,
              ns: 6,
              title: 'File:Catalog-fixture.wav',
              imageinfo: [
                {
                  size: audio.buffer.length,
                  duration: 6,
                  url,
                  descriptionurl: 'https://commons.wikimedia.org/wiki/File:Catalog-fixture.wav',
                  mime: 'audio/wav',
                  mediatype: 'AUDIO',
                  extmetadata: {
                    Artist: { value: 'Procedural test fixture' },
                    ObjectName: { value: 'Catalog fixture' },
                    LicenseUrl: { value: 'https://creativecommons.org/publicdomain/zero/1.0/' },
                    Restrictions: { value: '' },
                  },
                },
              ],
            },
          },
        },
      },
    }),
  );
  return { audio, url };
}

test('catalog acquisition can be cancelled and a later selection prepares a real complete timeline', async ({
  page,
}) => {
  const { audio, url } = await mockCatalog(page);
  let downloading = false;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(url, async (route) => {
    downloading = true;
    await pending;
    await route.fulfill({ body: audio.buffer, contentType: 'audio/wav' }).catch(() => {});
  });
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Song or artist' }).fill('fixture');
  await page.getByRole('button', { name: 'Search songs', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze song', exact: true }).click();
  await expect.poll(() => downloading).toBe(true);
  await page.getByRole('button', { name: 'Cancel analysis', exact: true }).click();
  release();
  await expect(page.getByText(/Complete timeline ready/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Analyze song', exact: true }).click();
  await expect(page.getByText(/Complete timeline ready/)).toBeVisible();
  await expect(page.getByText(/Analysis and playback use this same recording/)).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Playback position' })).toHaveValue('0');
});

test('catalog download failure is explicit and does not fabricate a timeline', async ({ page }) => {
  const { url } = await mockCatalog(page);
  await page.route(url, (route) => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Song or artist' }).fill('fixture');
  await page.getByRole('button', { name: 'Search songs', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze song', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText(/Complete timeline ready/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toHaveCount(0);
});

test('search is primary and live capture remains an explicit experimental option', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Search & Analyze', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Listen Live', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Listen Live', exact: true })).toBeVisible();
  await expect(page.getByText('Experimental live recognition', { exact: true })).toBeVisible();
});

test('whole-song local input prepares a complete timeline before play and supports future seek', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Whole-song audio file').setInputFiles(wavFile('whole-test.wav', 180));
  await expect(page.getByText(/Complete timeline ready/)).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Playback position' })).toHaveValue('0');
  await page.getByRole('slider', { name: 'Playback position' }).fill('157');
  await expect(page.getByRole('slider', { name: 'Playback position' })).toHaveValue('157');
  await expect(page.getByTestId('current-chord')).not.toHaveText('—');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
});
