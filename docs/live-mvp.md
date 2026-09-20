# Windows Listen Live MVP — verified 2026-09-20

The current Windows build works end-to-end with real process-loopback and endpoint
loopback audio. Listen Live is the default screen. File analysis remains secondary.
This completes the user's narrowed live-MVP scope, not the broader recognition or
full-release program. New ML work, provider expansion and release polishing remain
paused. No visible Harmonia window was launched during validation.

## Use on this machine

Built executable: `apps/desktop/src-tauri/target/continuation-clean/release/harmonia.exe`.
SHA-256: `c6a744d98ba2108362ccf53e6c7b181cf434439e99c9a3e234b65da93b5dfa52`.

1. Open Harmonia and choose an audio source in **Listen Live**.
2. Choose **Start listening** and play music in that application normally.
3. If the application is absent, start its playback and **Refresh sources**.
4. Use **Stop listening**, select another source, then start again to switch.

Application capture includes the selected process and its descendants. The system
choice captures one output device's mix. There is no automatic widening of capture
scope. Protected audio may be withheld by Windows. Captured audio is ephemeral,
processed locally and never saved. Spotify itself was not exercised in this run;
Chrome and whole-system output were exercised through actual Windows audio APIs.

## Native acceptance evidence

- [Controlled process test](review-evidence/live-native-mvp-10.json): two independent
  generated-tone playback processes; selected C, silence while the other source
  continued playing, resumed G, explicit switch to F#, source exit and stop.
  The UI retained the C / no-chord / G recent timeline. First C appeared 472 ms
  after Start. Received 984,000 frames, including 790,080 nonzero frames; at most
  two blocks per observed response and 960 frames per block. System mode was skipped
  in this particular isolation test because unrelated audio was active.
- [Chrome and system test](review-evidence/live-chrome-native.json): isolated,
  headless Chrome rendered generated audio to the real Windows output. Its actual
  audio session appeared in the picker; the packaged UI showed C, cleared when
  Chrome's AudioContext was suspended, and showed G after resume. Switching to
  explicit system output produced nonzero PCM and a live chord estimate. The endpoint
  mix may include unrelated local audio, so no exact chord-label assertion was made
  for that mode. No captured PCM was retained.
- Both reports verify hidden native startup, actual packaged worker execution,
  bounded transport, no reported errors, stopped owned processes, a closed debugging
  port and removal of the isolated data/profile. The harness terminates the hidden
  host after stop checks; its recorded exit code 1 is that cleanup termination.

The native runs exposed and fixed two real defects: a borrowed PROPVARIANT blob was
being freed twice, and constant-zero process-loopback device positions caused every
partial PCM packet to be discarded. Process capture now reports device position as
unavailable while retaining QPC/source-frame timing. Uncertain timestamps no longer
discard otherwise contiguous audio. Earlier failed diagnostic reports are retained;
one intervening probe run hit a helper-teardown bug, also fixed before acceptance.

## Automated checks

- 769 TypeScript unit/integration tests; ESLint and TypeScript checks passed.
- 28 Rust tests, including ownership, packet assembly, queue loss, timestamp handling,
  source identity, consumer expiry, cancellation and database regressions; strict
  Clippy and Rust formatting passed.
- 12 production-browser live/file/correction/accessibility flows passed. The four
  live flows passed again after the final source-picker help text change.
- Production frontend and optimized Windows desktop build passed. Changed live
  source files passed scoped formatting checks.

Native queue capacity is 12 blocks (240 ms); each response contains at most four.
Worker consumption permits one outstanding PCM operation. Missing consumers expire
after five seconds. PCM/resampling buffers are fixed, and recent history is bounded
to 120 seconds and 120 segments. These bounds also have deterministic tests.

## Reproduce

From the repository root, with existing dependencies installed:

```powershell
$env:CARGO_BUILD_JOBS = '2'
$env:CARGO_TARGET_DIR = (Join-Path (Get-Location) 'apps/desktop/src-tauri/target/continuation-clean')
npm.cmd run desktop:build -- --no-bundle
node scripts/live-native-probe.mjs docs/review-evidence/live-native-new.json
node scripts/live-browser-native-probe.mjs docs/review-evidence/live-chrome-new.json
```

Choose unused report paths; probes never overwrite evidence. They generate short
test tones, launch hidden/isolated test processes and clean them up. The first probe
uses the existing Python installation for standard-library tone generation only.
Neither probe runs ML experiments or accesses datasets.

Recognition uses the existing DSP baseline and remains imperfect. Scores are
uncalibrated. The timeline shows captured time, not a provider's song position;
upcoming chords and automatic track metadata are unavailable. The measured 472 ms
startup result is one controlled run on this machine, not a general latency or
real-song accuracy guarantee. Search & Play, model improvements, low-end hardware,
installer/signing and broader final-release gates remain outside this budget.
