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
  await page.getByLabel('Playback position').fill('0.5');
  const inspector = page.getByRole('complementary', { name: 'Harmony inspector' });
  await expect(inspector.getByRole('img', { name: /Piano voicing/ })).toBeVisible();
  await expect(inspector.getByText('One hand', { exact: true })).toBeVisible();
  await expect(inspector.getByText(/Left hand|Right hand/)).toHaveCount(0);
  await expect(inspector.locator('.piano-voicing svg')).toHaveCount(1);
  await inspector.getByRole('button', { name: 'Tone maps', exact: true }).click();
  await expect(
    inspector.getByText('Reference maps — not a fingering to play all at once.'),
  ).toBeVisible();
  await inspector.getByRole('button', { name: 'Piano', exact: true }).click();
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
  await expect(
    library.getByRole('button', { name: 'Classic shapes', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await library.getByRole('button', { name: 'Easy practice', exact: true }).click();
  await library.getByLabel('Guitar capo').selectOption('2');
  await expect(library.getByText('Capo on fret 2', { exact: true })).toBeVisible();
  await expect(library.getByText(/Frets shown relative to the capo/)).toBeVisible();
  expect((await exportedRecord(page)).analysis).toEqual(before.analysis);
  await library.getByRole('button', { name: 'Classic shapes', exact: true }).click();
  await expect(library.getByLabel('Guitar capo')).toHaveCount(0);
  await expect(library.getByText(/Classic chord shapes: familiar guitar positions/)).toBeVisible();
  await expect(library.getByText(/less movement between chords/)).toHaveCount(0);
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
  const cCard = cards.filter({ has: page.getByRole('heading', { name: 'C', exact: true }) });
  await expect(cCard.getByRole('img', { name: /Guitar voicing/ })).toHaveAttribute(
    'aria-label',
    /muted; fret 3, finger [1-4]; fret 2, finger [1-4]; open; fret 1, finger [1-4]; open/,
  );
  const classicPiano = await cCard
    .getByRole('img', { name: /Piano voicing/ })
    .getAttribute('aria-label');
  for (const button of await cCard.getByRole('button', { name: /Jump to C at/ }).all()) {
    await button.click();
    await expect(inspector.getByRole('img', { name: /Piano voicing/ })).toHaveAttribute(
      'aria-label',
      classicPiano!,
    );
  }
  // The keyboard stays close to the hand even when an inversion crosses C.
  for (const keyboard of await library.locator('.piano-voicing svg').all()) {
    const viewBox = (await keyboard.getAttribute('viewBox'))!.split(' ').map(Number);
    expect(viewBox[2]).toBeLessThanOrEqual(9 * 24);
  }
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

test('rare slash harmony has a disclosed guitar grip and a single compact piano diagram', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Whole-song audio file').setInputFiles(wavFile('rare-practice.wav', 4));
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByLabel('Playback position').fill('0.5');
  await page.getByRole('button', { name: 'Edit current chord', exact: true }).click();
  await page.getByLabel('Chord symbol').fill('E13/C#');
  await page.getByRole('button', { name: 'Save correction', exact: true }).click();
  const before = await exportedRecord(page);
  const inspector = page.getByRole('complementary', { name: 'Harmony inspector' });
  await inspector.getByRole('button', { name: 'Guitar', exact: true }).click();
  await expect(inspector.getByRole('img', { name: /Guitar voicing for E13/ })).toBeVisible();
  await expect(inspector.getByText(/Guitar practice reduction.*omits/)).toBeVisible();
  const library = page.getByRole('region', { name: 'Chord Library' });
  const card = library
    .getByTestId('practice-chord-card')
    .filter({ has: page.getByRole('heading', { name: 'E13/C#', exact: true }) });
  await expect(card.getByRole('img', { name: /Guitar voicing/ })).toBeVisible();
  await expect(card.getByText(/Guitar practice reduction.*omits/)).toBeVisible();
  await expect(card.locator('.piano-voicing svg')).toHaveCount(1);
  const piano = card.getByRole('img', { name: /Piano voicing/ });
  await expect(piano).toHaveAttribute('aria-label', /One hand:/);
  const pitches = await piano.getAttribute('aria-label');
  expect((pitches?.split('One hand:')[1].match(/[A-G][#b]?\d/g) ?? []).length).toBeLessThanOrEqual(
    5,
  );
  await expect(card.getByText(/Left hand|Right hand|unavailable/)).toHaveCount(0);
  await library.getByRole('button', { name: 'Easy practice', exact: true }).click();
  await library.getByLabel('Guitar capo').selectOption('1');
  await expect(card.getByRole('img', { name: /Guitar voicing/ })).toBeVisible();
  expect((await exportedRecord(page)).analysis).toEqual(before.analysis);
});
