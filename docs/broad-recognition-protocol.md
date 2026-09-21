# R005: broad, fixed existing-model comparison

Frozen before corpus inference on 21 September 2026. No fitting, new custom model,
hyperparameter sweep or locked-test access. R001–R004 remain rejected under their
original protocols; this is a new comparison of the original BTC release.

## Selection and sources

Use the already licensed GuitarSet 1.1.0 microphone recordings and prepared labels.
Development: one lexicographically first family-1 recording for each of six
performers and five styles, alternating comp/solo by performer plus style index:
30 recordings. Validation: all 120 family-2 recordings. Family 3 stays locked.
These are 150 performances of related progressions, not 150 independent commercial
songs. Report style and comp/solo strata, track means and pooled frame results.

The machine-readable freeze records exact IDs, source audio/annotation/prepared
hashes, manifest hash and implementation hashes. All arms consume the same decoded
float32 mono 22.05 kHz PCM (soundfile decode, librosa soxr_hq resampling), saved only
in ignored local diagnostics. No source downloads or user-cache changes are needed.

## Fixed arms

1. Original LV-Chordia 1.1.0 submission ensemble/HMM. Reuse the twelve completed
   E006 timelines; never rerun them. For the other tracks use the pinned native
   original inference (`refine=False, align=False`), rounded to the public API's
   centisecond output. Clamp/extend only the final interval to exact PCM duration.
   This measures the underlying original recognizer, not a new v3 timing score.
2. Original BTC-ISMIR19 170-class checkpoint, revision
   `2682317be668032e6e4b269ded36adaa2ad57df0`, explicit eight-layer/four-head config.
   Preserve its published ten-second CQT/model context. Correct timestamps from
   sample positions and handle short files; no guessed architecture or new model.
   Use released argmax output with only adjacent identical labels merged. Do not
   mistake this raw candidate for a production full-song temporal decoder.

Both fixed arms are evaluated across the complete selection, without using early
validation outcomes to tune anything. Retain predictions for future research;
validation is a development diagnostic, not an untouched final generalization test.
BTC has no inversion states and no extensions above sevenths. Report that explicitly.
The authors' pretrained-training overlap with these datasets is not fully established.

## Metrics and decision

Use the existing prepared targets and structural encoder for paired root, triad,
seventh, bass, inversion and extension precision/recall, full reduced-structural
exact, track means and pooled scores. Include segment count, duration distribution,
fraction shorter than 300 ms and source-grid boundary precision/recall/F1 at 50 and
100 ms. GuitarSet's chord/beat boundaries follow score tempo positions and are not
independent expert annotations of every performed attack; do not claim measured
commercial-song beat accuracy from these values. Explicitly disclose annotation
vocabulary limitations instead of interpreting every component as perceptual truth.

This raw-model comparison alone cannot promote BTC. A production replacement needs
full-song coherent decoding, substantial paired root/quality and structural gains,
no material bass/rare-chord regression, sane boundaries and acceptable native latency.
Existing five-recording HU33 timing evidence remains separate. Cached Switch and
Killer Queen are unlabelled user diagnostics, never ground-truth accuracy scores.
Do not run Bob Dylan again.

CPU only, two numerical threads per process, sequential tracks and at least 8 GiB
available RAM. Resume only completed matching frozen outputs; never overwrite
historical results. Keep all weights, features and audio ignored. Record actual
decode/model/stage times; no recognition or timeline mutation during playback.
