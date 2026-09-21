# R003: published ChordMini ChordNet comparison, 2026-09-21

Declared before downloading weights or running model inference. The upstream
[README](https://github.com/ptnghia-j/ChordMini/blob/aa6e3a8d7b017f082fd2aaff9329d5c26af49c03/README.md)
publishes `checkpoints/2e1d_model_best.pth` and instructions to run it locally.
This supports an author-intended local research comparison. The MIT statement
explicitly lists source/configuration/documentation; checkpoint redistribution
is not established here. Do not bundle or redistribute the downloaded model.

Pin revision `aa6e3a8d7b017f082fd2aaff9329d5c26af49c03`, download that checkpoint
only (27,523,646 bytes) plus relevant source/config/license files into ignored
`.superpowers/diagnostics/chordnet-r003/`. Record SHA256 hashes before inference.
Load with `weights_only=True`, explicit safe NumPy scalar/array types only if
required, strict exact state-dict matching, checkpoint architecture/normalization.
No permissive missing-key fallback, retraining, or new dependency installation.

Use upstream CQT extraction (22,050 Hz, hop 2,048, 144 bins, 24/octave, C1 start,
log amplitude), upstream overlapping inference at ratio 0.5, published Gaussian
kernel 9, logit aggregation, majority smoothing, sequence length from checkpoint
or 108. Keep upstream CLI default minimum duration zero so evaluation covers every
frame; the README example's optional 0.5-second output omission would create gaps.
Clamp final endpoint only to recording duration. No tempo snapping or LV fusion.

First evaluate original HU33 training compositions 02/03 once against retained
native LV decisions. Research advancement requires no loss of pooled root or triad
accuracy and improvement in the mean of root/triad/seventh accuracy. If it fails,
do not evaluate validation. If it passes, freeze unchanged adapter and evaluate
validation 14–18 once, using the same gate; report all components, reduced exact,
inversions, class support and boundary F1 at 20/50/100 ms. The 170-state model has
no explicit slash bass; research advancement is not production approval. Promotion
additionally needs strict reduced-exact improvement, no bass/inversion-bass loss,
no boundary F1@50 loss and no extra short-transition misses.

Only one model/configuration; no tuning on either result. Save features and
predictions, never repeat completed inference. Two CPU threads, one process, no
GPU, 8 GiB headroom. No user-song training/accuracy labels, no Bob Dylan, no locked
tests. Existing HU33 rights/split limits apply. A result cannot establish broad
commercial full-mix accuracy or settle upstream training-data overlap.
