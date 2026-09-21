# Architecture

## Frozen-timeline practice views

`practice-library.ts` projects the completed canonical segments into unique chord
entries with occurrence/count/duration metadata. `practice-voicings.ts` resolves
standard-tuning guitar fingerings and compact piano MIDI voicings separately from
recognition. These pure domain functions never edit an analysis or infer from audio.
`practice-arrangement.ts` selects suggested voicings over the complete occurrence
sequence with bounded dynamic programming and cached transition costs. Song mode
preserves harmonic detail; Easy mode explicitly reduces colors and can recommend
a songwide guitar capo. Guitar shape pitches plus capo equal the sounding pitches;
piano remains in the displayed song key. Neither mode identifies the performer's
actual instrumental fingering. Original labels, bass and analysis stay intact.
`ConsumerPlayer` memoizes the arrangement by timeline and practice options, sharing
occurrence choices with the current inspector and grouped library. Playback updates
do not rebuild it. Occurrence buttons use the player's existing authoritative seek
path. `PracticeDiagrams` renders original accessible SVGs. Existing instrument maps
and corrections remain in the now-visible consumer practice section. No cache/model
version changes are needed for a derived presentation feature.

Guitar candidates come from pinned, licensed, pitch/finger-validated data with
explicit reductions or unavailable results. Piano candidates separate reachable
left/right hands rather than highlighting every octave of each pitch class. The
old pitch-class maps remain explicitly identified reference views. See
`practical-voicing-sources.md` for provenance, limits and arrangement measurements.

## Current native whole-song recognition (ADR010)

The product flow below remains frozen. Native primary and whole-song file analysis
now decode once, prepare mono 22.05 kHz PCM in the worker, call a bounded native
original LV-Chordia CPU runtime, and assemble its complete contextual regions
before freezing the playback snapshot. Automatic-tuning CQT, five bidirectional
models and a joint HMM replace flat DSP templates and post-decoder frame-local
bass. Conservative beat-supported evidence refinement preserves strong changes.
Playback has one clock/index for Current/Previous/Next and the following strip.
Manual strip exploration pauses following briefly; explicit seeking resumes it.

See [ADR010](adr/010-native-whole-song-regions.md) for boundaries, cancellation,
resource bounds, model/cache versions, runtime dependency and evidence tradeoffs.
Browser preview/earlier DSP profiles are retained. The original LV ONNX parity
failure is unchanged; no unverified export or new training was promoted.

## Exact acquired-audio playback (ADR009, current)

YouTube provides native-configured search and exact video identity. The native
`WholeSongAudioProvider` adapter acquires complete audio through local yt-dlp,
self-hosted Cobalt, then optional SaveAPI. Status-aware retries, circuit health,
bounded downloads, content hashing and owned-file cleanup remain outside recognition.
The frontend receives opaque cache tokens and bounded binary reads, never keys or
signed media URLs. Provider availability does not establish recording rights.

The acquired bytes are validated and decoded once at 22.05 kHz. Full-song contextual
analysis completes before the immutable timeline and local player are exposed.
The player uses those same bytes; its time only indexes the frozen timeline.
Audio caching avoids reacquisition, while analysis identity includes exact video,
audio fingerprint, pipeline/model/profile. Decoder rejection can try the next
provider; recognition or persistence failures cannot masquerade as acquisition errors.
Earlier metadata-only/watch-only restrictions below describe the superseded prototype.

## Consumer search and playback snapshot

`SongSearchController` debounces text changes, aborts superseded requests and
rejects stale results. Raw controlled-input text is retained through asynchronous
updates; trimming occurs only at the provider request boundary, preserving spaces
and the caret during typing. `ConsumerCatalog` composes native official YouTube metadata
search and the existing permitted-recording catalog while preserving every result's
actual provider and identity. Native code owns credentials and Google HTTPS; the
privileged frontend receives bounded metadata only. There is no credential form
or static autocomplete list. Missing configuration and unavailable audio are
separate from preparation failure.

`SessionController` prepares a full-song analysis before playback, freezes its
playback snapshot and persists exact source provenance plus provider-aware cache
identity. The search controller requests playback only after preparation completes
and the current generation remains active. Player time performs binary timeline
lookup, never recognition. Explicit corrections create a new frozen snapshot;
explicit re-analysis retains the prior record. Native key storage, playback-source
rights and cached-analysis identity remain separate responsibilities.

The consumer UI presents search, preparation and player states. Technical details,
local import and Windows live capture remain secondary. Unavailable YouTube audio
does not permit extraction or an unverified title-based match to another recording.
See `consumer-player-plan.md` for current tasks and acceptance.

## Current primary workflow (ADR007)

