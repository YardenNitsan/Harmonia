# Harmonia: incomplete engineering checkpoint

Status on 2026-09-20: **INCOMPLETE — not final product approval or a production
release.** This report covers the categories required by master specification
section 85, but the acceptance campaign in sections 83–84 remains open.
Implemented features, a successful build, and narrow ML benchmarks do not
establish the requested general-song recognition quality or release readiness.
Do not launch or present the application as the completed product on the basis
of this checkpoint.

## Product implementation

The local-file workflow includes import, asynchronous decoding, worker analysis,
play/pause, seeking, speed and volume controls, a current-chord loop, a synchronized
timeline, neighboring chords, alternatives, piano/guitar pitch displays, chord
and boundary corrections, local library/favorites, and JSON export. Display
transposition changes notation, not audio pitch. Saved analyses can reopen
without audio; users must reselect the source file to listen again. The authored
synthetic demonstration is labeled and is not recognition evidence.

The default analysis profiles use browser DSP. The separately labeled
experimental profile now loads E004 through local ONNX Runtime Web CPU/WASM in
a worker, checks model hash and size, and uses bounded inference chunks. It
retains DSP novelty, rhythm and stabilization because the learned boundary head
failed evaluation. Runtime assets are bundled locally; production inference
does not require Python or the training GPU. Current import limits are 100 MB
and 20 minutes, verified mono/stereo WAV/FLAC/MPEG audio/Ogg headers, and platform
decoder support. Other containers currently require conversion.

This is a meaningful local engineering implementation, not the complete master
feature set. Provider integrations, broad musical reliability, advanced rhythm
analysis, richer export workflows and the full acceptance campaign remain
incomplete. See [known limitations](known-limitations.md).

## Architecture, patterns and rationale

The separate Harmonia monorepo preserves the adjacent GuitarScaleViewer product
and its existing changes. A framework-independent domain owns structured chords,
timeline validation and corrections. Application use cases orchestrate playback,
analysis and persistence. React renders the interface; infrastructure implements
the contracts. Tauri/Rust owns native SQLite, while browser preview uses IndexedDB.
Python/PyTorch is confined to research, evaluation and export.

Repository adapters isolate storage and schema changes. Provider adapters separate
playback capability from raw-audio availability. Recognizer strategies and a
feature/recognition/stabilization pipeline permit algorithm replacement. Composition
and dependency injection make those boundaries testable. Workers, cancellation
and request identities protect responsiveness and prevent stale results from
replacing another track. Playback time remains authoritative for chord lookup.

These choices preserve rich canonical chords even when an individual model has
a smaller vocabulary, keep heavy analysis outside React, and support local-only
operation. SQLite transactions and boundary validation protect saved records;
cache identity includes fingerprint, model, pipeline and profile. The architecture
and migration details are in [architecture](architecture.md) and
[database](database.md).

## Data, licenses, model and training

The only corpus used to train the current models is GuitarSet 1.1.0: 360 real acoustic
guitar recordings, 3.0468 hours, 4,320 annotated segments and 588 source labels.
The release is CC BY 4.0; authors, source DOI, license and transformations are
retained in the exported artifact's attribution. Other researched corpora were
not silently substituted or acquired without rights. See the
[dataset audit](data/dataset-audit.md).

Progression families 1/2/3 contain 120 training/validation/test tracks each.
Related performers and takes remain in their progression family, but performers
are shared across splits; this is not performer-disjoint validation. The training
set has 3,146 minor frames versus 65,016 in validation, a severe coverage shift.
Sparse guitar performances are not a representative benchmark for commercial
full mixes, vocals, drums, multiple instruments or rare jazz harmony.

The selected custom model, **E004-transposition-tcn**, uses 26 chroma/bass/energy/
flux features, a 64-channel projection and three temporal residual blocks with
dilations 1/2/4. Heads predict root, triad, seventh, absolute bass, four extension
bits and boundaries. Training used seed 20260920, 512-frame crops, three crops
per track, batch size 8, AdamW at 0.001, dropout 0.15, and early stopping within
12 epochs. Pitch augmentation transposes chroma and absolute targets.

E001 measured Python DSP; E002 used chroma-only TCN; E003 added bass/energy/flux;
E004 combined pitch augmentation with an epoch-propagation fix; E005 added
quality class weights. E004/E005 is a controlled weighting comparison; E003/E004
confounds augmentation and the worker fix. E004 narrowly wins the original
four-component validation criterion, without a significance claim. Its selection,
checkpoint, dataset and calibration hashes were frozen before test evaluation.

E006 ran the MIT-licensed LV-Chordia 1.1.0 five-model ensemble on a fixed validation
subset. Its notice and checkpoint hashes are retained. It performed better than
the custom model on that subset, but its CQT/ensemble/HMM runtime is not the
desktop ONNX model. Original training overlap was not exhaustively established.
BTC, ChordFormer, source separation and richer encoder proposals in
[research](research.md) are research directions, not completed implementations.

