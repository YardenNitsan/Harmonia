import * as ort from 'onnxruntime-web/wasm';
import manifest from '../../ml/artifacts/structured-chord-v1/manifest.json';
import type { Analysis, ChordAlternative } from '../domain/types';
import { modelFeatures } from './model-features';
import { decodeModelFrame, type ModelHeads } from './model-decoder';
import { analyzeAudio } from './pipeline';

export const EXPERIMENTAL_MODEL_VERSION = manifest.model_id;
type Progress = (stage: string, value: number) => void;

export async function analyzeWithModel(
  samples: Float32Array,
  sampleRate: number,
  fingerprint: string,
  assetBase: string,
  progress: Progress,
): Promise<Analysis> {
  if (samples.length === 0 || samples.length / sampleRate > 1200)
    throw new Error('Audio must be between one sample and 20 minutes');
  progress('Loading experimental local model', 0);
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = new URL('runtime/', assetBase).href;
  const response = await fetch(new URL('models/model.onnx', assetBase));
  if (!response.ok)
    throw new Error('Experimental model is missing. Rebuild the application assets.');
  const bytes = await response.arrayBuffer();
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  if (digest !== manifest.sha256 || bytes.byteLength !== manifest.bytes)
    throw new Error('Model integrity check failed. Rebuild the application assets.');
  const session = await ort.InferenceSession.create(bytes, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  try {
    progress('Extracting model features', 0.05);
    const features = modelFeatures(samples, sampleRate),
      count = features.times.length;
    const predictions: ChordAlternative[][] = [];
    const context = (manifest.receptive_field_frames - 1) / 2,
      chunkSize = 1024;
    for (let start = 0; start < count; start += chunkSize) {
      const stop = Math.min(count, start + chunkSize),
        left = Math.max(0, start - context),
        right = Math.min(count, stop + context);
      const tensor = new ort.Tensor('float32', features.values.slice(left * 26, right * 26), [
        1,
        right - left,
        26,
      ]);
      const outputs = await session.run({ features: tensor });
      try {
        for (let frame = start; frame < stop; frame++) {
          const offset = frame - left;
          const head = (name: string, size: number) => {
            const result = outputs[name];
            if (!result || result.dims[1] !== right - left || result.dims[2] !== size)
              throw new Error(`Incompatible model output: ${name}`);
            return Array.from(
              (result.data as Float32Array).subarray(offset * size, (offset + 1) * size),
            );
          };
          const heads: ModelHeads = {
            root: head('root', 13),
            triad: head('triad', 8),
            seventh: head('seventh', 4),
            bass: head('bass', 13),
            extensions: head('extensions', 4),
          };
          predictions.push(decodeModelFrame(heads));
        }
      } finally {
        tensor.dispose();
        for (const output of Object.values(outputs)) output.dispose();
      }
      progress('Running experimental CPU model', 0.1 + (0.5 * stop) / count);
    }
    // Reuse replaceable DSP rhythm/novelty and stabilization; learned boundaries failed evaluation.
    const analysis = analyzeAudio(
      samples,
      sampleRate,
      fingerprint,
      'accurate',
      (stage, value) => progress(stage, 0.6 + value * 0.4),
      {
        version: EXPERIMENTAL_MODEL_VERSION,
        predict(frame) {
          const index = Math.max(
            0,
            Math.min(count - 1, Math.round((frame.time * 22050 - 1024) / 512)),
          );
          return frame.rms < 0.002 ? [{ chord: { kind: 'none' }, score: 1 }] : predictions[index];
        },
      },
    );
    analysis.warnings = [
      'Experimental GuitarSet model: unreliable minor and extended chords. Scores are uncalibrated; review every result.',
      'DSP novelty, rhythm and stabilization are used; learned boundaries failed evaluation. Meter is unknown.',
      'Browser sample-rate conversion differs from research preprocessing for files not recorded at 22050 Hz.',
    ];
    return analysis;
  } finally {
    await session.release();
  }
}
