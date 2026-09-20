import { extractFeatures } from '../packages/audio/features';
import { analyzeFeatures } from '../packages/audio/pipeline';
import { TemplateRecognizer } from '../packages/audio/recognizer';
import { refineSegmentation } from '../packages/audio/segmentation';

function freeze(value: unknown, seen = new Set<object>()): void {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const child of Object.values(value)) freeze(child, seen);
  Object.freeze(value);
}
async function hash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
const scope = self as unknown as {
  onmessage: (event: MessageEvent) => void;
  postMessage: (value: unknown) => void;
};
scope.onmessage = async (event) => {
  try {
    const { samples, fingerprint, warmup } = event.data;
    const started = performance.now();
    const features = extractFeatures(samples, 22050);
    const extracted = performance.now();
    const recognizer = new TemplateRecognizer();
    const predictions = features.frames.map((frame) => recognizer.predict(frame));
    const recognized = performance.now();
    freeze(features);
    freeze(predictions);
    const frameIndices = new Map(features.frames.map((frame, i) => [frame, i]));
    const retained = {
      version: recognizer.version,
      predict: (frame: (typeof features.frames)[number]) => predictions[frameIndices.get(frame)!],
    };
    const timings = {
      baseline_combined_assembly_ms: [] as number[],
      candidate_segmentation_ms: [] as number[],
    };
    let baseline, candidate;
    for (let run = 0; run < (warmup ? 1 : 3); run++) {
      let clock = performance.now();
      const a = analyzeFeatures(features, fingerprint, 'balanced', undefined, retained);
      timings.baseline_combined_assembly_ms.push(performance.now() - clock);
      clock = performance.now();
      const b = refineSegmentation(features, predictions);
      timings.candidate_segmentation_ms.push(performance.now() - clock);
      if (baseline && JSON.stringify(a.segments) !== JSON.stringify(baseline.segments))
        throw new Error('Baseline changed across timing runs');
      if (candidate && JSON.stringify(b) !== JSON.stringify(candidate))
        throw new Error('Candidate changed across timing runs');
      baseline = a;
      candidate = b;
    }
    const recomputed = analyzeFeatures(features, fingerprint, 'balanced');
    if (JSON.stringify(recomputed.segments) !== JSON.stringify(baseline!.segments))
      throw new Error('Retained predictions changed baseline output');
    scope.postMessage({
      ok: true,
      frames: features.frames.length,
      duration: features.duration,
      feature_sha256: await hash(features),
      predictions_sha256: await hash(predictions),
      baseline_recomputation_matches: true,
      extraction_ms: extracted - started,
      recognition_ms: recognized - extracted,
      timings,
      baseline: baseline!.segments,
      candidate: candidate!.segments,
      provenance: {
        candidate_count: candidate!.candidates.length,
        candidate_intervals: candidate!.candidateSegments.length,
        inserted: candidate!.insertedCuts,
        removed: candidate!.removedCuts,
        timing_moves: candidate!.timingMoves,
      },
      worker_total_ms: performance.now() - started,
    });
  } catch (error) {
    scope.postMessage({ ok: false, error: String(error) });
  }
};
