import { chordPitchClasses, formatChord, pitchName, transposeChord } from './chord';
import { buildPracticeLibrary, type PracticeChordEntry } from './practice-library';
import {
  getGuitarVoicings,
  getPianoVoicings,
  type GuitarVoicing,
  type PianoVoicing,
  type VoicingResult,
} from './practice-voicings';
import type { ChordSegment, PitchedChord } from './types';

export type PracticeArrangementMode = 'song' | 'easy';
export interface PracticeArrangementEntry extends PracticeChordEntry {
  shapeLabel: string;
  guitar: VoicingResult<GuitarVoicing>;
  piano: VoicingResult<PianoVoicing>;
}
export interface PracticeArrangementOccurrence {
  segmentId: string;
  entryId: string;
  shapeLabel: string;
  guitar: VoicingResult<GuitarVoicing>;
  piano: VoicingResult<PianoVoicing>;
}
export interface PracticeArrangement {
  mode: PracticeArrangementMode;
  capo: number;
  recommendedCapo: number;
  capoExplanation: string;
  entries: PracticeArrangementEntry[];
  occurrences: PracticeArrangementOccurrence[];
}

function easyChord(chord: PitchedChord): PitchedChord {
  const simple: PitchedChord = {
    ...chord,
    seventh: null,
    extensions: [],
    addedTones: [],
    alterations: chord.alterations.filter((tone) => [2, 4].includes((tone.degree - 1) % 7)),
    omittedTones: [...chord.omittedTones],
  };
  const original = chordPitchClasses(chord);
  // A reduction cannot restore a tone explicitly replaced in the original.
  return chordPitchClasses(simple).every((pitch) => original.includes(pitch)) ? simple : chord;
}

function guitarEase(voicing: GuitarVoicing): number {
  const pressed = voicing.frets.filter((fret): fret is number => fret !== null && fret > 0);
  return (
    voicing.barres.length * 5 +
    Math.max(0, ...pressed) * 0.65 +
    new Set(voicing.fingers.filter((finger) => finger !== null && finger > 0)).size * 0.8 -
    voicing.frets.filter((fret) => fret === 0).length * 0.5
  );
}

function recommendCapo(entries: PracticeChordEntry[]): { fret: number; explanation: string } {
  if (!entries.length) return { fret: 0, explanation: 'No pitched chords need a capo.' };
  const weight = entries.reduce(
    (sum, entry) => sum + Math.max(entry.totalDuration, entry.count),
    0,
  );
  const scores = Array.from({ length: 8 }, (_, fret) => {
    let cost = 0;
    let unavailable = 0;
    for (const entry of entries) {
      const duration = Math.max(entry.totalDuration, entry.count);
      const result = getGuitarVoicings(transposeChord(easyChord(entry.chord), -fret), {
        limit: 16,
      });
      if (!result.voicings.length) unavailable += duration;
      cost +=
        duration *
        (result.voicings.length
          ? Math.min(...result.voicings.map(guitarEase)) + (result.status === 'simplified' ? 3 : 0)
          : 100);
    }
    return { fret, cost: cost / weight + fret * 0.2, unavailable };
  });
  const baseline = scores[0];
  const best = scores
    .filter((score) => score.unavailable <= baseline.unavailable)
    .sort((a, b) => a.cost - b.cost || a.fret - b.fret)[0];
  const saving = baseline.cost - best.cost;
  if (!best.fret || saving < 1 || saving < Math.abs(baseline.cost) * 0.15) {
    return {
      fret: 0,
      explanation: 'No capo gives a meaningful whole-song improvement over these shapes.',
    };
  }
  return {
    fret: best.fret,
    explanation: `Capo ${best.fret} gives easier or more open shapes across this song. Sounding chords and playback stay unchanged.`,
  };
}