The current runner fixes persistent-worker epoch propagation, stores scheduler
and RNG states, and separates sampler randomness from worker startup. Exact
interrupted CPU resume is tested. Historical uninterrupted E004/E005 runs predate
the final sampler-stream separation, so current-code bitwise replay of those old
runs is not claimed. Histories, original hashes and limitations are preserved in
the [training record](training.md) and `ml/experiments/results/registry.json`.

## Accuracy, baselines and failure cases

The following held-out scores use 120 family-3 GuitarSet tracks, 169,056 frames
and 1.0931 hours, evaluated once after selection froze:

| Metric                            | Python DSP baseline |   E004 |
| --------------------------------- | ------------------: | -----: |
| Root accuracy                     |              31.22% | 38.06% |
| Bass accuracy                     |              21.22% | 32.03% |
| Reduced structural exact accuracy |               7.81% | 15.13% |
| Inversion-frame bass accuracy     |              15.85% | 16.38% |
| Boundary F1 at 50 ms              |              0.0402 | 0.0054 |

These are **Python prepared-feature benchmarks**, not measured browser DSP
accuracy. Nor are they end-to-end accuracy measurements of the desktop's hybrid
model/DSP segmentation. The browser DSP has different feature extraction and
recognition logic. At 22,050 Hz the exported model has numerical feature/logit
fixtures; WebAudio resampling for other input rates differs from the SciPy
training resampler, so full preprocessing equivalence is not established there.

“Reduced structural exact” compares root/triad/seventh/bass/extension bits, not
the full canonical chord grammar. The v1 target encoder loses alterations,
omissions and some implied shorthand intervals. Rich notation support and manual
correction do not prove acoustic recognition of those chords.

Advanced-chord performance fails the intended quality bar. E004 predicts major
triads throughout the test: minor recall is zero on 36,132 frames, and sus2,
sus4 and power recalls are zero. Positive recall for 6/9/11/13 extensions is
zero. On 45,284 inversion frames, reduced exact accuracy is 2.34%. At 50 ms,
the learned boundary head finds only five of 1,800 references and produces 40
false positives; Python DSP finds 57 with 980 false positives. Thresholded
learned boundaries are therefore not used for the app's segmentation.

On the identical 12-track validation subset, root/reduced-exact accuracy was
23.88%/2.56% for Python DSP, 33.08%/7.53% for E004 and 47.68%/22.61% for
LV-Chordia. This subset spans six performers, five styles and both playing modes,
but is too small to support a broad general-song claim. Full per-class, performer,
style, inversion and boundary evidence is in [evaluation](evaluation.md).

Only the E004 root component has a validation-fitted temperature, 1.1971407673.
Composition-separated validation audit ECE improved from 0.07103 to 0.06030.
Both partitions participated in model selection, so this remains descriptive
validation evidence. Whole-chord scores are uncalibrated; the current application
labels them as such. DSP similarity is not a probability, and the temperature
is not silently applied to the entire chord score.

## Resources and performance

E004/E005 training used one worker and an RTX 5070, with Torch allocator fraction
capped at 45%, about 50.3 MB peak tensor VRAM, and approximately 2.1 GB final
main-process RSS. Training-loop times were 29.82/27.12 seconds excluding setup.
Tensor VRAM excludes driver/context allocations; final RSS is not peak machine
memory or combined child-process RSS. A hard total-system memory guarantee and
low-memory stress recovery have not been established.

The selected float32 ONNX file is 233,441 bytes. ONNX Runtime native CPU output
matches PyTorch within 0.00000334 absolute error across tested sequence lengths.
Two-thread CPU inference for 2,048 frames took a median 2.20 ms. On a separate
1,875-frame sample, PyTorch CPU/CUDA medians were 2.16/0.72 ms. Partial int8 saved
only 571 bytes and changed about 0.6% of root/bass predictions; float32 remains
selected. These figures exclude audio decoding, feature extraction and runtime
startup, and are not browser-WASM or low-end-PC latency measurements.

The UI uses worker analysis and has headless interaction and viewport/screenshot
checks. No complete frame-time, animation-smoothness, high-DPI, screen-reader or
low-end hardware campaign is certified here. The integrating engineer must append
the final engineering command results, current build identity and measured browser
performance below; pending figures must not be inferred from Python inference.

## Earlier verification and security checkpoint

This section records the earlier checkpoint. Current continuation counts and build
evidence appear in **Public corpus continuation** below.

