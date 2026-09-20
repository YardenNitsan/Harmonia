# E010: predicted-root quality cascade

Declared and approved 2026-09-20 before fitting or new validation inference.
One bounded follow-up tests whether D001's oracle-root representation benefit
survives real E009 root errors. This is research validation, not model promotion,
probability calibration, new test access or browser integration. Preserve D001,
E004, E007–E009, their code, checkpoints and historical reports unchanged.

## Inputs and separation

Use prepared HU33 manifest SHA256
`a54ce6ed104a42b8216f5045e4bc0be0d4912e61c8678c920ddf896dc63faf4d`.
Fit on valid frames from compositions 02–13 only. Use compositions 14–18 once for
paired validation after successful convergence. Never open 19–24. Validate exact
composition/track/NPZ identities and all 17 selected file hashes before fitting;
validation-file hashing is permitted at preflight, but their arrays are not opened
until convergence. Freeze protocol/config/runner/test/helper/model-source hashes
and environment in a new exclusive-created preflight record before fitting.

Frozen E009 checkpoint `checkpoints/E009-hu33-context-tcn/best.pt` SHA256 is
`d32c9b249cc8a2c6d4bc682851a8f21cd97901f9e85f895c05f9d8603518e299`.
Verify against this trusted locally created checkpoint before loading. Its complete
training-state format contains NumPy/RNG records; loading its verified bytes with
`weights_only=False` is restricted to this one pinned local artifact. It is not a
general untrusted-checkpoint loader. Require the expected E009 model configuration,
26 input features and valid checkpoint normalization before inference.

## Single quality fit

Rotate both 12-bin raw chroma/bass groups by negative annotated training root;
leave energy/flux unchanged. This is D001's exact root-relative transform. Valid
training roots must be 0–11 and triad labels 1–4 (major/minor/diminished/augmented);
abort unexpected targets instead of filtering a new vocabulary. Fit population
mean and standard deviation on all transformed valid training frames only, with
standard-deviation floor 1e-4. No validation statistics, augmentation or sampling.

Fit one zero-initialized 26-input/4-output float64 linear classifier, unweighted
mean cross entropy plus `0.5 * 1e-4 * sum(weight squared)`, bias unregularized.
Use Torch CPU LBFGS: learning rate 1, history size 100, strong-Wolfe line search,
maximum 100 iterations / 125 objective evaluations, tolerance_grad 1e-7 and
tolerance_change 1e-12. Retain every objective value and actual optimizer counts;
line-search semantics may exceed the objective budget within the final iteration.
Explicitly evaluate final objective/gradient. Require gradient infinity norm
<=1e-5; successful process exit is not convergence. On nonconvergence save the
fit and report an inconclusive study, without opening validation arrays, changing
settings or retrying. Retain normalization/coefficients in a new ignored NPZ.

## Paired inference

E009 baseline: evaluation mode, CPU float32, no autocast, full recording context,
its checkpoint feature indices and normalization unchanged. Do not remove masked
frames from model inputs or split a recording into independent context windows.
Infer E009 once per complete validation recording. Decode root/triad/seventh/bass
by argmax; extensions use sigmoid >=0.5 exactly as the historical evaluator.
Retain boundary sigmoid values unchanged. The new paired CPU baseline, not the
historical GPU report, is the comparator; preserve and label any historical metric
differences without adjusting scientific settings in response.

Candidate: use only E009 argmax predicted roots 0–11 to rotate raw 26-dimensional
features, apply the training-only quality normalization and fitted float64 linear
classifier, then replace triad with argmax+1. Predicted root 12 leaves the entire
baseline result unchanged. Root, bass, seventh, extension decisions and boundary
values are byte-identical between arms. No confidence gate, blending, smoothing,
oracle validation root or alternate candidate. Validation reference labels and
masks enter evaluation only, never candidate prediction. Annotated training roots
and predicted validation roots create a real deployment distribution mismatch;
measure its consequences instead of claiming the oracle benefit transfers.

## Metrics and acceptance

Apply the existing explicit frame-aligned boolean validity mask to both arms.
Primary is pooled triad macro recall across every reference class present in
validation, including unsupported sus4, not only the four fit qualities. Accept a
useful research signal only when all invariants hold, optimization converges,
macro recall improves by >=0.05 absolute and reduced structural exact agreement
decreases by no more than 0.01 absolute. Reduced exact requires root, triad,
seventh, bass and all four extension bits together; it is not full chord-string
accuracy. No calibration, held-out generalization or release claim follows.

Report complete 8x8 triad confusion, reference/prediction supports, precision,
recall, F1 for all eight classes (absent reference classes excluded only from
present-class macro averages), pooled/per-composition accuracy and reduced exact,
and major/minor/diminished/augmented/sus4 results explicitly. Report the same
quality measures for correct-root versus incorrect-root frames with supports;
null aggregate metrics for empty subsets. Keep wrong-root frames in the primary
metric. Report predicted-N gate coverage, changed/corrected/damaged triad counts,
inversion support/reduced exact, unchanged-head invariants and common raw boundary
score hashes. Do not reinterpret triad changes as boundary-head improvement.

Compute each arm's paired metrics once. Record training fit separately from
validation and preserve raw per-recording predictions in new ignored artifacts.
Do not perform a validation oracle arm or select settings after these results.

## Resources, stopping and integrity

One process, two Torch/BLAS CPU threads, one interop thread, no workers or GPU;
deterministic algorithms. Retain >=8 GiB available memory, sampled before data
loading, every objective call and before/after each recording inference. Abort on
headroom breach, OOM, nonfinite values or unexpected identity/shape without retry.
Record sampled peak RSS/minimum free memory and fitting, baseline inference,
quality inference and total elapsed times. Inference timing excludes audio
decode/preparation and cannot establish desktop latency.

New paths: `experiments/results/E010-predicted-root-quality-cascade/` and ignored
`checkpoints/E010-predicted-root-quality-cascade/`. Refuse existing output paths;
retain failure reports instead of overwriting them. Check all frozen source,
config, protocol, manifest, selected NPZ and E009 checkpoint hashes after execution.
New hash-bound E010 files are protected with scoped `-text` attributes; imported
helper/model source hashes refer to existing Windows working bytes, preserved
without renormalization. The verified E009 metadata may be inspected before fit
without running inference to reject avoidable architecture/normalization errors.
Tests must exercise actual rotation/predicted-root dependence, training-only
normalization, mask behavior, all-present-class macro scoring, N-gate and
unchanged-head behavior, convergence gating and source/split rejection. Only
constructed temporary data may be used before the frozen study execution.
