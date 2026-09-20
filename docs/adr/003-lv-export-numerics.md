# ADR 003: LV-Chordia export precision and acceptance boundaries

Status: research decision accepted; production integration blocked, 2026-09-20.

The audited LV-Chordia 1.1.0 five-network model uses sequence-wide instance
normalization and bidirectional recurrence over hybrid CQT features. Exporting
float32 InstanceNormalization produced reduction error on long sequences.
Layer-isolated comparisons against identical inputs located the first large
error in normalization, not the preceding convolution.

Options were unchanged float32 export, explicit centered float32 reductions,
float64 normalization reductions with float32 output, or wider tolerances.
Only an export copy now uses float64 centered mean/variance and normalization;
the installed PyTorch network remains the independent reference. Keep weights,
inputs, convolution/recurrent layers and outputs float32. Do not change the
existing logit/probability acceptance tolerances. Tests also require a failed
parity report to be written before later exports stop.

The first network passes procedural sequences through 8,192 frames; all five
and their probability average/HMM match through 4,096. This is limited evidence:
network 1 still fails at 8,192, and a full real validation recording also fails
network 0 at 1,531 frames. Neither accepting shorter procedural fixtures nor
observing matching argmax values closes those failures. The first real recording
did preserve all 15 decoded segments, so the investigation includes a nontrivial
decoder comparison rather than only no-chord fixtures.

An isolated first-network headless WASM probe confirms mixed-precision operator
support with the current local runtime/CSP at 128 frames. CQT/resampling/tuning,
ensemble/HMM production ports, representative numerical acceptance and complete
pipeline memory/latency remain open. Do not chunk this model using the TCN's
overlap rule: that changes normalization and recurrent context.

Costs: transient float64 tensors, slower reductions, full-sequence memory, and
remaining numerical sensitivity. Benefits: an identified error source, explicit
precision, retained thresholds and reproducible failures. No dependency on the
Python research stack is added to the desktop product. DSP remains default;
E004 remains the separately labeled experimental runtime.

Evidence: `ml/experiments/results/LV-Chordia-export-cpu.md`,
`ml/experiments/results/LV-Chordia-real-audio-parity.json`, and
`docs/review-evidence/lv-wasm-probe.json`.

Follow-up localization on the retained second validation recording separates
the PyTorch export copy from ONNX execution. The copy itself passes every logit
head against the unchanged native model. ONNX convolution differences start at
2.38e-7 in the first convolution, grow to about 3.81e-5 after its normalization,
and accumulate through the convolution stack. With graph optimizations disabled,
the final triad/bass/ninth heads have 27/2/14 tolerance violations. Disabling other
optimization levels did not close the original failure. Separating the first
convolution's bias gives identical failing results; a float64 patch/matrix-product
probe still fails (26/2/15). Native ORT has no float64 Conv kernel for this graph.
These probes are diagnostic only, not alternative accepted model artifacts.

Reproduce from `ml/` with `PYTHONPATH=.` and
`.venv/Scripts/python.exe experiments/lv_real_audio_layers.py`. It checks the
original source/weight identity, uses only the preselected validation recording,
retains CPU/thread/headroom limits and writes
`artifacts/lv-chordia-diagnostic/real-audio-layers.json`. The original acceptance
report remains unchanged. Matching probabilities/argmax on a failed logit check
does not authorize promotion; further kernel-level localization is still needed.

The next frozen diagnostic replaced all ten convolutions with explicit float64
patch/matrix multiplication and cast each result back to float32. Three constructed
multichannel/padding tests match a float64 convolution reference exactly. On the
same retained recording, original logit acceptance still fails: triad29, bass2,
ninth15 violations; other heads pass. Probability checks and argmax match, which
does not override the logit failure. ORT inference took1.448s, total measured
diagnostic2.849s, lifetime peak process RSS2.305GB; at least15.317GB remained after.
Two-thread environment settings were recorded before imports. No additional
recording or test was accessed. Evidence: `ml/artifacts/lv-chordia-diagnostic/all-convolutions/`;
protocol: `ml/experiments/LV-all-convolutions-protocol.md`. Do not rerun into it.

An independent metadata bug was also fixed: the normalization loop shadowed the
weight filename, reporting `norm4b` as `checkpoint_name`. New exports use the actual
checkpoint basename. A failing regression reproduced it before the fix. Historical
reports remain unchanged; their weight hashes still identify the correct files.

A separate constructed SELU probe localizes float32 Exp(x)-1 cancellation near
zero: a double difference lowers the fixed near-zero maximum error from6.06e-8
to4.55e-13, but still loses the smallest negative subnormal fixture. Replacing
only the ten SELU nodes in the original graph does not solve the retained real
recording: triad29, bass2 and ninth15 logit violations remain. Other heads,
probabilities and argmax pass. This is another failed diagnostic, not promotion.
The frozen protocol is `ml/experiments/LV-selu-arithmetic-protocol.md`; evidence is
`ml/artifacts/lv-chordia-diagnostic/selu-arithmetic/`. Full native CQT/output tensors
are retained in its ignored, hashed `reference.npz` to avoid repeating reference
generation. Measured inference0.589s, diagnostic2.049s, lifetime peak RSS1.067GB;
minimum sampled headroom16.787GB. All eleven frozen file identities remain exact.
