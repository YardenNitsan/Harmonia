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

## Completed comparison and runtime decision

The original native LV ensemble is the strongest measured available candidate.
Production uses the original PyTorch/CQT/HMM path, not the failed ONNX export.
No model was trained, fitted or downloaded. Both locked test sets stayed closed.
The byte-exact pre-run protocol is retained at
`ml/experiments/stabilization/results/comparison-protocol.snapshot.md`; the
original preflight hash refers to that snapshot, before these results were added.

All rows below use the same 23,250 valid frames of HU33 compositions 14–18.
LV v2 uses original unrounded HMM timestamps; its evidence cleanup is neutral
on these recordings and exactly matches native v1 decisions and boundaries.

| Method                 |   Root | Triad quality | Seventh |   Bass | Reduced exact |
| ---------------------- | -----: | ------------: | ------: | -----: | ------------: |
| Current whole-song DSP | 42.81% |        46.28% |  47.81% | 36.26% |         6.17% |
| Retained E010          | 59.01% |        58.86% |  74.70% | 47.56% |        25.41% |
| Native LV v1 / v2      | 62.66% |        66.42% |  78.02% | 53.52% |        39.86% |

`comparison-with-dsp.json` preserves the first three-arm comparison using the
public LV API's centisecond-rounded segments (LV reduced exact 39.84%).
`refinement-validation.json` is authoritative for the production adapter's
full-precision v1/v2 comparison. Small numerical score differences between the
two reports come from timestamp rounding, not changed model weights or logits.
All interior segment labels and boundaries match the original API after its
own formatting; the final boundary is clamped to exact PCM duration.

On 539.8 scored seconds, original public-API LV had 223 total regions, E010's
explicit frame-to-timeline adapter 7,944 and current DSP 8,358. These are native
method outputs with a common scorer, not evidence that their postprocessors
were identical. Exact overlap root/reduced agreement was respectively LV
62.66%/39.89%, E010 59.01%/25.41%, DSP 42.88%/6.16%.

Production full-precision LV boundary precision/recall/F1 at 50 ms is
23.50% / 16.35% / 0.19283 (43 matches, 140 false positives, 220 misses).
Its F1 at 20/100 ms is 0.08969/0.30493. The rounded public API gives F1 0.21973
at 50 ms; do not interchange that figure with the production result.
DSP's 50 ms F1 is 0.06607 and E010's is 0.06589. LV greatly reduces false cuts
but still misses many transitions, including all four eligible short-adjacent
references. The added guard creates no additional misses.

Advanced-class limitations are explicit. On the original API comparison, LV
minor quality precision/recall is 71.33%/62.58%; minor seventh 61.40%/44.21%;
inversion presence 71.34%/21.66%. Exact bass on reference inversion frames is
27.29% for production LV, 21.61% E010 and 35.13% DSP. Diminished quality recall
is only 6.64%; augmented/sus4 recall is zero. Positive sixth recall is zero on
13 frames, and there are no positive ninth/eleventh/thirteenth reference frames.
No advanced-extension recall claim is supported by this set. The original
DSP predicts 9,707 ninth, 2,411 eleventh and 2,975 thirteenth positives against
zero reference positives. Complete per-class supports/precision/recall are saved.

The pinned model's six posterior shapes are `[T,73]`, `[T,13]`, `[T,4]`,
`[T,4]`, `[T,3]`, `[T,3]`. Root/triad, bass and decorations remain separate
evidence components; the HMM jointly decodes dictionary chords. These posteriors
are not calibrated whole-chord probabilities. On the same masks, ten fixed-bin
ECE / binary selected-event Brier for emitted region root+triad support is
0.07910 / 0.18562; for underlying frame support 0.04188 / 0.16302; DSP region
similarity 0.50336 / 0.47699. No calibrator was fitted. E010 posterior reliability
is unavailable from retained decisions, and was not regenerated. See
`ml/experiments/stabilization/results/reliability.json` for bin counts and meaning.

## Evidence refinement and implementation

The separate frozen `refinement-protocol.md` declares a conservative A–B–A
decoration/bass cleanup. A brief middle region must share root/triad with both
flanks, fit inside one detected beat, have weak selected component support and
margin, and lose to the flanking state in both containing-beat averages and
whole-region log evidence. Strong brief advanced chords, sustained changes,
different harmonic families, crossing-beat changes and no-chord survive. No
beats means no extra consolidation. There is no global minimum/maximum chord
duration, hard beat snapping, or inferred downbeat guarantee.

