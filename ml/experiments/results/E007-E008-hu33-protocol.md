# HU33 validation-only selection protocol

Declared 2026-09-20 before training or validation inference. This protocol
supersedes the data-addition experiment suggestion in the preparation report:
the authorized first comparison is HU33-only, baseline versus class weighting.
It does not freeze a model for test evaluation or authorize production promotion.

## Data and candidates

Use `ml/data/prepared/winterreise-hu33-v1/manifest.json`, SHA-256
`a54ce6ed104a42b8216f5045e4bc0be0d4912e61c8678c920ddf896dc63faf4d`.
Training compositions 02–13; validation 14–18; locked test 19–24 stays closed.
Use only valid frames and the existing training-only normalization. Keep the
unchanged 26-feature `chroma-bass-v1` contract and strict masked targets. No
GuitarSet data, E004 artifacts, existing reports or old registry entries change.

Two initial candidates:

| ID | Treatment |
| --- | --- |
| E007-hu33-tcn | Unweighted relative-quality losses |
| E008-hu33-weighted-tcn | Training-frequency inverse-square-root weights, capped at 8, for triad and seventh only |

All other scientific settings match: seed 20260920, 64 hidden channels, three
TCN blocks, dropout 0.15, 512-frame training crops, 16 sampled crops per training
track per epoch, batch 8, one DataLoader worker, AdamW learning rate 0.001 and
weight decay 0.0001, gradient clipping 1.0, pitch transposition enabled. At most
30 epochs, patience 5, minimum internal improvement 0.001. The 192 crops sample
98,304 frame slots per epoch versus 91,413 available training frames; overlap
and masking mean this is not guaranteed exhaustive coverage. Preserve the
existing multitask coefficients, boundary positive weight and learning-rate
scheduler. Save each config before execution; record config, manifest, source
and checkpoint hashes in a separate HU33 registry.

## Checkpoint and candidate selection

The unchanged runner chooses each candidate's checkpoint using its existing
mean root/triad/seventh/bass accuracy on one fixed 2,048-frame validation crop
per track, without pitch augmentation. It also drives stopping and scheduling.
Long tracks are only partly represented by this internal proxy; report this
limitation and do not call it full-validation checkpoint optimization.

Evaluate each resulting best checkpoint once on all five complete validation
tracks, honoring the mask. The primary candidate score is the equal mean of:

1. Macro triad recall over classes present in the validation reference, including
   unsupported-in-training classes.
2. Root frame accuracy.
3. Reduced structural exact frame accuracy: root, triad, seventh, bass and all
   four extension flags must match together.

The higher primary score wins this bounded research comparison. A difference
of at most 0.001 is a tie: prefer lower median full-validation inference runtime
from three additional runs after the initial run has warmed the device. If
runtime differs by less than 5%, prefer E007's simpler unweighted recipe. Runtime
excludes audio decoding/features/startup and is not a desktop latency claim.

Also run the Python template DSP baseline against the exact same masked full
validation set. Report its primary score and component metrics separately; it
is not the browser DSP implementation. Report per-class supports/recalls,
inversions, extensions, boundaries, descriptive root calibration error and
coverage. Do not select on test metrics, unsupported class exclusions, altered
label mappings or retrospectively adjusted weights. No third candidate is part
of this initial protocol.

## Resources and interpretation

Run sequentially, retain at least 8 GiB available system memory, cap Torch/BLAS
CPU threads at two, workers at one and CUDA allocator usage at 45% of VRAM.
Use the existing runner's CUDA bfloat16 autocast where supported, float32
validation and fixed feature normalization; record actual hardware/precision.
Check memory before each process and monitor during training, aborting if the
headroom threshold is crossed. OOM aborts; do not retry with different scientific
settings under the same ID. Existing completed checkpoints are resumable only
under the unchanged scientific configuration.

This one-seed, five-composition comparison cannot establish statistical
significance or broad genre/performer generalization. HU33 training has no
no-chord, sus2, sus4, power, sixth, eleventh or thirteenth supervision and very
little augmented/major-seventh/ninth material. Validation has 79 sus4 frames and
13 sixth-extension frames despite no corresponding training targets, and no
major-seventh/ninth positives. Label exclusions and historical recording quality
limit interpretation. Even a higher validation score does not establish the
broader support and quality gates needed to open the test or promote a model.
