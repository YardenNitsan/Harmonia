# Harmonia operating guide

## Start and resume

- Current scope (latest user correction): **Search & Analyze whole song → playback
  synchronized to a precomputed timeline** is primary. Follow
  `docs/search-analyze-plan.md`. Preserve Listen Live as optional/experimental.
  Research permitted audio sources before implementation; never extract YouTube
  streams or use capture as a provider-policy workaround. Pause arbitrary custom
  ML training; reuse research and benchmark mature approaches. Stop after end-to-end
  prototype acceptance and report the actual audio input, timing and limits.

- Read `docs/implementation-plan.md` first; update its checkboxes and evidence as work progresses. Resume existing work instead of restarting it.
- The full requirements are in `../instructions.txt`. Read relevant sections and `docs/product-spec.md` before changing scope.
- Before major architecture changes, inspect `docs/architecture.md` and relevant `docs/adr/` records. Record decisions, tradeoffs, and changed interfaces in those documents.
- Preserve user changes. Keep work local unless publishing, messaging, or external actions are explicitly authorized. Never commit secrets, personal audio, or private dataset credentials.

## Architecture and code

- The latest correction supersedes ADR006's live-primary priority. Search & Analyze
  uses full-song, non-causal analysis. Local-file whole-song analysis is secondary;
  Windows listening remains experimental. Preserve ADR006 and its verified capture
  implementation; do not spend this phase improving live recognition.
- Local capture uses supported Windows loopback APIs with explicit source selection,
  bounded ephemeral PCM and clear unavailable/protected-stream outcomes. Never bypass
  protected-audio restrictions or assume provider APIs expose PCM. No silent capture
  fallback to a wider source, audio uploads, captured-audio persistence or training.

- Separate **Domain**, **Application**, **Infrastructure**, and **Presentation**. Domain is independent of React, Tauri, databases, providers, and ML frameworks; infrastructure implements inward-facing contracts.
- Use clean code, focused modules, strong types, and SOLID where useful. Prefer composition. Avoid giant components, duplicated logic, hidden side effects, and speculative abstractions.
- Use Repository for persistence, Adapter for external providers, Strategy for interchangeable algorithms, and Pipeline for analysis stages only where they solve an actual problem.
- React components render and handle UI interactions; business rules and workflows belong in domain/application modules.
- Raw SQL belongs only in persistence/repository implementations and migrations. Provider-specific logic stays inside provider adapters; capabilities must be explicit and truthful.
- One canonical structured `Chord` model is the internal truth. Parse/format strings at boundaries; preserve extensions, alterations, bass, and no-chord semantics.
- DSP, features, boundary detectors, chord/bass recognizers, temporal decoding, calibration, and runtimes must be modular, testable, benchmarkable, and replaceable. Candidate boundaries must allow later split/merge refinement.
- Heavy decoding/analysis/features/inference/database work must never block the UI thread. Support cancellation, stale-result protection, bounded resources, and deterministic playback-clock synchronization.

## Privacy and providers

- Default to local processing and local persistence. Never silently upload audio, corrections, telemetry, or training data.
- Use documented, supported provider APIs. Never bypass DRM, rip or capture protected streams, use unsupported download endpoints, or treat streaming providers as training datasets.
- Validate untrusted files, metadata, serialized analyses, paths, and model artifacts. Never interpolate user paths into shell commands.

## ML and performance

- Audit dataset/audio/annotation/model licenses in `docs/data/dataset-audit.md` before acquisition or training. Annotation access does not grant audio rights. Record unresolved permissions; do not assume them.
- Preserve reproducible experiments: dataset and feature versions, song/artist splits, seed, configuration, code revision, checkpoints, metrics, resource use, and conclusions.
- Prevent train/validation/test leakage across chunks, duplicate songs, remasters, and augmentations. Keep the test set locked; never tune against it. Synthetic fixtures are not evidence of real-song accuracy.
- Use the same preprocessing for training and inference. Benchmark baselines and controlled changes; report rare chords, inversions, boundaries, calibration, and failures honestly.
- Detect available GPU/VRAM/RAM; leave system headroom, limit workers, bound OOM retries, and support resumable training. Never deliberately exhaust memory.
- Keep production usable on weaker PCs: CPU fallback, bounded memory, responsive UI, cached features, and measured analysis profiles. Do not require the training GPU or ship the full scientific Python stack without evidence justifying it.

## Completion gates

- During development, validate internally using tests, headless E2E, builds and short-lived smoke checks. Do not repeatedly open the desktop GUI or leave development windows running. Launch helpers hidden on Windows and clean up temporary processes.
- Only after ALL implementation, ML training/optimization/model selection, production inference, UI, persistence/cache, supported provider work, testing/performance/regression, clean build, installer and final validation gates pass, launch the final production desktop app for the user and leave it running. Verify release startup and the main flow beforehand. Never present an unfinished development build as the final app.
- A phase is complete only after formatting, linting, type checking, applicable Rust/Python checks, unit/integration tests, relevant E2E/runtime checks, and production builds pass. Record commands and results in the plan.
- Never disable legitimate failing tests or suppress errors to obtain green results. Fix failures and report checks that could not run.
- Run important user flows, not just compilation. Keep architecture, research, limitations, release instructions, and progress documentation accurate.
- Never label a baseline as a trained model, uncalibrated scores as calibrated probabilities, or an unmeasured improvement as success.

## Commands

Run commands from this repository root unless a different directory is specified.
On Windows use `npm.cmd` when PowerShell execution policy blocks `npm`.