function disclose<T extends GuitarVoicing | PianoVoicing>(
  original: PitchedChord,
  result: VoicingResult<T>,
  capo: number,
  instrument: string,
): VoicingResult<T> {
  if (!result.voicings.length) return { ...result, requestedLabel: formatChord(original) };
  const played = new Set(result.voicings[0].midiNotes.map((note) => (note + capo) % 12));
  const omitted = chordPitchClasses(original).filter((pitch) => !played.has(pitch));
  return {
    ...result,
    requestedLabel: formatChord(original),
    status: omitted.length ? 'simplified' : 'exact',
    explanation: omitted.length
      ? `${instrument} practice reduction omits ${omitted.map((pitch) => pitchName(pitch, original.spelling)).join(', ')}. The sounding song chord and bass are unchanged in the timeline.`
      : null,
    voicings: result.voicings.map((voicing) =>
      'omittedPitchClasses' in voicing ? { ...voicing, omittedPitchClasses: omitted } : voicing,
    ),
  };
}

interface Layer<T> {
  candidates: T[];
  start: number;
  end: number;
}
function path<T extends { id: string }>(
  layers: Layer<T>[],
  localCost: (value: T) => number,
  transition: (a: T, b: T) => number,
): (T | undefined)[] {
  const costs: number[][] = [];
  const parents: number[][] = [];
  const transitions = new Map<string, number>();
  for (let index = 0; index < layers.length; index++) {
    const layer = layers[index];
    costs.push([]);
    parents.push([]);
    for (const value of layer.candidates) {
      let best = Infinity;
      let parent = -1;
      const previous = layers[index - 1];
      if (!previous?.candidates.length) best = 0;
      else
        for (let choice = 0; choice < previous.candidates.length; choice++) {
          const previousValue = previous.candidates[choice];
          const key = `${previousValue.id}>${value.id}`;
          let movement = 0;
          if (layer.start - previous.end <= 2) {
            const cached = transitions.get(key);
            movement = cached ?? transition(previousValue, value);
            if (cached === undefined) transitions.set(key, movement);
          }
          const candidate = costs[index - 1][choice] + movement;
          if (candidate < best) {
            best = candidate;
            parent = choice;
          }
        }
      costs[index].push(best + localCost(value));
      parents[index].push(parent);
    }
  }
  const chosen: (T | undefined)[] = new Array(layers.length);
  let cursor = -1;
  for (let index = layers.length - 1; index >= 0; index--) {
    if (!layers[index].candidates.length) {
      cursor = -1;
      continue;
    }
    if (cursor < 0) cursor = costs[index].indexOf(Math.min(...costs[index]));
    chosen[index] = layers[index].candidates[cursor];
    cursor = parents[index][cursor];
  }
  return chosen;
}

function handMovement(a: number[], b: number[]): number {
  if (!a.length || !b.length) return Math.abs(a.length - b.length) * 4;
  const directed = (from: number[], to: number[]) =>
    from.reduce((sum, note) => sum + Math.min(...to.map((other) => Math.abs(note - other))), 0);
  return (directed(a, b) + directed(b, a)) / 2;
}

function selected<T extends { id: string }>(
  result: VoicingResult<T>,
  choice: T | undefined,
): VoicingResult<T> {
  return choice
    ? {
        ...result,
        voicings: [
          choice,
          ...result.voicings.filter((value) => value.id !== choice.id).slice(0, 2),
        ],
      }
    : result;
}

