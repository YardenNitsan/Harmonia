import { analyzeAudio } from './pipeline';
import type { AnalysisProfile } from '../domain/types';
const scope = self as unknown as {
  onmessage: (event: MessageEvent) => void;
  postMessage: (value: unknown) => void;
};
scope.onmessage = async (
  event: MessageEvent<{
    channels: Float32Array[];
    sampleRate: number;
    fingerprint: string;
    profile: AnalysisProfile;
    assetBase: string;
  }>,
) => {
  try {
    const { channels, sampleRate, fingerprint, profile } = event.data;
    if (!channels.length) throw new Error('Audio has no channels');
    const mono = new Float32Array(channels[0].length);
    for (const channel of channels)
      for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / channels.length;
    const progress = (stage: string, value: number) =>
      scope.postMessage({ kind: 'progress', stage, value });
    const analysis =
      profile === 'accurate'
        ? await (
            await import('./model-runtime')
          ).analyzeWithModel(mono, sampleRate, fingerprint, event.data.assetBase, progress)
        : analyzeAudio(mono, sampleRate, fingerprint, profile, progress);
    scope.postMessage({ kind: 'result', analysis });
  } catch (error) {
    scope.postMessage({
      kind: 'error',
      message: error instanceof Error ? error.message : 'Analysis failed',
    });
  }
};
