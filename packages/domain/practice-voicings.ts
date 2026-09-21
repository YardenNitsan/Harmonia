import { chordPitchClasses, formatChord, pitchName } from './chord';
import type { Chord } from './types';

export interface VoicingResult<T> {
  requestedLabel: string;
  status: 'exact' | 'simplified' | 'unavailable';
  explanation: string | null;
  voicings: T[];
}

export interface GuitarBarre {
  fret: number;
  /** Zero-based string indices, low E (0) to high e (5). */
  fromString: number;
  toString: number;
  finger: number;
}

export interface GuitarVoicing {
  id: string;
  name: string;
  /** Low E to high e. Null = muted, zero = open. */
  frets: (number | null)[];
  /** Null = muted, zero = open, 1–4 = index through little finger. */
  fingers: (number | null)[];
  barres: GuitarBarre[];
  baseFret: number;
  midiNotes: number[];
}

export interface PianoVoicing {
  id: string;
  name: string;
  midiNotes: number[];
  leftHand: number[];
  rightHand: number[];
  omittedPitchClasses: number[];
}

export const STANDARD_GUITAR_TUNING = [40, 45, 50, 55, 59, 64] as const;

interface GuitarShape {
  name: string;
  frets: (number | null)[];
  fingers: (number | null)[];
  barres?: GuitarBarre[];
}

