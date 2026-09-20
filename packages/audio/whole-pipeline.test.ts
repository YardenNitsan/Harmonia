import { expect, it } from 'vitest';
import { chordPitchClasses, formatChord, parseChord } from '../domain/chord';
import { extractFeatures, type AudioFeatures, type FeatureFrame } from './features';
import { analyzeFeatures } from './pipeline';
import { TemplateRecognizer } from './recognizer';
import { analyzeWholeSongFeatures } from './whole-pipeline';

function frame(label: string, time: number): FeatureFrame {
  const pitches = chordPitchClasses(parseChord(label));
  const chroma = Array.from({ length: 12 }, (_, i) =>
    pitches.includes(i) ? 1 / Math.sqrt(pitches.length) : 0,
  );
  return { time, chroma, bass: Array(12).fill(0), rms: pitches.length ? 0.1 : 0, onset: 0 };
}
function features(labels: string[]): AudioFeatures {
  return {
    frames: labels.map((label, i) => frame(label, i * 0.1)),
    duration: labels.length * 0.1,
    hopSeconds: 0.1,
    waveform: [0.1],
  };
}

it('makes all acoustic templates available without changing the baseline top four', () => {
  const recognizer = new TemplateRecognizer();
  const input = frame('Cmaj7', 0);
  const all = recognizer.scoreAll(input);
  expect(all).toHaveLength(324);
  expect(recognizer.predict(input)).toEqual([...all].sort((a, b) => b.score - a.score).slice(0, 4));
  expect(all.some((candidate) => formatChord(candidate.chord) === 'Cmaj7')).toBe(true);
});

it('retains supported seventh/extended chord vocabulary instead of reducing to major/minor', () => {
  const result = analyzeWholeSongFeatures(features(Array(30).fill('Cmaj7')), 'rich', 'balanced');
  expect(result.segments).toHaveLength(1);
  expect(formatChord(result.segments[0].chord)).toBe('Cmaj7');
});

it('keeps silence and both sides of a short strong chord with complete bounds', () => {
  const result = analyzeWholeSongFeatures(
    features(['C', 'C', 'N', 'G', 'N', 'F', 'F']),
    'change',
    'balanced',
  );
  expect(result.segments.map((segment) => formatChord(segment.chord))).toEqual([
    'C',
    'N',
    'G',
    'N',
    'F',
  ]);
  expect(result.segments[0].start).toBe(0);
  expect(result.segments.at(-1)?.end).toBeCloseTo(0.7);
  result.segments
    .slice(1)
    .forEach((segment, index) => expect(segment.start).toBe(result.segments[index].end));
});

it('builds a complete unknown-key no-chord timeline from actual silent PCM', () => {
  const result = analyzeWholeSongFeatures(
    extractFeatures(new Float32Array(22050), 22050),
    'silent',
    'balanced',
  );
  expect(result.segments).toMatchObject([{ start: 0, end: 1, chord: { kind: 'none' } }]);
  expect(result.key).toBeNull();
  expect(result.tempo).toBeNull();
  expect(result.meter).toBeNull();
  expect(result.calibration).toBe('uncalibrated');
});

it('uses a different cache identity from the baseline for the same complete recording', () => {
  const input = features(Array(30).fill('C'));
  const baseline = analyzeFeatures(input, 'same', 'balanced');
  const whole = analyzeWholeSongFeatures(input, 'same', 'balanced');
  expect(whole.id).not.toBe(baseline.id);
  expect(whole.pipelineVersion).not.toBe(baseline.pipelineVersion);
  expect(whole.id).toContain(whole.pipelineVersion);
  expect(whole.id).toContain(whole.modelVersion);
  expect(whole.key).toMatchObject({ root: 0, mode: 'major' });
});

it('rejects malformed or unbounded features before decoding', () => {
  expect(() =>
    analyzeWholeSongFeatures({ ...features(['C']), duration: 1201 }, 'bad', 'balanced'),
  ).toThrow();
  expect(() =>
    analyzeWholeSongFeatures({ ...features(['C']), frames: [] }, 'bad', 'balanced'),
  ).toThrow();
  const invalid = features(['C']);
  invalid.frames[0].chroma[3] = NaN;
  expect(() => analyzeWholeSongFeatures(invalid, 'bad', 'balanced')).toThrow();
});