/** Suggested fingerings from frozen harmony and neighboring chords, not audio transcription. */
export function buildPracticeArrangement(
  segments: readonly ChordSegment[],
  options: { mode?: PracticeArrangementMode; capo?: number | 'recommended' } = {},
): PracticeArrangement {
  const mode = options.mode ?? 'song';
  const library = buildPracticeLibrary(segments);
  const recommendation = recommendCapo(library);
  const requestedCapo = options.capo === 'recommended' ? recommendation.fret : (options.capo ?? 0);
  if (!Number.isInteger(requestedCapo) || requestedCapo < 0 || requestedCapo > 7)
    throw new Error('Capo must be a fret from 0 to 7');
  const capo = mode === 'song' ? 0 : requestedCapo;
  const entries: PracticeArrangementEntry[] = library.map((entry) => {
    const practiceChord = mode === 'easy' ? easyChord(entry.chord) : entry.chord;
    const shape = transposeChord(practiceChord, -capo);
    const guitar = disclose(entry.chord, getGuitarVoicings(shape, { limit: 16 }), capo, 'Guitar');
    const piano = disclose(
      entry.chord,
      getPianoVoicings(practiceChord, { alternatives: true }),
      0,
      'Piano',
    );
    return { ...entry, shapeLabel: formatChord(shape), guitar, piano };
  });
  const bySegment = new Map(
    entries.flatMap((entry) =>
      entry.occurrences.map((occurrence) => [occurrence.segmentId, entry] as const),
    ),
  );
  const pitched = segments.flatMap((segment) => {
    const entry = bySegment.get(segment.id);
    return entry ? [{ segment, entry }] : [];
  });
  const guitarLayers = pitched.map(({ segment, entry }) => ({
    candidates: entry.guitar.voicings,
    start: segment.start,
    end: segment.end,
  }));
  const pianoLayers = pitched.map(({ segment, entry }) => ({
    candidates: entry.piano.voicings,
    start: segment.start,
    end: segment.end,
  }));
  const guitar =
    mode === 'easy'
      ? guitarLayers.map(
          (layer) => [...layer.candidates].sort((a, b) => guitarEase(a) - guitarEase(b))[0],
        )
      : path(
          guitarLayers,
          (value) => guitarEase(value) * 0.12,
          (a, b) =>
            a.frets.reduce<number>((sum, fret, string) => {
              const next = b.frets[string];
              return (
                sum +
                (fret === null || next === null ? (fret === next ? 0 : 0.7) : Math.abs(fret - next))
              );
            }, 0),
        );
  const piano = path(
    pianoLayers,
    (value) =>
      (Math.max(...value.leftHand) -
        Math.min(...value.leftHand) +
        (Math.max(...value.rightHand) - Math.min(...value.rightHand))) *
      0.03,
    (a, b) => handMovement(a.leftHand, b.leftHand) + handMovement(a.rightHand, b.rightHand),
  );
  const occurrences = pitched.map(({ segment, entry }, index) => ({
    segmentId: segment.id,
    entryId: entry.id,
    shapeLabel: entry.shapeLabel,
    guitar: selected(entry.guitar, guitar[index]),
    piano: selected(entry.piano, piano[index]),
  }));
  // The library shows an occurrence actually chosen by the contextual path.
  // Duration-weighted frequency makes recurring/held shapes representative.
  const timings = new Map(
    segments.map((segment) => [segment.id, Math.max(0.01, segment.end - segment.start)]),
  );
  const byEntry = new Map<string, PracticeArrangementOccurrence[]>();
  for (const occurrence of occurrences) {
    const group = byEntry.get(occurrence.entryId) ?? [];
    group.push(occurrence);
    byEntry.set(occurrence.entryId, group);
  }
  for (const entry of entries) {
    const matches = byEntry.get(entry.id) ?? [];
    for (const instrument of ['guitar', 'piano'] as const) {
      const totals = new Map<string, number>();
      for (const occurrence of matches) {
        const id = occurrence[instrument].voicings[0]?.id ?? '';
        totals.set(id, (totals.get(id) ?? 0) + (timings.get(occurrence.segmentId) ?? 0.01));
      }
      const representative = [...matches].sort(
        (a, b) =>
          (totals.get(b[instrument].voicings[0]?.id ?? '') ?? 0) -
          (totals.get(a[instrument].voicings[0]?.id ?? '') ?? 0),
      )[0];
      if (representative) {
        if (instrument === 'guitar') entry.guitar = representative.guitar;
        else entry.piano = representative.piano;
      }
    }
  }
  return {
    mode,
    capo,
    recommendedCapo: recommendation.fret,
    capoExplanation: recommendation.explanation,
    entries,
    occurrences,
  };
}