At that checkpoint the ML suite completed with 24 passing tests, clean Ruff lint/format, passing
dependency consistency, dynamic ONNX parity and matching frozen hashes. Two
upstream legacy ONNX-export deprecation warnings remain. Domain/application/audio
regressions, headless browser flows and native persistence tests exist. Earlier
frontend/native build successes do not certify the latest integrated snapshot.

Engineering verification on 2026-09-20: `npm.cmd ci` succeeded; formatting/check,
lint/typecheck and 551 TypeScript tests passed. The rebuilt production frontend
passed all 16 headless E2E tests under the native CSP. Rust has 14 passing tests
and clean fmt/clippy. The original ML suite passed 24 tests; HU33 pilot additions
subsequently brought it to 46, with two documented legacy-export warnings. New ML
research remains in progress and is not a promoted production model.

The packaged native executable passed a hidden WebView2 smoke covering actual DSP
and E004 inference, native SQLite, playback/seek, edits/favorites and restart. All
owned processes/debug ports/test data were cleaned. NSIS packaging succeeded;
a fresh no-cache native rebuild was then pending after presentation refactors.
See `review-evidence/native-smoke.json` for this earlier artifact; the continuation
below records the completed rebuild and its replacement artifact identities.

A 30-second synthetic file imported in approximately 435 ms under 4x CDP CPU throttle
on the development PC, with p95 frame interval 13.9 ms, max 118 ms and an 89 ms long
task. The earlier ~380 ms stall included Playwright's in-memory upload harness;
the recorded test now imports a real filesystem path. These figures do not certify
low-end hardware or the full animation campaign. npm production audit found zero
reported vulnerabilities. A green engineering suite does not close musical-quality,
independent security, clean-machine installation or release acceptance gaps.

Implemented trust boundaries include canonical saved-record validation, bounded
native records, transactional SQLite migrations, quarantining corrupt stored rows,
worker cancellation, stale-result protection, local model integrity checking and
a restrictive Tauri capability surface. The CSP permits local WASM/blob workers;
it does not authorize arbitrary remote scripts or a generic native shell. Audio
and corrections are local; no protected-stream capture or training upload is
implemented. This is a scoped engineering review, not an independent security
audit. Dependency/supply-chain review, complete corruption/OOM recovery, and the
full offline and failure campaign remain release work.

## Providers and release status

Local files are the implemented provider. Spotify, YouTube, Apple Music and
SoundCloud have no configured, implemented and live-tested connection here.
Missing credentials are only part of the gap: official SDK compatibility,
permissions, account eligibility and policy-specific behavior also require work.
The researched APIs do not grant a raw-audio analysis path for these providers.
No DRM bypass, stream ripping or hidden protected-audio capture is an alternative.
See [provider capabilities](provider-capabilities.md).

A Windows per-user NSIS installer has been rebuilt with recorded source/artifact
hashes and passing hidden startup/main-flow/restart smoke checks on this machine.
Clean-machine installation, upgrade/uninstall behavior and signing remain
unverified at this checkpoint. No code-signing identity, clean Windows machine,
non-Windows release validation or low-end hardware results are established.
The WebView2 download bootstrapper may require network access during installation.

Build and release commands, prerequisites, installer location and required checks
are in [build and release](build-release.md). Rebuild the frontend and installer
using the documented commands; do not distribute the result as an approved release
until the outstanding checks pass. The production GUI must remain gated by the
workspace's completion rule.

## Work required before product approval

Acquire a broader, lawfully usable real-audio corpus; version and repair the
training target representation; establish independent advanced-chord/inversion
and full-mix benchmarks; improve and measure temporal/boundary/rhythm inference;
and obtain a fresh test policy before further model tuning. Verify preprocessing
parity at supported sample rates and benchmark the actual browser/default DSP
pipeline. Complete the master feature audit, accessibility/performance/stress/
failure campaign, supported-provider work where authorized, supply-chain review,
signing and clean-machine release validation. Existing weak metrics must remain
visible while that work proceeds.

## Public corpus continuation (not model promotion)

The audited HU33 acquisition contains 23 recordings and 48 verified files; this
continuation reused them without downloading again. Strict masked preparation
has 78,350 valid training and 23,250 validation frames. Unknown spans are excluded,
not encoded as no-chord; raw-source hashes and train-only normalization are tested.
Compositions 19–24 remain test-locked and GuitarSet's test remains untouched.

E007/E008 measured unweighted versus class-weighted losses; E009 changed only
three to six temporal blocks. E009 leads the bounded validation study with root
59.02%, reduced structural exact 19.81%, and boundary F1 0.2372 at 50 ms, but minor
recall is 0.34% and inversion exactness 1.75%. No model was promoted. See
[preparation](data/hu33-preparation-report.md),
[experiments](data/hu33-experiment-results.md), and [evaluation](evaluation.md).

