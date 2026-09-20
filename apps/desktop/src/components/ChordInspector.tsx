import { memo, useState } from 'react';
import { chordPitchClasses, formatChord, pitchName } from '../../../../packages/domain/chord';
import type { Chord, ChordSegment } from '../../../../packages/domain/types';
import { Piano, Guitar } from './Instrument';
interface ChordInspectorProps {
  segment: ChordSegment | undefined;
  index: number;
  transpose: number;
  onSelectChord: (segmentId: string, chord: Chord) => void;
}
export const ChordInspector = memo(function ChordInspector({
  segment,
  index,
  transpose,
  onSelectChord,
}: ChordInspectorProps) {
  const [instrument, setInstrument] = useState<'piano' | 'guitar'>('piano');
  const chord = segment?.chord ?? { kind: 'unknown' as const };
  return (
    <aside className="inspector" aria-label="Harmony inspector">
      <div className="section-heading">
        <span className="eyebrow">INSIDE THE CHORD</span>
        <span className="small-index">{segment ? String(index + 1).padStart(2, '0') : '—'}</span>
      </div>
      <h2>{segment ? formatChord(chord) : '—'}</h2>
      <p className="chord-description">
        {chord.kind === 'chord'
          ? `${chord.triad} · ${chord.seventh ? `${chord.seventh} seventh` : 'triad'}`
          : 'No harmonic label'}
      </p>
      <div className="tones">
        {chordPitchClasses(chord).map((pc, i) => (
          <span
            className={chord.kind === 'chord' && pc === chord.root ? 'root-tone' : ''}
            key={`${pc}-${i}`}
          >
            {pitchName(pc, chord.kind === 'chord' ? chord.spelling : 'sharp')}
          </span>
        ))}
      </div>
      <div className="instrument-tabs">
        <button
          className={instrument === 'piano' ? 'selected' : ''}
          onClick={() => setInstrument('piano')}
        >
          Piano
        </button>
        <button
          className={instrument === 'guitar' ? 'selected' : ''}
          onClick={() => setInstrument('guitar')}
        >
          Guitar
        </button>
      </div>
      {instrument === 'piano' ? <Piano chord={chord} /> : <Guitar chord={chord} />}
      <div className="inspector-details">
        <span>Bass note</span>
        <strong>
          {chord.kind === 'chord' ? pitchName(chord.bass ?? chord.root, chord.spelling) : '—'}
        </strong>
        <span>Duration</span>
        <strong>{segment ? (segment.end - segment.start).toFixed(2) : '—'} s</strong>
      </div>
      {segment && segment.alternatives.length > 0 && (
        <div className="alternatives">
          <span className="eyebrow">OTHER POSSIBILITIES</span>
          {segment.alternatives.slice(0, 2).map((a, i) => (
            <button
              key={i}
              disabled={transpose !== 0}
              onClick={() => onSelectChord(segment.id, a.chord)}
            >
              <span>{formatChord(a.chord)}</span>
              <small>{Math.round(a.score * 100)}% score</small>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
});
