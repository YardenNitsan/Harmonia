import { BrowserAudioAnalysisService } from './browser-analysis';
import type { Analysis, AnalysisProfile } from '../domain/types';
import { WHOLE_SONG_MODEL_VERSION, WHOLE_SONG_PIPELINE_VERSION } from './whole-pipeline';
import { AudioInputError } from './input-error';
import type { WholeSongTimings, WholeWorkerTimings } from './whole-timings';
export class WholeSongAnalysisService extends BrowserAudioAnalysisService {
  private expectedDurations = new WeakMap<File, number>();
  expectDuration(file: File, duration: number | null): void {
    if (duration === null) {
      this.expectedDurations.delete(file);
      return;
    }
    if (!Number.isFinite(duration) || duration <= 0 || duration > 1200)
      throw new AudioInputError(new Error('Invalid expected recording duration.'));
    this.expectedDurations.set(file, duration);
  }
  private timings: Readonly<WholeSongTimings> | null = null;
  get lastTimings(): Readonly<WholeSongTimings> | null {
    return this.timings;
  }
  override readonly pipelineVersion = WHOLE_SONG_PIPELINE_VERSION;
  override modelVersion(_profile: AnalysisProfile): string {
    void _profile;
    return WHOLE_SONG_MODEL_VERSION;
  }
  override async analyze(
    file: File,
    fingerprint: string,
    profile: AnalysisProfile,
    signal: AbortSignal,
    progress: (stage: string, value: number) => void,
  ): Promise<Analysis> {
    const started = performance.now();
    this.timings = null;
    if (signal.aborted) throw new DOMException('Analysis cancelled', 'AbortError');
    progress('Preparing complete recording', 0);
    let decoded: AudioBuffer;
    try {
      decoded = await this.decode(file, signal);
      const expected = this.expectedDurations.get(file);
      if (
        expected !== undefined &&
        (!Number.isFinite(decoded.duration) ||
          Math.abs(decoded.duration - expected) > Math.max(3, expected * 0.02))
      ) {
        throw new AudioInputError(
          new Error('The acquired recording does not match the selected song duration.'),
        );
      }
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError'))
        throw error;
      throw new AudioInputError(error);
    }
    const decodeMs = performance.now() - started;
    performance.clearMeasures('harmonia.whole.decode');
    performance.measure('harmonia.whole.decode', { start: started, duration: decodeMs });
    if (signal.aborted) throw new DOMException('Analysis cancelled', 'AbortError');
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) =>
      decoded.getChannelData(index),
    );
    const worker = new Worker(new URL('./whole-song-worker.ts', import.meta.url), {
      type: 'module',
    });
    return this.runWorker<Analysis>(
      worker,
      signal,
      {
        channels,
        sampleRate: decoded.sampleRate,
        fingerprint,
        profile,
      },
      channels.map((channel) => channel.buffer),
      progress,
      (message) => {
        const { timings } = message as { timings?: WholeWorkerTimings };
        if (timings) {
          this.timings = Object.freeze({
            ...timings,
            decodeMs,
            analysisMs: performance.now() - started,
          });
          performance.clearMeasures('harmonia.whole.analysis');
          performance.measure('harmonia.whole.analysis', {
            start: started,
            duration: this.timings.analysisMs,
            detail: this.timings,
          });
        }
      },
    );
  }
}
