import { expect, test } from '@playwright/test';
test('demonstration uses real audio, supports seeking, editing, and persistence', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await expect(page.getByTestId('track-title')).toContainText('After hours');
  await expect(page.getByTestId('current-chord')).toHaveText('Cmaj7');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Seek to Dm9 at 8 seconds' }).click();
  await expect(page.getByTestId('current-chord')).toHaveText('Dm9');
  await page.getByRole('button', { name: 'Edit current chord' }).click();
  await page.getByLabel('Chord symbol').fill('G13(b9)/B');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByTestId('current-chord')).toHaveText('G13(b9)/B');
  await page.reload();
  await page.getByRole('button', { name: /Open analysis: After hours/ }).click();
  await page.getByRole('button', { name: 'Seek to G13(b9)/B at 8 seconds' }).click();
  await expect(page.getByTestId('current-chord')).toHaveText('G13(b9)/B');
  expect(errors).toEqual([]);
});
test('compact and large layouts have no horizontal overflow', async ({ page }) => {
  for (const width of [800, 1280, 1920, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});
test('editing during playback retains the selected chord and typed text', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await expect(page.getByTestId('current-chord')).toHaveText('Cmaj7');
  await page.getByLabel('Playback position').fill('3.8');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Edit current chord' }).click();
  await page.getByLabel('Chord symbol').fill('F#7(b9)');
  await expect(page.getByTestId('current-chord')).toHaveText('Am9');
  await expect(page.getByLabel('Chord symbol')).toHaveValue('F#7(b9)');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(page.getByTestId('current-chord')).toHaveText('F#7(b9)');
});
