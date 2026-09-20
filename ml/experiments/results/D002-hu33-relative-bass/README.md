# D002: completed train-only relative-bass diagnostic

The single frozen study completed on 2026-09-20. **It fails all three declared
signal/tradeoff gates.** Do not proceed to predicted-root bass inference on the
basis of this result. No validation/test arrays were opened and no product model
changed. The [protocol](../../D002-hu33-relative-bass-protocol.md),
[source preflight](source-preflight.json), [input preflight](input-preflight.json)
and [report](report.json) preserve the settings and complete evidence.

Both arms use 38 inputs and identical twelve-class linear classifiers, with the
same annotated-root one-hot information. Only the rotation of the two chroma
groups differs. Four held-out training-composition folds cover 78,350 valid
frames: 56,472 root-position and 21,878 inverted frames. These are correlated
frames from twelve compositions, not independent examples or deployment roots.

| Pooled out-of-fold measure                   | Absolute control | Root-relative treatment | Always root position |
| -------------------------------------------- | ---------------: | ----------------------: | -------------------: |
| Exact relative-bass interval                 |         68.1455% |                66.7862% |             72.0766% |
| Inverted-frame exact interval                |          0.8639% |                 5.5718% |                   0% |
| Inversion-only present-class macro recall    |          0.3119% |                 1.6185% |                   0% |
| Root-position exact accuracy                 |         94.2113% |                90.5015% |                 100% |
| Inversion detection precision                |         35.7886% |                39.0731% |            undefined |
| Inversion detection recall                   |          8.3280% |                15.7236% |                   0% |
| False inversion rate on root-position frames |          5.7887% |                 9.4985% |                   0% |

The inverted-frame gain is 4.7079 percentage points, below the required 5 points;
inversion macro gain is 1.3067 points, below 2; root-position loss is 3.7098 points,
exceeding the 2-point allowance. Detecting an inversion is not the same as naming
its correct bass degree. Even the treatment identifies the exact interval in
only 1,219 of 21,878 inverted frames.

All eight fits converge under the frozen full-objective gradient criterion:
maximum gradient infinity norm is 3.3680861e-7, below 1e-6. Fits used 246-298
iterations and 268-377 objective evaluations. The protocol explicitly records
strong-Wolfe line-search overshoot of the nominal 375-evaluation limit. No fit
was restarted, extended or selected. Poor held-out accuracy cannot be attributed
to an unfinished optimizer in this study.

Reference interval supports for semitones 0 through 11 are
`[56472, 65, 89, 3735, 4540, 205, 584, 9782, 0, 193, 2611, 74]`.
Interval 8 is unsupported. The fold holding compositions 03/07/11 has interval 11
in held-out references but none in training; the fold holding 05/09/13 similarly
has unseen intervals 2 and 9. They remain scored, with explicit support counts.
This limitation does not explain weak recognition of well-supported intervals
3, 4 and 7. Treatment recall for those intervals is 0.9906%, 2.6652% and 10.4273%.
Root-relative training inverted-frame accuracy ranges from 16.56% to 26.42%,
versus held-out 2.23%, 1.88%, 5.39% and 17.49% across the four folds. This exposes
both limited fit and composition generalization; it does not establish whether
a stronger temporal/bass representation or a nonlinear model would resolve them.

Measured study time was 22.6762 seconds, sampled peak process RSS 669,511,680 bytes,
and minimum sampled available system memory 17,099,128,832 bytes. There were 2,910
resource checks, two CPU/BLAS threads, no workers and no GPU. Sampling is not a
continuous peak guarantee. No concurrent numerical study was scheduled in this
window; these prepared-feature timings are not desktop audio-to-timeline latency.

Verification after execution matched five frozen source files and their exact
bytes in `source-snapshot.zip`, all twelve training file hashes, all eight ignored
checkpoint hashes, and the source/input preflight chain. The report records both
source and training inputs unchanged. Six focused constructed tests and scoped
Ruff lint/format checks passed after the run. Tests cover rotation with equal
oracle information, training-only normalization, exact-versus-detection metrics,
train-only loading, nonconvergence and nonfinite-objective rejection.

The archive is an exact scientific source snapshot; do not rewrite it or the
preflights/report. Coefficients remain under ignored
`ml/checkpoints/D002-hu33-relative-bass/`. This result closes this bounded
diagnostic without a bass-model promotion or validation experiment.
