import { test, expect, wavFile, exportedRecord } from './fixtures';

test('whole-song library corrections survive exact-file cache reuse and restart', async ({
  page,
}) => {
  const file = wavFile('whole-library.wav', 12);
  await page.goto('/');
  await page.getByLabel('Whole-song audio file').setInputFiles(file);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByText('Details & practice', { exact: true }).click();
  await expect(page.getByText(/Complete timeline ready/)).toBeVisible();
  await page.getByRole('button', { name: /^Library/ }).click();
  await page.getByRole('button', { name: 'Search & Analyze', exact: true }).click();
  await page.getByText('Details & practice', { exact: true }).click();
  await expect(page.getByText(/Complete timeline ready/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: /^Library/ }).click();
  await page.getByRole('button', { name: 'Open analysis: whole-library.wav', exact: true }).click();
  await page.getByRole('slider', { name: 'Playback position' }).fill('1');
  await page.getByRole('button', { name: 'Edit current chord', exact: true }).click();
  await page.getByLabel('Chord symbol').fill('F#7(b9)/A#');
  await page.getByRole('button', { name: 'Save correction', exact: true }).click();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  const corrected = await exportedRecord(page);
  expect(corrected.analysis.pipelineVersion).toMatch(/^harmonia-whole-song-/);
  expect(corrected.corrections.length).toBeGreaterThan(0);

  // Reimport from the reopened Library view must retain whole-song ownership.
  await page.getByLabel('Import audio file', { exact: true }).setInputFiles(file);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByText('Details & practice', { exact: true }).click();
  await expect(page.getByText('Loaded cached analysis.', { exact: true })).toBeVisible();
  await page.getByRole('slider', { name: 'Playback position' }).fill('1');
  await expect(page.getByTestId('current-chord')).toHaveText('F#7(b9)/A#');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: /^Library/ }).click();
  await page.getByRole('button', { name: 'Open analysis: whole-library.wav', exact: true }).click();
  expect(await exportedRecord(page)).toEqual(corrected);

  await page.reload();
  await page.getByRole('button', { name: /^Library/ }).click();
  await page.getByRole('button', { name: 'Open analysis: whole-library.wav', exact: true }).click();
  expect(await exportedRecord(page)).toEqual(corrected);
  await page.getByLabel('Import audio file', { exact: true }).setInputFiles(file);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByText('Details & practice', { exact: true }).click();
  await expect(page.getByText('Loaded cached analysis.', { exact: true })).toBeVisible();
  await page.getByRole('slider', { name: 'Playback position' }).fill('1');
  await expect(page.getByTestId('current-chord')).toHaveText('F#7(b9)/A#');
});

test('Library uses the legacy controller copy after editing a restored earlier-profile session', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('More', { exact: true }).click();
  await page.getByRole('button', { name: 'File analysis', exact: true }).click();
  await page.getByRole('button', { name: 'Earlier analysis profiles', exact: true }).click();
  await page.getByRole('button', { name: 'Explore the demo', exact: true }).click();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  // Both controllers initialize from this saved record; only the legacy copy owns updates.
  await page.reload();
  await page.getByRole('button', { name: /^Library/ }).click();
  await page.getByRole('button', { name: /Open analysis: After hours/ }).click();
  await page.getByRole('button', { name: 'Edit current chord', exact: true }).click();
  await page.getByLabel('Chord symbol').fill('Dm9/F');
  await page.getByRole('button', { name: 'Save correction', exact: true }).click();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Library/ }).click();
  await page.getByRole('button', { name: /Open analysis: After hours/ }).click();
  await expect(page.getByTestId('current-chord')).toHaveText('Dm9/F');
});
