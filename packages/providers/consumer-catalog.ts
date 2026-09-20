import type { CatalogRecording, RecordingCatalogPort } from '../application/catalog-contracts';

/** One consumer search; discovery does not imply rights to analyze a video. */
export class ConsumerCatalog {
  constructor(
    private youtube: { search(query: string, signal: AbortSignal): Promise<CatalogRecording[]> },
    private permitted: RecordingCatalogPort,
  ) {}
  async search(
    query: string,
    _provider: CatalogRecording['provider'],
    signal: AbortSignal,
    onResults?: (results: CatalogRecording[]) => void,
  ) {
    signal.throwIfAborted();
    // YouTube suggestions publish independently. Give the playable catalog enough
    // time to respond instead of silently discarding it after a short typeahead budget.
    const supplemental = new AbortController();
    const cancel = () => supplemental.abort(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(() => supplemental.abort(), 10000);
    try {
      const [videos, recordings] = await Promise.allSettled([
        this.youtube.search(query, signal).then((results) => {
          if (!signal.aborted) onResults?.(results);
          return results;
        }),
        this.permitted.search(query, 'commons', supplemental.signal),
      ]);
      signal.throwIfAborted();
      const results = [
        ...(videos.status === 'fulfilled' ? videos.value : []),
        ...(recordings.status === 'fulfilled' ? recordings.value : []),
      ];
      if (videos.status === 'rejected' && recordings.status === 'rejected')
        throw new Error('Search is unavailable right now. Check your connection and try again.');
      return {
        results,
        notice:
          videos.status === 'rejected'
            ? 'YouTube search is unavailable on this computer. You can still choose an available recording below.'
            : recordings.status === 'rejected'
              ? 'Could not load recordings with chord analysis. Try searching again. YouTube results are watch-only.'
              : !results.some((recording) => recording.audio) && results.length
                ? 'No recordings with chord analysis were found. YouTube results are watch-only.'
                : null,
      };
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
    }
  }
  acquire(
    recording: CatalogRecording,
    signal: AbortSignal,
    progress: (received: number, total: number | null) => void,
  ) {
    return this.permitted.acquire(recording, signal, progress);
  }
}
