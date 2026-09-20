# ADR 002: Local experimental inference, conservative decoding

Status: accepted for the engineering checkpoint, 2026-09-20.

E004 is frozen and exported, but held-out minor/extension and boundary performance
fails the intended quality bar. Keep balanced DSP as the default; expose E004 only
as experimental research. Do not silently fall back when model loading fails.

Bundle the pinned float32 ONNX artifact and ONNX Runtime WASM locally. Verify its
SHA-256 before loading, run one CPU thread inside a cancellable module worker, and
process 1024-frame chunks with seven context frames on each side. No CDN, GPU or
Python dependency is required in production. These settings follow the runtime's
[official environment documentation](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html).
Partial int8 benchmarking gave negligible size benefit and changed predictions;
retain float32. CSP allows local fetch and WebAssembly compilation, not remote scripts.

Training/export and TypeScript feature extraction match on the retained parity
fixture. Browser resampling still differs from scipy for non-22050Hz sources; this
is disclosed, not treated as validated parity. Chord scores remain uncalibrated;
root-only validation calibration is not a whole-chord confidence claim. Learned
boundaries are not used: DSP novelty/stabilization remains replaceable and explicit.

Import conservatively reads at most 1 MiB of headers to verify mono/stereo layout,
then checks duration before Web Audio decode. Unknown formats/layouts are rejected
with conversion guidance. This currently narrows input to common WAV, FLAC, MPEG
audio and Ogg Vorbis/Opus containers. Large metadata preceding the audio header may
also require conversion. A post-decode check catches mismatches; it is not an OS
allocation cap. A bounded streaming/native decoder remains a release-hardening task.

Cost: roughly 14 MB WASM runtime plus a 233 KB model; additional DSP feature pass;
unvalidated resampling and narrower container support. Benefit: explicit provenance,
replaceable inference and no silent privacy/quality/resource claims.