Constructed regressions cover weak/strong sevenths, ninths, bass inversions,
independent beat corroboration, crossing/absent beats, offbeat root changes,
sustained decorations and no-chord. Training controls 02/03 and the one
validation pass on 14–18 each had zero extra consolidations. This establishes
nonregression on those recordings, not an accuracy improvement over native LV.
Two integration-check failures are preserved: a two-dimensional posterior
adapter assumption fixed before scoring, and final-endpoint rounding in the
parity checker. The latter resumed from retained 14/15 outputs and inferred only
16–18; no thresholds changed and no completed inference was repeated.

`scripts/native-whole-song.py --samples N` accepts exactly `4*N` stdin bytes,
float32 little-endian mono at 22,050 Hz, at most 1,200 seconds. It rejects
nonfinite/truncated/excess input, verifies the five pinned checkpoint hashes,
forces safe weight loading, uses two CPU threads and requires 8 GiB available
RAM. It emits one bounded JSON result with full-precision segments, uncalibrated
triad/component support, beat evidence, model identity, PCM hash and stage timings.
It uses the exact decoded PCM, writes no audio file, downloads nothing and does
not accept arbitrary model/audio paths. Stdout is at most 16 MiB plus newline.
The entry point explicitly selects v2; the Python callable retains a v1 option
for exact comparisons. A 64-sample zero signal returns one bounded N interval.

The original five native validation runs took 28.15 seconds total, excluding
process/import startup; peak process working set was 1.66 GB. First-track
183.2-second audio took 9.90 seconds (decode/CQT 2.16, network inference 6.01,
HMM 0.15); subsequent recordings took 1.76–6.88 seconds. These developer-PC
measurements do not establish weak-hardware performance or portable packaging.
The scientific Python environment remains an explicit deployment dependency.

On the user's exact cached Bob Dylan decoded PCM, the original native method
produced 67 regions, median 1.78 seconds and no sub-200 ms regions, versus the
retained DSP's 1,052 regions with a 46 ms median. Native standalone pipeline
time was 7.15 seconds plus 1.46 seconds imports, with 1.44 GB peak working set.
This recording has no licensed ground-truth annotation here, so these are
structural/runtime observations, not an accuracy percentage. Native product-flow
timing and cache/playback verification are recorded by the parent separately.

## Other existing models and remaining constraints

ChordMini upstream revision `aa6e3a8d7b017f082fd2aaff9329d5c26af49c03` lists
BTC CL and ChordNet 2E1D weights (35,942,692 and 27,523,646 bytes). They are
accessible, but the current README's MIT coverage explicitly names source,
configuration and documentation; a checkpoint-specific redistribution grant was
not established. The restricted labelled training audio and mixed upstream
dataset rights remain separate issues. No weights were downloaded or evaluated,
and no score is invented. This is an unresolved artifact-rights condition, not
an assertion that the authors prohibit local research.

The official config uses 144 CQT bins, 24/octave, 2,048-sample hop at 22,050 Hz,
108-frame context and 170 classes. Its dependency pins differ from Harmonia's
installed environment. A reproducible comparison would need a separately pinned
runtime/preprocessing adapter and clarified checkpoint terms; it is not silently
substituted into this stabilization release. Original BTC code's MIT license
alone does not settle the newer ChordMini checkpoint terms.

The original LV MIT notices remain retained. Software/weight distribution does
not grant rights to upstream training recordings. Native CPU integration leaves
all existing ONNX numerical failures and tolerances intact. This is a measured
local stabilization improvement with substantial remaining recognition errors,
not a claim of broad-genre, rare-harmony or final release quality.

Verified scoped checks: 21 Python inference/protocol/region regressions; Ruff
lint and formatting for these new sources; both frozen control/validation gates;
original-API/native direct-PCM timeline comparison; 64-sample silence smoke.
The complete ML suite also passes: 147 tests in 27.15 seconds; all 93 Python
files pass formatting. Full-tree Ruff reports one pre-existing SIM105 style
issue in preserved `experiments/e010_wasm_reference.py:287`; new sources pass.
All machine-readable evidence, including the exact runtime/source/model manifest,
is under `ml/experiments/stabilization/results/`.
