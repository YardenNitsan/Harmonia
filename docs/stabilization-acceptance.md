# Recognition and progression stabilization evidence

The frozen search → acquire → complete analysis → immutable timeline → local
playback flow is preserved. The optimized Windows build passes the hidden exact
Bob Dylan regression and progression-following acceptance. This is a measured
stabilization checkpoint, **not final broad-genre recognition or release approval**.
No visible GUI was opened, new model trained or locked test evaluated.

## Exact recording before and after

BobDylanVEVO, **Bob Dylan - Knockin' On Heaven's Door (Official Audio)**,
video `rm9coqlk8fY`, 151.4239909297052 seconds. Both methods use identical cached
WebM bytes, SHA256
`1df50037c17822f83f5162dda09b86663fa030a448bf9f758f837a44827d409b`, decoded once
to mono 22.05 kHz. No alternative performance or hardcoded progression is used.
Personal audio remains outside Git and the user library/database is unchanged.

| Measure                                         | Before: whole-song DSP v1 | After: native LV v2 |
| ----------------------------------------------- | ------------------------: | ------------------: |
| Regions                                         |                     1,052 |                  67 |
| Median region                                   |                  0.0464 s |            1.7879 s |
| Mean region                                     |                  0.1439 s |            2.2601 s |
| Changes/minute                                  |                    416.45 |               26.15 |
| Regions shorter than 200 ms                     |                    80.61% |                  0% |
| Extensions/added/altered/slash union, by region |                    95.91% |                  0% |
| Extension / alteration / slash, separately      |   87.93% / 5.80% / 55.89% |        0% / 0% / 0% |
| Analysis including decode                       |                   1.416 s |            10.802 s |

Complexity here means added/upper-extension, alteration or slash bass; ordinary
sevenths are reported separately by the labelled evaluation. The result still
contains seventh chords (for example Am7 at 46.649–49.946 s). Zero upper extensions
on this recording is an observation, not a simple-chord vocabulary restriction.
It has no reference annotation in this repository: structural sanity is not a
ground-truth accuracy percentage.

