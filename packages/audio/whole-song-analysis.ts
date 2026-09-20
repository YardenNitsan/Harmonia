import { BrowserAudioAnalysisService } from './browser-analysis';
import type { Analysis, AnalysisProfile } from '../domain/types';
import { WHOLE_SONG_MODEL_VERSION, WHOLE_SONG_PIPELINE_VERSION } from './whole-pipeline';
export class WholeSongAnalysisService extends BrowserAudioAnalysisService {
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
    if (signal.aborted) throw new DOMException('Analysis cancelled', 'AbortError');
    progress('Preparing complete recording', 0);
    const decoded = await this.decode(file, signal);
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
    );
  }
}
