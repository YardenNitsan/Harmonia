import type { AnalysisProfile } from '../domain/types';
import { createFeatureCache } from '../persistence/feature-cache';
import { dspFeatures } from './feature-cache';
import { analyzeWholeSongFeatures } from './whole-pipeline';
import type { WholePipelineTimings } from './whole-timings';

const scope = self as unknown as {
  onmessage: (event: MessageEvent) => Promise<void>;
  postMessage: (value: unknown) => void;
};
scope.onmessage = async (
  event: MessageEvent<{
    channels: Float32Array[];
    sampleRate: number;
    fingerprint: string;
    profile: AnalysisProfile;
  }>,
) => {
  try {
    const started = performance.now();
    const { channels, sampleRate, fingerprint, profile } = event.data;
    if (
      !Array.isArray(channels) ||
      channels.length < 1 ||
      channels.length > 2 ||
      !Number.isFinite(sampleRate) ||
      sampleRate < 8000 ||
      sampleRate > 192000 ||
      typeof fingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/.test(fingerprint) ||
      !['fast', 'balanced', 'accurate'].includes(profile) ||
      channels.some((channel) => !(channel instanceof Float32Array)) ||
      channels[0].length < 1 ||
      channels[0].length / sampleRate > 1200 ||
      channels.some((channel) => channel.length !== channels[0].length) ||
      channels[0].byteLength * channels.length > 256 * 1024 * 1024
    )
      throw new Error('Invalid or oversized whole-song audio input');
    const mono = new Float32Array(channels[0].length);
    for (const channel of channels)
      for (let i = 0; i < mono.length; i++) {
        if (!Number.isFinite(channel[i])) throw new Error('Invalid whole-song audio sample');
        mono[i] += channel[i] / channels.length;
      }
    const normalizeMs = performance.now() - started;
    const progress = (stage: string, value: number) =>
      scope.postMessage({ kind: 'progress', stage, value });
    const featureStarted = performance.now();
    const cache = await createFeatureCache();
    const features = await dspFeatures(
      mono,
      {
        fingerprint,
        sampleRate,
        samples: mono.length,
        channels: channels.length,
      },
      cache,
      progress,
    );
    const featuresMs = performance.now() - featureStarted;
    let stages: WholePipelineTimings | undefined;
    const analysis = analyzeWholeSongFeatures(features, fingerprint, profile, progress, (value) => {
      stages = value;
    });
    scope.postMessage({
      kind: 'result',
      analysis,
      timings: { ...stages, normalizeMs, featuresMs, workerMs: performance.now() - started },
    });
  } catch (error) {
    scope.postMessage({
      kind: 'error',
      message: error instanceof Error ? error.message : 'Whole-song analysis failed',
    });
  }
};
