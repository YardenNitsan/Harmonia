import { useCallback, useEffect, useState } from 'react';
import type { LocalPlayback } from '../../../../packages/application/contracts';
export function usePlaybackClock(player: LocalPlayback) {
  const [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false);
  useEffect(() => {
    let frame = 0,
      last = 0;
    const tick = (now: number) => {
      if (now - last >= 33) {
        setTime(player.position);
        setPlaying(player.playing);
        last = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [player]);
  const seek = useCallback(
    (seconds: number) => {
      player.seek(seconds);
      setTime(seconds);
    },
    [player],
  );
  return { time, playing, seek };
}
