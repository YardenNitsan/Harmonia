import { memo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
export const PracticeControls = memo(function PracticeControls({
  transpose,
  onChange,
}: {
  transpose: number;
  onChange: Dispatch<SetStateAction<number>>;
}) {
  return (
    <div className="practice-row">
      <div>
        <span className="eyebrow">MAKE IT YOURS</span>
        <p>Slow it down. Find the shape. Play it your way.</p>
      </div>
      <div className="transpose">
        <span>
          Display transpose <small>notation only</small>
        </span>
        <button
          className="icon-button"
          aria-label="Transpose down"
          disabled={transpose <= -12}
          onClick={() => onChange((v) => v - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <strong>
          {transpose > 0 ? '+' : ''}
          {transpose}
        </strong>
        <button
          className="icon-button"
          aria-label="Transpose up"
          disabled={transpose >= 12}
          onClick={() => onChange((v) => v + 1)}
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
});