// Original, hand-entered common shapes. These are whole playable grips, not
// independent nearest-note choices on each string. Every candidate is checked
// against the requested complete pitch set and actual lowest sounding pitch.
const OPEN_SHAPES: GuitarShape[] = [
  { name: 'Open Dsus2', frets: [null, null, 0, 2, 3, 0], fingers: [null, null, 0, 1, 3, 0] },
  { name: 'Open Dsus4', frets: [null, null, 0, 2, 3, 3], fingers: [null, null, 0, 1, 3, 4] },
  { name: 'Open Asus2', frets: [null, 0, 2, 2, 0, 0], fingers: [null, 0, 1, 2, 0, 0] },
  { name: 'Open Asus4', frets: [null, 0, 2, 2, 3, 0], fingers: [null, 0, 1, 2, 3, 0] },
  {
    name: 'G power chord',
    frets: [3, 5, 5, null, null, null],
    fingers: [1, 3, 4, null, null, null],
  },
  {
    name: 'C augmented',
    frets: [null, 3, 2, 1, 1, null],
    fingers: [null, 4, 3, 1, 1, null],
    barres: [{ fret: 1, fromString: 3, toString: 4, finger: 1 }],
  },
  { name: 'C diminished', frets: [null, 3, 4, 5, 4, null], fingers: [null, 1, 2, 4, 3, null] },
  { name: 'B half diminished', frets: [null, 2, 3, 2, 3, null], fingers: [null, 1, 3, 2, 4, null] },
  { name: 'Open Cadd9', frets: [null, 3, 2, 0, 3, 3], fingers: [null, 2, 1, 0, 3, 4] },
  {
    name: 'C9 with fifth',
    frets: [null, 3, 2, 3, 3, 3],
    fingers: [null, 2, 1, 3, 3, 3],
    barres: [{ fret: 3, fromString: 3, toString: 5, finger: 3 }],
  },
  { name: 'Open C', frets: [null, 3, 2, 0, 1, 0], fingers: [null, 3, 2, 0, 1, 0] },
  { name: 'Open D', frets: [null, null, 0, 2, 3, 2], fingers: [null, null, 0, 1, 3, 2] },
  { name: 'Open E', frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
  { name: 'Open G', frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3] },
  { name: 'Open A', frets: [null, 0, 2, 2, 2, 0], fingers: [null, 0, 1, 2, 3, 0] },
  { name: 'Open Am', frets: [null, 0, 2, 2, 1, 0], fingers: [null, 0, 2, 3, 1, 0] },
  { name: 'Open Em', frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
  { name: 'Open Dm', frets: [null, null, 0, 2, 3, 1], fingers: [null, null, 0, 2, 3, 1] },
  { name: 'Open C7', frets: [null, 3, 2, 3, 1, 0], fingers: [null, 3, 2, 4, 1, 0] },
  { name: 'Open D7', frets: [null, null, 0, 2, 1, 2], fingers: [null, null, 0, 2, 1, 3] },
  { name: 'Open E7', frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] },
  { name: 'Open G7', frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
  { name: 'Open A7', frets: [null, 0, 2, 0, 2, 0], fingers: [null, 0, 1, 0, 2, 0] },
  { name: 'Open Cmaj7', frets: [null, 3, 2, 0, 0, 0], fingers: [null, 3, 2, 0, 0, 0] },
  { name: 'Open Amaj7', frets: [null, 0, 2, 1, 2, 0], fingers: [null, 0, 2, 1, 3, 0] },
  { name: 'Open Em7', frets: [0, 2, 0, 0, 0, 0], fingers: [0, 2, 0, 0, 0, 0] },
  { name: 'Open Am7', frets: [null, 0, 2, 0, 1, 0], fingers: [null, 0, 2, 0, 1, 0] },
  { name: 'D with F# bass', frets: [2, null, 0, 2, 3, 2], fingers: [1, null, 0, 2, 4, 3] },
  { name: 'C with E bass', frets: [0, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
  { name: 'G with B bass', frets: [null, 2, 0, 0, 0, 3], fingers: [null, 1, 0, 0, 0, 3] },
  { name: 'Am with C bass', frets: [null, 3, 2, 2, 1, 0], fingers: [null, 4, 2, 3, 1, 0] },
];

const MOVABLE_SHAPES: GuitarShape[] = [
  { name: 'E major shape', frets: [0, 2, 2, 1, 0, 0], fingers: [1, 3, 4, 2, 1, 1] },
  { name: 'E minor shape', frets: [0, 2, 2, 0, 0, 0], fingers: [1, 3, 4, 1, 1, 1] },
  { name: 'E7 shape', frets: [0, 2, 0, 1, 0, 0], fingers: [1, 3, 1, 2, 1, 1] },
  { name: 'Em7 shape', frets: [0, 2, 0, 0, 0, 0], fingers: [1, 3, 1, 1, 1, 1] },
  { name: 'Emaj7 shape', frets: [0, 2, 1, 1, 0, 0], fingers: [1, 4, 2, 3, 1, 1] },
  { name: 'A major shape', frets: [null, 0, 2, 2, 2, 0], fingers: [null, 1, 2, 3, 4, 1] },
  { name: 'A minor shape', frets: [null, 0, 2, 2, 1, 0], fingers: [null, 1, 3, 4, 2, 1] },
  { name: 'A7 shape', frets: [null, 0, 2, 0, 2, 0], fingers: [null, 1, 3, 1, 4, 1] },
  { name: 'Am7 shape', frets: [null, 0, 2, 0, 1, 0], fingers: [null, 1, 3, 1, 2, 1] },
  { name: 'Amaj7 shape', frets: [null, 0, 2, 1, 2, 0], fingers: [null, 1, 3, 2, 4, 1] },
];

function guitarVoicing(shape: GuitarShape, offset = 0): GuitarVoicing {
  const frets = shape.frets.map((fret) => (fret === null ? null : fret + offset));
  const pressed = frets.filter((fret): fret is number => fret !== null && fret > 0);
  const baseFret = Math.max(...pressed) <= 4 ? 1 : Math.min(...pressed);
  return {
    id: frets.map((fret) => fret ?? 'x').join('-'),
    name: offset ? `${shape.name}, barre at fret ${offset}` : shape.name,
    frets,
    fingers: [...shape.fingers],
    barres: offset
      ? [{ fret: offset, fromString: frets[0] === null ? 1 : 0, toString: 5, finger: 1 }]
      : (shape.barres ?? []).map((barre) => ({ ...barre })),
    baseFret,
    midiNotes: frets.flatMap((fret, i) =>
      fret === null ? [] : [STANDARD_GUITAR_TUNING[i] + fret],
    ),
  };
}

const GUITAR_VOICINGS: GuitarVoicing[] = [
  ...OPEN_SHAPES.map((shape) => guitarVoicing(shape)),
  ...Array.from({ length: 12 }, (_, i) =>
    MOVABLE_SHAPES.map((shape) => guitarVoicing(shape, i + 1)),
  ).flat(),
];

function unavailable<T>(chord: Chord, explanation: string): VoicingResult<T> {
  return { requestedLabel: formatChord(chord), status: 'unavailable', explanation, voicings: [] };
}

export function getGuitarVoicings(chord: Chord): VoicingResult<GuitarVoicing> {
  if (chord.kind !== 'chord') return unavailable(chord, 'No pitched chord to play.');
  const wanted = chordPitchClasses(chord).join(',');
  const bass = chord.bass ?? chord.root;
  const matches = GUITAR_VOICINGS.filter((voicing) => {
    const pitches = [...new Set(voicing.midiNotes.map((note) => note % 12))].sort((a, b) => a - b);
    return pitches.join(',') === wanted && Math.min(...voicing.midiNotes) % 12 === bass;
  });
  if (!matches.length)
    return unavailable(
      chord,
      'No verified practical guitar shape for this chord and bass yet. Use the piano voicing or chord-tone map.',
    );
  return {
    requestedLabel: formatChord(chord),
    status: 'exact',
    explanation: null,
    voicings: matches.slice(0, 3).map((voicing) => ({
      ...voicing,
      frets: [...voicing.frets],
      fingers: [...voicing.fingers],
      barres: voicing.barres.map((barre) => ({ ...barre })),
      midiNotes: [...voicing.midiNotes],
    })),
  };
}

export function getPianoVoicings(chord: Chord): VoicingResult<PianoVoicing> {
  if (chord.kind !== 'chord') return unavailable(chord, 'No pitched chord to play.');
  const bass = chord.bass ?? chord.root;
  const leftHand = [48 + bass];
  let upperPitches = chordPitchClasses({ ...chord, bass: null });
  // The left hand already supplies bass; reclaim that right-hand finger in
  // dense harmony, then prioritize color tones over an unaltered fifth.
  if (upperPitches.length > 5) upperPitches = upperPitches.filter((pitch) => pitch !== bass);
  const priority = [3, 4, 10, 11, 1, 2, 5, 6, 8, 9, 0, 7];
  upperPitches.sort(
    (a, b) =>
      priority.indexOf((a - chord.root + 12) % 12) - priority.indexOf((b - chord.root + 12) % 12),
  );
  const rightHand = upperPitches
    .slice(0, 5)
    .map((pitch) => 60 + pitch)
    .sort((a, b) => a - b);
  const midiNotes = [...leftHand, ...rightHand];
  const played = new Set(midiNotes.map((note) => note % 12));
  const omittedPitchClasses = chordPitchClasses(chord).filter((pitch) => !played.has(pitch));
  const simplified = omittedPitchClasses.length > 0;
  return {
    requestedLabel: formatChord(chord),
    status: simplified ? 'simplified' : 'exact',
    explanation: simplified
      ? `Reduced piano voicing; omits ${omittedPitchClasses.map((pitch) => pitchName(pitch, chord.spelling)).join(', ')}. The analyzed chord label is unchanged.`
      : null,
    voicings: [
      {
        id: midiNotes.join('-'),
        name: 'Bass + compact right hand',
        midiNotes,
        leftHand,
        rightHand,
        omittedPitchClasses,
      },
    ],
  };
}
