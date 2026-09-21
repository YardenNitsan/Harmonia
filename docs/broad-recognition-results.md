# Classic shapes and broader recognition check

2026-09-21 continuation from `aeca57a`. The product flow, source providers,
immutable playback timeline, live mode and existing model artifacts are preserved.
**Classic shapes is implemented. A new production recognition-accuracy gain is
not claimed.** The experiments below reject promotion rather than silently
substituting a worse model or loosening acceptance gates.

## What is now visible

The default Chord Library uses familiar fixed guitar grips and conventional compact
one-hand piano chords, consistently for each occurrence. Explicit slash bass and
the original analyzed label remain; necessary practice reductions remain disclosed.
Optional Easy practice/capo remains. See [classic practice](classic-practice.md).

## Broader evidence and the actual gaps

R005 compares the released original BTC170 against original LV on **150 GuitarSet
recordings**: 30 development and all 120 existing validation performances, covering
six players, five styles and accompaniment/solo. These are related performances,
not 150 independent commercial songs. The twelve completed E006 LV results were
reused; 138 new LV and 150 BTC inferences share decoded PCM. No test set was opened.
The [protocol](broad-recognition-protocol.md), per-track outputs, full component
precision/recall and descriptive summary are retained in
`ml/experiments/results/R005-broad-existing-models/`.

| Validation subset / metric                  | Original LV | Original BTC170 |
| ------------------------------------------- | ----------: | --------------: |
| All 120: root                               |      44.15% |          45.84% |
| All 120: triad component                    |      38.98% |          43.97% |
| All 120: seventh component                  |      69.79% |          68.10% |
| All 120: reduced structural exact           |      20.02% |          20.23% |
| Accompaniment 60: root                      |  **84.98%** |          80.03% |
| Accompaniment 60: triad                     |  **69.44%** |          68.18% |
| Accompaniment 60: bass                      |  **67.28%** |          62.91% |
| Accompaniment 60: reduced structural exact  |  **38.73%** |          36.77% |
| Solo 60: root                               |       3.32% |          11.65% |
| All 120: regions                            |   **1,108** |           2,336 |
| All 120: median region duration             | **2.070 s** |         1.115 s |
| All 120: regions shorter than 300 ms        |   **6.23%** |          19.43% |
| Accompaniment: source-grid boundary F1@50ms |  **42.91%** |          19.89% |

Pooled averages conceal a major domain difference. LV emits no-chord over 83.84%
of isolated-solo duration, but only 2.36% of accompaniment. GuitarSet's score-informed
harmonic labels are not necessarily fully audible as chords in an isolated solo.
Therefore its solo aggregate is not a direct measure of commercial full-mix accuracy.
This suggests a need to distinguish sparse melodic evidence from confident absence
of harmony; it does not justify inventing chords whenever the model says no-chord.

Rare structures remain weak. In accompaniment, LV's major/minor recalls are
88.61%/76.73%, but the prepared augmented/sus/power classes receive zero recall.
BTC recovers some augmented frames (14.94% recall, 58.97% precision), while losing
other quality and seventh accuracy. Major-seventh recall falls from 57.04% to
21.06%. Bass and omitted-tone annotation limitations also make the complete
structural task much harder than root identification. Detailed class support and
precision are in the report; do not describe component accuracy as whole-chord accuracy.

The original BTC model is fast: validation median 0.167 s per approximately 33 s
recording, versus LV 1.217 s across its 108 newly inferred validation tracks. These
warm research timings exclude acquisition and shared decode and are not click-to-ready
benchmarks. Faster execution did not outweigh its accuracy/stability losses.

## Cross-domain check

The same unchanged BTC was then compared once against retained LV on the five
approved HU33 voice-and-piano validation recordings. No baseline was rerun.

| HU33 metric              | Original LV | Original BTC170 |
| ------------------------ | ----------: | --------------: |
| Root                     |  **62.66%** |          58.34% |
| Triad                    |  **66.42%** |          58.12% |
| Seventh                  |      78.02% |          79.35% |
| Bass                     |  **53.52%** |          46.27% |
| Reduced structural exact |  **39.86%** |          35.61% |
| Inverted-bass exact      |  **27.29%** |          12.58% |

See [cross-domain protocol](btc-cross-domain-protocol.md) and
`ml/experiments/results/R005-btc-cross-domain/`. BTC uses explicit published
architecture/configuration, unlike the previously rejected ChordMini runtime with
guessed heads. It still loses on these paired data and lacks direct inversion states.
Its raw 10-second-context output is not a production full-song decoder.

On the exact cached Killer Queen PCM, BTC produces 153 regions versus production
LV's 83, and disagrees in the sparse introduction and other passages. Its CQT/model
time is 0.371/0.384 s. No aligned ground truth exists for that Top Of The Pops video,
so this comparison is diagnostic only. No hardcoded Queen progression was used.

## Tuning hypothesis: promising robustness, failed real-data promotion gate

