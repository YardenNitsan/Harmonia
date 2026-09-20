const types = {
  float32: Float32Array,
  float64: Float64Array,
  int64: BigInt64Array,
  uint8: Uint8Array,
};
export const outputs = [
  'root',
  'baseline_triad',
  'seventh',
  'bass',
  'extensions',
  'boundary',
  'quality_logits',
  'triad_decision',
];
function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
export function lifecyclePassed(report) {
  return (
    report.pageErrors.length === 0 &&
    report.externalRequests.length === 0 &&
    report.cspViolations.length === 0 &&
    report.cleanup.session?.passed === true &&
    report.cleanup.workerTerminated === true &&
    report.cleanup.browserClosed === true &&
    report.cleanup.serverClosed === true
  );
}
export function decodeTensors(buffer, metadata) {
  requireValue(
    buffer instanceof ArrayBuffer &&
      buffer.byteLength === metadata.bytes &&
      buffer.byteLength > 0 &&
      buffer.byteLength <= 8 * 1024 * 1024,
    'Invalid binary size',
  );
  const entries = Object.entries(metadata.tensors);
  requireValue(entries.length > 0 && entries.length <= 32, 'Invalid tensor inventory');
  const regions = [];
  for (const [name, descriptor] of entries) {
    const Type = types[descriptor.dtype];
    requireValue(
      Type &&
        Array.isArray(descriptor.dims) &&
        descriptor.dims.length > 0 &&
        descriptor.dims.length <= 3 &&
        descriptor.dims.every((d) => Number.isSafeInteger(d) && d > 0 && d <= 60000),
      'Invalid tensor shape/type',
    );
    const count = descriptor.dims.reduce((a, b) => a * b, 1);
    requireValue(
      Number.isSafeInteger(count) &&
        count <= 60000 * 26 &&
        Number.isSafeInteger(descriptor.offset) &&
        descriptor.offset >= 0 &&
        descriptor.offset % 8 === 0 &&
        descriptor.bytes === count * Type.BYTES_PER_ELEMENT &&
        descriptor.offset + descriptor.bytes <= buffer.byteLength,
      'Invalid tensor byte bounds',
    );
    regions.push({ name, descriptor, count, Type });
  }
  regions.sort((a, b) => a.descriptor.offset - b.descriptor.offset);
  for (let i = 1; i < regions.length; i++)
    requireValue(
      regions[i].descriptor.offset >=
        regions[i - 1].descriptor.offset + regions[i - 1].descriptor.bytes,
      'Overlapping binary tensors',
    );
  return Object.fromEntries(
    regions.map(({ name, descriptor, count, Type }) => [
      name,
      new Type(buffer, descriptor.offset, count),
    ]),
  );
}
export function compareTensor(meta, expected, actual) {
  const Type = types[meta.dtype];
  if (
    !actual ||
    actual.type !== meta.dtype ||
    !(actual.data instanceof Type) ||
    actual.data.length !== expected.length ||
    JSON.stringify(actual.dims) !== JSON.stringify(meta.dims)
  )
    return {
      passed: false,
      reason: 'Shape/dtype mismatch',
      expectedType: meta.dtype,
      actualType: actual?.type,
    };
  const exact = meta.dtype === 'int64',
    double = meta.dtype === 'float64';
  const atol = exact ? 0 : double ? 1e-10 : 1e-5,
    rtol = exact ? 0 : double ? 1e-10 : 1e-4;
  let violations = 0,
    maxAbsoluteError = 0;
  for (let i = 0; i < expected.length; i++) {
    const error = exact ? Number(actual.data[i] - expected[i]) : actual.data[i] - expected[i];
    if (
      !Number.isFinite(error) ||
      Math.abs(error) > atol + rtol * (exact ? 0 : Math.abs(expected[i]))
    )
      violations++;
    maxAbsoluteError = Math.max(maxAbsoluteError, Math.abs(error));
  }
  return {
    passed: violations === 0,
    violations,
    maxAbsoluteError,
    dtype: actual.type,
    shape: actual.dims,
    atol,
    rtol,
  };
}
export function extensionDecision(value) {
  return 1 / (1 + Math.exp(-value)) >= 0.5 ? 1n : 0n;
}
export function compareRetained(result, reference, frames) {
  const checks = {};
  for (const [name, size] of [
    ['root', 13],
    ['baseline_triad', 8],
    ['seventh', 4],
    ['bass', 13],
  ]) {
    let violations = 0;
    for (let frame = 0; frame < frames; frame++) {
      let winner = 0;
      for (let i = 1; i < size; i++)
        if (result[name].data[frame * size + i] > result[name].data[frame * size + winner])
          winner = i;
      if (BigInt(winner) !== reference[`retained_${name}`][frame]) violations++;
    }
    checks[name] = { passed: violations === 0, violations };
  }
  for (const name of ['triad_decision', 'extensions']) {
    let violations = 0;
    for (let i = 0; i < result[name].data.length; i++) {
      const value =
        name === 'extensions' ? extensionDecision(result[name].data[i]) : result[name].data[i];
      if (value !== reference[`retained_${name}`][i]) violations++;
    }
    checks[name] = { passed: violations === 0, violations };
  }
  let violations = 0,
    maxAbsoluteError = 0;
  for (let i = 0; i < frames; i++) {
    const expected = reference.retained_boundary[i];
    const error = Math.abs(1 / (1 + Math.exp(-result.boundary.data[i])) - expected);
    maxAbsoluteError = Math.max(maxAbsoluteError, error);
    if (!Number.isFinite(error) || error > 1e-5 + 1e-4 * Math.abs(expected)) violations++;
  }
  checks.boundary = { passed: violations === 0, violations, maxAbsoluteError };
  return { passed: Object.values(checks).every((check) => check.passed), heads: checks };
}
