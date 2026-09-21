# Recognition, timing and practical voicings follow-up

## User report and diagnosis

The user reports worse chords/timing on _סוויץ׳_ from Imagine Festigal,
YouTube `41BZrKQY1IM`, and weak accuracy on _Killer Queen_, `2ZBtPf7FOoM`.
Do not use Bob Dylan as an accuracy benchmark. Search/acquisition/player flow,
whole-song analysis and frozen playback snapshots remain unchanged.

The read-only user database contains one native v2 Switch analysis, created
2026-09-21 07:43:57 UTC, with 59 regions and zero corrections. It predates the
practice update. No before/after rewritten pair exists in that database. The
last commit changed practice voicings, search typing and 11/13 parsing, not native
weights, inference or timings. This does not disprove the listening report;
it distinguishes the unchanged saved recognition from the changed practice view.
The original Switch record and exact source identity were privately frozen before
new work. No user cache or corrections were overwritten.

The current model has genuine root/quality and temporal limitations. Beats are
estimated after HMM decoding and previously only supported a rarely triggered
decoration cleanup. Wrong beat alignment must be evaluated independently from
whether the player indexes the timeline correctly.

## Evidence-supported timing change

The frozen [protocol](boundary-timing-protocol.md) compares two acoustic-attack
timing candidates on training compositions 02/03, then the selected onset-peak
candidate once on validation 14–18. It reuses retained model heads and timelines;
there is no model fit or inference rerun. The same decoded PCM provides the onset
envelope already needed for beat tracking.

A pitched-to-pitched boundary can move at most 150 ms and one quarter of either
neighboring original region. It must have a nearby detected acoustic onset and
limited contradictory joint chord evidence. No-chord boundaries, labels and
region counts remain intact. No beats are invented, no frame predictions become
new segments, and no unconditional beat grid snapping is used.

| Fixed HU33 validation metric       | Before v2 | Timing v3 |
| ---------------------------------- | --------: | --------: |
| Boundary precision, 50 ms          |    23.50% |    29.89% |
| Boundary recall, 50 ms             |    16.35% |    20.91% |
| Boundary F1, 50 ms                 |    19.28% |    24.61% |
| Correctly matched boundaries       |        43 |        55 |
| Missed short-adjacent boundaries   |         4 |         4 |
| Root accuracy                      |   62.662% |   62.667% |
| Reduced structural exact           |   39.862% |   39.953% |
| Triad quality                      |   66.422% |   66.434% |
| Seventh accuracy                   |   78.022% |   78.056% |
| Bass accuracy                      |   53.523% |   53.484% |
| Exact bass on reference inversions |   27.286% |   27.237% |

Training F1 rose 44.0% to 46.4%; the backtracked-onset arm reached 45.6% and was
not selected. Validation passes the predeclared gain/nonregression gates. These
are five previously exposed classical voice/piano recordings, not an aligned
commercial-pop benchmark. The improvement is boundary localization, not proof of
substantially better chord identity or accurate beats throughout either user song.
No locked test set was opened.

Timestamp relocation reassigns a small number of frames: bass accuracy falls
0.039 percentage points and inversion-bass accuracy falls 0.049 points. These
are explicit tradeoffs, not unchanged metrics. The predeclared root/reduced and
short-transition guards pass; the gain is 12 additional matched boundaries.

Full reports, class supports and per-track rows:
`ml/experiments/boundary_timing/results/{training,validation}.json`.
Exclusive preflight hashes and source-at-run snapshots preserve the evaluated
implementation. Subsequent evaluator edits only repair lint comments and add
strict equal-length zip checks; the production function docstring identifies
promotion. Numerical logic and thresholds remain unchanged.

The native entry enables the new alignment; Python's optional baseline mode
remains available for historical reproducibility. Pipeline/model runtime identity
advances to v3 so new search preparation cannot silently reuse v2 timings.
Existing revisions and corrections remain preserved. Playback never re-estimates
chords or changes the prepared timeline.

## Practice correction

See [practice revision](practice-revision.md): one compact piano shape, inversions
for nearby positions, and explicit practical guitar fallbacks. These remain
suggestions derived from harmony, not transcription of original instrumental
fingerings. Recognition decisions do not depend on diagram availability.

## Recognition candidates and unresolved quality

The [controlled comparison](recognition-controlled-comparison.md) tests four
alternatives: expanded LV vocabulary, training-length overlapping inference,
the published ChordMini ChordNet runtime, and upstream layered decoding. All
fail their training gates, so none proceeds to validation or production. The
layered decoder improves root/triad/bass but loses seventh and complete-chord
accuracy. ChordNet's checkpoint architecture is not fully specified by its
published metadata, which limits interpretation of its poor result. Its weights
are local research artifacts, not bundled with Harmonia.

The user's requested high chord-identity accuracy has not been achieved. Current
whole-song LV remains the strongest measured accepted option. Further progress
needs a verified alternative runtime and representative aligned full-mix evidence;
UI tests and unlabelled song excerpts cannot certify that goal. No unsupported
maximum-accuracy or broad recognition-quality claim is made for this checkpoint.

## Windows and application acceptance

946 application tests, 150 Python tests and 45 production browser tests pass.
The final keyboard crop additionally passes both focused production practice
flows. Lint/typecheck, scoped Python checks and optimized Windows build pass.
Existing Torch export warnings remain; no parity tolerances were relaxed.
The frontend retains its 557.65 kB entry-chunk warning and Tauri dynamic-import
warning. No visible GUI was launched.

Both hidden native checks use the exact cached WebM, real native YouTube
typeahead, new complete analysis before autoplay, one-hand piano/guitar library,
occurrence seeks, authoritative pause/play/late seek and immutable playback.
Reopening uses SQLite analysis and cached audio without recognition/acquisition.
Owned processes and isolated data are removed after each check.

| Exact source                              |   Switch | Killer Queen |
| ----------------------------------------- | -------: | -----------: |
| Regions before / after                    |  59 / 59 |      83 / 83 |
| Changed chord labels                      |        0 |            0 |
| Relocated boundaries                      |       12 |           18 |
| Maximum relocation                        |  69.7 ms |      92.9 ms |
| Click to ready with cached audio          | 12.914 s |     14.284 s |
| Cached selection to player                | 147.8 ms |     112.8 ms |
| Seek to 2:00 and assert chord/progression |  16.7 ms |      21.7 ms |

Evidence: `review-evidence/timing-v3-switch-native-verified.json` and
`review-evidence/timing-v3-killer-queen-native.json`. The first Switch attempt
successfully prepared the player but failed a stale test version assertion;
its report remains `timing-v3-switch-native.json`. The correction required exact
v3 identity rather than widening a gate or changing application behavior.

Source chord sequences are unchanged. These recordings lack aligned chord/beat
ground truth here, so neither the moved boundaries nor successful UI tests prove
that their harmony is now correct. The unresolved opening no-chord regions and
incorrect/missing chord qualities remain real limitations.

Run `npm.cmd run desktop` from the repository, or use the rebuilt executable:
`apps/desktop/src-tauri/target/continuation-clean/release/harmonia.exe`.
SHA256: `748f6010274e110bd569cdb3acfc6b1817bcb2bb0bcdc9bc0980ff1dd51d46d0`.
This remains source-dependent, not a portable standalone release. New search
preparation uses v3 automatically; an explicitly restored historical Library
revision remains historical until the user chooses Analyze again.
