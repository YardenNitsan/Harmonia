import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareTensor,
  decodeTensors,
  extensionDecision,
  lifecyclePassed,
} from './e010-wasm-checks.mjs';

test('acceptance requires confirmed session, worker, browser and server cleanup', () => {
  const report = {
    pageErrors: [],
    externalRequests: [],
    cspViolations: [],
    cleanup: {
      session: { passed: true },
      workerTerminated: true,
      browserClosed: true,
      serverClosed: true,
    },
  };
  assert.equal(lifecyclePassed(report), true);
  for (const key of ['session', 'workerTerminated', 'browserClosed', 'serverClosed']) {
    assert.equal(
      lifecyclePassed({
        ...report,
        cleanup: { ...report.cleanup, [key]: key === 'session' ? { passed: false } : false },
      }),
      false,
    );
  }
  assert.equal(lifecyclePassed({ ...report, pageErrors: ['runtime failure'] }), false);
});

test('decodes bounded aligned binary tensors without casting float64 or int64', () => {
  const buffer = new ArrayBuffer(32);
  new Float32Array(buffer, 0, 2).set([1, 2]);
  new Float64Array(buffer, 8, 2).set([1 + 1e-8, 3]);
  new BigInt64Array(buffer, 24, 1).set([2n]);
  const metadata = {
    bytes: 32,
    tensors: {
      features: { dtype: 'float32', dims: [1, 2], offset: 0, bytes: 8 },
      quality: { dtype: 'float64', dims: [1, 2], offset: 8, bytes: 16 },
      decision: { dtype: 'int64', dims: [1], offset: 24, bytes: 8 },
    },
  };
  const actual = decodeTensors(buffer, metadata);
  assert.equal(actual.quality[0], 1 + 1e-8);
  assert.equal(actual.decision[0], 2n);
  assert.ok(actual.quality instanceof Float64Array);
  assert.ok(actual.decision instanceof BigInt64Array);
});

for (const fault of ['negative', 'unaligned', 'oversize', 'dimensions', 'length', 'overlap']) {
  test(`rejects malformed binary descriptor before allocation: ${fault}`, () => {
    const descriptor = { dtype: 'float64', dims: [1], offset: 0, bytes: 8 };
    const metadata = { bytes: 8, tensors: { a: descriptor } };
    if (fault === 'negative') descriptor.offset = -8;
    if (fault === 'unaligned') descriptor.offset = 1;
    if (fault === 'oversize') metadata.bytes = 9 * 1024 * 1024;
    if (fault === 'dimensions') descriptor.dims = [Number.MAX_SAFE_INTEGER, 60000];
    if (fault === 'length') descriptor.bytes = 4;
    if (fault === 'overlap') metadata.tensors.b = { ...descriptor };
    assert.throws(() => decodeTensors(new ArrayBuffer(8), metadata));
  });
}

test('requires genuine float64 output and applies the tight quality tolerance', () => {
  const meta = { dtype: 'float64', dims: [1, 1, 1] };
  const reference = new Float64Array([1 + 1e-8]);
  assert.equal(
    compareTensor(meta, reference, { type: 'float64', dims: meta.dims, data: reference }).passed,
    true,
  );
  assert.equal(
    compareTensor(meta, reference, {
      type: 'float32',
      dims: meta.dims,
      data: new Float32Array(reference),
    }).passed,
    false,
  );
  assert.equal(
    compareTensor(meta, reference, {
      type: 'float64',
      dims: meta.dims,
      data: new Float64Array([1]),
    }).passed,
    false,
  );
});

test('checks integer decisions exactly despite close numerical outputs', () => {
  const meta = { dtype: 'int64', dims: [1, 1] };
  assert.equal(
    compareTensor(meta, new BigInt64Array([2n]), {
      type: 'int64',
      dims: [1, 1],
      data: new BigInt64Array([1n]),
    }).passed,
    false,
  );
});

test('does not hide JavaScript versus CPU float32 sigmoid threshold differences', () => {
  assert.equal(extensionDecision(-1e-8), 0n);
  assert.equal(extensionDecision(0), 1n);
  assert.equal(extensionDecision(1), 1n);
});
