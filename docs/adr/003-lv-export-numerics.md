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