| Purpose                     | Command                                                                                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Install frontend            | `npm.cmd ci`                                                                                                                                                                                                                                           |
| Development server (no GUI) | `npm.cmd run dev`                                                                                                                                                                                                                                      |
| Production frontend         | `npm.cmd run build`                                                                                                                                                                                                                                    |
| Unit/integration tests      | `npm.cmd test`                                                                                                                                                                                                                                         |
| Headless UI tests           | `npm.cmd run test:e2e` (installed Chrome)                                                                                                                                                                                                              |
| Lint / types                | `npm.cmd run lint` / `npm.cmd run typecheck`                                                                                                                                                                                                           |
| Format / check              | `npm.cmd run format` / `npm.cmd run format:check`                                                                                                                                                                                                      |
| Native checks               | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`; `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings`                                                                                          |
| Windows installer           | `npm.cmd run desktop:build` (set `CARGO_BUILD_JOBS=2`)                                                                                                                                                                                                 |
| Interactive dev desktop     | `npm.cmd run desktop` — **do not run automatically during development**                                                                                                                                                                                |
| ML tests                    | From `ml/`: `.venv/Scripts/python.exe -m pytest -q`                                                                                                                                                                                                    |
| ML lint / format            | From `ml/`: `.venv/Scripts/python.exe -m ruff check .`; `.venv/Scripts/python.exe -m ruff format --check .`                                                                                                                                            |
| ML training                 | From `ml/`: `.venv/Scripts/python.exe -m harmonia_ml.training.runner experiments/E003-chroma-bass-tcn.json`                                                                                                                                            |
| ML evaluation               | From `ml/`: `.venv/Scripts/python.exe -m harmonia_ml.evaluation.report --manifest data/prepared/guitarset-v1/manifest.json --split validation --checkpoint checkpoints/E003-chroma-bass-tcn/best.pt --output experiments/results/E003-validation.json` |

Use `npm.cmd run test:e2e:production` after the frontend build to exercise bundled
assets under the native CSP. `node scripts/native-smoke.mjs` validates a freshly
built release in an isolated hidden WebView; it must clean up all processes and data.
`node scripts/prepare-runtime.mjs` prepares pinned local model/WASM assets (also
invoked by development/build hooks). ML export/evaluation instructions and frozen
artifact hashes are in `docs/training.md` and `docs/evaluation.md`.

Current live-MVP checks: `node scripts/live-native-probe.mjs <unused-report-path>`
and `node scripts/live-browser-native-probe.mjs <unused-report-path>` use the fresh
continuation-clean executable, real Windows capture and hidden isolated processes.
They do not launch the visible app, save captured PCM or run ML. Native evidence,
the verified executable hash and current limits are in `docs/live-mvp.md`.

Current primary check: `node scripts/search-native-probe.mjs <unused-report-path>`
uses an explicitly licensed Commons recording, whole-song worker, hidden native
playback and SQLite cache. See `docs/search-analyze-acceptance.md` for source,
timing, executable and unimplemented YouTube/recognition capabilities. This is
product-flow acceptance, not recognition-model promotion or final release.

The user has no private corpus: continue only with independently audited public
datasets. Do not assume permissions from annotation licenses or a hosting site's
blanket metadata; inspect embedded audio rights. E004's test is already evaluated:
never reuse it for model selection or tune against its reported failures.

HU33 acquisition/preparation and E007–E009 runs now exist; reuse their immutable
manifests/checkpoints, not a new download or overwrite. See
`docs/data/hu33-experiment-results.md`. Its test remains closed. E009 is a research
leader with inadequate minority-chord performance, not the product model.
LV-Chordia export passes procedural fixtures but fails a retained real-audio
numerical check; see ADR 003. Do not promote it, loosen tolerances or silently
chunk full-sequence normalization/recurrent inference.

D001 is a completed training-only, oracle-root representation diagnostic. Preserve
its protocol/config/source/checkpoint hashes; it is not a deployable model or a
reason to repeat E007–E009. The five-file isolated-guitar pilot is inspection-only,
not aligned training data. E010's predicted-root cascade passed its bounded
research gates and is being exported separately; it is not the production model.
Its fit/validation and ten-case CPU ONNX parity are complete: reuse retained
predictions, coefficients and exported artifact. Browser verification is separate.
D002 is a completed, failed train-only bass diagnostic; do not repeat its eight
fits or proceed to predicted-root bass from its failed guards. D003's separate
quality-capacity protocol reuses D001 controls; do not retrain completed controls.
B001 is complete and failed its short-transition guard; preserve its report and
keep the current segmentation default. New work requires a separate frozen protocol.

Derived features use worker-owned OPFS and Web Locks (ADR 004), never raw PCM.
Keep cache operations optional, bounded and cancellable without releasing a lock
while its I/O continues. `tests/e2e/feature-cache.spec.ts` checks actual worker reuse
and corruption/cancellation recovery. The hidden native smoke also checks reuse
across profiles and process restart; rebuild before running that smoke.

The fresh native target for this continuation is
`apps/desktop/src-tauri/target/continuation-clean`; pass its release executable to
`node scripts/native-smoke.mjs --exe <path> --report <path>` after rebuilding.
`npm.cmd run test:e2e:production` includes keyboard/high-DPI/reduced-motion flows
and two CPU-throttled profile campaigns. These are not actual low-end-PC results.

ML commands require the audited prepared corpus. Do not run locked-test evaluation
until model selection is frozen. Keep this table aligned with actual scripts.

Use scoped `AGENTS.md` files only for meaningful local differences (for example
ML data handling or native desktop constraints). This file remains the main guide.
