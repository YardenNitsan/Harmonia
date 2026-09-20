import { expect, it } from 'vitest';
import { createAnalysisExport } from './export';
import { parseChord } from '../domain/chord';
import type { SavedTrack } from '../domain/types';

function savedTrack(name = 'After hours.wav'): SavedTrack {
  const before = {
    id: 'segment-1',
    start: 0,
    end: 4,
    chord: parseChord('Cmaj7'),
    score: 0.8,
    alternatives: [],
  };
  const after = { ...before, chord: parseChord('G13(b9)/B') };
  return {
    track: {
      id: 'audio',
      fingerprint: 'audio',
      name,
      duration: 4,
      importedAt: '2026-09-20T12:00:00Z',
      favorite: true,
    },
    analysis: {
      id: 'analysis',
      fingerprint: 'audio',
      profile: 'balanced',
      modelVersion: 'dsp-template-v1',
      pipelineVersion: 'pipeline',
      duration: 4,
      segments: [after],
      beats: [0, 1, 2, 3],
      tempo: 60,
      meter: null,
      key: null,
      waveform: [0.2, 0.4],
      boundaries: [],
      createdAt: '2026-09-20T12:00:00Z',
      calibration: 'uncalibrated',
      warnings: ['Review estimates.'],
    },
    corrections: [
      {
        id: 'correction',
        analysisId: 'analysis',
        segmentId: 'segment-1',
        before,
        after,
        createdAt: '2026-09-20T12:01:00Z',
      },
    ],
  };
}

it('exports the full structured record, provenance and corrections as readable JSON', () => {
  const record = savedTrack();
  const result = createAnalysisExport(record);
  expect(result.mediaType).toBe('application/json');
  expect(JSON.parse(result.contents)).toEqual(record);
  expect(result.contents).toContain('\n  "track": {');
});

it('does not mutate the original record or retain mutable export data', () => {
  const record = savedTrack();
  const before = structuredClone(record);
  const result = createAnalysisExport(record);
  expect(record).toEqual(before);
  record.track.name = 'Renamed';
  record.analysis.segments[0].chord = parseChord('N');
  expect(JSON.parse(result.contents)).toEqual(before);
});

it.each([
  ['After hours.wav', 'After hours.wav.harmonia.json'],
  ['F#7/B: take "2"?.flac', 'F_7_B_ take _2__.flac.harmonia.json'],
  ['../practice\\song.mp3', '.._practice_song.mp3.harmonia.json'],
])('uses a safe portable download filename for %s', (name, expected) => {
  expect(createAnalysisExport(savedTrack(name)).filename).toBe(expected);
});
