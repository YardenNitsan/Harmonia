# Harmonia implementation plan

> Agentic workers: use executing-plans for integrated work and dispatch independent
> bounded research/domain tasks using dispatching-parallel-agents. User sections 86
> and 89 authorize automatic implementation without additional design approval stops.

**Goal:** Deliver the professional local-first chord-analysis desktop product described
in `../../instructions.txt`, preserving honest evidence for every acceptance gate.

**Architecture:** Framework-free structured chord/timeline domain, explicit application
use cases, local provider and repository adapters, replaceable worker DSP/ML pipeline,
Tauri SQLite backend, React listening workspace, Python supervised research pipeline.

**Tech stack:** TypeScript, React, Vite, Tauri 2/Rust, SQLite, Python/PyTorch.
**Spec:** `docs/product-spec.md`; complete requirements: `../../instructions.txt`.

## Global constraints

Follow `AGENTS.md`. No protected streaming capture. No false confidence or quality claims.
Dataset/license audit precedes acquisition/training. Leave GPU/RAM headroom. CPU fallback.
No main-thread analysis. No test leakage. Preserve GuitarScaleViewer and its existing edit.

## Review focus

- Invalid/overlapping saved timelines must be rejected before synchronization.
- Rapid track changes and cancellation must never apply stale analysis to another song.
- Silence, short clips, unusual sample rates and corrupt files need explicit outcomes.
- Extended/altered slash chords must survive parsing, serialization and transposition.
- Model scores must never be represented as calibrated probabilities without calibration.

## Tasks and dependencies

### 0. Research and operating record

- [x] Read master specification; inspect workspace and toolchains; preserve existing work.
- [x] Create root and workspace `AGENTS.md`, product spec, architecture, ADR and this plan.
- [x] Research primary MIR/model/runtime sources and write `docs/research.md`.
- [x] Complete dataset audit and provider capability matrix before data acquisition.
- [x] Record an explicit evidence-backed model/data strategy and any permission blockers.

### 1. Testable monorepo and canonical domain (depends on 0 architectural decisions)

Files: root package/config files; `packages/domain/{types,chord,timeline}.ts`, domain tests.
Interfaces: `parseChord`, `formatChord`, `transposeChord`, `chordPitchClasses`,
`toHarte`, `fromHarte`, `validateChord`, `findSegmentIndex`, `validateAnalysis`.

- [x] Install isolated dependencies; initialize product Git history on a feature branch.
- [x] Write and observe failing tests for rich chord roundtrips and timeline boundaries.
- [x] Implement compositional chord parsing/normalizing/formatting/validation and Harte I/O.
- [x] Implement timeline validation, binary search, transposition and correction operations.
- [x] Gate: unit tests, format, lint, typecheck; record results below.

### 2. Design system and local player (depends on 1)

Files: `apps/desktop/src/{App,components,styles}`, `packages/providers/local.ts`,
`packages/application/player.ts`, `tests/e2e/player.spec.ts`.

- [x] Define visual/motion/focus tokens before screen implementation.
- [x] Test and implement local import, playback, pause, seek, speed, loop, duration and errors.
- [x] Connect a visibly labeled synthetic demonstration to the real playback clock.
- [x] Implement responsive chord hero, timeline, piano, inspector and keyboard controls.
- [x] Gate: browser E2E import/play/seek/edit/reload and compact/large screenshots; production build.

### 3. Measured DSP pipeline (depends on 1; integrated with 2)

Files: `packages/audio/{features,recognizer,pipeline,worker}.ts`, audio tests and benchmarks.

- [x] Write deterministic acoustic fixtures and failing recognition/boundary tests.
- [x] Implement FFT/chroma/bass/RMS/waveform features with resource bounds in a worker.
- [ ] Implement boundary scores separately from frame chord scores; refine via split/merge.
- [x] Estimate beats/tempo/key and label unsupported meter/downbeats as unknown.
- [x] Preserve alternatives, provenance, uncalibrated-score labels and cancellation.
- [x] Gate: acoustic regression, silence/corrupt input, boundary tolerances, measured runtime (engineering baseline only; real-song accuracy is a separate open gate).

### 4. Persistence, corrections and native shell (depends on 1–3)

Files: `packages/persistence`, `packages/application`, `apps/desktop/src-tauri`.

