import { afterEach, expect, it, vi } from 'vitest';
import { WholeSongAnalysisService } from './whole-song-analysis';
import { BrowserAudioAnalysisService } from './browser-analysis';
import { analyzeWholeSongFeatures } from './whole-pipeline';
import { extractFeatures } from './features';

class WorkerHarness {
  static latest: WorkerHarness | undefined;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;
  message: { channels: Float32Array[]; fingerprint: string; profile: string } | undefined;
  constructor(readonly url: URL) {
    WorkerHarness.latest = this;
  }
  postMessage(message: typeof this.message) {
    this.message = message;
  }
  terminate() {
    this.terminated = true;
  }
}
class DecodedService extends WholeSongAnalysisService {
  protected override async decode(): Promise<AudioBuffer> {
    const pcm = new Float32Array(22050);
    return {
      numberOfChannels: 1,
      sampleRate: 22050,
      getChannelData: () => pcm,
    } as unknown as AudioBuffer;
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  WorkerHarness.latest = undefined;
});

it('uses whole-song identities for cache lookup rather than the experimental learned model', () => {
  const service = new WholeSongAnalysisService();
  const baseline = new BrowserAudioAnalysisService();
  expect(service.pipelineVersion).not.toBe(baseline.pipelineVersion);
  expect(service.modelVersion('accurate')).toBe(service.modelVersion('balanced'));
  expect(service.modelVersion('balanced')).not.toBe(baseline.modelVersion('balanced'));
});

it('accepts OGA filenames for fingerprinting while decode still checks the actual header', async () => {
  const service = new WholeSongAnalysisService();
  const bytes = new Uint8Array([79, 103, 103, 83]);
  expect(await service.fingerprint(new File([bytes], 'recording.oga'))).toBe(
    await service.fingerprint(new File([bytes], 'recording.ogg')),
  );
});

it('sends complete PCM to the separate worker and releases it after the final timeline', async () => {
  vi.stubGlobal('Worker', WorkerHarness);
  const service = new DecodedService();
  const promise = service.analyze(
    new File([], 'audio.wav'),
    'fixture',
    'balanced',
    new AbortController().signal,
    () => {},
  );
  await Promise.resolve();
  const worker = WorkerHarness.latest!;
  expect(worker.url.pathname).toContain('whole-song-worker');
  expect(worker.message?.channels[0].length).toBe(22050);
  const analysis = analyzeWholeSongFeatures(
    extractFeatures(worker.message!.channels[0], 22050),
    'fixture',
    'balanced',
  );
  worker.onmessage!({ data: { kind: 'result', analysis } } as MessageEvent);
  expect((await promise).segments.at(-1)?.end).toBe(1);
  expect(worker.terminated).toBe(true);
});

it('terminates an active whole-song worker on cancellation and rejects its result', async () => {
  vi.stubGlobal('Worker', WorkerHarness);
  const abort = new AbortController();
  const promise = new DecodedService().analyze(
    new File([], 'audio.wav'),
    'fixture',
    'balanced',
    abort.signal,
    () => {},
  );
  const rejected = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  await Promise.resolve();
  abort.abort();
  await rejected;
  expect(WorkerHarness.latest?.terminated).toBe(true);
});

it('does not start a worker for already cancelled preparation', async () => {
  vi.stubGlobal('Worker', WorkerHarness);
  const abort = new AbortController();
  abort.abort();
  await expect(
    new DecodedService().analyze(
      new File([], 'audio.wav'),
      'fixture',
      'balanced',
      abort.signal,
      () => {},
    ),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(WorkerHarness.latest).toBeUndefined();
});
