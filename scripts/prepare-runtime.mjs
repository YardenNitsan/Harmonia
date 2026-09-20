import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'ml/artifacts/structured-chord-v1');
const target = resolve(root, 'apps/desktop/public/models');
const runtime = resolve(root, 'apps/desktop/public/runtime');
await mkdir(target, { recursive: true });
await mkdir(runtime, { recursive: true });
const manifest = JSON.parse(await readFile(resolve(source, 'manifest.json'), 'utf8'));
const model = await readFile(resolve(source, 'model.onnx'));
if (createHash('sha256').update(model).digest('hex') !== manifest.sha256)
  throw new Error('Model artifact hash does not match manifest');
for (const name of ['model.onnx', 'manifest.json', 'ATTRIBUTION.txt'])
  await copyFile(resolve(source, name), resolve(target, name));
for (const name of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'])
  await copyFile(resolve(root, 'node_modules/onnxruntime-web/dist', name), resolve(runtime, name));
await copyFile(
  resolve(root, 'third-party/ONNX-Runtime-LICENSE.txt'),
  resolve(runtime, 'LICENSE.txt'),
);
console.log(
  `Prepared local CPU runtime and ${manifest.model_id} (${model.length} bytes, experimental)`,
);