- [x] Implement repository contract, browser IndexedDB adapter and native SQLite migrations.
- [x] Fingerprint audio; cache final analyses by fingerprint/model/pipeline/profile.
- [x] Implement chord/boundary corrections, library reload, favorites and export.
- [x] Integrate Tauri native commands and restrictive capabilities/CSP.
- [x] Gate: repository recovery/roundtrip tests, Rust checks/tests, hidden native launch/build.

### 5. Reproducible ML and benchmark program (depends on 0 audit and 3 baseline)

Files: `ml/{data,features,models,training,evaluation,export,experiments}` and ML docs.

- [ ] Acquire only audited, permitted data; enforce song and duplicate/artist split isolation.
- [x] Implement structured shared encoder with root/triad/seventh/bass/extension/boundary heads.
- [x] Implement safe hardware detection, bounded workers, resume/best checkpoints, early stopping.
- [ ] Run controlled features/encoder/boundary comparisons and track learning curves.
- [x] Evaluate pretrained baselines where license and technical access permit.
- [x] Evaluate real-recording locked test, rare chords, inversions, boundaries and calibration.
- [ ] Integrate/export only measured models; compare CPU/GPU/quantization performance.
- [ ] Gate: reproducible registry, leakage tests, evaluation reports; no synthetic-only final claims.

### 6. Product polish and release validation (depends on all applicable earlier gates)

- [ ] Finish musician features, keyboard/accessibility, compact/high-DPI/reduced-motion behavior.
- [ ] Profile startup/analysis/playback/cache; audit dependencies and untrusted input paths.
- [ ] Run complete automated suite and final campaign from master sections 83–84.
- [ ] Build Windows installer; verify installation on a clean machine when available.
- [x] Document other platform validation separately; do not infer cross-platform success.
- [ ] Update all required documents and `docs/final-report.md` with actual evidence and gaps.

## Execution ledger

### Active continuation: consumer typeahead and prepared player

User-reported follow-up: YouTube titles displayed literal `&#39;`, and every
YouTube selection reached the same unavailable message. Native `plain()` omitted
entity decoding; a red/green regression now covers the exact Guns N' Roses title,
numeric/hex/common named entities, malformed references, one-pass decoding and
redaction after decoding. The audio failure is an architecture limitation, not a
bad key: every official YouTube result has `audio: null`. No permitted analysis
source for arbitrary YouTube videos exists in this implementation.

Search now labels each result **Analyze & play** or **Watch only · no chord
analysis** before selection, explains watch-only searches explicitly, and removes
the misleading suggestion that another YouTube video will work. The playable
catalog's independent timeout rises from two to ten seconds (YouTube results
still publish immediately); a regression proves a 2.5-second response is retained.
This repairs title formatting/discovery and communicates the gap; it does not
claim to have enabled arbitrary YouTube chord playback.

Verified follow-up: 861 TS tests, 37 Rust tests, all nine affected production E2Es,
lint/types/format/clippy and optimized build pass. Hidden native probe
`consumer-native-03.json` confirms the exact official title is correctly decoded,
capability labels match actual sources, and licensed full-song playback/cache
remain working. The current executable/hash are in consumer acceptance. No key
changed, no visible GUI launched and no new ML work occurred.

Follow `docs/consumer-player-plan.md` and the latest detailed user specification.
Resume checkpoint4ff6a28; preserve all code/research and untracked work. Primary
search must make actual configured YouTube requests on debounced text changes.
Credential absence and unavailable permitted analysis input must stay honest.
No GUI or new ML experiments. Earlier Search & Analyze acceptance below is a
preserved prototype, not acceptance of this new consumer workflow.

Consumer checkpoint now verified; see `docs/consumer-player-acceptance.md` and
`docs/review-evidence/consumer-native-02.json`. Real configured YouTube typeahead
works without Enter or a key form. Licensed catalog selections produce a fixed
whole-song snapshot before automatic playback; native 2:00 lookup, playback,
clickable progression and SQLite cache reopen pass. Preparation 4.426s, worker
2.546s, cached reopen 0.825s on the 122.14s Commons recording. The earlier failed
native probe is retained: tiny timeline targets overlapped; repaired padding and
a readable progression strip pass the final probe. No recognition changes.

