# Acquired-audio player acceptance — 2026-09-21

The free-first acquisition/player phase passes the automated product-flow checks
below. This is not recognition-quality acceptance or final installer release.
No visible application window was launched. Existing research, corrections,
local-file mode and experimental Windows capture remain preserved.

## What works

Real native YouTube Data API search updates after the 300 ms typeahead debounce.
Choosing the exact result automatically acquires complete audio through local
yt-dlp, validates and decodes it once, runs the existing non-causal complete-song
decoder, freezes the complete timeline, and starts local playback of those bytes.
There is no YouTube player in this acquired-audio path. Playback and seeking only
look up the immutable timeline. Provider names, keys and URLs stay out of the main
preparation UI. A failed chain produces one simple preparation error.

The ranked providers are yt-dlp, private/self-hosted Cobalt, optional SaveAPI.
yt-dlp and Deno are installed in this PC's per-user Harmonia tools directory.
The private Cobalt service at localhost:19000 is configured and was left running
as the optional fallback; use `scripts/cobalt-local.ps1 -Action Start` after reboot.
SaveAPI has no configured key and is skipped. No paid service is required.
See [provider setup and license implications](acquisition-providers.md).

## Actual hidden Windows measurements

Fresh optimized executable, isolated SQLite/audio cache and WebView2:

| Measurement                     | Monkeys Spinning Monkeys (130 s) | CHARGE (263 s) |
| ------------------------------- | -------------------------------: | -------------: |
| Complete yt-dlp acquisition     |                          2.602 s |        3.116 s |
| Container                       |                        Opus/WebM |      Opus/WebM |
| Decode/preflight/resample       |                           351 ms |         628 ms |
| Feature extraction              |                           618 ms |       1,262 ms |
| Chord scoring                   |                           308 ms |         945 ms |
| Full-sequence temporal decoding |                            14 ms |          19 ms |
| Rhythm/key                      |                             2 ms |           2 ms |
| Total analysis                  |                          1.419 s |        3.209 s |
| Selection to player ready       |                          4.425 s |        7.369 s |
| Cache reopen including search   |                          1.186 s |        1.748 s |
| Cache selection to player       |          not separately recorded |        0.851 s |

The normal-length native check overlapped the browser regression campaign, so
these are observed end-to-end timings, not an isolated statistical benchmark.
Short/normal/long 30/240/600-second procedural production benchmarks separately
measured 0.498/2.103/5.910 seconds to ready with no network acquisition. The
output-preserving optimization reduced the old 240-second result from 6.206 to
2.103 seconds; exact legacy chord/bass/score/boundary/alternative parity passed.
See [stage benchmarks](whole-song-performance.md). A 597-second real acquisition
attempt failed with HTTP 403/empty Cobalt output; no bypass was attempted and no
successful long real-song network benchmark is claimed.

Both native runs verified complete timeline coverage before the first media play,
automatic playback, pause/resume, ±10-second controls, progress seek directly to
2:00, previous/next controls, clickable progression and active highlight. The
130-second run's 2:00 seek assertion took 40 ms. Playback moved the real media clock
and changed the displayed chord. Analysis hashes stayed unchanged and no new
worker appeared. Reload/reselection reused SQLite analysis and audio cache with
zero additional provider attempts or recognition workers. Temporary probe audio,
WebViews and private debugging ports were removed on exit.

Evidence: [130-second native run](review-evidence/acquisition-native-01.json),
[263-second native run](review-evidence/acquisition-native-normal-01.json).
The first report's historical `audioSaved: false` means no audio retained after
cleanup; audio was temporarily cached during the test. Harness exit code 1 is its
intentional process termination after successful checks, not a startup failure.

The final reviewed build repeats the 130-second path successfully after fixing a
stale retry on cancelled rejected-media cleanup. Its click-to-ready was **4.458 s**,
analysis **1.437 s**, cached selection **0.319 s**, and 2:00 seek assertion **39 ms**.
See [final executable verification](review-evidence/acquisition-native-final.json).
The ten affected browser E2Es and all 877 unit tests passed again after that fix.

## Failover and validation

- Shared production chain test: primary 503 retries once, secondary corrupt media
  is rejected, tertiary succeeds. Actual order: yt-dlp, yt-dlp, Cobalt, SaveAPI.
- Auth-disabled/rate-limited providers are skipped; invalid requests stop;
  network failures advance without retry; long Retry-After opens a cooldown.
- Actual HTTP fixtures verify 401, 429, 400, 503, HTML/empty successful responses
  and source-specific CDN 403 without permanently disabling valid credentials.
- Native integration with an intentionally unavailable primary selected the
  running private Cobalt instance: 82,643-byte AAC/M4A, **486 ms**, successful.
- Browser test feeds actual corrupt bytes from the simulated primary, then a
  genuine 180-second WAV from the simulated secondary. Decode rejection triggers
  failover; only the valid complete file reaches recognition and playback.
- Exact fingerprint/video checks, bounded metadata/download/IPC/cache operations,
  active-read cache leases, corruption replacement and child-tree cancellation
  have native/unit regressions. Whole-song duration mismatch fails before inference.

Verified: 877 TypeScript tests; 56 default Rust tests (three opt-in integration
tests skipped), plus the explicit real Cobalt fallback test; all 41 production
browser E2Es; lint/typecheck/format, Rust fmt/clippy and optimized native build.

## Remaining limits

Acquisition availability varies by recording, region and upstream changes. No
cookies, authenticated-session extraction, DRM or bot-check bypass is implemented.
Tool capability does not establish rights to a recording or provider permission.
Cobalt returned empty output for some longer videos; SaveAPI has only simulated
contract/failover coverage until a key is configured. Its free allowance is finite.
Current decoder supports common AAC-LC M4A and Opus WebM alongside WAV/MP3/Ogg/FLAC;
raw ADTS AAC, HE-AAC, encrypted/multitrack or unknown layouts fail closed. Limits
remain 100 MB, 20 minutes and bounded decoded memory. No streaming acquisition/
decode overlap or new GPU/model path was added: measured allocation work was the
first bottleneck and its removal preserved outputs.

Recognition remains the existing DSP/full-sequence baseline, not a newly trained
or promoted model. Real examples still oversegment badly (1,385 segments in the
130-second music recording) and can overestimate complex chords. No new accuracy
score, reliable modulation/downbeat/meter/section/tuning claim is made. E010 and
LV-Chordia remain research artifacts; improving recognition is the next phase.

Executable:
`apps/desktop/src-tauri/target/continuation-clean/release/harmonia.exe`

SHA256: `8fba22b73e0a3f6d2973962aec49b92883c4eee767372382dc62a3b8d7d63447`.
Run this executable on this configured PC; older copies do not include acquisition.
No external executables were bundled in Git or a new installer. Distribution
notices and third-party dependencies require the separate packaging gate.
