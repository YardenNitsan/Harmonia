import type { Analysis, AnalysisProfile, ChordSegment } from '../domain/types';
import type { AudioFeatures } from './features';
import { TemplateRecognizer, chordIdentity } from './recognizer';
import { estimateKey, estimateRhythm } from './rhythm';
import { harmonicNovelty } from './segmentation';
import { decodeWholeSequence } from './whole-decoder';
export const WHOLE_SONG_PIPELINE_VERSION = 'harmonia-whole-song-v1';
export const WHOLE_SONG_MODEL_VERSION = 'dsp-whole-song-v1';
/** Frozen engineering settings; no validation-based tuning or quality claim. */
export const WHOLE_SONG_SETTINGS = Object.freeze({ changePenalty: 0.12 });
export function analyzeWholeSongFeatures(
  features: AudioFeatures,
  fingerprint: string,
  profile: AnalysisProfile,
  progress?: (stage: string, value: number) => void,
): Analysis {
  if (
    !Number.isFinite(features.hopSeconds) ||
    features.hopSeconds <= 0 ||
    features.waveform.length > 900 ||
    features.waveform.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
  )
    throw new Error('Invalid whole-song feature metadata');
  const novelty = harmonicNovelty(features);
  const recognizer = new TemplateRecognizer();
  const noChord = recognizer.templateCount;
  const decoded = decodeWholeSequence(
    features.frames.length,
    noChord + 1,
    (index, emissions) => {
      emissions.fill(-Infinity);
      const choices = recognizer.scoreAll(features.frames[index]);
      if (choices[0].chord.kind === 'none') emissions[noChord] = 1;
      else
        choices.forEach((choice, state) => {
          emissions[state] = choice.score;
        });
    },
    WHOLE_SONG_SETTINGS.changePenalty,
    (value) => progress?.('Decoding complete-song harmony', 0.65 + value * 0.25),
  );

  const segments: ChordSegment[] = [];
  let previousKey: string | undefined;
  for (let i = 0; i < decoded.states.length; i++) {
    const choices = recognizer.scoreAll(features.frames[i]);
    const chosen = decoded.states[i] === noChord ? choices[0] : choices[decoded.states[i]];
    const key = chordIdentity(chosen.chord);
    const start = features.frames[i].time;
    const end = i + 1 < features.frames.length ? features.frames[i + 1].time : features.duration;
    const previous = segments.at(-1);
    if (previous && key === previousKey) {
      previous.score =
        (previous.score * (previous.end - previous.start) + chosen.score * (end - start)) /
        (end - previous.start);
      previous.end = end;
    } else {
      segments.push({
        id: `whole-segment-${segments.length}`,
        start,
        end,
        chord: chosen.chord,
        score: chosen.score,
        alternatives: choices
          .filter((choice) => chordIdentity(choice.chord) !== key)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3),
      });
    }
    previousKey = key;
    if (i % 128 === 0)
      progress?.('Building complete-song timeline', 0.9 + (i / decoded.states.length) * 0.09);
  }
  const rhythm = estimateRhythm(features);
  const analysis: Analysis = {
    id: `${fingerprint}:${WHOLE_SONG_MODEL_VERSION}:${WHOLE_SONG_PIPELINE_VERSION}:${profile}`,
    fingerprint,
    profile,
    modelVersion: WHOLE_SONG_MODEL_VERSION,
    pipelineVersion: WHOLE_SONG_PIPELINE_VERSION,
    duration: features.duration,
    segments,
    beats: rhythm.beats,
    tempo: rhythm.tempo,
    meter: null,
    key: estimateKey(features),
    waveform: features.waveform,
    boundaries: novelty.map((probability, i) => ({ time: features.frames[i].time, probability })),
    createdAt: new Date().toISOString(),
    calibration: 'uncalibrated',
    warnings: [
      'Whole-song DSP prototype: final Viterbi decoding uses the complete recording. Recognition accuracy has not been established.',
      'Scores and boundary values are uncalibrated acoustic similarities, not probabilities. Bass and extended chords require review.',
      'Global key and beats are provisional estimates. Global tuning correction, local keys, song sections, meter and downbeats are not implemented.',
      'All whole-song profiles use the same frozen DSP decoder; no pretrained recognition model is used.',
    ],
  };
  progress?.('Complete-song analysis ready', 1);
  return analysis;
}
