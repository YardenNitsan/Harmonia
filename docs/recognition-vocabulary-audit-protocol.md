# Recognition vocabulary audit protocol, 2026-09-21

Frozen before new labelled scoring. This investigation is separate from temporal
decoding work and uses no fitting, new audio inference, downloads, or locked tests.
It consumes only existing LV six-head predictions and prepared HU33 labels.

1. Inspect original preprocessing/head interpretation against the pinned upstream
   implementation. Audit dictionary representability on training compositions
   02/03, the only training recordings with retained complete heads.
2. Evaluate exactly one vocabulary candidate: the unmodified upstream
   `full_chord_list.txt`, with the same original HMM penalty 30 and no additional
   smoothing. Compare against retained native submission-dictionary decisions.
   No dictionary editing, candidate combinations, posterior calibration, or
   parameter search is permitted by this protocol.
3. On 02/03 report pooled/per-track root, triad, seventh, bass, reduced exact,
   inversion bass and extension precision/recall; dictionary coverage; and raw
   independent head decisions. Raw independent heads are diagnostic, not a
   proposed product output. Candidate must strictly improve reduced exact and
   not decrease root, triad, bass, or inversion bass to proceed.
4. Only if training passes, freeze source/protocol/dictionary/input hashes and
   evaluate the unchanged candidate once on validation compositions 14–18.
   Require strict reduced-exact improvement and no decrease in root, triad,
   bass, inversion bass, boundary F1 at 50 ms, or extra short-transition misses.
   Report all failed conditions. Do not tune from the validation result.
5. Preserve inputs/history and write reports exclusively to a new directory.
   Reuse existing heads and timelines; never invoke a neural network. Enforce two
   numerical CPU threads, no GPU, and no arbitrary file/split selector. If the
   candidate fails training, do not access validation arrays for this experiment.

These two training and five validation classical voice/piano recordings cannot
establish commercial full-mix accuracy. Earlier validation exposure and uncertain
upstream training overlap remain limitations. Killer Queen is unlabelled context,
not a tuning target or numerical accuracy benchmark. Bob Dylan is excluded.