859 unit tests, 38 functional production E2Es and both unchanged CPU-throttled
campaigns pass; Rust fmt/36 tests/clippy, lint/types/format and optimized native
build pass. This rerun passes the prior 150ms cached-import threshold without
relaxation (fast 69.5ms; accurate timing in the retained current JSON). Historical
152.8/152.9ms failures remain in checkpoint4ff6a28 and the earlier ledger below;
this is a new observation, not a proven performance optimization or weak-PC result.

Independent review cache-revision issues are fixed with unit and browser red/green
regressions. Credentials are ignored/native DPAPI, placeholder-only example and
absent from tracked files/frontend/executable. Preserved unrelated untracked files
and frozen ML work. Stop after this useful local checkpoint; visible app stays
closed. **Arbitrary YouTube songs still lack permitted analysis input/integrated
playback**, and the 559-segment recognition remains inaccurate. Do not relabel
this bounded permitted-source success as complete YouTube or final-product acceptance.

### Preserved continuation: Search & Analyze whole song

The latest user correction supersedes live-primary priority and the prior stop-after-
live budget. Follow `docs/search-analyze-plan.md`, ADR007 and
`docs/whole-song-recognition-research.md`. Preserve the completed live MVP and all
frozen research; pause arbitrary custom training. No visible GUI.

- [x] Inspect reusable timeline/player/cache/worker modules and official input restrictions.
- [x] Record permitted Commons analysis-input architecture and independent YouTube limitations.
- [x] Implement catalog search, per-recording rights validation and bounded acquisition.
- [x] Implement separate genuinely full-song non-causal worker/decoding strategy and tests.
- [x] Connect Search & Analyze selection/progress/precomputed timeline/playback/cache UX.
- [x] Verify real permitted-recording search, full analysis, future-time lookup, playback/seek
      and cache reuse in production browser and hidden native Windows build.
- [x] Document actual analyzed source, measured analysis time, limits and executable;
      checkpoint useful local work and stop after prototype acceptance.

Native product-flow acceptance is in `docs/review-evidence/search-native-03.json`:
Commons Greensleeves, Julien Grandgagnage, CC BY-SA 3.0, 122.14 seconds; final
preparation 4.96s, worker 3.49s, cached preparation 0.55s. Complete timeline precedes
playback; never-played 80s seek, changing chords while playing, pause and SQLite
reuse after reload pass; hidden processes/data cleaned. This is an openly licensed
catalog prototype, not YouTube PCM access or recognized-quality acceptance.
The 559 segments still expose over-segmentation. See `docs/search-analyze-acceptance.md`.

Independent review found and fixed whole-song Library routing/stale duplicate
cache ownership and navigation hiding a completed timeline. Regression tests
preserve corrections through Library, exact-file cache reuse and reload. Existing
live capture, E010/LV/B001 and all frozen datasets/protocols remain unchanged.
825 TS tests, lint/types and optimized Windows build pass. Rust fmt, 28 tests and
clippy pass. The broad production UI run passed 32/35; its old import-navigation
test was corrected to explicitly select the preserved earlier-profile mode and
passes. All 33 functional flows therefore pass across the full run and scoped
rerun. Two legacy CPU-throttled cached-reimport frame-p95 gates remain failing:
the isolated rerun measured 152.8/152.9ms against the unchanged 150ms ceiling.
Other timing phases pass. Initial overlapped-build failures are retained separately
as `search-regression-performance-*-failed.json`; current timing reports hold the
isolated rerun. No threshold was relaxed and no test disabled. This is an open
performance/release gate, separate from the user's whole-song product-flow
prototype acceptance. No actual weak-PC or new installer campaign was undertaken.

The final catalog privacy review added explicit `cache: no-store` for metadata and
audio, with a regression test, so temporary input does not populate HTTP cache.
All 6 new production search/library tests and the fresh native probe pass after
that change. Formatting and diff checks pass; no visible GUI or new ML run occurred.
Stop at this useful local prototype checkpoint as requested. Remaining scientific,
YouTube integration, performance and final-release gates are explicitly open.

### Preserved continuation: primary Listen Live correction

The user's 2026-09-20 correction supersedes the file-first interpretation. Preserve
all completed work below; do not restart studies. Read `docs/live-input-correction.md`
and ADR006 before implementation. No visible desktop launch.

