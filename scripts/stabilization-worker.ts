import { extractFeatures } from '../packages/audio/features';
import { analyzeWholeSongFeatures } from '../packages/audio/whole-pipeline';
import { formatChord } from '../packages/domain/chord';
import type { WholePipelineTimings } from '../packages/audio/whole-timings';

self.onmessage = ({ data }) => {
  try {
    const started = performance.now();
    const features = extractFeatures(data.samples, 22050);
    const featuresMs = performance.now() - started;
    let timings: WholePipelineTimings | undefined;
    const analysis = analyzeWholeSongFeatures(
      features,
      data.fingerprint,
      'balanced',
      undefined,
      (value) => {
        timings = value;
      },
    );
    self.postMessage({
      analysis,
      featuresMs,
      timings,
      labels: analysis.segments.map((s) => formatChord(s.chord)),
      features: data.retainFeatures ? features : undefined,
    });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
