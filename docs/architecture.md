# Architecture

## Workspace decision

Harmonia is a separate monorepo beside the existing GuitarScaleViewer repository.
That application focuses on live key detection and contains an existing user edit.
A separate product avoids inheriting system-audio capture and provider assumptions
that conflict with the new local-file analysis workflow. See ADR 001.

## Dependency direction

Presentation (`apps/desktop/src`) calls application use cases (`packages/application`).
Application depends on domain (`packages/domain`) and contracts. Infrastructure
(`packages/audio`, `packages/providers`, `packages/persistence`, and native Tauri)
implements those contracts. Domain imports no framework or infrastructure packages.

The local provider owns media-element playback. A cancellable Web Worker performs DSP
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
