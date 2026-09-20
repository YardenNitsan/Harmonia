# Stabilization comparison protocol — 2026-09-21

Frozen before new inference. This compares existing recognizers without fitting,
threshold search, changing original exports, or opening either locked test set.
The parent approved the existing HU33 validation compositions 14–18 only.

Use `ml/data/prepared/winterreise-hu33-v1/manifest.json`, SHA256
`a54ce6ed104a42b8216f5045e4bc0be0d4912e61c8678c920ddf896dc63faf4d`.
The exact five audio, annotation and prepared-file identities are already in
`ml/experiments/results/B001-boundary-refinement/browser-request.json`.
The runner records their hashes, its source, this protocol, original LV source
and all five weights, E010 predictions, and scoring helpers in an exclusive
preflight file before any new audio inference. Existing artifacts stay unchanged.

Arms: current whole-song browser DSP supplied by the parent; retained E010
decisions (replace only triad with `candidate_triad`); original installed
LV-Chordia 1.1.0 submission dictionary, five native CPU networks and original HMM.
LV receives the identical original WAV recordings; model-specific preprocessing
is preserved, not forced into DSP chroma. Use full sequence context, two CPU
threads, no GPU/workers, and at least 8 GiB available RAM. Record decode/CQT,
network/HMM timing, total time and process memory. Do not claim cold startup
from warm inference timings. No ONNX acceptance tolerance changes are permitted.

Frame scoring uses identical prepared timestamps and validity masks. Report
root, triad, seventh, bass and reduced structural exact (all eight projected
components), per-class precision/recall/F1 with supports, positive extension
precision/recall, inversion presence and exact bass on reference inversions.
Undefined precision/recall is null. These scores are uncalibrated.

Timeline scoring reuses B001's strict valid reference intervals and excluded
unknown-edge neighborhoods, with exact interval overlap and boundaries at
20/50/100 ms. E010 frame decisions become piecewise-constant segments with
boundaries at successive prepared timestamp midpoints, outer edges 0/duration;
this is an explicit comparison adapter, not a claim of production segmentation.
LV uses its original API's two-decimal timestamps. Keep native decoded timelines;
do not apply model-specific tuning. A later shared stabilization arm must be
frozen independently before its one candidate validation pass.

ChordMini BTC/ChordNet are feasibility arms only if weights can be safely loaded
and original inference works with available dependencies. Fix upstream revision,
checkpoint hashes and one default inference configuration before inference.
No training, dependency replacement, output-driven retries or threshold search.
If not feasible, record the concrete blocker and no fabricated metric.

The common set is five classical voice/piano recordings, not a commercial
full-mix benchmark. Existing validation exposure, uncertain upstream training
overlap and weak rare-class support prevent a generalization/release claim.

Upstream sources inspected: [LV packaging project](https://github.com/openmirlab/lv-chordia),
[original LV research](https://github.com/music-x-lab/ISMIR2019-Large-Vocabulary-Chord-Recognition),
[ChordMini source and inference instructions](https://github.com/ptnghia-j/ChordMini),
[ChordMini license](https://github.com/ptnghia-j/ChordMini/blob/main/LICENSE),
[ChordMini configuration](https://github.com/ptnghia-j/ChordMini/blob/main/config/ChordMini.yaml).
Code MIT grants do not establish rights to upstream training recordings. The
ChordMini README explicitly describes MIT coverage for source/configuration/docs;
checkpoint redistribution requires separate clarification before bundling.
