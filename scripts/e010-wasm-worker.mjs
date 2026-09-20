import * as ort from '/ort.wasm.min.mjs';
import { compareRetained, compareTensor, decodeTensors, outputs } from './e010-wasm-checks.mjs';

let session;
const digest = async (bytes) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
async function verifiedFetch(url, bytes, sha256, limit) {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > limit)
    throw new Error('Invalid fetch bound');
  const response = await fetch(url);
  if (!response.ok || Number(response.headers.get('Content-Length')) !== bytes)
    throw new Error('Unexpected response size');
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength !== bytes || (await digest(buffer)) !== sha256)
    throw new Error('Artifact integrity failure');
  return buffer;
}
self.onmessage = async ({ data }) => {
  const { id, command } = data;
  let input, result;
  try {
    if (command === 'init') {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = '/';
      const model = await verifiedFetch(
        '/model.onnx',
        data.model.bytes,
        data.model.sha256,
        1024 * 1024,
      );
      const start = performance.now();
      session = await ort.InferenceSession.create(model, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
      self.postMessage({
        id,
        passed: true,
        initializationMs: performance.now() - start,
        runtime: ort.env.versions,
      });
      return;
    }
    if (command === 'close') {
      if (session) await session.release();
      session = undefined;
      self.postMessage({ id, passed: true, sessionReleased: true });
      return;
    }
    if (command !== 'case' || !session) throw new Error('Invalid worker request');
    const record = data.record;
    const buffer = await verifiedFetch(
      `/cases/${record.id}.bin`,
      record.bytes,
      record.sha256,
      8 * 1024 * 1024,
    );
    const reference = decodeTensors(buffer, record);
    if (
      !(reference.features instanceof Float32Array) ||
      record.frames < 1 ||
      record.frames > 60000 ||
      reference.features.length !== record.frames * 26 ||
      !reference.features.every(Number.isFinite)
    )
      throw new Error('Invalid feature tensor');
    input = new ort.Tensor('float32', reference.features, [1, record.frames, 26]);
    const start = performance.now();
    result = await session.run({ features: input });
    const inferenceMs = performance.now() - start;
    const heads = Object.fromEntries(
      outputs.map((name) => [
        name,
        compareTensor(record.tensors[name], reference[name], result[name]),
      ]),
    );
    const rawPassed = Object.values(heads).every((head) => head.passed);
    const retained = rawPassed
      ? compareRetained(result, reference, record.frames)
      : { passed: false, skipped: 'raw parity failed' };
    self.postMessage({
      id,
      case: record.id,
      frames: record.frames,
      scoredFrames: record.scored_frames,
      passed: rawPassed && retained.passed,
      inferenceMs,
      heads,
      retained,
    });
  } catch (error) {
    self.postMessage({ id, passed: false, error: String(error) });
  } finally {
    input?.dispose();
    if (result) for (const value of Object.values(result)) value.dispose();
  }
};
