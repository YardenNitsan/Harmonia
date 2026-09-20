import { expect, it } from 'vitest';
import { SessionController } from './session';
import { parseChord, formatChord } from '../domain/chord';
import type { Analysis, AnalysisProfile, SavedTrack } from '../domain/types';

function analysis(profile: AnalysisProfile = 'fast'): Analysis {
  return {
    id: `abc:model:pipeline:${profile}`,
    fingerprint: 'abc',
    profile,
    modelVersion: 'model',
    pipelineVersion: 'pipeline',
    duration: 2,
    segments: [
      { id: 's1', start: 0, end: 2, chord: parseChord('C'), score: 0.8, alternatives: [] },
    ],
    beats: [],
    tempo: null,
    meter: null,
    key: null,
    waveform: [0.1],
    boundaries: [],
    createdAt: '2026-09-20T00:00:00Z',
    calibration: 'uncalibrated',
    warnings: [],
  };
}
function fixture(save: (record: SavedTrack) => Promise<void> = async () => {}) {
  const player = {
    id: 'local',
    capabilities: {
      play: true,
      pause: true,
      seek: true,
      position: true,
      duration: true,
      rawAnalysisAvailable: true,
      offlineAvailable: true,
    },
    position: 0,
    duration: 2,
    available: true,
    volume: 1,
    playing: false,
    load: () => {},
    release: () => {},
    play: async () => {},
    pause: () => {},
    seek: () => {},
    setLoop: () => {},
    setSpeed: () => {},
    setVolume: () => {},
    onError: () => () => {},
  };
  const analyzer = {
    modelVersion: () => 'model',
    pipelineVersion: 'pipeline',
    fingerprint: async () => 'abc',
    analyze: async (_file: File, _hash: string, profile: AnalysisProfile) => analysis(profile),
    demo: async () => ({ analysis: analysis(), file: new Blob() }),
  };
  const controller = new SessionController({
    player,
    repository: { list: async () => ({ records: [], issues: [] }), save },
    analyzer,
  });
  return { controller, analyzer, player };
}
it('preserves corrected/favorited analysis when another profile is analyzed', async () => {
  const saved: SavedTrack[] = [];
  const { controller } = fixture(async (record) => {
    saved.push(record);
  });
  controller.setProfile('fast');
  await controller.importFile(new File(['x'], 'song.wav'));
  await controller.editChord('s1', parseChord('Dm9'));
  await controller.favorite();
  controller.setProfile('balanced');
  await controller.importFile(new File(['x'], 'song.wav'));
  expect(controller.snapshot().library).toHaveLength(2);
  const original = controller.snapshot().library.find((r) => r.analysis.profile === 'fast')!;
  expect(formatChord(original.analysis.segments[0].chord)).toBe('Dm9');
  expect(original.corrections).toHaveLength(1);
  expect(controller.snapshot().current?.track.favorite).toBe(true);
  expect(saved.at(-1)?.analysis.profile).toBe('balanced');
});
it('propagates a failed correction save and marks it unsaved', async () => {
  let failing = false;
  const { controller } = fixture(async () => {
    if (failing) throw new Error('disk full');
  });
  await controller.importFile(new File(['x'], 'song.wav'));
  failing = true;
  await expect(controller.editChord('s1', parseChord('Dm'))).rejects.toThrow('disk full');
  expect(controller.snapshot().saveState).toBe('unsaved');
  expect(controller.snapshot().status).toBe('ready');
});

it('relinking a reopened session uses its profile and preserves its corrections', async () => {
  const { controller } = fixture();
  controller.setProfile('fast');
  await controller.importFile(new File(['x'], 'song.wav'));
  await controller.editChord('s1', parseChord('Dm9'));
  const fast = controller.snapshot().current!;
  controller.setProfile('accurate');
  await controller.importFile(new File(['x'], 'song.wav'));
  controller.open(fast);
  await controller.importFile(new File(['x'], 'song.wav'));
  expect(controller.snapshot().current?.analysis.profile).toBe('fast');
  expect(formatChord(controller.snapshot().current!.analysis.segments[0].chord)).toBe('Dm9');
});
it('an earlier save failure cannot change a replacement import status', async () => {
  let rejectSave: ((reason: Error) => void) | undefined;
  let block = false;
  const { controller, analyzer } = fixture(() =>
    block
      ? new Promise((_, reject) => {
          rejectSave = reject;
        })
      : Promise.resolve(),
  );
  await controller.importFile(new File(['x'], 'song.wav'));
  block = true;
  const correction = controller.editChord('s1', parseChord('Dm'));
  const failure = expect(correction).rejects.toThrow('late failure');
  await Promise.resolve();
  analyzer.analyze = () => new Promise(() => {});
  controller.setProfile('fast');
  void controller.importFile(new File(['x'], 'second.wav'));
  await Promise.resolve();
  await Promise.resolve();
  rejectSave?.(new Error('late failure'));
  await failure;
  expect(controller.snapshot().status).toBe('analyzing');
  controller.cancel();
});

