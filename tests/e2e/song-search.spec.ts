import { test, expect, wavFile, exportedRecord } from './fixtures';

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
  await page.getByRole('combobox', { name: 'Song or artist' }).fill('fixture');
  await expect(page.getByRole('option').filter({ hasText: 'Catalog fixture' })).toContainText(
    'Analyze & play',
  );
  await page.getByRole('option', { name: /Catalog fixture/ }).click();
  await expect.poll(() => downloading).toBe(true);
  await page.getByRole('button', { name: 'Cancel analysis', exact: true }).click();
  release();
  await expect(page.getByText(/Complete timeline ready/)).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Song or artist' }).focus();
  await page.getByRole('option', { name: /Catalog fixture/ }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Practice tools' })).toBeVisible();
  await expect(page.getByText(/Complete timeline ready/)).toBeVisible();
  await expect(page.getByText(/Analysis and playback use this same recording/)).toBeVisible();
  expect(
    Number(await page.getByRole('slider', { name: 'Playback position' }).inputValue()),
  ).toBeLessThan(6);
});

test('catalog download failure is explicit and does not fabricate a timeline', async ({ page }) => {
  const { url } = await mockCatalog(page);
  await page.route(url, (route) => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Song or artist' }).fill('fixture');
  await page.getByRole('option', { name: /Catalog fixture/ }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText(/Complete timeline ready/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toHaveCount(0);
});

test('source-backed library reopens the chosen corrected revision without new analysis', async ({
  page,
}) => {
  const { audio, url } = await mockCatalog(page);
  await page.route(url, (route) => route.fulfill({ body: audio.buffer, contentType: 'audio/wav' }));
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    let count = 0;
    Object.defineProperty(window, 'revisionAnalysisWorkers', { get: () => count });
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        count++;
      }
    };
  });
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Song or artist' }).fill('fixture');
  await page.getByRole('option', { name: /Catalog fixture/ }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('slider', { name: 'Playback position' }).fill('0');
  await expect(page.getByRole('region', { name: 'Practice tools' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit current chord', exact: true }).click();
  await page.getByLabel('Chord symbol').fill('F#7(b9)/A#');
  await page.getByRole('button', { name: 'Save correction', exact: true }).click();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  const original = await exportedRecord(page);
  expect(original.source?.provider).toBe('commons');
  expect(original.corrections).toHaveLength(1);
  const firstWorkers = await page.evaluate(() => Reflect.get(window, 'revisionAnalysisWorkers'));
  expect(firstWorkers).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Analyze again', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Practice tools' })).toBeVisible();
  const replacement = await exportedRecord(page);
  expect(replacement.analysis.id).not.toBe(original.analysis.id);
  expect(replacement.corrections).toHaveLength(0);
  const revisedWorkers = await page.evaluate(() => Reflect.get(window, 'revisionAnalysisWorkers'));
  expect(revisedWorkers).toBe(firstWorkers + 1);

  await page.getByRole('button', { name: /^Library/ }).click();
  const revisions = page.getByRole('button', {
    name: `Open analysis: ${original.track.name}`,
    exact: true,
  });
  await expect(revisions).toHaveCount(2);
  // Saved revisions are newest first. Select the older record explicitly.
  await revisions.last().click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('slider', { name: 'Playback position' }).fill('0');
  await expect(page.getByTestId('current-chord')).toHaveText('F#7(b9)/A#');
  await expect(page.getByRole('region', { name: 'Practice tools' })).toBeVisible();
  await expect(page.getByText('Loaded cached analysis.', { exact: true })).toBeVisible();
  expect(await exportedRecord(page)).toEqual(original);
  expect(await page.evaluate(() => Reflect.get(window, 'revisionAnalysisWorkers'))).toBe(
    revisedWorkers,
  );
});

test('search is primary and live capture remains an explicit experimental option', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('combobox', { name: 'Song or artist' })).toBeVisible();
  await page.getByText('More', { exact: true }).click();
  await page.getByRole('button', { name: 'Listen Live', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Listen Live', exact: true })).toBeVisible();
  await expect(page.getByText('Experimental live recognition', { exact: true })).toBeVisible();
});

test('whole-song local input prepares a complete timeline before play and supports future seek', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Whole-song audio file').setInputFiles(wavFile('whole-test.wav', 180));
  await page.getByRole('button', { name: 'Pause', exact: true }).click({ timeout: 30000 });
  await expect(page.getByRole('region', { name: 'Practice tools' })).toBeVisible();
  await expect(page.getByText(/Complete timeline ready/)).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.getByRole('slider', { name: 'Playback position' }).fill('0');
  await expect(page.getByRole('slider', { name: 'Playback position' })).toHaveValue('0');
  await page.getByRole('slider', { name: 'Playback position' }).fill('157');
  await expect(page.getByRole('slider', { name: 'Playback position' })).toHaveValue('157');
  await expect(page.getByTestId('current-chord')).not.toHaveText('—');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
});
