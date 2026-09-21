import { describe, expect, it } from 'vitest';
import { chordPitchClasses, parseChord } from './chord';
import { buildPracticeArrangement } from './practice-arrangement';
import { getPianoVoicings } from './practice-voicings';
import type { ChordSegment } from './types';

function song(labels: string[]): ChordSegment[] {
  return labels.map((label, index) => ({
    id: String(index),
    start: index * 2,
    end: index * 2 + 2,
    chord: parseChord(label),
    score: 0.8,
    alternatives: [],
  }));
}
const pcs = (notes: number[]) => [...new Set(notes.map((note) => note % 12))].sort((a, b) => a - b);
const movement = (notes: number[][]) =>
  notes
    .slice(1)
    .reduce(
      (sum, hand, index) =>
        sum +
        hand.reduce(
          (distance, note) =>
            distance + Math.min(...notes[index].map((previous) => Math.abs(note - previous))),
          0,
        ),
      0,
    );

describe('contextual practice arrangement', () => {
  it('keeps nearby piano positions through ascending chromatic harmony', () => {
    const segments = song(['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B', 'C']);
    const result = buildPracticeArrangement(segments);
    const arranged = result.occurrences.map((occurrence) => occurrence.piano.voicings[0].midiNotes);
    const isolated = segments.map(
      (segment) => getPianoVoicings(segment.chord).voicings[0].midiNotes,
    );
    expect(movement(arranged)).toBeLessThan(movement(isolated));
    expect(result.mode).toBe('song');
    expect(result.capo).toBe(0);
    for (let index = 0; index < segments.length; index++) {
      const voicing = result.occurrences[index].piano.voicings[0];
      expect(pcs(voicing.midiNotes)).toEqual(chordPitchClasses(segments[index].chord));
      expect(voicing.midiNotes.length).toBeLessThanOrEqual(5);
      expect(Math.max(...voicing.midiNotes) - Math.min(...voicing.midiNotes)).toBeLessThanOrEqual(
        9,
      );
    }
  });

  it('recommends a songwide capo only when it improves playable shapes', () => {
    const difficult = buildPracticeArrangement(song(['Gb', 'Bbm', 'Db', 'Ebm', 'Gb', 'Db']), {
      mode: 'easy',
      capo: 'recommended',
    });
    expect(difficult.recommendedCapo).toBeGreaterThan(0);
    expect(difficult.capo).toBe(difficult.recommendedCapo);
    expect(difficult.capoExplanation).toMatch(/easier|open/i);
    const easy = buildPracticeArrangement(song(['G', 'C', 'D', 'Em', 'G', 'D']), {
      mode: 'easy',
      capo: 'recommended',
    });
    expect(easy.recommendedCapo).toBe(0);
    for (const entry of difficult.entries) {
      expect(entry.guitar.status).toBe('exact');
      const sounding = entry.guitar.voicings[0].midiNotes.map((note) => note + difficult.capo);
      expect(pcs(sounding)).toEqual(chordPitchClasses(entry.chord));
      expect(Math.min(...sounding) % 12).toBe(entry.chord.bass ?? entry.chord.root);
    }
  });

  it('makes Easy reductions explicit while preserving sounding identity and slash bass', () => {
    const segments = song(['Dbmaj9/F', 'Dbmaj9/F', 'Bbm11/Ab', 'N', 'X']);
    const before = JSON.stringify(segments);
    const result = buildPracticeArrangement(segments, { mode: 'easy', capo: 1 });
    expect(result.entries[0].count).toBe(2);
    expect(result.entries[0].label).toBe('Dbmaj9/F');
    expect(result.entries[0].shapeLabel).toBe('C/E');
    for (const entry of result.entries) {
      expect(entry.guitar.status).toBe('simplified');
      expect(entry.guitar.explanation).toMatch(/omits/i);
      expect(entry.piano.status).toBe('simplified');
      const actual = entry.guitar.voicings[0].midiNotes.map((note) => note + result.capo);
      expect(pcs(actual).every((pitch) => chordPitchClasses(entry.chord).includes(pitch))).toBe(
        true,
      );
      expect(Math.min(...actual) % 12).toBe(entry.chord.bass ?? entry.chord.root);
    }
    expect(result.occurrences).toHaveLength(3);
    expect(JSON.stringify(segments)).toBe(before);
    expect(buildPracticeArrangement(song(['N', 'X'])).entries).toEqual([]);
  });

  it('uses future context and chooses a representative from actual occurrences', () => {
    const result = buildPracticeArrangement(song(['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G']));
    for (const entry of result.entries) {
      const occurrences = result.occurrences.filter(
        (occurrence) => occurrence.entryId === entry.id,
      );
      expect(occurrences).toHaveLength(entry.count);
      expect(
        occurrences.some(
          (occurrence) => occurrence.piano.voicings[0].id === entry.piano.voicings[0].id,
        ),
      ).toBe(true);
    }
  });
});