Representative retained before output: 1.184–1.207 E13/D, 1.207–1.231 E13/C#,
1.231–1.254 E13, 1.254–1.277 E13/G#, 1.277–1.300 E13/F#,
1.300–1.440 G7(#11). After: 1.231–3.181 G, 3.181–4.876 D,
4.876–8.290 Am, 8.290–10.054 G, 10.054–11.865 D, 11.865–15.325 C.
These are model outputs, not supplied answers.

[Before machine-readable evidence](review-evidence/stabilization-before-bob.json)
and [final Windows evidence](review-evidence/stabilization-native-final.json)
retain hashes, excerpts, timing, assertions and cleanup results.

## Recognition and labelled evaluation

The selected path is original LV-Chordia 1.1.0 CPU ensemble: automatic-tuning CQT,
full-song normalization/bidirectional networks, separate root/quality/bass/extension
heads, joint non-causal HMM, then conservative beat-supported weak-decoration
refinement. Frame-local bass no longer splits final regions after decoding.
The extra refinement is neutral on the measured recordings; it is not credited
with the ensemble's accuracy gains. See [ADR010](adr/010-native-whole-song-regions.md).

Same 23,250 valid HU33 frames, compositions 14–18:

| Metric                             | DSP v1 | Retained E010 | Selected native LV v2 |
| ---------------------------------- | -----: | ------------: | --------------------: |
| Root                               | 42.81% |        59.01% |                62.66% |
| Triad quality                      | 46.28% |        58.86% |                66.42% |
| Seventh                            | 47.81% |        74.70% |                78.02% |
| Bass                               | 36.26% |        47.56% |                53.52% |
| Reduced structural exact           |  6.17% |        25.41% |                39.86% |
| Exact bass on reference inversions | 35.13% |        21.61% |                27.29% |

Native boundary precision/recall/F1 at 50 ms: **23.50% / 16.35% / 0.19283**,
versus DSP F1 0.06607. Native matches 43 cuts, makes 140 false cuts and misses
220; it misses all four eligible short-adjacent references. It reduces excessive
cuts but is not boundary-accuracy completion. Inversion presence precision/recall
is 71.33% / 21.71%. Diminished recall is 6.64%, augmented/sus4 zero. Sixth recall
is zero on 13 reference frames; 9/11/13 recall is undefined (no positive labels).
No claim that advanced/jazz harmony is solved or unaffected is supported.

Region root+triad support ECE/Brier is 0.07910/0.18562, versus DSP similarity
0.50336/0.47699; these are selected-event diagnostics, not fitted whole-chord
calibration. Full masks, class counts, timing definitions, original rounded API
comparison, preserved failed checks and ChordMini license/runtime limits are in
[the comparison report](stabilization-model-comparison.md). The selected native
adapter uses precise timestamps; its boundary metrics must not be replaced by
the rounded public API's more favorable numbers.

## Latency and playback acceptance

Final optimized executable, same cached source bytes; real native YouTube search,
hidden Windows WebView, genuine Python model and local audio element:

| Stage                                               |                                          Seconds |
| --------------------------------------------------- | -----------------------------------------------: |
| Search/typeahead                                    |                                            1.382 |
| New network acquisition                             | Not repeated; exact original cached bytes reused |
| Decode                                              |                                            0.393 |
| Mono preparation                                    |                                            0.020 |
| CQT features                                        |                                            1.577 |
| Ensemble inference                                  |                                            4.913 |
| Joint temporal decoding                             |                                            0.099 |
| Beat estimation                                     |                                            0.923 |
| Evidence refinement                                 |                                           0.0012 |
| Timeline construction                               |                                           0.0034 |
| Full analysis, including process/setup/IPC overhead |                                           10.802 |
| Selection to playable result                        |                                           11.363 |
| Cached selection to player                          |                                            0.111 |

Stage rows are not exhaustive: full time includes imports/checkpoint setup and
IPC. No fresh download latency is claimed. Acquisition was already verified in
[the prior phase](acquisition-acceptance.md); this run intentionally retains exact
bytes for a controlled recognition comparison. CPU inference is the largest
measured stage. Failed ONNX parity prevents treating an unverified export as an
optimization. The accuracy/stability gain costs ~9.4 s versus DSP on this song.

The hidden test verifies complete timeline before autoplay, real play/pause,
±10 s, progress seeking, chord-click seeking, 5→130 s immediate centering,
ongoing playback centering and unchanged saved timeline/no new recognition.
The 0→120 s lookup immediately displays precomputed **G**, with assertion latency
9.1 ms. Reopening through real search uses SQLite analysis and cached audio with
zero provider acquisitions and zero recognition workers. Cleanup stopped owned
processes, closed the debug port and removed isolated test data.

The progression E2E additionally covers manual exploration with 2.5-second respite,
immediate follow on explicit seek, pause/resume, first/final segments, rerenders
without scroll resets, and agreement among all neighboring labels/highlight.

## Verification and executable

- 881 TypeScript unit/integration tests pass; lint and typecheck pass.
- 42 production browser E2Es pass, including progression, acquisition, cache,
  corrections and preserved live/legacy workflows.
- 63 default Rust tests pass; Clippy passes. Three opt-in live integrations remain
  ignored in this scope; earlier native live evidence is preserved.
- 147 Python tests pass, including 21 new inference/evidence regressions;
  full Python formatting and new-source Ruff pass. Full-tree Ruff retains one
  pre-existing SIM105 style failure in frozen `experiments/e010_wasm_reference.py:287`.
  It was not suppressed or edited to change historical experiment hashes.
- Optimized no-bundle Windows build and exact native acceptance pass. No portable
  installer, weak-hardware or new GPU benchmark is claimed.
- Formatting and staged-diff checks pass. The [secret/artifact audit](review-evidence/stabilization-audit.json)
  finds no configured key in tracked/staged files, frontend assets or the executable;
  no personal audio or model weights are staged. Frozen runtime source hashes match.

Run `apps/desktop/src-tauri/target/continuation-clean/release/harmonia.exe` from
this repository. SHA256:
`7abb974423c967f9c9e4bc721c60400a8cf32c3510a9b493b739d2b8c3e7e674`.
The native recognizer currently requires this checkout's `ml/.venv`, verified
local LV weights and 8 GiB available RAM. It has no silent fallback to flickering
DSP. This executable is usable on the configured development PC, not a standalone
redistributable package. Source/weight/runtime hashes are in
`ml/experiments/stabilization/results/runtime-manifest.json`.

Reliable meter/downbeats, local keys/modulations, sections, broad advanced harmony
and low-end deployment remain open. The global key is a stable duration-weighted
summary, not a rolling guess or a rule forcing chromatic chords into one key.
Existing research, live mode, providers and prior analyses/corrections are retained.