**Latest budget restriction:** finish the external live-listening MVP only. New
ML experiments, accuracy improvements, Search & Play/provider expansion and release
polishing are paused. Preserve their existing work and frozen protocols. Do not
resume them automatically when live listening passes. Full-release gates below
remain separate from MVP acceptance.

- [x] Audit concrete file-first assumptions and research supported Windows capture.
- [x] Document generic PCM architecture, bounded capture/worker lifecycle and live acceptance.
- [x] Implement native audio-session/source discovery, process-tree and endpoint capture,
      PID identity, bounded activation/pull queues, timestamp/loss/error handling and cleanup.
- [x] Implement generic PCM source/stream-worker contracts, stateful preprocessing,
      reused causal-window DSP recognition and bounded live timeline/reset behavior.
- [x] Make Listen Live the primary screen; add actual source selection, current/recent
      harmony, elapsed/latency, silence/resume/error states and coordinated offline mode.
- [x] Validate actual hidden native process isolation/system capture and end-to-end
      live recognition, source switching, stopping, queue bounds and offline regressions.
- [ ] Continue official Search & Play/metadata integration through separate provider
      and capture capabilities, with platform/service constraints preserved.
- [ ] Complete streaming model quality/latency selection and remaining release gates.

**Live MVP accepted on this Windows machine (2026-09-20).** See
`docs/live-mvp.md`, `docs/review-evidence/live-native-mvp-10.json` and
`docs/review-evidence/live-chrome-native.json`. Real selected-process PCM showed
C → silence → G while excluding a second source, then F# after source switching.
Actual Chrome playback pause/resume and explicit system-output capture also passed.
The first controlled chord appeared after 472 ms. All owned test processes,
debugging ports and isolated data were cleaned; no visible GUI was launched.

Verification: 769 TS tests; 28 Rust tests; ESLint/types; Rust fmt/strict Clippy;
12 production-browser live/offline flows and a final four-flow live rerun; optimized
desktop build. Native ownership and process-clock packet-starvation regressions are
fixed and covered. No model changes or new research experiments were needed.
Source/worker queues and recent history are bounded. Recognition remains the
uncalibrated DSP baseline. Stop here under the latest budget scope; provider,
recognition-quality and full-release work remain paused, not completed.

D003 completed once and is inconclusive: all four fits miss convergence, with
major recall/overall accuracy declining. Preserve its reports and no promotion.
E010's completed CPU export remains accepted research; its new WASM harness is
prepared but unrun/unfrozen. The provider bridge browser probe is also preserved
unrun. These tasks remain paused under the latest budget restriction, including
after live input integration becomes stable.

### Preserved continuation: public data and stronger runtime

