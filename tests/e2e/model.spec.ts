import { expect } from '@playwright/test';
import { test, wavFile, exportedRecord } from './fixtures';

test('experimental model runs entirely locally and exports honest provenance', async ({ page }) => {
  const remote: string[] = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:1425/'))
      remote.push(request.url());
  });
  await page.goto('/');
  await page.getByText('More', { exact: true }).click();
  await page.getByRole('button', { name: 'File analysis', exact: true }).click();
  await page.getByRole('button', { name: 'Earlier analysis profiles', exact: true }).click();
  await page.getByLabel('Analysis profile').selectOption('accurate', { timeout: 2000 });
  await page.getByLabel('Import audio file').setInputFiles(wavFile('experimental.wav', 4));
  await expect(page.getByTestId('track-title')).toHaveText('experimental.wav', { timeout: 30000 });
  const saved = await exportedRecord(page);
  expect(saved.analysis.modelVersion).toBe('E004-transposition-tcn');
  expect(saved.analysis.profile).toBe('accurate');
  expect(saved.analysis.calibration).toBe('uncalibrated');
  expect(saved.analysis.warnings.join(' ')).toMatch(/experimental/i);
  expect(saved.analysis.segments[0].start).toBe(0);
  expect(saved.analysis.segments.at(-1)?.end).toBeCloseTo(4, 2);
  expect(remote).toEqual([]);
});

test('corrupt model fails visibly without silently substituting DSP', async ({ page, context }) => {
  await context.route('**/models/model.onnx', (route) =>
    route.fulfill({ status: 200, body: 'corrupt artifact' }),
  );
  await page.goto('/');
  await page.getByText('More', { exact: true }).click();
  await page.getByRole('button', { name: 'File analysis', exact: true }).click();
  await page.getByRole('button', { name: 'Earlier analysis profiles', exact: true }).click();
  await page.getByLabel('Analysis profile').selectOption('accurate');
  await page.getByLabel('Import audio file').setInputFiles(wavFile());
  await expect(page.getByRole('alert')).toContainText('Model integrity check failed');
  await expect(page.getByTestId('track-title')).toHaveCount(0);
  await page.getByLabel('Analysis profile').selectOption('balanced');
  await page.getByLabel('Import audio file').setInputFiles(wavFile());
  await expect(page.getByTestId('track-title')).toHaveText('local-progression.wav');
});

test('profile can change for the next import without restarting the workspace', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('More', { exact: true }).click();
  await page.getByRole('button', { name: 'File analysis', exact: true }).click();
  await page.getByRole('button', { name: 'Earlier analysis profiles', exact: true }).click();
  await page.getByLabel('Import audio file').setInputFiles(wavFile('profiles.wav', 4));
  await expect(page.getByTestId('track-title')).toHaveText('profiles.wav');
  await page.getByLabel('Analysis profile').selectOption('accurate', { timeout: 2000 });
  await page.getByLabel('Import audio file').setInputFiles(wavFile('profiles.wav', 4));
  await expect(page.getByText('EXPERIMENTAL ML', { exact: true })).toBeVisible();
  const exported = await exportedRecord(page);
  expect(exported.analysis.modelVersion).toBe('E004-transposition-tcn');
  await page.getByRole('button', { name: 'Library 2', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Open analysis: profiles.wav', exact: true }),
  ).toHaveCount(2);
});
