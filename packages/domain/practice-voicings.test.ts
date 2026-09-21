import { describe, expect, it } from 'vitest';
import { parseChord } from './chord';
import { getGuitarVoicings, getPianoVoicings } from './practice-voicings';

const tuning = [40, 45, 50, 55, 59, 64];
const pcs = (notes: number[]) => [...new Set(notes.map((note) => note % 12))].sort((a, b) => a - b);

describe('practical guitar voicings', () => {
  it.each([
    ['C', [0, 4, 7], 0],
    ['D', [2, 6, 9], 2],
    ['E', [4, 8, 11], 4],
    ['F', [0, 5, 9], 5],
    ['G', [2, 7, 11], 7],
    ['A', [1, 4, 9], 9],
    ['Am', [0, 4, 9], 9],
    ['Em', [4, 7, 11], 4],
    ['Dm', [2, 5, 9], 2],
    ['G7', [2, 5, 7, 11], 7],
    ['Cmaj7', [0, 4, 7, 11], 0],
    ['Am7', [0, 4, 7, 9], 9],
    ['Bb', [2, 5, 10], 10],
    ['F#m', [1, 6, 9], 6],
    ['Dbmaj7', [0, 1, 5, 8], 1],
    ['D/F#', [2, 6, 9], 6],
    ['C/E', [0, 4, 7], 4],
    ['G/B', [2, 7, 11], 11],
    ['Am/C', [0, 4, 9], 0],
    ['Dsus2', [2, 4, 9], 2],
    ['Dsus4', [2, 7, 9], 2],
    ['Asus2', [4, 9, 11], 9],
    ['Asus4', [2, 4, 9], 9],
    ['G5', [2, 7], 7],
    ['Caug', [0, 4, 8], 0],
    ['Cdim', [0, 3, 6], 0],
    ['Bm7b5', [2, 5, 9, 11], 11],
    ['Cadd9', [0, 2, 4, 7], 0],
    ['C9', [0, 2, 4, 7, 10], 0],
  ] as const)(
    'plays all and only the notes of %s with its requested lowest bass',
    (label, tones, bass) => {
      const result = getGuitarVoicings(parseChord(label));
      expect(result.status).toBe('exact');
      expect(result.voicings.length).toBeGreaterThan(0);
      for (const voicing of result.voicings) {
        const sounding = voicing.frets.flatMap((fret, i) =>
          fret === null ? [] : [tuning[i] + fret],
        );
        expect(pcs(sounding)).toEqual(tones);
        expect(Math.min(...sounding) % 12).toBe(bass);
        expect(voicing.midiNotes).toEqual(sounding);
        expect(voicing.frets).toHaveLength(6);
        expect(voicing.fingers).toHaveLength(6);
        voicing.frets.forEach((fret, string) => {
          const finger = voicing.fingers[string];
          if (fret === null) expect(finger).toBeNull();
          else if (fret === 0) expect(finger).toBe(0);
          else expect(finger).toBeGreaterThan(0);
        });
        for (const finger of [1, 2, 3, 4]) {
          const strings = voicing.fingers.flatMap((value, string) =>
            value === finger ? [string] : [],
          );
          if (strings.length <= 1) continue;
          const first = strings[0];
          const last = strings[strings.length - 1];
          expect(
            voicing.barres.some(
              (barre) =>
                barre.finger === finger &&
                barre.fromString <= first &&
                barre.toString >= last &&
                strings.every((string) => voicing.frets[string] === barre.fret),
            ),
          ).toBe(true);
        }
        expect(
          voicing.fingers.every((finger) => finger === null || (finger >= 0 && finger <= 4)),
        ).toBe(true);
        const pressed = voicing.frets.filter((fret): fret is number => fret !== null && fret > 0);
        expect(Math.max(...pressed) - Math.min(...pressed)).toBeLessThanOrEqual(3);
      }
    },
  );

  it('does not mislabel an advanced or unavailable inversion as an exact basic chord', () => {
    for (const label of ['C13#11', 'C7b9', 'C/F#']) {
      const result = getGuitarVoicings(parseChord(label));
      expect(result.status).toBe('unavailable');
      expect(result.voicings).toEqual([]);
      expect(result.requestedLabel).toContain('C');
      expect(result.explanation).toBeTruthy();
    }
  });
});

describe('practical piano voicings', () => {
  it.each([
    ['C', [0, 4, 7], 0],
    ['Dm7', [0, 2, 5, 9], 2],
    ['D/F#', [2, 6, 9], 6],
    ['C/F#', [0, 4, 6, 7], 6],
    ['C7b9', [0, 1, 4, 7, 10], 0],
    ['F#m7b5', [0, 4, 6, 9], 6],
  ] as const)(
    'supplies compact playable pitches and a genuine lowest bass for %s',
    (label, tones, bass) => {
      const result = getPianoVoicings(parseChord(label));
      expect(result.status).toBe('exact');
      const voicing = result.voicings[0];
      expect(pcs(voicing.midiNotes)).toEqual(tones);
      expect(voicing.midiNotes[0] % 12).toBe(bass);
      expect(voicing.leftHand).toEqual([voicing.midiNotes[0]]);
      expect(voicing.rightHand.length).toBeLessThanOrEqual(5);
      expect(Math.max(...voicing.rightHand) - Math.min(...voicing.rightHand)).toBeLessThanOrEqual(
        12,
      );
      expect(voicing.omittedPitchClasses).toEqual([]);
    },
  );

  it('explicitly names reduced dense harmony while retaining bass, third, seventh and alterations', () => {
    const result = getPianoVoicings(parseChord('C13#11/E'));
    expect(result.status).toBe('simplified');
    expect(result.requestedLabel).toBe('C13(#11)/E');
    expect(result.explanation).toBeTruthy();
    const voicing = result.voicings[0];
    expect(voicing.midiNotes[0] % 12).toBe(4);
    expect(pcs(voicing.midiNotes)).toEqual([0, 2, 4, 6, 9, 10]);
    expect(voicing.omittedPitchClasses).toEqual([7]);
  });

  it('does not invent voicings for unknown or no chord', () => {
    for (const chord of [parseChord('N'), parseChord('X')]) {
      expect(getPianoVoicings(chord).status).toBe('unavailable');
      expect(getGuitarVoicings(chord).status).toBe('unavailable');
    }
  });
});