LV-Chordia first-network procedural parity passes through 8,192 frames after
explicit float64 normalization reductions; its five-network average and original
HMM pass through 4,096. Real-recording parity retains a failure on the second
preselected validation track, so production integration remains blocked. The
first real track preserves 15 decoded segments. An independent 128-frame local
browser/WASM probe passes under native CSP. No CQT port, full runtime parity or
real-song quality gain is inferred from that probe. ADR 003 records the decision.

The current app adds full/simplified/Roman/Nashville display modes and original
corrected-chord Harte timeline export. The named editor dialog now focuses the
symbol field, contains Tab navigation and restores focus on exit. Local playback
preserves volume across imports and rejects invalid controls. The isolated YouTube adapter now has playback/error handling and live browser
control evidence; product remote connections remain unimplemented; the provider matrix distinguishes that work from actual
account/registration prerequisites, including key-free public YouTube embeds.

Current product verification: 736 TypeScript tests, 98 Python tests plus later
scoped B001/LV checks, 14 Rust tests, TypeScript/lint/format and Rust fmt/clippy
checks, 25 production-browser flows,
and the rebuilt NSIS/native hidden-smoke campaign. Python's legacy export/tracing
warnings remain visible. The real-recording LV research acceptance probe exits
nonzero as documented; a green unit suite does not override that failure.
CPU-throttle evidence now covers fast and experimental profiles through import,
playback, seeking, resize and cache; it is not actual weak-PC hardware evidence.

Artifact identities and source hashes are in
`docs/review-evidence/release-continuation.json`; hidden startup/main flow/restart
passed in `native-smoke-continuation.json`, with owned processes and temporary data
cleaned. The unsigned installer has not passed clean-machine installation. The
visible desktop application was not launched, and final acceptance remains open.

Manual correction now saves the chord, start and end in one operation. Contiguous
neighbors move with shared boundaries and every changed segment receives history;
invalid bounds leave the timeline intact, while failed persistence retains the
whole correction as unsaved. First/last edits can leave explicitly unlabelled
edge spans. Gap-aware display/navigation does not invent N labels, and active
loops follow the updated interval. The native smoke verifies these timing/history
changes through actual SQLite persistence and process restart.

The read-only [release environment inventory](review-evidence/release-environment.json)
found a Windows 11 Home development machine with approximately32GiB RAM, no
discoverable clean-Windows validation command and no personal-store code-signing
certificate. It changed no host settings. [Remaining gates](release-gates.md)
distinguishes unfinished local work from actual environment/account dependencies;
boundary integration, model quality and secure provider connection remain local work.
Worker-owned OPFS feature caching now passes production-browser and hidden-native
cross-profile/restart reuse, integrity and bounded-recovery checks (ADR 004).

A separate [training-only representation diagnostic](data/hu33-representation-diagnostic.md)
found higher quality recall when the same features use an annotated root:
24.87%→45.21% macro recall across held-out training compositions. All eight fits
meet the frozen gradient criterion. Reference roots are unavailable at deployment;
this supports further root-conditioned research, not a product accuracy claim.
Validation/test arrays and the completed E007–E009 study remained untouched.

The five-file [isolated-guitar pilot](data/2026-09-20-real-recording-followup.md)
verified pinned source bytes and basic decoding without accessing its Test partition.
It remains inspection-only; aligned timing/bass labels and recording provenance
are unresolved. No full-corpus acquisition or training followed from that pilot.

The standalone B001 boundary strategy has31 behavioral tests and a completed
frozen comparison. F1@50ms improves0.099445→0.135922, but one additional missed
short transition fails its mandatory guardrail. The production baseline remains.

E010 follows D001 with actual predicted validation roots. It improves pooled
triad macro recall20.25%→27.02%, minor recall0.34%→53.53% and reduced structural
exact19.81%→25.41%. Major recall and wrong-root quality regress; augmented/sus4
remain zero. Its research criterion passes, while model promotion remains gated.
The exact cascade now passes ten CPU ONNX parity cases, preserving every retained
validation decision. Browser WASM verification is separate and pending; the
product still uses default DSP and explicitly experimental E004. D002's relative-
bass diagnostic completed with all eight fits converged, but fails the inversion
gains and root-position guard. A separately frozen training-only D003 diagnostic
tests a nonlinear quality residual while guarding minor/diminished recall.
See [evaluation](evaluation.md).

The isolated YouTube adapter's50 tests and actual-SDK browser/native probes
verify controls. A remote page was explicitly denied list/save/delete native
commands, and its isolated database sentinel was unchanged. All owned processes,
ports and temporary data were cleaned. The strict proxy/endpoint message bridge
adds46 passing tests; browser embedding, product connection and installed-app
identity acceptance remain separate work. Completed scientific
artifacts and locked tests remain preserved.
