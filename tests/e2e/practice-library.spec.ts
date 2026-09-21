import { test, expect, wavFile, exportedRecord } from './fixtures';
import { chordPitchClasses } from '../../packages/domain/chord';

test('song practice is visible and library groups frozen chords across playback, seek and transpose', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Whole-song audio file').setInputFiles(wavFile('practice-song.wav', 18));
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const practice = page.getByRole('region', { name: 'Practice tools' });
  await expect(practice).toBeVisible();
  await expect(page.getByLabel('Chord notation')).toBeVisible();
  await expect(page.getByLabel('Playback speed')).toBeVisible();
  await expect(page.getByLabel('Volume', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Transpose up' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit current chord' })).toBeVisible();
  expect(await page.locator('details').filter({ hasText: 'Details & practice' }).count()).toBe(0);
  const before = await exportedRecord(page);
  const grouped = new Map<string, number>();
  for (const { chord } of before.analysis.segments) {
    if (chord.kind !== 'chord') continue;
    const key = [
      chord.root,
      chord.bass ?? chord.root,
      ...chordPitchClasses(chord).sort((a, b) => a - b),
    ].join(':');
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  const library = page.getByRole('region', { name: 'Chord Library' });
  await expect(library).toBeVisible();
  const cards = library.getByTestId('practice-chord-card');
  await expect(cards).toHaveCount(grouped.size);
  const counts = await cards.evaluateAll((nodes) =>
    nodes.map((node) => Number(node.getAttribute('data-count'))),
  );
  expect(counts).toEqual([...grouped.values()]);
  await library.getByRole('button', { name: 'Both', exact: true }).click();
  await expect(library.getByRole('img', { name: /Piano voicing/ }).first()).toBeVisible();
  await expect(library.getByRole('img', { name: /Guitar voicing/ }).first()).toHaveAttribute(
    'aria-label',
    /finger [1-4]/,
  );
  // Every card has either a truthful guitar shape or an explicit unavailable message.
  for (const card of await cards.all()) {
    expect(
      (await card.getByRole('img', { name: /Guitar voicing/ }).count()) +
        (await card.getByText('Guitar diagram unavailable', { exact: true }).count()),
    ).toBe(1);
  }
  const occurrence = library.getByRole('button', { name: /Jump to .* at/ }).last();
  const at = await occurrence.getAttribute('data-start');
  await occurrence.click();
  await expect(page.getByLabel('Playback position')).toHaveValue(
    String(Number(Number(at).toFixed(2))),
  );
  await expect(page.locator('.progression-chord.active strong')).toHaveText(
    await page.getByTestId('current-chord').innerText(),
  );
  await page.getByRole('button', { name: 'Transpose up' }).click();
  await expect(library.getByText('Practice view +1 semitone · audio unchanged')).toBeVisible();
  await page.getByRole('button', { name: 'Transpose down' }).click();
  expect((await exportedRecord(page)).analysis).toEqual(before.analysis);
  await library.getByRole('button', { name: 'Piano', exact: true }).click();
  await expect(library.getByRole('img', { name: /Guitar voicing/ })).toHaveCount(0);
  await library.getByRole('button', { name: 'Guitar', exact: true }).click();
  await expect(library.getByRole('img', { name: /Piano voicing/ })).toHaveCount(0);
  for (const width of [390, 800, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await library.getByRole('button', { name: 'Both', exact: true }).click();
  await library.screenshot({ path: testInfo.outputPath('chord-library.png') });
  await practice.screenshot({ path: testInfo.outputPath('practice-tools.png') });
});
