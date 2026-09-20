import { expect, it } from 'vitest';
import { validateSourceProvenance } from './source';
import type { SourceProvenance } from './types';

export const licensedSource: SourceProvenance = {
  provider: 'commons',
  id: '123',
  title: 'A song',
  artist: 'A musician',
  thumbnail: null,
  pageUrl: 'https://commons.wikimedia.org/wiki/File:A_song.ogg',
  audio: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/A_song.ogg',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'A musician — CC BY 4.0',
    size: 1024,
  },
};
it('accepts bounded official Commons provenance and a legal source identity', () => {
  expect(validateSourceProvenance(licensedSource)).toEqual(licensedSource);
});
it.each([
  { provider: 'arbitrary' },
  { id: '' },
  { title: 'x'.repeat(1001) },
  { pageUrl: 'https://commons.wikimedia.org.evil.test/wiki/File:Song.ogg' },
  { thumbnail: 'javascript:alert(1)' },
  {
    audio: {
      ...licensedSource.audio,
      url: 'https://user@upload.wikimedia.org/wikipedia/commons/a/ab/A.ogg',
    },
  },
  {
    audio: {
      ...licensedSource.audio,
      url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/A.ogg#secret',
    },
  },
  {
    audio: {
      ...licensedSource.audio,
      licenseUrl: 'https://creativecommons.org/licenses/by-nc/4.0/',
    },
  },
  { audio: { ...licensedSource.audio, size: 100 * 1024 * 1024 + 1 } },
  { audio: null },
])('rejects unsupported or malformed source provenance %j', (patch) => {
  expect(() => validateSourceProvenance({ ...licensedSource, ...patch })).toThrow();
});
