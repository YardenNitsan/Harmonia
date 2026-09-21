import { pitchName } from '../../../../packages/domain/chord';
import type { GuitarVoicing, PianoVoicing } from '../../../../packages/domain/practice-voicings';

export function GuitarDiagram({ voicing, label }: { voicing: GuitarVoicing; label: string }) {
  const { baseFret, frets, fingers } = voicing;
  return (
    <svg
      className="guitar-diagram"
      viewBox="0 0 180 210"
      role="img"
      aria-label={`Guitar voicing for ${label}: ${frets.map((f, i) => (f === null ? 'muted' : f === 0 ? 'open' : `fret ${f}, finger ${fingers[i]}`)).join('; ')}, low E to high E. ${voicing.barres.map((b) => `Barre finger ${b.finger} at fret ${b.fret}, strings ${6 - b.fromString} to ${6 - b.toString}.`).join(' ')}`}
    >
      <title>{label} · standard tuning · low E to high E</title>
      {Array.from({ length: 6 }, (_, i) => (
        <line
          key={`f${i}`}
          x1="30"
          x2="150"
          y1={40 + i * 28}
          y2={40 + i * 28}
          stroke="var(--line)"
          strokeWidth={i === 0 && baseFret === 1 ? 4 : 1}
        />
      ))}
      {baseFret > 1 && (
        <text x="8" y="59" className="diagram-fret-label">
          {baseFret}
        </text>
      )}
      {voicing.barres.map((barre, index) => (
        <line
          key={index}
          x1={30 + barre.fromString * 24}
          x2={30 + barre.toString * 24}
          y1={54 + (barre.fret - baseFret) * 28}
          y2={54 + (barre.fret - baseFret) * 28}
          stroke="var(--accent)"
          strokeWidth="17"
          strokeLinecap="round"
        />
      ))}
      {frets.map((fret, string) => (
        <g key={string}>
          <line
            x1={30 + string * 24}
            x2={30 + string * 24}
            y1="40"
            y2="180"
            stroke="var(--muted)"
            strokeWidth={1.7 - string * 0.18}
          />
          {fret === null ? (
            <text x={30 + string * 24} y="29" textAnchor="middle" className="diagram-string-mark">
              ×
            </text>
          ) : fret === 0 ? (
            <circle
              cx={30 + string * 24}
              cy="23"
              r="5"
              fill="none"
              stroke="var(--text)"
              strokeWidth="1.5"
            />
          ) : (
            <>
              <circle
                cx={30 + string * 24}
                cy={54 + (fret - baseFret) * 28}
                r="9"
                fill="var(--accent)"
              />
              {fingers[string] !== null && (
                <text
                  x={30 + string * 24}
                  y={58 + (fret - baseFret) * 28}
                  textAnchor="middle"
                  className="diagram-finger"
                >
                  {fingers[string]}
                </text>
              )}
            </>
          )}
          <text x={30 + string * 24} y="200" textAnchor="middle" className="diagram-string-label">
            {['E', 'A', 'D', 'G', 'B', 'e'][string]}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function PianoDiagram({
  voicing,
  label,
  root,
  spelling,
}: {
  voicing: PianoVoicing;
  label: string;
  root: number;
  spelling: 'sharp' | 'flat';
}) {
  const notes = voicing.midiNotes;
  const start = Math.floor(Math.min(...notes) / 12) * 12;
  const end = Math.ceil((Math.max(...notes) + 1) / 12) * 12 - 1;
  const white = Array.from({ length: end - start + 1 }, (_, i) => start + i).filter((n) =>
    [0, 2, 4, 5, 7, 9, 11].includes(n % 12),
  );
  const black = Array.from({ length: end - start + 1 }, (_, i) => start + i).filter((n) =>
    [1, 3, 6, 8, 10].includes(n % 12),
  );
  const noteLabel = (n: number) => `${pitchName(n % 12, spelling)}${Math.floor(n / 12) - 1}`;
  return (
    <div className="piano-voicing">
      <svg
        viewBox={`0 0 ${white.length * 24} 108`}
        role="img"
        aria-label={`Piano voicing for ${label}: ${notes.map(noteLabel).join(', ')}`}
      >
        <title>
          {label} · {notes.map(noteLabel).join(', ')}
        </title>
        {white.map((n, i) => (
          <g key={n}>
            <rect
              x={i * 24 + 1}
              y="1"
              width="22"
              height="104"
              rx="3"
              fill={notes.includes(n) ? 'var(--accent)' : '#e7e6db'}
            />
            {notes.includes(n) && (
              <text x={i * 24 + 12} y="90" textAnchor="middle" className="piano-note-label">
                {pitchName(n % 12, spelling)}
              </text>
            )}
            {notes.includes(n) && n % 12 === root && (
              <circle cx={i * 24 + 12} cy="99" r="2" fill="var(--ink)" />
            )}
          </g>
        ))}
        {black.map((n) => {
          const x = white.filter((w) => w < n).length * 24;
          return (
            <g key={n}>
              <rect
                x={x - 7}
                y="1"
                width="14"
                height="62"
                rx="2"
                fill={notes.includes(n) ? '#70b996' : '#162023'}
                stroke="#162023"
                strokeWidth="1"
              />
              {notes.includes(n) && n % 12 === root && (
                <circle cx={x} cy="49" r="3" fill="#101d19" />
              )}
            </g>
          );
        })}
      </svg>
      <p className="voicing-notes">{notes.map(noteLabel).join(' · ')}</p>
      <p className="voicing-hands">
        Left: {voicing.leftHand.map(noteLabel).join(', ') || '—'}
        <br />
        Right: {voicing.rightHand.map(noteLabel).join(', ') || '—'}
      </p>
    </div>
  );
}
