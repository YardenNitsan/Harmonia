# D001: train-only oracle-root representation diagnostic

Declared before optimization on 2026-09-20. This separate bounded diagnostic does
not reopen the completed E007-E009 candidate study, select a product model, or
authorize validation/test inference. Preserve this protocol and config unchanged
after preflight. Output creation refuses overwrites.

## Question and data

Does explicitly expressing pitch features relative to an annotated root make
the existing features more linearly useful for recognizing chord quality?
Use the immutable HU33 manifest SHA256
`a54ce6ed104a42b8216f5045e4bc0be0d4912e61c8678c920ddf896dc63faf4d`.
Read prepared arrays only for compositions 02-13, selecting explicit valid frames.
Do not read validation 14-18 or test 19-24 arrays, run their inference, or use
their labels. Existing manifest metadata may be read to identify train records.
Record and check all twelve training-file hashes before fitting.

Four held-out composition folds are {02,06,10}, {03,07,11}, {04,08,12},
{05,09,13}; each composition receives out-of-fold predictions once per arm.
The target vocabulary is major, minor, diminished and augmented (existing triad
IDs 1-4). Unexpected target/root values abort rather than being remapped.

## Frozen paired comparison

Absolute arm: unchanged 26 raw features. Root-relative arm: rotate each 12-bin
chroma/bass group by negative ANNOTATED root, preserving energy and flux.
This uses oracle information unavailable at deployment. The study measures
linear accessibility with that information; it cannot show deployment accuracy.
Neither arm uses transposition augmentation or temporal/contextual features.

Each arm/fold fits its own per-feature mean and population standard deviation
only on the other nine compositions, with standard-deviation floor 1e-4. The
same fixed 26-input/4-output linear softmax classifier has zero weights/bias.
Train all valid fold-training frames simultaneously in float64 with unweighted
mean cross entropy plus 0.5 * 1e-4 * sum(weight squared); bias is unregularized.
Use PyTorch CPU LBFGS, learning rate 1, history 100, strong-Wolfe search, maximum
100 optimizer iterations / 125 function evaluations, tolerance_grad 1e-7 and
tolerance_change 1e-12. No retries, restarts, parameter search or additional arm.
The evaluation budget follows LBFGS semantics and its line search may exceed it
within the final iteration; report actual calls. Record every objective value.

Evaluate final objective gradients explicitly after fitting. A fold converges
only when maximum absolute parameter gradient <= 1e-5. Report actual iterations,
function calls, final objective, gradient norm and status; optimizer return alone
does not establish convergence. If any arm/fold fails this criterion, the paired
study is inconclusive, even when its observed metric difference is large.

## Metrics and interpretation

Primary: pool each arm's out-of-fold predictions across the twelve compositions
and average recall equally across all four target qualities. A >=0.05 absolute
gain for the root-relative arm, with ALL fits converged, is a useful diagnostic
signal warranting separate root-conditioned representation research. It is not
a significance threshold or a model-promotion criterion. A nonpositive finding
cannot establish that features contain no quality information: nonlinear or
temporal models could extract other structure.

Record pooled and per-composition support, confusion, accuracy, recall,
precision and present-class macro recall, plus fold-training fit on the same
metrics. Per-composition absent classes are omitted only from that composition's
macro average, with zeros/supports explicit; pooled primary includes all four.
The augmented class's tiny source support and this single historical corpus
limit interpretation. No broad music, no-chord, extension, calibration or boundary
claim is supported. This diagnostic is not comparable to full-validation E009.

## Resources, reproducibility and stopping

One process, two Torch/BLAS CPU threads, one interop thread, no workers/GPU;
deterministic Torch algorithms and float64. Require >=8 GiB available system
memory before fitting and at every objective evaluation/fold boundary. Abort
on breach or OOM, without changing scientific settings. Report sampled peak RSS,
minimum available memory, sample count and elapsed time (not continuous peaks).
Before optimization save preflight config/protocol/source/test/manifest/training
hashes, software versions and resources. Checkpoint coefficients/normalization
go only in ignored checkpoints/D001-hu33-root-relative-probe. Record hashes and
verify source/config/protocol unchanged after execution. Existing datasets,
models, runner, evaluator, reports and selection records remain untouched.
