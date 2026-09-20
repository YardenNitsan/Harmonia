# E010 predicted-root quality cascade: completed research diagnostic

One predeclared fit and one paired full-validation pass completed on 2026-09-20.
The [protocol](../../E010-predicted-root-quality-cascade-protocol.md),
[preflight](preflight.json) and [report](report.json) retain the scientific settings,
25 frozen-file hashes, per-composition metrics and resources. No test was opened,
no historical report/checkpoint was changed, and no product model was promoted.

The new quality classifier used 78,350 valid training frames from HU33 compositions
02–13, with annotated roots only for training rotation. Validation compositions
14–18 used E009 predicted roots exclusively; reference roots entered metrics only.
All five validation recordings were evaluated once, totaling 23,250 valid frames.
No oracle validation arm, threshold search or second fit occurred.

| Pooled validation measure                              | Paired E009 CPU baseline | E010 cascade |
| ------------------------------------------------------ | -----------------------: | -----------: |
| Triad macro recall, all five present reference classes |                 20.2548% |     27.0171% |
| Reduced structural exact agreement                     |                 19.8065% |     25.4108% |
| Overall triad accuracy                                 |                 59.9699% |     58.8645% |
| Major recall                                           |                 99.8563% |     71.9028% |
| Minor recall                                           |                  0.3408% |     53.5316% |
| Diminished recall                                      |                  1.0771% |      9.6510% |
| Augmented recall                                       |                       0% |           0% |
| Sus4 recall                                            |                       0% |           0% |
| Root accuracy, unchanged between paired arms           |                 59.0108% |     59.0108% |
| Reduced exact on 8,180 inversion frames                |                  1.7482% |      2.8729% |

The +6.7623 percentage-point macro gain exceeds the predeclared +5-point threshold,
and reduced exact improves by 5.6043 points, satisfying its no-more-than-1-point-loss
guardrail. This is a **useful research signal**, not release-quality acceptance.
The primary macro includes all present classes: major/minor/diminished/augmented
and unsupported sus4, with supports 13,916/6,456/2,321/478/79 respectively.

There are concrete regressions. Triad accuracy on the 9,530 wrong-root frames falls
from 54.2392% to 38.1637%; on the 13,720 correct-root frames it rises from 63.9504%
to 73.2434%. Wrong-root and correct-root macro averages have different class support
and must not be directly compared as if they represented the same distribution.
Overall, 8,453 triad labels change: 3,666 are corrected and 3,923 formerly correct
labels are damaged. Composition 17 loses reduced exact (34.3737% to 27.0550%) even
though pooled exact improves. Augmented and sus4 remain unrecognized.

Root, seventh, bass, extension decisions and boundary score bytes match between
paired arms, verified before metrics. No validation frame predicted root 12, so
the preserve-N gate has constructed-test coverage but no positive validation
coverage here. Triad replacement is not evidence of improved boundary-head quality.

The historical E009 GPU report remains immutable. Compared with that report, this
new CPU baseline has one fewer correct root and one fewer reduced-exact frame:
root 0.5901505376 to 0.5901075269; exact 0.1981075269 to 0.1980645161. Its triad macro
is identical. Acceptance compares the two arms of the same new CPU run, not an
unmatched historical backend. No settings were changed to remove this difference.

The single zero-initialized float64 LBFGS fit used 100 iterations and 104 objective
evaluations, with measured final gradient infinity norm **2.01543e-6**, below 1e-5.
Training-only normalization and coefficients are retained in ignored
`checkpoints/E010-predicted-root-quality-cascade/quality.npz`, SHA256
`5ac07607af5eb6ce8aa2eeb14027030789f3f4d85e51fc05ec95f25c40b2d06a`.
Five unchanged paired-prediction archives are retained alongside it, each hashed
in the report. All 25 frozen source/config/protocol/data/checkpoint hashes remained
unchanged after execution. The preflight SHA256 is
`6970fd6c31d68430ebfba151e7c5e933c795782aea9e3faed847d4d8713fdd6b`.

Measured fit time was 0.7727 seconds; summed E009 inference 0.0917 seconds and
quality inference 0.0152 seconds. Sampled total study time was 1.0578 seconds from
the resource monitor's start, excluding Python/import startup; process wall time
was 3.65 seconds. Sampled peak RSS was 660,963,328 bytes and minimum system memory
headroom 17,477,443,584 bytes. Two CPU/BLAS threads, one interop thread, no workers
or GPU were used. These are prepared-array research timings, not audio-to-timeline
desktop latency. Sampling does not establish continuous resource peaks.

Before the scientific run, 15 constructed E010 tests passed after the initial
12 expected stub failures; the full Python suite passed 98 tests, with 25 upstream
ONNX warnings, and repository-wide Ruff checks passed. Tests cover predicted-root
rotation, exact extension threshold, N preservation, wrong-root/mask metrics,
unsupported-class inclusion, actual solver convergence and stopping before
validation on a failed fit. No model-quality claim follows from those checks.

The result supports further investigation of a predicted-root-conditioned quality
branch. It does not establish broad genres, new performers, full mixes, calibrated
confidence, extension accuracy, deployment parity or final-product suitability.
