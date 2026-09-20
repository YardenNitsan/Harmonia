import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { formatChord, parseChord } from '../../../../packages/domain/chord';
import type { ChordSegment } from '../../../../packages/domain/types';
import type { SessionController } from '../../../../packages/application/session';

export function ChordEditor({
  segment,
  controller,
  onClose,
  isLast,
}: {
  segment: ChordSegment;
  controller: SessionController;
  onClose: () => void;
  isLast: boolean;
}) {
  const [symbol, setSymbol] = useState(formatChord(segment.chord));
  const [end, setEnd] = useState(String(segment.end));
  const [error, setError] = useState('');
  const ref = useRef<HTMLDialogElement>(null);
  const symbolInput = useRef<HTMLInputElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    symbolInput.current?.focus();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      const chord = parseChord(symbol);
      const time = Number(end);
      if (!Number.isFinite(time)) throw new Error('Enter a valid boundary time');
      if (!isLast && time !== segment.end) await controller.editBoundary(segment.id, time);
      await controller.editChord(segment.id, chord);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invalid chord');
    }
  }
  return (
    <dialog
      ref={ref}
      className="editor"
      aria-labelledby={titleId}
      onCancel={onClose}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled])',
        );
        const first = controls[0],
          last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <form onSubmit={save}>
        <div className="section-heading">
          <span className="eyebrow">YOUR MUSICAL JUDGMENT</span>
          <button type="button" className="icon-button" aria-label="Close editor" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <h2 id={titleId}>Refine this moment.</h2>
        <p>Corrections stay in your local library.</p>
        <label>
          Chord symbol
          <input
            ref={symbolInput}
            value={symbol}
            onChange={(event) => setSymbol(event.target.value)}
            placeholder="G13(b9)/B"
          />
        </label>
        {!isLast && (
          <label>
            End time in seconds
            <input
              type="number"
              step="0.001"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>
        )}
        <p className="hint">
          Supports extensions, alterations and slash chords. Use N for no chord.
        </p>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <button className="primary" type="submit">
          Save correction
        </button>
      </form>
    </dialog>
  );
}
