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

Screenshots/metrics live in `docs/review-evidence/`. Acoustic fixtures are numerical and
interaction evidence, not a real-song benchmark. Frozen real-audio ML reports are in
`ml/experiments/results/`; do not rerun test-guided model selection. Browser/native
hybrid recognition quality needs its own real-recording evaluation beyond Python frames.