it('a rejected play request from an older session cannot overwrite the new session error', async () => {
  const { controller, player } = fixture();
  await controller.importFile(new File(['x'], 'song.wav'));
  let rejectPlay: ((error: Error) => void) | undefined;
  player.play = () =>
    new Promise((_, reject) => {
      rejectPlay = reject;
    });
  const playing = controller.togglePlayback();
  controller.open(controller.snapshot().current!);
  rejectPlay?.(new Error('old playback failed'));
  await playing;
  expect(controller.snapshot().error).toBeNull();
  expect(controller.snapshot().status).toBe('ready');
});

it('a rejected play request stays visible when the same analysis has been edited', async () => {
  const { controller, player } = fixture();
  await controller.importFile(new File(['x'], 'song.wav'));
  let rejectPlay: ((error: Error) => void) | undefined;
  player.play = () =>
    new Promise((_, reject) => {
      rejectPlay = reject;
    });
  const playing = controller.togglePlayback();
  await controller.editChord('s1', parseChord('Dm'));
  rejectPlay?.(new Error('Playback device unavailable'));
  await playing;
  expect(controller.snapshot().error).toBe('Playback device unavailable');
});

function deferredSave() {
  let complete!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolve, fail) => {
    complete = resolve;
    reject = fail;
  });
  return { promise, complete, reject };
}

it('finishing a favorite propagation cannot reopen a previously selected analysis', async () => {
  const pending = deferredSave();
  let blockNext = false;
  const { controller } = fixture(() => {
    if (blockNext) {
      blockNext = false;
      return pending.promise;
    }
    return Promise.resolve();
  });
  controller.setProfile('fast');
  await controller.importFile(new File(['x'], 'song.wav'));
  const first = controller.snapshot().current!;
  controller.setProfile('balanced');
  await controller.importFile(new File(['x'], 'song.wav'));
  controller.open(first);
  blockNext = true;
  const favoriting = controller.favorite();
  await Promise.resolve();
  const unrelated = {
    ...first,
    track: { ...first.track, id: 'other', fingerprint: 'other', name: 'Other song' },
    analysis: { ...first.analysis, id: 'other-analysis', fingerprint: 'other' },
  };
  controller.open(unrelated);
  pending.complete();
  await favoriting;
  expect(controller.snapshot().current).toBe(unrelated);
  expect(controller.snapshot().library.every((record) => record.track.favorite)).toBe(true);
});

it('favorite propagation merges an intervening chord correction into its saved record', async () => {
  const pending = deferredSave();
  let blockNext = false;
  const persisted = new Map<string, SavedTrack>();
  const { controller } = fixture(async (record) => {
    if (blockNext) {
      blockNext = false;
      await pending.promise;
    }
    persisted.set(record.analysis.id, record);
  });
  controller.setProfile('fast');
  await controller.importFile(new File(['x'], 'song.wav'));
  const first = controller.snapshot().current!;
  controller.setProfile('balanced');
  await controller.importFile(new File(['x'], 'song.wav'));
  controller.open(first);
  blockNext = true;
  const favoriting = controller.favorite();
  await Promise.resolve();
  const correcting = controller.editChord('s1', parseChord('F#7(b9)'));
  pending.complete();
  await Promise.all([favoriting, correcting]);
  const current = controller.snapshot().current!;
  expect(formatChord(current.analysis.segments[0].chord)).toBe('F#7(b9)');
  expect(current.corrections).toHaveLength(1);
  expect(current.track.favorite).toBe(true);
  expect(persisted.get(first.analysis.id)).toEqual(current);
});

it('an old favorite save failure cannot put its error onto another session', async () => {
  const pending = deferredSave();
  let blockNext = false;
  const { controller } = fixture(() => {
    if (blockNext) {
      blockNext = false;
      return pending.promise;
    }
    return Promise.resolve();
  });
  await controller.importFile(new File(['x'], 'song.wav'));
  blockNext = true;
  const favoriting = controller.favorite();
  await Promise.resolve();
  const previous = controller.snapshot().current!;
  controller.open({
    ...previous,
    track: { ...previous.track, id: 'other', fingerprint: 'other' },
    analysis: { ...previous.analysis, id: 'other-analysis', fingerprint: 'other' },
  });
  pending.reject(new Error('Old favorite save failed'));
  await favoriting;
  expect(controller.snapshot().error).toBeNull();
});
