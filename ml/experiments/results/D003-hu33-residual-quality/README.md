# D003: completed run, inconclusive nonlinear quality diagnostic

One frozen training-only run completed on 2026-09-20. **All four fits failed the
predeclared convergence criterion**, so the diagnostic is inconclusive. No retry,
extra iterations, validation/test inference or model promotion follows. Its
[protocol](../../D003-hu33-residual-quality-protocol.md),
[source preflight](source-preflight.json), [input preflight](input-preflight.json),
[report](report.json) and [external watchdog](watchdog.json) remain immutable.

The candidate adds a 16-unit tanh residual to each existing D001 root-relative
linear classifier. D001 weights and fold-only normalization remain frozen; the
initial zero-output residual reproduces its logits exactly. The candidate has
500 trainable residual parameters, 608 total, versus 108 in the control. Both
use the same 26 features, oracle roots, explicit mask and four held-out training
composition folds. This tests a capacity change, not a deployment-ready model.

| Pooled train-composition OOF measure | Saved D001 linear control | D003 residual candidate |
| ------------------------------------ | ------------------------: | ----------------------: |
| Major recall                         |                  80.8491% |                78.1104% |
| Minor recall                         |                  69.9248% |                71.8524% |
| Diminished recall                    |                  30.0693% |                31.1424% |
| Augmented recall                     |                        0% |                      0% |
| Present-class macro recall           |                  45.2108% |                45.2763% |
| Overall triad accuracy               |                  73.7983% |                72.9853% |

Descriptively, major recall loses 2.7387 percentage points instead of gaining the
required 3 points. Macro gain is 0.0655 points, below the required 0.5 points, and
overall accuracy loses 0.8130 points. Minor and diminished preservation guards
pass. These descriptive results do not override failed convergence, and the
nonlinear capacity question remains unresolved under the declared budget.

Every fit reached the fixed 500-iteration cap. Final gradient infinity norms were
0.001217571 / 0.000486068 / 0.000341748 / 0.001140836, all above 0.00001. Objective
evaluations were 507 / 511 / 505 / 509. The process exited successfully because
the study completed and preserved its evidence; exit status is not convergence.
Even convergence would establish only a stationary point, not a global optimum.

All 78,350 valid training frames are included once in OOF evaluation. Supports
are major 45,131 / minor 28,585 / diminished 4,473 / augmented 161. All augmented
examples occur in composition 03; its held-out fold has no augmented training
examples, and that missing support is reported rather than omitted. Sus qualities
have no training support. The candidate's training accuracy spans 87.47%-90.47%,
versus held-out fold accuracy 69.50%-78.92%; these are descriptive capacity and
generalization observations, not proof that more fitting would help.

The full numerical study took 21.3976 seconds; the external supervisor measured
23.9485 seconds including child startup, below its fixed 600-second limit. No
timeout/retry occurred. Sampled peak numerical-process RSS was 669,327,360 bytes,
and minimum system headroom 17,102,577,664 bytes across 2,037 checks. Two CPU/BLAS
threads, one interop thread, no data workers and no GPU were used. The stdlib-only
supervisor is separate; numerical-process RSS excludes its small Python process.
These sampled prepared-feature timings do not measure desktop live latency.

Post-run verification matched six scientific source files and their exact bytes
in `source-snapshot.zip`, six dependency hashes (manifest, D001 report and four
frozen control checkpoints), twelve training inputs, four new checkpoints,
twelve retained paired OOF prediction files and the preflight hash chain. Every
baseline composition confusion and pooled confusion exactly matches D001; control
predictions were checked before fitting each fold. No D001 fit was repeated.

Eight constructed tests passed before the scientific run, after observed stub
failures, and scoped Ruff lint/format checks passed. Coverage includes frozen
baseline equality/parameters, fold-only normalization, absent-class metrics,
tradeoff and nonconvergence gates, nonfinite objective rejection, watchdog timeout,
interruption cleanup and overwrite refusal. New coefficients/predictions stay in
ignored `ml/checkpoints/D003-hu33-residual-quality/`.

No reduced-structural, predicted-root, calibrated-confidence or product-quality
claim follows. All scientific artifacts are retained unchanged while the product
work proceeds to live PCM capture and streaming analysis.