- [x] Audit public expansion candidates and inspect embedded licenses before downloading audio.
- [x] Acquire and validate HU33 pilot02+18; preserve raw annotations, gaps and conflicts.
- [x] Acquire HU33-only remainder excluding01 within audited byte/path limits; retain fixed composition split.
- [x] Prepare explicit valid-label masks; train-only normalization; tests preventing unknown→N and split leakage.
- [x] Report train/validation class distribution before choosing the next controlled training experiment.
- [x] Export first LV-Chordia network and investigate full-sequence CPU numerical parity; original tolerances retained, procedural acceptance and real-audio failure recorded in ADR 003.
- [x] After first-network procedural acceptance, export/benchmark remaining ensemble with probability averaging/HMM/preprocessing contract; all-five acceptance is limited to procedural sequences through 4096 frames.
- [ ] No model promotion or new locked-test evaluation until the new selection protocol is documented and frozen.
- [x] Run predeclared HU33 E007/E008 and adaptive E009 context comparison; retain full-validation reports, hashes and resource measurements without opening test.
- [ ] Resolve LV-Chordia real-recording logit parity (second E006 validation recording, network0,1531frames) and network1/8192 before production acceptance; no arbitrary chunking or tolerance relaxation.
- [ ] Port/verify CQT, tuning/resampling and original ensemble/HMM production preprocessing, then measure complete CPU pipeline resources and real-song quality.
- [x] Finish fresh no-cache native build, rerun hidden smoke, update artifact identities, and save the verified checkpoint locally.
- [x] Save checkpoint `d379b93`; isolate remaining real-audio export error across native PyTorch, export-copy PyTorch and ONNX layers without relaxing acceptance.
- [x] Complete atomic manual chord/start/end correction, including neighboring histories, persistence failure recovery and transposed-display editing.
- [x] Finish separate D001 train-only root-relative diagnostic; its oracle roots cannot establish deployable accuracy or authorize promotion.
- [x] Run frozen E010 predicted-root quality cascade once: validation macro recall20.25%→27.02%, reduced exact19.81%→25.41%; minor recall53.53%. Research gates pass, majority/wrong-root regressions remain; no product promotion.
- [x] Export the exact E010 cascade as a separate research artifact: all ten CPU parity cases pass, including every retained validation decision; no production change.
- [ ] Verify E010's exact float64 cascade in browser WASM under a separately frozen runtime protocol; preserve full-sequence context and retained predictions.
- [x] Complete D002 training-only relative-bass diagnostic: all eight fits converge, but all three signal/tradeoff gates fail. No predicted-root bass experiment follows from this result.
- [ ] Run separately frozen D003 training-only nonlinear quality diagnostic to test major-recall recovery while guarding minor/diminished recall; reuse completed D001 controls.
- [x] Complete B001's paired browser-DSP validation once; boundary F1 improves but short-transition misses increase0→1, so retain the production baseline.
- [x] Test all-convolution float64 accumulation for the retained LV failure; logit violations remain29/2/15 (triad/bass/ninth). Preserve failed evidence and unchanged tolerances.
- [x] Isolate SELU cancellation on constructed fixtures and test only that arithmetic change on the retained LV recording; logit violations remain29/2/15. Retain CQT/native references for future investigations.
- [ ] Integrate independent boundary candidates and measured split/merge refinement; current novelty scores do not drive segmentation.
- [x] Add reusable worker-owned OPFS feature caching with bounded cleanup, deadlines and integrity checks; verify cross-profile/restart reuse and corruption/cancellation recovery in production browser and hidden native flows.

Current ownership: parent integrates verification and release records; bounded agents
verify E010 WASM, implement D003 training-only quality research, and verify the
isolated provider message bridge. D002 is complete and rejected by its guards.
B001 is finished and rejected by its mandatory short-transition guard.
Do not rerun E010 or B001. The five-file inspection pilot is complete;
its missing aligned labels/provenance keep it out of training.
HU33 preparation, E007–E009 training/evaluation and export research artifacts are saved.
Do not redispatch completed experiments or repeat acquisition. Desktop GUI must remain
closed throughout. Existing E004 artifacts/test results are immutable.

Continuation evidence: 736 TS tests including46 new provider-bridge checks; 98 Python tests plus the later scoped B001
mask regression and LV convolution checks; 14 Rust tests;
TypeScript/lint, Python Ruff/dependency consistency and Rust fmt/clippy.
Production browser25/25 includes
new notation/Harte export, named dialog focus/Tab/Escape restoration, keyboard/high-DPI/
reduced-motion and fast/experimental CPU-throttle campaigns. Actual weak hardware is
still unavailable. The fresh-target baseline native build and final incremental
integration build both passed; final hidden smoke passed and cleaned resources.
Source/executable/installer hashes in `docs/review-evidence/release-continuation.json`
await refresh for this new snapshot; the prior checkpoint identities remain historical.
This does not verify signed or clean-machine installation.

The atomic timing follow-up verifies first/last bounds, adjacent histories, blank
and invalid values, transposed-display source editing, persisted reopening and a
real loop following both edited bounds. Uncovered spans display no harmonic label,
with gap-aware previous/next navigation. The latest hidden native smoke verifies
the whole corrected timeline and its history in SQLite after process restart.
The smoke harness initially supplied a noncanonical decimal to a range input;
its representable seek value was corrected and the complete smoke then passed.

The subsequent OPFS follow-up passed a rebuilt native executable/NSIS and hidden
smoke with actual feature checksums, reuse across fast/accurate profiles, and reuse
after process restart. Production browser25/25 also covers interrupted writer lock
release, orphan reclamation and corrupt feature recomputation. ADR 004 records the
resource/deadline contract. The standalone B001 strategy has31 behavioral tests;
its production default remains gated on the predeclared real-validation comparison.
The injected YouTube adapter has50 tests and passed an isolated official-SDK live
play/pause/seek/dispose probe; it is not connected to the privileged app page.
Its bounded proxy/endpoint message bridge now has46 additional tests. Real
cross-origin browser bridge verification is in progress; the current production
CSP intentionally does not permit the remote iframe.

