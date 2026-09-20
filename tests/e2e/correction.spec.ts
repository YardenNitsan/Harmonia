import { test, expect, exportedRecord } from './fixtures';

test('complete timing correction validates atomically, exports original chords and survives restart', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await page.getByRole('button', { name: 'Seek to Am9 at 4 seconds' }).click();
  await page.getByRole('button', { name: 'Transpose up' }).click();
  await page.getByRole('button', { name: 'Edit current chord' }).click();
  await expect(page.getByLabel('Chord symbol')).toHaveValue('Am9');
  const start = page.getByLabel('Start time in seconds');
  await expect(start).toBeVisible({ timeout: 2000 });
  await start.fill('3');
  await page.getByLabel('End time in seconds').fill('2');
  await page.getByLabel('Chord symbol').fill('Dm9/F');
  await page.getByRole('button', { name: 'Save correction', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByLabel('End time in seconds').fill('7');
  await page.getByRole('button', { name: 'Save correction', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  const saved = await exportedRecord(page);
  expect(saved.analysis.segments.slice(0, 3).map(({ start, end }) => [start, end])).toEqual([
    [0, 3],
    [3, 7],
    [7, 12],
  ]);
  expect(saved.corrections).toHaveLength(3);
  expect(saved.analysis.segments[1].chord).toMatchObject({ root: 2, bass: 5 });
  await page.reload();
  await page.getByRole('button', { name: /Open analysis: After hours/ }).click();
  await page.getByRole('button', { name: 'Seek to Dm9/F at 3 seconds' }).click();
  await expect(page.getByTestId('current-chord')).toHaveText('Dm9/F');
  await page.getByRole('button', { name: 'Edit current chord' }).click();
  await expect(start).toHaveValue('3');
  await expect(page.getByLabel('End time in seconds')).toHaveValue('7');
});

test('first and last bounds allow unlabelled edges, and an active loop follows the new start', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await page.getByRole('button', { name: 'Loop current chord', exact: true }).click();
  await page.getByRole('button', { name: 'Edit current chord' }).click();
  await page.getByLabel('Start time in seconds').fill('');
  await page.getByRole('button', { name: 'Save correction', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('valid start and end');
  await page.getByLabel('Start time in seconds').fill('1');
  await page.getByLabel('End time in seconds').fill('2');
  await page.getByRole('button', { name: 'Save correction', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const firstEdit = await exportedRecord(page);
  await expect(page.getByTestId('current-chord')).toHaveText('—');
  await expect(
    page.getByRole('complementary', { name: 'Harmony inspector' }).getByRole('heading'),
  ).toHaveText('—');
  await expect(page.locator('.neighbor.previous button')).toBeDisabled();
  await expect(page.locator('.neighbor.next button')).toHaveText('Cmaj7');
  await expect(page.locator('.neighbor.next button')).toBeEnabled();
  expect(firstEdit.analysis.segments[0]).toMatchObject({ start: 1, end: 2 });
  expect(firstEdit.analysis.segments[1].start).toBe(2);
  const position = page.getByLabel('Playback position');
  await position.fill('1.9');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  let minimum = Infinity;
  await expect
    .poll(
      async () => {
        const time = Number(await position.inputValue());
        minimum = Math.min(minimum, time);
        return time;
      },
      { intervals: [25], timeout: 3000 },
    )
    .toBeLessThan(1.5);
  expect(minimum).toBeGreaterThanOrEqual(1);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Loop current chord', exact: true }).click();
  const duration = firstEdit.analysis.duration;
  await position.fill(String(duration - 0.1));
  await page.getByRole('button', { name: 'Edit current chord' }).click();
  await expect(page.getByLabel('End time in seconds')).toHaveValue(String(duration));
  await page.getByLabel('End time in seconds').fill(String(duration - 0.5));
  await page.getByRole('button', { name: 'Save correction', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const lastEdit = await exportedRecord(page);
  expect(lastEdit.analysis.segments.at(-1)?.end).toBe(duration - 0.5);
  expect(lastEdit.analysis.segments).toHaveLength(firstEdit.analysis.segments.length);
  await expect(page.getByTestId('current-chord')).toHaveText('—');
  await expect(page.locator('.neighbor.next button')).toHaveText('—');
  await expect(page.locator('.neighbor.next button')).toBeDisabled();
  await expect(page.locator('.neighbor.previous button')).toBeEnabled();
});
