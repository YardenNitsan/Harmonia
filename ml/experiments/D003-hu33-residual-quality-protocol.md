# D003: train-only nonlinear residual quality diagnostic

Approved before new fitting. This independent study tests one capacity change
against immutable D001 root-relative linear controls. Existing training labels
and reports informed its design; no validation/test arrays are read. It does not
repeat D001 optimization, tune E010 on validation, or change any product default.

## Fixed data and control

Use only valid frames of HU33 compositions 02-13, manifest SHA256
`a54ce6ed104a42b8216f5045e4bc0be0d4912e61c8678c920ddf896dc63faf4d`.
Four held-out training folds remain {02,06,10}, {03,07,11}, {04,08,12},
{05,09,13}. Read neither validation 14-18 nor test 19-24 arrays.
Verify every training input and the pinned D001 report and four root-relative
checkpoint hashes. Preserve D001 normalization exactly; recompute it from each
fold's training compositions solely to verify equality, never adapt it to held
compositions. Rotation, validity mask, 26 inputs and four quality targets remain
identical. Reference roots are oracle inputs for BOTH arms.

Baseline is D001's retained root-relative linear classifier and its recorded
pooled/per-composition OOF metrics. Do not refit it. Recompute its predictions only
as necessary for paired residual logits, and verify the resulting confusion
matrices exactly against retained evidence before accepting the new comparison.

## One candidate

Candidate logits are `frozen_linear(x) + W2*tanh(W1*x+b1)+b2`, with one hidden layer
of width 16. It has 500 trainable residual parameters and 608 total parameters,
versus the control's 108. This is explicitly a capacity intervention, not an
equal-parameter architecture proof. No context windows, class weights, new
features, augmented labels, confidence gate, smoothing, or additional candidate.

Set CPU RNG seed `20260920 + fold_index`. Initialize W1 with Xavier uniform,
b1=0, W2=0 and b2=0; initial logits are exactly the frozen control. D001 parameters
are immutable buffers and excluded from optimization. Minimize full-batch
unweighted mean cross entropy plus `0.5*1e-4*sum(residual_parameters_squared)`,
including both biases. This regularized residual objective differs intentionally
from fitting a replacement linear model; penalizing residual biases also bounds
the optimum when a fold lacks augmented examples. D001 itself is not altered.

Use deterministic float64 Torch CPU LBFGS, learning rate 1, strong-Wolfe search,
history 100, maximum 500 iterations / 625 evaluations, tolerance_grad=1e-8 and
tolerance_change=1e-12. Record actual closure counts including possible final
line-search overshoot. Exactly one initialization and fit per fold; no restarts,
budget extensions or selection. Nonfinite objective/gradient aborts the study.
Recompute final full objective and gradient; each fit must have gradient infinity
norm <=1e-5. A stationary point is not a proof of the nonlinear global optimum.
Nonconvergence makes the study inconclusive even if descriptive metrics improve.

## Frozen triage gates

Against retained D001 pooled OOF results, require ALL:

1. Major recall gain >=0.03 absolute.
2. Minor recall loss <=0.02 absolute.
3. Diminished recall loss <=0.02 absolute.
4. Macro recall across all reference-present qualities gains >=0.005 absolute.
5. Overall triad accuracy does not decline.
6. All four fits converge and source/control/data invariants hold.

Report all four class supports, confusion matrices, recall, precision, pooled and
per-composition OOF results, fold-training fit and fold results. Undefined class
metrics are null; absent reference classes are excluded only from macro averages.
Keep augmented in pooled macro. Report classes absent from each fold's training
but present in held-out references. No reduced-structural agreement claim follows
from a quality-only oracle-root diagnostic. No E009 in-sample train prediction is
substituted for an out-of-fold backbone or treated as deployment evidence.

Training support is major 45,131 / minor 28,585 / diminished 4,473 / augmented 161.
All augmented frames occur in composition 03, so its held-out fold has no augmented
training examples. Sus2/sus4 have no training support. Seventh targets have
56,432 none / 19,178 minor seventh / 145 major seventh / 2,595 diminished seventh;
major seventh appears only in compositions 03/04. Only ninth extensions have
positive labels (162 frames, compositions 07/13); sixth/eleventh/thirteenth have
none. Do not interpret unsupported vocabulary as an optimizer failure, add new
output heads in this study, or claim generalization from isolated frame counts.

## Resources and immutable evidence

One numerical worker process, two Torch/BLAS CPU threads and one interop thread,
no DataLoader workers/GPU. A lightweight external supervisor enforces a fixed
600-second wall-clock watchdog on the child, including imports; timeout kills
that child and records failure, with no retry. Require >=8GiB available RAM before
array access, each fold and every objective evaluation. Record sampled process
RSS/system headroom, durations, software versions and objective histories; no
continuous peak guarantee. Abort on resource breach/OOM.

Save config/protocol/runner/tests/imported-source/manifest/control-report and all
four control-checkpoint hashes plus exact source ZIP before optimization, then
twelve training-input hashes in a separate preflight. Verify all again afterward.
Refuse output/checkpoint overwrite. Coefficients and paired OOF predictions belong
only under ignored `checkpoints/D003-hu33-residual-quality/`. A positive diagnostic
can support a separately frozen predicted-root follow-up; it neither authorizes
new validation/test inference nor resolves E010's wrong-root distribution mismatch.
