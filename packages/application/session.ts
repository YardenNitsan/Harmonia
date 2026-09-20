import type { Analysis, AnalysisProfile, Chord, SavedTrack } from '../domain/types';
import {
  correctBoundary,
  correctChord,
  correctSegment,
  validateAnalysis,
  type SegmentCorrection,
} from '../domain/timeline';
import { equalChords } from '../domain/chord';
import type { AnalysisRepository, AudioAnalysisService, LocalPlayback } from './contracts';
import { LatestTask } from './tasks';

export interface SessionState {
  status: 'idle' | 'preparing' | 'analyzing' | 'ready' | 'cancelled' | 'failed';
  stage: string;
  progress: number;
  current: SavedTrack | null;
  library: SavedTrack[];
  error: string | null;
  profile: AnalysisProfile;
  saveState: 'saved' | 'saving' | 'unsaved';
}
export interface SessionDependencies {
  player: LocalPlayback;
  repository: AnalysisRepository;
  analyzer: AudioAnalysisService;
}
export class SessionController {
  readonly player: LocalPlayback;
  private tasks = new LatestTask();
  private abort: AbortController | null = null;
  private listeners = new Set<() => void>();
  private persisted = new Map<string, SavedTrack>();
  private saveQueue: Promise<void> = Promise.resolve();
  private initialization: Promise<void> | null = null;
  private playbackRevision = 0;
  private unsubscribePlayback: () => void;
  private state: SessionState = {
    status: 'idle',
    stage: '',
    progress: 0,
    current: null,
    library: [],
    error: null,
    profile: 'balanced',
    saveState: 'saved',
  };
  constructor(private dependencies: SessionDependencies) {
    this.player = dependencies.player;
    this.unsubscribePlayback = this.player.onError((error) => {
      if (!this.state.current || !this.player.available) return;
      this.player.pause();
      this.update({ error: this.message(error) });
    });
  }
  dispose() {
    ++this.playbackRevision;
    this.unsubscribePlayback();
    this.cancel();
    this.player.release();
    this.listeners.clear();
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.state;
  private update(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  initialize() {
    if (!this.initialization)
      this.initialization = this.dependencies.repository
        .list()
        .then(({ records, issues }) => {
          records.forEach((record) => this.persisted.set(record.analysis.id, record));
          const present = new Set(this.state.library.map((r) => r.analysis.id));
          this.update({
            library: [...this.state.library, ...records.filter((r) => !present.has(r.analysis.id))],
            ...(issues.length
              ? {
                  error: `${issues.length} damaged saved analyses were isolated. Healthy sessions remain available; damaged records were retained.`,
                }
              : {}),
          });
        })
        .catch((error) => {
          this.update({ error: this.message(error) });
        });
    return this.initialization;
  }
  private message(error: unknown) {
    return error instanceof Error ? error.message : 'An unexpected error occurred';
  }
  clearError() {
    this.update({ error: null });
  }
  setProfile(profile: AnalysisProfile) {
    this.update({ profile });
  }
  private fail(error: unknown) {
    this.update({ error: this.message(error), status: this.state.current ? 'ready' : 'failed' });
  }
  cancel() {
    this.tasks.cancel();
    this.abort?.abort();
    this.abort = null;
    this.update({
      status: this.state.current ? 'ready' : 'cancelled',
      stage: 'Cancelled',
      progress: 0,
    });
  }
  private start() {
    ++this.playbackRevision;
    this.cancel();
    this.player.release();
    this.abort = new AbortController();
    this.update({
      current: null,
      error: null,
      status: 'preparing',
      progress: 0,
      stage: 'Preparing local audio',
      saveState: 'saved',
    });
    return { token: this.tasks.begin(), signal: this.abort.signal };
  }
  private async accept(analysis: Analysis, file: Blob, name: string, token: number) {
    if (!this.tasks.current(token)) return;
    validateAnalysis(analysis);
    this.player.load(file);
    const existing = this.state.library.find((r) => r.analysis.id === analysis.id);
    const prior = this.state.library.find((r) => r.track.fingerprint === analysis.fingerprint);
    const record: SavedTrack = existing ?? {
      track: {
        id: analysis.fingerprint,
        name,
        duration: analysis.duration,
        fingerprint: analysis.fingerprint,
        importedAt: prior?.track.importedAt ?? new Date().toISOString(),
        favorite: prior?.track.favorite ?? false,
      },
      analysis,
      corrections: [],
    };
    this.update({ current: record, status: 'ready', progress: 1 });
    await this.save(record);
  }
  private save(record: SavedTrack): Promise<void> {
    this.update({
      library: [record, ...this.state.library.filter((r) => r.analysis.id !== record.analysis.id)],
      ...(this.state.current === record ? { saveState: 'saving' as const } : {}),
    });
    const operation = this.saveQueue
      .then(() => this.dependencies.repository.save(record))
      .then(() => {
        this.persisted.set(record.analysis.id, record);
        if (this.state.current === record) this.update({ saveState: 'saved' });
      })
      .catch((error) => {
        if (this.state.current === record)
          this.update({
            saveState: 'unsaved',
            error: `Changes are not saved: ${this.message(error)}`,
          });
        throw error;
      });
    this.saveQueue = operation.catch(() => undefined);
    return operation;
  }
  async importFile(file: File) {
    const { token, signal } = this.start();
    const profile = this.state.profile;
    try {
      await this.initialize();
      if (!this.tasks.current(token)) return;
      const fingerprint = await this.dependencies.analyzer.fingerprint(file);
      if (!this.tasks.current(token)) return;
      const cached = this.state.library.find(
        (r) =>
          r.track.fingerprint === fingerprint &&
          r.analysis.profile === profile &&
          r.analysis.pipelineVersion === this.dependencies.analyzer.pipelineVersion &&
          r.analysis.modelVersion === this.dependencies.analyzer.modelVersion(profile),
      );
      if (cached) {
        await this.accept(cached.analysis, file, file.name, token);
        return;
      }
      this.update({ status: 'analyzing' });
      const analysis = await this.dependencies.analyzer.analyze(
        file,
        fingerprint,
        profile,
        signal,
        (stage, progress) => {
          if (this.tasks.current(token)) this.update({ stage, progress });
        },
      );
      await this.accept(analysis, file, file.name, token);
    } catch (error) {
      if (this.tasks.current(token) && !signal.aborted) {
        if (this.state.current) this.update({ error: this.message(error) });
        else this.fail(error);
      }
    }
  }
  async demo() {
    const { token, signal } = this.start();
    try {
      await this.initialize();
      if (!this.tasks.current(token)) return;
      const result = await this.dependencies.analyzer.demo(signal);
      await this.accept(result.analysis, result.file, 'After hours · studio study', token);
    } catch (error) {
      if (this.tasks.current(token) && !signal.aborted) this.fail(error);
    }
  }
  open(record: SavedTrack) {
    ++this.playbackRevision;
    this.cancel();
    this.player.release();
    this.update({
      current: record,
      status: 'ready',
      profile: record.analysis.profile,
      error: null,
      saveState: this.persisted.get(record.analysis.id) === record ? 'saved' : 'unsaved',
    });
  }
  async togglePlayback() {
    const revision = this.playbackRevision;
    try {
      if (this.player.playing) this.player.pause();
      else await this.player.play();
      if (revision === this.playbackRevision) this.update({});
    } catch (error) {
      if (revision === this.playbackRevision) this.update({ error: this.message(error) });
    }
  }
  private async correction(analysis: Analysis) {
    const current = this.state.current;
    if (!current) return;
    const createdAt = new Date().toISOString();
    const changes = analysis.segments.flatMap((after, index) => {
      const before = current.analysis.segments[index];
      const sameSpelling =
        before.chord.kind !== 'chord' ||
        after.chord.kind !== 'chord' ||
        before.chord.spelling === after.chord.spelling;
      if (
        before.start === after.start &&
        before.end === after.end &&
        sameSpelling &&
        equalChords(before.chord, after.chord)
      )
        return [];
      return [
        {
          id: crypto.randomUUID(),
          analysisId: analysis.id,
          segmentId: after.id,
          before,
          after,
          createdAt,
        },
      ];
    });
    const record = {
      ...current,
      analysis,
      corrections: [...current.corrections, ...changes],
    };
    this.update({
      current: record,
      ...(this.state.error?.startsWith('Changes are not saved:') ? { error: null } : {}),
    });
    await this.save(record);
  }
  async editChord(segmentId: string, chord: Chord) {
    if (this.state.current)
      await this.correction(correctChord(this.state.current.analysis, segmentId, chord));
  }
  async editSegment(segmentId: string, correction: SegmentCorrection) {
    if (this.state.current)
      await this.correction(correctSegment(this.state.current.analysis, segmentId, correction));
  }
  async editBoundary(segmentId: string, time: number) {
    if (this.state.current)
      await this.correction(correctBoundary(this.state.current.analysis, segmentId, time));
  }
  async favorite() {
    const current = this.state.current;
    if (!current) return;
    const revision = this.playbackRevision;
    const favorite = !current.track.favorite;
    const relatedIds = this.state.library
      .filter((r) => r.track.fingerprint === current.track.fingerprint)
      .map((r) => r.analysis.id);
    try {
      for (const id of relatedIds) {
        const latest = this.state.library.find((r) => r.analysis.id === id);
        if (!latest) continue;
        const record = {
          ...latest,
          track: { ...latest.track, favorite },
        };
        if (this.state.current?.analysis.id === id) this.update({ current: record });
        await this.save(record);
      }
    } catch (error) {
      if (revision === this.playbackRevision) this.update({ error: this.message(error) });
    }
  }
}