Read-only release environment inventory: Windows 11 Home, Core Ultra 7 265KF,
about32GiB RAM; no discoverable Sandbox/VirtualBox/VMware/Hyper-V command and no
code-signing certificates in the two personal certificate stores. No host settings
were changed. See `docs/review-evidence/release-environment.json` and the specific
local versus external gates in `docs/release-gates.md`.

Post-implementation review found and closed source-pair swapping in HU33 validation,
volume slider state after replacing a track, and timeline export visibility at
800px. Three source-swap regressions and a production volume flow were added;
all 23 original source identities/hashes still match, so existing preparation and
experiments were retained. Independent re-review found no remaining code blocker
in these fixes. Scientific parity/quality and final release gates remain open.

Research result: E009 improves HU33 root to59.02% and reduced exact to19.81%, but
minor recall0.34% and inversion exact1.75% remain inadequate. It is research-only.
LV procedural tests pass; the retained real-audio research probe deliberately remains
a failing acceptance check (28/111763 triad logits on second validation recording).
No legitimate failure was disabled and no model/test freeze was repurposed.

D001 completed separately on training-only composition folds. Oracle-root-relative
features improve pooled triad macro recall24.87%→45.21%, minor24.58%→69.92%, with all
eight fits satisfying the predeclared gradient criterion. It supports further
representation research, not deployable quality; validation/test arrays stayed
closed. Parent independently reverified source/protocol/config/training/checkpoint
hashes. See `docs/data/hu33-representation-diagnostic.md`.

Ruling: retain mixed-precision LV normalization only as measured export research;
passing short procedural/browser fixtures does not authorize production integration.
Ruling: preserve original predeclared protocol snapshots under experiment results;
human-facing protocol documentation may be formatted after runs without changing those
hash-bound snapshots. Next work starts with the unresolved real-audio numerical and
preprocessing contracts, followed by broader data/target representation, advanced
segmentation, remaining product/provider features and physical release gates.

2026-09-20 resumed checkpoint `34e34f3` on existing `feat/harmonia`, clean at start.
No completed phase was restarted. The existing 23-track/48-file HU33 acquisition
was verified and reused without another download. Strict masked preparation completed;
see `docs/data/hu33-preparation-report.md`: 78,350 valid training and 23,250 validation
frames. Test remains locked. Added source identity/hash/path/duplicate regressions;
raw CSV rather than cached parsed labels is authoritative. Fixed the unfinished
evaluation coverage regression; four evaluator tests pass. E007/E008 research protocol
and controlled experiments are in progress; no model promotion is authorized by these
preparation results.

Ruling: continue in the existing product branch and use the existing implementation
ledger — preserves the requested continuation and ignored datasets/checkpoints.
Ruling: practice display modes are projections of canonical chords, never corrections.
Roman/Nashville degrees use major-reference numbering relative to the displayed tonic;
slash bass remains numeric to avoid implying secondary-dominant analysis. Unknown-key
number modes are unavailable. Original full chord remains editable/exportable.

Fresh checkpoint baseline: 551 TS tests, lint and typecheck; 16 production-browser
flows. A new Cargo target directory `apps/desktop/src-tauri/target/continuation-clean`
built the native binary and NSIS installer without reusing compiled native artifacts
(3m11s). Hidden native smoke passed and cleaned up; evidence
`docs/review-evidence/native-smoke-continuation-baseline.json`. This baseline predates
the new notation/provider changes and is not the final release artifact.

2026-09-20: Work began from a workspace without a root repository. Existing
GuitarScaleViewer has a modified Cargo.toml; left intact. Node 24.11.1, npm 11.6.2,
Python 3.13.12 and Rust commands are present. No product tests or benchmarks run yet.
Research agent owns research/dataset/provider documents; parent owns integration.

2026-09-20 milestone evidence: 47 TypeScript unit/integration tests pass; frontend
typecheck and lint pass. Two headless Chrome E2E checks pass (demo playback/seek/
correction/reload; window widths 800/1280/1920/2560). Native agent ran six SQLite
tests, cargo check/fmt/clippy successfully; parent production NSIS build is underway.
No desktop GUI launched. Formatting/all-phase acceptance still pending integration.

