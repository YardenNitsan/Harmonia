# SELU arithmetic: retained failure

This single frozen diagnostic fails original LV-Chordia logit acceptance. It
changes only ten SELU nodes in the original s0 mixed-normalization graph, leaving
convolutions, weights and recurrence unchanged. The reference remains the native
installed PyTorch model, on the already selected 1,531-frame validation recording
`00_Funk2-108-Eb_solo`. No new recording or locked test was accessed.

| Head | Logit violations | Probability violations | Argmax disagreements |
| --- | ---: | ---: | ---: |
| Triad | 29 | 0 | 0 |
| Bass | 2 | 0 | 0 |
| Seventh | 0 | 0 | 0 |
| Ninth | 15 | 0 | 0 |
| Eleventh | 0 | 0 | 0 |
| Thirteenth | 0 | 0 | 0 |

Tolerances remain logit atol5e-5/rtol5e-4 and probability atol1e-5/rtol5e-4.
Matching probabilities and decisions does not override failed logits. The
constructed activation result improves near-zero cancellation but does not
resolve accumulated full-model error. Do not promote this artifact or combine
it post hoc with other variants and claim the original protocol passed.

Measured ONNX inference was0.589s; total diagnostic2.049s; process lifetime peak
RSS1,066,647,552bytes; minimum sampled free RAM16,787,030,016bytes. Two CPU/BLAS
threads and one interop thread were used, with no GPU. These are single-pass
prepared-feature timings, not a complete audio-to-timeline hardware benchmark.

All eleven frozen file hashes were unchanged afterward. `preflight.json` and
`report.json` retain source/audio/weight/model identities and per-head errors.
The original graph and all earlier acceptance reports remain unchanged.
The ignored `reference.npz` preserves exact CQT/native output arrays for later
numerical investigations, SHA256
`d6790ef105ff046c969e3ad4c010d3a52c7e8ede94a47ff121bc1bb2268c1ca3`.
The ignored candidate graph has SHA256
`7f5b27ab37abe57fdcda61b00867fd9f4f9ed321dc9a4a880ab16f114e12350b`.

Protocol: `ml/experiments/LV-selu-arithmetic-protocol.md`. Three constructed tests
verify near-zero precision, preserved source graph, and refusal of unsupported
coefficients/missing SELU nodes. The runner refuses an existing evidence directory;
do not rerun or overwrite this completed diagnostic.
