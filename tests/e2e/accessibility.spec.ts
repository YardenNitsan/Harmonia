import { test, expect } from './fixtures';

test.use({ viewport: { width: 800, height: 700 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });

test('compact high-DPI reduced-motion workspace supports keyboard playback and editing', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'File analysis', exact: true }).click();
  await page.getByRole('button', { name: 'Earlier analysis profiles', exact: true }).click();
  const demo = page.getByRole('button', { name: 'Explore the demo' });
  // Reach the demo using actual tab navigation instead of invoking its click handler.
  for (
    let step = 0;
    step < 15 && !(await demo.evaluate((element) => element === document.activeElement));
    step++
  )
    await page.keyboard.press('Tab');
  await expect(demo).toBeFocused();
  expect(await demo.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('current-chord')).toHaveText('Cmaj7');
  expect(await page.evaluate(() => devicePixelRatio)).toBe(2);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    true,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await page.evaluate(
      () =>
        document.getAnimations().filter((animation) => animation.playState === 'running').length,
    ),
  ).toBe(0);

  const play = page.getByRole('button', { name: 'Play', exact: true });
  await play.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.getAnimations().filter((animation) => animation.playState === 'running').length,
    ),
  ).toBe(0);
  await page.keyboard.press('Space');
  await expect(play).toBeVisible();

  const position = page.getByLabel('Playback position');
  await position.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => Number(await position.inputValue())).toBeCloseTo(0.01, 2);

  const edit = page.getByRole('button', { name: 'Edit current chord' });
  await edit.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName('Refine this moment.');
  const symbol = page.getByLabel('Chord symbol');
  await expect(
    symbol,
    `Initial editor focus: ${await page.evaluate(() => document.activeElement?.outerHTML)}`,
  ).toBeFocused();
  await symbol.fill('G13(b9)/B');
  await page.keyboard.press('ArrowLeft');
  await expect(play).toBeVisible();
  await expect.poll(async () => Number(await position.inputValue())).toBeCloseTo(0.01, 2);
  for (let step = 0; step < 8; step++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(edit).toBeFocused();
  await expect(page.getByTestId('current-chord')).toHaveText('Cmaj7');

  await page.keyboard.press('Enter');
  await symbol.fill('G13(b9)/B');
  await symbol.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('current-chord')).toHaveText('G13(b9)/B');
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('global playback shortcuts work while form controls keep their own keyboard input', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'File analysis', exact: true }).click();
  await page.getByRole('button', { name: 'Earlier analysis profiles', exact: true }).click();
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  const chord = page.getByTestId('current-chord');
  await expect(chord).toHaveText('Cmaj7');
  await chord.click();
  await page.keyboard.press('ArrowRight');
  const position = page.getByLabel('Playback position');
  await expect.poll(async () => Number(await position.inputValue())).toBeCloseTo(5, 1);
  await expect(chord).toHaveText('Am9');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => Number(await position.inputValue())).toBeCloseTo(0, 1);
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

  const speed = page.getByLabel('Playback speed');
  await speed.focus();
  await page.keyboard.press('ArrowDown');
  await expect(speed).toHaveValue('1.25');
  expect(Number(await position.inputValue())).toBeLessThan(1);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});
