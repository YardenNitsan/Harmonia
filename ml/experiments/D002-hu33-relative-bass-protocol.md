# D002: train-only oracle-root relative-bass diagnostic

Declared before training-array access or inference. This independent diagnostic
does not change D001, E007-E010, B001, product models or any held-out test policy.
Use only valid HU33 training frames from compositions 02-13 under manifest SHA256
`a54ce6ed104a42b8216f5045e4bc0be0d4912e61c8678c920ddf896dc63faf4d`.
Never open validation 14-18 or test 19-24 arrays. Verify twelve training input
identities and hashes. Unexpected non-tonal roots/basses abort, not remap.

## Fixed comparison

Target is (annotated absolute bass minus annotated root) modulo 12, retaining all
twelve semitone-interval output classes. Root position is class 0; inversion is a
reference target other than 0. The four held-out training-composition folds are
{02,06,10}, {03,07,11}, {04,08,12}, {05,09,13}.

Control: original 26 features concatenated with a twelve-dimensional one-hot
ANNOTATED root. Treatment: rotate both twelve-bin chroma/bass groups by negative
annotated root, keep energy/flux unchanged, and append the SAME root one-hot.
Both arms therefore have 38 input features, twelve output logits, equal capacity
and the same oracle information. This tests linear access to root-relative bass
structure, not deploying a classifier with unavailable reference roots.

Each fold/arm fits population mean/std only on the other nine compositions, with
std floor 1e-4. No augmentation, weighting, temporal context, resampling or labels
from held-out compositions enter fitting/normalization. Use all valid fold-training
frames in a deterministic full-batch float64 linear softmax classifier initialized
to exactly zero weights AND biases. Objective: unweighted mean cross entropy plus
0.5 * 1e-4 * (sum(weight squared) + sum(bias squared)). Penalizing biases makes the
optimum finite even for classes absent from fold training; this deliberately
differs from D001's four-class quality probe.

Frozen solver: CPU PyTorch LBFGS, learning rate 1, history 100, strong-Wolfe search,
max 300 iterations / 375 function evaluations, tolerance_grad 1e-8 and
tolerance_change 1e-12. Report actual evaluations (line search may exceed its budget
within the last iteration). No restarts, retries or scientific-setting changes.
After fitting, recompute the full objective and gradients. Convergence requires
maximum absolute gradient across ALL weights/biases <= 1e-6 for every arm/fold.
The 300-iteration budget and stricter gradient check are declared for the larger
twelve-class problem rather than copied from D001's successful stopping outcome.

## Metrics and decision

Report pooled/per-fold/per-composition out-of-fold metrics and fold-training fit:
all twelve reference/prediction supports and confusion entries; exact interval
accuracy; overall present-class macro recall; inverted-frame exact degree accuracy;
inversion-only macro recall over reference-present nonzero classes; root-position
exact accuracy; inversion-detection precision/recall and false-inversion rate on
reference root-position frames. Classes absent from a fold's training but present
in its held-out references remain scored and are explicitly identified.

An analytic always-root-position predictor supplies the same metrics and support
counts without training. Its inverted-frame degree accuracy is zero when inversion
support exists, and its overall accuracy is the root-position majority fraction.
These frame slots are correlated observations, not independent examples.

All three pooled signal conditions must pass:

1. Treatment inverted-frame exact degree accuracy exceeds control by >= 0.05.
2. Treatment inversion-only present-class macro recall exceeds control by >= 0.02.
3. Treatment root-position exact accuracy loses <= 0.02 against control.

Additionally, all eight fits must meet the gradient convergence criterion. Empty
inversion/zero-denominator metrics are null, including empty folds; no perfect
scores are invented. Undefined primary/guardrail aggregates make acceptance
unresolved. These are research triage thresholds, not significance or release
criteria. A positive signal can justify a separately frozen predicted-root E011;
it never establishes production accuracy or authorizes validation/test inference.

## Resources and preservation

One process, two Torch/BLAS CPU threads, one interop thread, no DataLoader workers
or GPU. Require >=8 GiB available system RAM before array access, each fold and
every objective evaluation; abort on breach/OOM without altering settings. Record
sampled peak RSS/minimum system headroom, durations, objective histories, gradient
norms, convergence, normalization and software versions. No claim of continuous
peak measurement. Save protocol/config/script/tests/dependency/manifest hashes
before training-array access; append a separate input-hash preflight before fitting.
Preserve exact scientific source bytes in a hashed archive. Output creation refuses
overwrite. Coefficients go only to ignored checkpoints/D002-hu33-relative-bass.
