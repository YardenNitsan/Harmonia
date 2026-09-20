# Validation map

Run all commands from the repository root unless noted. See AGENTS.md for the full
command table and the implementation ledger for the current accepted snapshot.

- `npm.cmd test`: canonical chord/timeline, acoustic fixtures, Python/TS feature
  parity, model decoding, application races, repository recovery and provider errors.
- `npm.cmd run test:e2e`: headless Chrome, local synthetic WAV imports, no analysis
  mocks. Playback/seek/edit/reload, cancellation/replacement, corruption, loop edits,
  responsive screenshots and experimental-model provenance/integrity failure.
- `npm.cmd run build` then `npm.cmd run test:e2e:production`: the same flows against
  bundled assets with the desktop CSP, not the development transformation server.
- `node scripts/native-smoke.mjs`: rebuilt release executable, invisible isolated
  WebView2 and real native IPC/SQLite. It verifies DSP/ONNX, playback, edits and restart,
  then cleans processes/debug ports/test data. It refuses older binaries without the
  explicit hidden-validation protocol. Never substitute a visible development launch.
- Cargo test/fmt/clippy: schema migration, corruption preservation, transactional
  data and validation-mode isolation.
- From `ml/`, `.venv/Scripts/python.exe -m pytest -q`: split safety, preprocessing,
  structured labels, temporal metrics, export parity and exact interrupted CPU resume.

Performance E2E uses a generated30second WAV imported by filesystem path, then records
frame/long-task timing under4x CDP CPU throttle. Passing an in-memory base64 file through
Playwright added a ~380ms harness-side renderer upload stall; the file-path version
avoids that distortion. Remaining observed ~88ms long tasks are still reported. This
developer-machine simulation is not actual weak-PC or full startup/animation certification.

The continuation measures fast DSP and one-thread experimental CPU/WASM separately
through analysis, playback, rapid seeks, repeated resize, saved-analysis reopening
and cached audio reimport. JSON evidence is split into
`browser-performance-fast.json` and `browser-performance-accurate.json`.
It includes long tasks and maximum gaps rather than reporting only medians.
The keyboard campaign covers 800px/2x DPI/reduced motion, native controls versus
global shortcuts, named editor dialog, initial focus, focus containment, Escape
and focus restoration. Notation and Harte timeline export are exercised against
the original canonical chords even while the display is transposed.

Atomic correction flows cover both bounds, neighboring history, blank/invalid
input, first/last gaps, original-pitch editing under display transposition, reload
and live loop updates. The hidden native smoke additionally verifies both bounds
and all affected history in actual SQLite, including restoration after restart.

`tests/e2e/feature-cache.spec.ts` exercises actual OPFS reuse across profiles and
reload, exact E004 output parity, corrupt payload recomputation, and termination
of a lock-owning worker followed by orphan reclamation. The hidden native smoke
also verifies payload bytes/checksums and reuse across a native process restart.

`node scripts/youtube-provider-probe.mjs` tests the real injected adapter with the
official public IFrame SDK in an isolated headless browser. It verifies trusted-click
playback, advancing clock, pause, seek and disposal; its report retains source
hashes, errors and cleanup. It establishes neither native-shell connection nor
audible-output acceptance and never accesses Harmonia IPC/library data.

`node scripts/youtube-native-probe.mjs` repeats adapter control checks inside an
isolated hidden native WebView and verifies that remote-origin database commands
are rejected by ACL. It uses `scripts/hidden-native-harness.mjs` for guarded hidden
startup and cleanup. This is temporary diagnostic navigation, not a shipped
provider connection or permission change.

Screenshots/metrics live in `docs/review-evidence/`. Acoustic fixtures are numerical and
interaction evidence, not a real-song benchmark. Frozen real-audio ML reports are in
`ml/experiments/results/`; do not rerun test-guided model selection. Browser/native
hybrid recognition quality needs its own real-recording evaluation beyond Python frames.
