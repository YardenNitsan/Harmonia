import type { CatalogRecording } from './catalog-contracts';

type CatalogProvider = CatalogRecording['provider'];
interface Catalog {
  search(
    query: string,
    provider: CatalogProvider,
    signal: AbortSignal,
    apiKey?: string,
  ): Promise<CatalogRecording[]>;
  acquire(
    recording: CatalogRecording,
    signal: AbortSignal,
    progress: (received: number, total: number | null) => void,
  ): Promise<File>;
}
export interface SongSearchState {
  status: 'idle' | 'searching' | 'downloading' | 'analyzing' | 'ready' | 'input-required' | 'error';
  results: CatalogRecording[];
  selected: CatalogRecording | null;
  error: string | null;
  received: number;
  total: number | null;
  elapsedSeconds: number | null;
}
/** Coordinates permitted whole-recording preparation; never starts playback. */
export class SongSearchController {
  private state: SongSearchState = {
    status: 'idle',
    results: [],
    selected: null,
    error: null,
    received: 0,
    total: null,
    elapsedSeconds: null,
  };
  private listeners = new Set<() => void>();
  private revision = 0;
  private abort: AbortController | null = null;
  constructor(
    private dependencies: {
      catalog: Catalog;
      prepare(file: File): Promise<void>;
      cancelPreparation(): void;
      beforePrepare(): Promise<void>;
    },
  ) {}
  snapshot = () => this.state;
  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };
  private set(patch: Partial<SongSearchState>) {
    this.state = { ...this.state, ...patch };
    for (const callback of this.listeners) callback();
  }
  cancel(preserveReady = true) {
    ++this.revision;
    this.abort?.abort();
    this.abort = null;
    this.dependencies.cancelPreparation();
    this.set({
      status: preserveReady && this.state.status === 'ready' ? 'ready' : 'idle',
      error: null,
      ...(!preserveReady ? { selected: null, elapsedSeconds: null } : {}),
    });
  }
  dispose() {
    this.cancel();
    this.listeners.clear();
  }
  async search(query: string, provider: CatalogProvider, apiKey?: string) {
    this.cancel();
    const revision = this.revision,
      abort = (this.abort = new AbortController());
    this.set({ status: 'searching', results: [], selected: null, elapsedSeconds: null });
    try {
      const results = await this.dependencies.catalog.search(query, provider, abort.signal, apiKey);
      if (revision === this.revision) this.set({ status: 'idle', results });
    } catch (error) {
      this.fail(error, revision);
    }
  }
  async select(recording: CatalogRecording) {
    this.cancel();
    const revision = this.revision,
      abort = (this.abort = new AbortController());
    this.set({ selected: recording, received: 0, total: null, elapsedSeconds: null });
    if (!recording.audio) {
      this.set({ status: 'input-required' });
      return;
    }
    const started = performance.now();
    this.set({ status: 'downloading' });
    try {
      await this.dependencies.beforePrepare();
      if (revision !== this.revision) return;
      const file = await this.dependencies.catalog.acquire(
        recording,
        abort.signal,
        (received, total) => {
          if (revision === this.revision) this.set({ received, total });
        },
      );
      if (revision !== this.revision) return;
      this.set({ status: 'analyzing' });
      await this.dependencies.prepare(file);
      if (revision === this.revision)
        this.set({ status: 'ready', elapsedSeconds: (performance.now() - started) / 1000 });
    } catch (error) {
      this.fail(error, revision);
    }
  }
  async local(file: File) {
    this.cancel();
    const revision = this.revision,
      started = performance.now();
    this.set({ status: 'analyzing', selected: null, elapsedSeconds: null });
    try {
      await this.dependencies.beforePrepare();
      if (revision !== this.revision) return;
      await this.dependencies.prepare(file);
      if (revision === this.revision)
        this.set({ status: 'ready', elapsedSeconds: (performance.now() - started) / 1000 });
    } catch (error) {
      this.fail(error, revision);
    }
  }
  private fail(error: unknown, revision: number) {
    if (revision !== this.revision) return;
    this.set({ status: 'error', error: error instanceof Error ? error.message : String(error) });
  }
}
