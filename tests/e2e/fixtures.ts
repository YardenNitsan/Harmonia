import { expect, test as base, type Page } from '@playwright/test';
import type { SavedTrack } from '../../packages/domain/types';

export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await use(errors);
      expect(errors, 'no uncaught browser exceptions').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

// Deterministic PCM, decoded and analyzed through the ordinary file-import path.
// These tones exercise the pipeline; they do not establish real-song accuracy.
export function wavFile(name = 'local-progression.wav', duration = 6, pitchOffset = 0) {
  const rate = 22050;
  const length = Math.round(duration * rate);
  const buffer = Buffer.alloc(44 + length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(length * 2, 40);
  const chords = [
    [48, 60, 64, 67],
    [45, 57, 60, 64],
    [43, 55, 59, 62],
  ];
  for (let i = 0; i < length; i++) {
    const time = i / rate;
    const localTime = time % 2;
    const envelope = Math.min(1, localTime / 0.02, (2 - localTime) / 0.04);
    const notes = chords[Math.floor(time / 2) % chords.length];
    const sample =
      notes.reduce(
        (sum, midi) =>
          sum + Math.sin(2 * Math.PI * 440 * 2 ** ((midi + pitchOffset - 69) / 12) * time),
        0,
      ) / notes.length;
    buffer.writeInt16LE(Math.round(sample * envelope * 24000), 44 + i * 2);
  }
  return { name, mimeType: 'audio/wav', buffer };
}

export async function importWav(page: Page, file = wavFile()) {
  await page.getByLabel('Import audio file').setInputFiles(file);
  await expect(page.getByTestId('track-title')).toHaveText(file.name);
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  return file;
}

export async function exportedRecord(page: Page): Promise<SavedTrack> {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = await downloading;
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Analysis export produced no data');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as SavedTrack;
}