Search & Analyze selects a permitted recording, decodes the full track in the
existing bounded worker infrastructure, runs a separate non-causal whole-song
strategy, persists a complete versioned harmonic map and synchronizes it to the
player's authoritative position. Discovery/playback and analysis-input access are
independent contracts. The credential-free path uses explicitly licensed Commons
recordings; YouTube APIs expose metadata/player controls but no analysis PCM.
See `search-analyze-plan.md`. This supersedes the live-primary priority below;
existing Windows capture remains optional/experimental and is preserved.

## Workspace decision

Harmonia is a separate monorepo beside the existing GuitarScaleViewer repository.
That application focuses on live key detection and contains an existing user edit.
A separate product preserves its files and user work. The earlier file-first input
interpretation and subsequent live-primary correction are superseded by ADR007.
Harmonia still owns its optional Windows loopback capture (ADR006).

## Dependency direction

Presentation (`apps/desktop/src`) calls application use cases (`packages/application`).
Application depends on domain (`packages/domain`) and contracts. Infrastructure
(`packages/audio`, `packages/providers`, `packages/persistence`, and native Tauri)
implements those contracts. Domain imports no framework or infrastructure packages.

Optional live input is selected application/process-tree PCM, or explicit system-output
loopback, captured on a bounded native thread and analyzed continuously in a worker.
Capture and provider playback are independent contracts; the live session does not
require a File, saved track or finite duration. Source timestamps govern the live
timeline, and missing audio/discontinuity clears stale estimates. See ADR006.

The local-file provider owns media-element playback for both permitted catalog
recordings and local imports. `SongSearchController` owns source preparation;
`WholeSongAnalysisService` transfers complete PCM to a separate worker and performs
full-sequence Viterbi decoding with final traceback. Whole-song records are owned
by their whole-song session controller, including library corrections and cache
reuse; the legacy controller owns only older pipeline records. This prevents stale
duplicate library snapshots from replacing edits. Source credits are shown during
catalog playback; catalog metadata is not yet part of saved-record provenance.

The preserved legacy cancellable Web Worker performs DSP
feature extraction, probabilistic boundary scoring, chord/bass template recognition,
temporal stabilization, and timeline construction. Web Audio asynchronously decodes
browser-supported files. Rust owns native SQLite with migrations; browser preview
uses IndexedDB behind the same repository interface. Expensive tensors stay out of SQL.

Python/PyTorch owns research, common deterministic feature specifications, training,
evaluation, and export. Production model integration requires verified artifact
metadata, compatible features, and measured improvement over the retained DSP baseline.
No trained-model capability is advertised until it exists and has been evaluated.

The current experimental runtime bundles the frozen E004 ONNX model and local WASM,
checks the model hash and runs one CPU thread in the cancellable import worker.
Its measured shortcomings keep DSP as the default. The shared stabilization stage
accepts either recognizer strategy; learned boundaries are not enabled. See ADR 002.
Channel/duration preflight precedes decoding, but browser codecs are not a hard
allocation sandbox. Unverified containers require conversion to known mono/stereo formats.

The canonical chord object uses root pitch class, triad, fifth alteration, seventh,
extensions, alterations, added/omitted degrees, bass pitch class and spelling preference.
`none` and `unknown` are distinct states. Display and Harte strings are boundaries.
Analysis stores model/pipeline/profile/fingerprint provenance and correction history.

Manual chord/start/end edits form one domain-validated application transaction.
Contiguous neighbors share the moved boundary; neighbors across existing gaps stay
fixed. Every affected segment receives history in the same persisted record.
Failed validation leaves state intact; failed persistence retains the complete
transaction as unsaved for retry. Leading/trailing gaps remain unlabelled, distinct
from canonical no-chord. Display transposition never changes the edited source pitch.

## Concurrency and trust

Import increments a request identity and cancels the old worker. All late callbacks
check identity. Audio samples are transferred to workers. Playback position has its
own subscription; animation updates remain within the player workspace. Time lookup
is binary search using `start <= t < end`. Seek resets the visual position immediately.
Untrusted saved analyses are validated before use. No remote audio fetch or telemetry.

Derived DSP/model features live in worker-owned OPFS, separate from completed
analysis records. Versioned keys bind source fingerprint and decode/extraction
contracts. Checksums and exact shape/timing validation precede reuse. Web Locks,
bounded retention/cleanup and optional-operation deadlines protect concurrent
workers; cancellation terminates the owner without accepting stale results.
See ADR 004 and the production-browser/hidden-native reuse evidence.

The YouTube adapter accepts an injected official player factory in an isolated
context. It exposes playback and typed errors, never raw-analysis/offline access.
The live isolated probe does not connect remote scripts to the privileged app;
native SDK isolation and product connection remain separate acceptance work.
