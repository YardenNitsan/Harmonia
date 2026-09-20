# E010 research-only ONNX cascade parity

Declared 2026-09-20 after E010's one completed fit/validation, before this export
or parity measurements. This checks representation/runtime feasibility for the
exact frozen cascade, not new model selection, training, test evaluation, default
integration or confidence calibration. Preserve all original E010 artifacts.

## Frozen graph contract

Input `features`: raw float32 `[1, frames, 26]`, dynamic frame dimension, the exact
existing prepared `chroma-bass-v1` contract. Embed E009's float32 normalization and
six-block network unchanged. Root argmax (first index on ties) drives gather indices
`(pitch_index + predicted_root) % 12` for each raw 12-bin chroma/bass group. Leave
raw energy/flux unchanged. Cast these features to float64, then apply the frozen
E010 quality mean/std/weight/bias in float64. Do not quantize or silently cast the
quality branch to float32.

Return eight named outputs:

- `root`, `baseline_triad`, `seventh`, `bass`, `extensions`, `boundary`: E009's
  original float32 independent raw logits, with unchanged dimensions 13/8/4/13/4/1.
  Boundary remains `[1, frames]`; the other heads have a final class dimension.
- `quality_logits`: float64 `[1, frames, 4]`, the four uncalibrated linear scores
  in major/minor/diminished/augmented order. The root-12 branch computes this
  diagnostic tensor with modulo-12 indices but does not use it for decisions.
- `triad_decision`: int64 `[1, frames]`; quality argmax+1 for predicted roots 0–11,
  original E009 triad argmax for root 12. No reference-root input or score gate.

This is **not** the existing E004 decoder/confidence contract. Any future product
integration requires an explicit cascade adapter; an eight-class baseline head
must not be mistaken for the cascade decision or calibrated whole-chord scores.
No app bundle or model registry changes belong to this research artifact.

The official ONNX [GatherElements](https://onnx.ai/onnx/operators/onnx__GatherElements.html)
and [MatMul](https://onnx.ai/onnx/operators/onnx__MatMul.html) specifications permit
double tensors. This establishes operator type expressibility, not runtime,
browser, WebAssembly or model-accuracy acceptance. Use installed Torch's existing
legacy exporter with opset 17 and `dynamo=False`, one export, no alternate graph
search. Use CPUExecutionProvider only, two intra-op threads, one inter-op thread,
sequential execution, default graph optimization. Record package versions.

## Comparison and stopping

Freeze exporter/test/protocol/config, imported E010 helper/model source hashes,
E009 checkpoint, E010 report/preflight/quality checkpoint, prepared manifest and
five validation NPZ/prediction archive hashes before export. Verify E010 retained
report SHA256 `039aa502f502072afcdd8dcbf6f1ed427fa31c00f7cdea6521db9b50eb9587a5`
and quality NPZ SHA256
`5ac07607af5eb6ce8aa2eeb14027030789f3f4d85e51fc05ec95f25c40b2d06a`.
Read only existing validation compositions 14–18; no training arrays or test files.

First use constructed fixtures with seeded normal float32 inputs, mean 0 and
standard deviation 0.2, lengths 1/17/128/1024/2048, seed equal to length. These are
numerical checks, not audio-quality evidence. Unit tests separately force root 12,
root rotation and a float64 decision distinguishable from its float32 rounding.

Then run each of the five complete validation feature sequences once through the
Torch wrapper and once through ONNX. Compare E009 raw float32 heads with the
unchanged existing export tolerance `atol=1e-5, rtol=1e-4`. Compare float64 quality
logits at `atol=1e-10, rtol=1e-10`. Require every triad decision to match exactly.
Also compare quality logits to the retained NumPy coefficient computation using
the retained predicted roots, independently of the wrapper's gather implementation.
Check all outputs are finite and dimensions/dtypes match the contract.

On every validation frame, including masked frames, require both wrappers' root,
triad, seventh and bass decisions to match the retained E010 prediction archive.
Apply the original CPU float32 Torch sigmoid then `>=0.5` to extension logits,
matching E010's exact decision path; those decisions must also agree. Compare
boundary sigmoid values with the same float32 tolerance. This decoder comparison
does not validate a future JavaScript float64 sigmoid implementation. Verify the
stored masks against the prepared masks and report scored/raw frame counts.

Acceptance requires every numerical and exact-decision check to pass. A close
logit comparison does not excuse a root argmax change that changes the downstream
quality decision. Do not loosen tolerance, drop near-tie frames, replace retained
predictions, or switch precision/backend after a failure. Stop and retain the
first failing case, counts/max errors and diagnostic head names; mark remaining
cases unexecuted. Do not recalculate chord-quality selection metrics.

## Bounds and artifacts

Full recording context only, batch 1, at most 60,000 frames and 20 minutes according
to the existing manifest. No chunk inference in this first probe. The network's
127-frame receptive field would require 63-frame halos on each side for a future
separate chunk-parity claim; that claim is not made here.

One CPU process, no GPU/workers, two BLAS/Torch threads set before Python imports,
one inter-op thread, deterministic Torch algorithms, >=8 GiB sampled available
system memory. Check resources before export/session creation and every case;
record session creation and each inference elapsed time, sampled peak RSS/minimum
headroom. Abort without retry on failure/OOM/headroom breach. Process execution is
bounded by a 120-second external watchdog; preserve partial evidence on failure.

Use only new research artifact directory `artifacts/E010-onnx-cascade/`, refusing
an existing output directory. Save exclusive-created preflight before export,
`model.onnx`, report and artifact manifest; retain failures and hash every frozen
input again afterward. The exported graph is limited to 16 MiB; an oversized
artifact is retained as a failed export, never promoted. Report
operator/runtime/parity scope explicitly. Even a
full CPU pass does not establish WASM support, UI behavior, audio preprocessing,
weak-PC performance, calibration or release readiness.
