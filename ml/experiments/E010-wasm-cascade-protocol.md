# E010 exact cascade: bounded browser CPU/WASM parity

Declared 2026-09-20 before the new CPU reference-generation/browser campaign.
Reuse the completed E010 fit, predictions and exact exported ONNX bytes. This is
cross-runtime numerical acceptance, not training, quality reselection, test access,
product integration, calibration or permission to change the graph/precision.

## Inputs and reference generation

Pin the completed model SHA256
`f1fd6e356463fbb3387ca680ec705130ca73bbeffdb880de26028e239a8d561f` (447,455 bytes),
E010 retained report and original five validation input/prediction hashes. Only
HU33 compositions 14–18 may be read; do not open training/test arrays or audio.
The earlier CPU report retained numerical summaries, not raw logits. Authorize
exactly one new reference-generation pass per complete validation input through
ONNX Runtime 1.30.0 CPUExecutionProvider, sequential execution, two intra-op and
one inter-op threads, default graph optimization, matching the completed export.
Verify every decoded decision against retained E010 before publishing a reference.
No chord-quality metrics or new selection score may be computed.

Save lossless raw input/reference tensors and retained decisions in new ignored
`checkpoints/E010-wasm-cascade/` binaries, not JSON floats or lossy conversions.
Use little-endian float32/float64/int64/uint8 with 8-byte-aligned tensor offsets;
retain dtype, shape, byte length and SHA256. Each binary <=8 MiB, total <=32 MiB,
one full recording <=60,000 frames. Verify frozen sources/runtime/model/input hashes
before reference generation and again afterward, then freeze the resulting binary
manifest/hash before starting the browser. Never repeat this CPU generation simply
because browser execution fails; retain the reference binaries for later review.

## Browser execution

Launch installed Chrome headless with GPU disabled in a fresh isolated context.
Serve only an explicit in-memory asset allowlist on 127.0.0.1: the pinned graph,
reference binaries/manifest, worker/checker modules and local onnxruntime-web 1.30.0
WASM assets. Record hashes for `ort.wasm.min.mjs`, `ort-wasm-simd-threaded.mjs` and
`ort-wasm-simd-threaded.wasm`, package lock and native CSP source. Block external
requests; apply the application's existing native CSP verbatim. No app bundle,
user profile, OPFS, IndexedDB or visible desktop window is used.

Inference runs only in a dedicated module worker: execution provider `wasm`, one
WASM thread, proxy disabled, graph optimization `all`. No WebGL/WebGPU, fallback,
quality cast or graph alteration. Create one session; process the five complete
sequences once in composition order, without chunking or warm-up on validation.
Require quality output type float64 backed by Float64Array and final triad output
type int64 backed by BigInt64Array. Validate binary bounds/dtypes/shapes before
creating typed views or inference tensors; verify binary/model hashes in worker.

## Acceptance and reporting

Compare every raw float32 output to the saved CPU reference with unchanged
`atol=1e-5, rtol=1e-4`; compare float64 quality logits at `atol=1e-10, rtol=1e-10`.
Integer triad decisions must agree exactly. Also compare root, baseline triad,
cascade triad, seventh and bass argmax decisions against retained E010 on every
raw frame, including masked frames. Keep first-index tie behavior. No tolerance
or decision mismatch may be hidden by average error or scored-frame filtering.

For the browser extension decision explicitly use JavaScript
`1/(1+Math.exp(-logit)) >= 0.5`, with no artificial rounding patch. Require exact
agreement with retained E010 CPU float32-sigmoid decisions. Any near-zero rounding
disagreement is a failed adapter/runtime check, not a reason to modify the frozen
model or ignore that frame. Compare boundary sigmoid values to the retained
float32 reference with the same float32 tolerance. These checks preserve the
distinction between model output parity and cross-language decoder parity.

Report per-head shapes/dtypes/max errors/violation counts, exact decision mismatch
counts, raw/scored frames, initialization/inference times, browser/runtime versions,
observed requests, CSP violations and cleanup. Stop at the first failed case,
retain its details and mark later recordings unexecuted; no retry, precision
fallback or new model-quality evaluation. Success establishes only this headless
CPU/WASM configuration, not native WebView, audio preprocessing, chunking, weak-PC
performance, calibrated confidence or release readiness.

## Bounds and lifecycle

Require >=8 GiB sampled available system RAM. CPU-reference generation uses two
BLAS/Torch threads set before imports; browser WASM remains single-threaded. Run
the campaign separately from D002, LV probes and full test suites. Reference
generation has a 120-second watchdog; browser initialization/each request have
60-second limits within a 120-second browser campaign watchdog. Monitor browser
process-tree RSS and free memory from the external Python orchestrator. Abort on
resource breach/OOM/timeout without numerical retry.

Release input/output tensors, session and worker; close the owned browser/context,
loopback server and any temporary browser profile on success and failure. The
external watchdog terminates only its owned process tree if graceful cleanup cannot
finish. Record partial cases before proceeding and cleanup failures separately.
Use only new `artifacts/E010-wasm-cascade/` evidence, refusing existing output paths;
preserve the completed CPU export and all prior reports byte-for-byte.
