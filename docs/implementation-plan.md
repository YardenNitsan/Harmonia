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

### Active continuation: public data and stronger runtime

- [x] Audit public expansion candidates and inspect embedded licenses before downloading audio.
- [x] Acquire and validate HU33 pilot02+18; preserve raw annotations, gaps and conflicts.
- [ ] Acquire HU33-only remainder excluding01 within audited byte/path limits; retain fixed composition split.
- [ ] Prepare explicit valid-label masks; train-only normalization; tests preventing unknown→N and split leakage.
- [ ] Report train/validation class distribution before choosing the next controlled training experiment.
- [ ] Export first LV-Chordia network and investigate full-sequence CPU numerical parity; do not relax tests without an evidence-backed numerical decision.
- [ ] Only after first-network acceptance, export/benchmark remaining ensemble and retain probability averaging/HMM/preprocessing contract.
- [ ] No model promotion or new locked-test evaluation until the new selection protocol is documented and frozen.
- [ ] Finish fresh no-cache native build, rerun hidden smoke, update artifact identities, and commit the verified checkpoint locally.

Current ownership: parent integrates app/docs/releases; ml_continue owns HU33
preparation/masking; review owns LV-Chordia export research. Desktop GUI must remain
closed throughout. Existing E004 artifacts/test results are immutable.

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