Official librosa CQT auto-tuning is expressed relative to the selected bin grid.
LV uses 36 bins/octave; a musical pitch offset near one third of a semitone can
wrap to near zero on that finer grid. The existing Killer Queen audit had already
identified this possibility. R006 tests one fixed alternative: a 12-bin musical
tuning estimate, converted into 36-bin units only outside ±1/6 semitone. It changes
analysis frequencies, not playback audio. [Protocol and primary sources](semitone-tuning-protocol.md).

On 15 training accompaniment tracks and 30 controlled ±0.33-semitone resampling
variants, the frozen training gate passes:

| Training condition / metric | Original |  Candidate |
| --------------------------- | -------: | ---------: |
| Unshifted root              |   90.94% |     91.00% |
| Unshifted reduced exact     |   45.33% |     45.37% |
| Shifted root                |   75.28% | **86.94%** |
| Shifted triad               |   84.99% | **88.41%** |
| Shifted bass                |   60.59% | **69.17%** |
| Shifted reduced exact       |   36.91% | **42.23%** |

The subsequent [fixed real validation gate](semitone-tuning-validation.md) fails.
Only one of the 125 real validation recordings triggers correction. GuitarSet root
improves 0.142 percentage points, triad loses 0.136 points, and reduced exact gains
0.051 points. All HU33 outputs and boundaries are unchanged. This falls below the
required real-data gain; no threshold adjustment, Queen-specific override or
production integration follows. The results are retained under R006; do not repeat
the studies. A suitably licensed, labelled detuned full-mix corpus is the useful
next step, not another arbitrary training run.

## Beat accuracy remains a separate evidence gap

GuitarSet's boundaries/beat positions follow score-tempo grids; they are not
independent expert judgments of every played onset. The popular Beat This main/small
models were trained on GuitarSet comping performances, so that corpus cannot provide
clean unseen beat evidence for them. Its code/weights are MIT; native CPU latency
and dependencies are not verified here. HU33 has published measure/downbeat
annotations not yet in the retained subset. See [beat research](beat-tracking-research.md).
Do not force every chord onto a constant beat grid or interpolate downbeats and call
the result measured beats. Existing v3 bounded attack alignment remains unchanged.

## Reproducibility and corrections during verification

R005 completed before the full test run found an import-time environment side effect:
its helper set `TORCH_FORCE_WEIGHTS_ONLY_LOAD` globally, disrupting the unrelated
training-resume fixture. The flag is now limited to command-line invocation; BTC's
actual checkpoint load remains explicitly `weights_only=True`. Exact executed
pre-fix scripts and hashes are preserved in R005 `frozen-source/`; results were not
overwritten or rerun. The current source hash intentionally differs from that
finished study. Do not resume it as a new benchmark; use retained outputs. A new
regression verifies imports leave checkpoint policy unchanged. Frozen-source hashes
allow exact historical reconstruction separately from subsequent maintenance.

One existing E010 watchdog lint issue was replaced by equivalent
`contextlib.suppress(psutil.NoSuchProcess)` handling. No E010 experiment or output
was rerun. Browser acceptance-generated screenshots/performance reports were saved
with `classic-r005-` names. Historical performance JSON values were restored and
their whitespace normalized for the formatter; exact prior bytes remain in the
`classic-r005-historical-*.json.txt` archives. R006's exact executed tuning script
is also archived under its `frozen-source/` before a blank-line formatting fix;
that maintenance does not rerun or alter the frozen study.

## Windows acceptance

Fresh optimized executable:
`apps/desktop/src-tauri/target/continuation-clean/release/harmonia.exe`

SHA256: `756d6efa53afc163ab956c228b7b03d140e2b51fd821db141bb274ebcc7d6422`.
This remains a source-dependent developer build requiring the local scientific
runtime and pinned original weights; it is not a new portable installer.

Hidden native Killer Queen check passes real native YouTube typeahead, exact cached
audio reuse, complete analysis before local autoplay, occurrence/progression seeks,
pause/resume, immediate 120-second seek, immutable timeline and SQLite cache reuse.
Preparation 13.544 s, cached selection-to-player 118 ms, late seek assertion 26.9 ms.
The same 83 labels remain; the 18 timing differences versus its older saved analysis
are the already-shipped v3 change, not a new R005/R006 gain. Cleanup succeeds and no
visible GUI launches. [Native evidence](review-evidence/classic-r005-killer-queen-native.json).

Classic references and the broader evaluation work are ready. Significant new
recognition/beat accuracy remains an open product requirement, not a completed claim.

Final checks: 947 application tests, 158 Python tests, 45 production browser E2Es,
TypeScript/lint, Python Ruff/format, repository formatting and optimized Windows
build pass. The separate hidden native flow above also passes. The requested
independent final review agent hit its service usage limit; the parent completed
code/metric review and automated verification, so no independent-review pass is claimed.
