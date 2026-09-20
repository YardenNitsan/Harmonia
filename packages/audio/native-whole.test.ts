import { expect, it } from 'vitest';
import { assembleNativeWholeSong, NATIVE_MODEL_VERSION } from './native-whole';
import { formatChord } from '../domain/chord';
const result = () => ({
  schemaVersion: 1,
  sampleRate: 22050,
  sampleCount: 220500,
  duration: 10,
  modelVersion: NATIVE_MODEL_VERSION,
  segments: [
    { start: 0, end: 5, label: 'G:maj', score: 0.8 },
    { start: 5, end: 10, label: 'D:7/3', score: 0.75 },
  ],
  beats: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  tempo: 60,
  timings: {
    setupSeconds: 0,
    cqtSeconds: 0.1,
    inferenceSeconds: 0.2,
    decodeSeconds: 0.03,
    beatSeconds: 0.02,
    totalSeconds: 0.4,
  },
  warnings: [],
});
it('assembles the complete native region timeline without frame-level bass splitting', () => {
  const analysis = assembleNativeWholeSong(result(), {
    fingerprint: 'a'.repeat(64),
    profile: 'balanced',
    samples: 220500,
    waveform: [0.1],
  });
  expect(analysis.segments.map((s) => formatChord(s.chord))).toEqual(['G', 'D7/F#']);
  expect(analysis.duration).toBe(10);
  expect(analysis.modelVersion).toBe(NATIVE_MODEL_VERSION);
  expect(analysis.calibration).toBe('uncalibrated');
});
it('rejects wrong models, incomplete bounds, nonfinite support and mismatched PCM identity', () => {
  const metadata = {
    fingerprint: 'a'.repeat(64),
    profile: 'balanced' as const,
    samples: 220500,
    waveform: [0.1],
  };
  expect(() => assembleNativeWholeSong({ ...result(), modelVersion: 'wrong' }, metadata)).toThrow();
  expect(() => assembleNativeWholeSong({ ...result(), sampleCount: 220499 }, metadata)).toThrow();
  const gap = result();
  gap.segments[1].start = 5.2;
  expect(() => assembleNativeWholeSong(gap, metadata)).toThrow();
  const nonfinite = result();
  nonfinite.segments[0].score = NaN;
  expect(() => assembleNativeWholeSong(nonfinite, metadata)).toThrow();
});