GuitarSet 1.1.0 acquired after audit: 360 recordings, 3.0468h, 4320 annotated segments,
588 distinct labels. Progression families separate 120/120/120 train/validation/test
tracks; locked test has not been evaluated. E001 Python DSP baseline and E002/E003
small TCN experiments ran; validation quality is low, especially rare/minor classes.
Do not conflate the Python DSP benchmark with the different browser peak-chroma baseline.
17 Python unit tests and Ruff lint pass. ML agent hit a usage limit; parent resumed
its saved artifacts and ran E003. Model selection/export and pretrained comparison remain.

Ruling: separate adjacent monorepo, as ADR 001 records. Cost: duplicate build configuration.
Ruling: user authorizes autonomous phased implementation, overriding skill approval stops.

2026-09-20 integration/review checkpoint: root guide remains authoritative. Native schema2
preserves profiles and corrupt/duplicate rows; browser IndexedDB migration quarantines
invalid data. Save errors, edited loops, stale favorite saves, and playback errors have
regressions. Domain format/parse now covers all 448 triad/seventh/extension combinations.
Latest full TS run: 542 tests; typecheck and lint pass. Additional import-preflight and
performance E2E were added afterwards; complete acceptance run is still pending.
Production frontend E2E passed 12/12 under native CSP before the latest additions.
No visible desktop GUI has been launched.

ML: E001–E005 controlled runs and E006 LV-Chordia validation baseline recorded. E004
selected by the predeclared validation criterion and frozen before a once-only 120-track
held-out test: root38.06%, reduced-structural15.13%, minor/extension recall0. This is NOT
adequate final product accuracy. ONNX float32 export parity verified; local single-thread
WASM worker integration is explicitly experimental; balanced DSP remains default.
24 Python tests, Ruff and dependency consistency checks passed. See evaluation.md.

Ruling: keep learned boundary predictions out of the shipped experimental timeline —
held-out performance is inadequate; use documented DSP novelty/stabilization. Costs:
no claim that Python frame metrics measure the complete desktop pipeline.
Ruling: analysis now fails closed for unverified channel layouts and accepts only
header-verified mono/stereo WAV/FLAC/MPEG audio/Ogg before PCM decode. Previously listed
M4A/AAC/AIFF/WebM require conversion for now. Costs: narrower container support until a
bounded streaming decoder is integrated. Header checks are not a hard decoder sandbox.
Ruling: pipeline provenance advanced to harmonia-worker-2 for decoder/preflight changes;
old sessions remain readable but re-import creates a separately versioned analysis.

Next: finish current whole-suite/production/native-hidden smoke checks and installer;
record hashes and observations. Then continue unresolved product gates: broad licensed
corpus and stronger calibrated model, advanced boundaries, complete practice/correction
features, officially configured provider adapters, low-end hardware and clean-machine
release campaign. Do not open the final app while these remain unresolved.

2026-09-20 production checkpoint: the Windows release executable and NSIS installer
built successfully. Hidden release smoke passed actual WebView2/CSP, DSP and E004,
SQLite, media playback/seek, correction/favorite and process-restart persistence.
No page errors; all owned processes/debug ports and temporary data were cleaned.
Evidence: docs/review-evidence/native-smoke.json. This is not clean-machine installation.
Production-browser campaign passed15/15; unit suite subsequently reached551 tests;
Rust14tests/fmt/clippy and Python24tests/Ruff pass. Frontend component refactors and
one new profile-switch E2E are being integrated; rebuild/recheck before accepting
the next snapshot. npm audit reports0production vulnerabilities.

Performance diagnostic: the initial ~380ms stall included Playwright's base64 upload
harness. Importing an actual temporary file path yielded ~456ms import-to-ready for
30s of synthetic audio under4x CPU throttle, p95frame13.8ms/max111ms, one88mslongtask.
This is a developer-machine simulation, not a complete weak-PC or animation campaign.

User confirmed no private corpus; use audited public sources only. Public expansion
audit found HU33 Winterreise PDM audio with aligned chords; restricted SC06 excluded.
Authorized pilot: songs02+18 only. New composition split fixed02–13train/14–18validation/
19–24lockedtest, song01excluded for repeatvariant. No training/evaluation of this new
corpus yet. In parallel, investigate LV-Chordia ONNX parity without changing E004 or
touching locked tests. Research/export feasibility is not a production model promotion.
