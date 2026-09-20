# Search & Analyze prototype acceptance

This is a working architecture prototype, **not recognition-quality or final
release acceptance**. The visible desktop window stayed closed. The latest user
direction replaces live-primary priority; Windows capture and frozen ML remain intact.

## What works

- Search the labeled Commons open-recordings catalog without credentials.
- Select an eligible recording; revalidate source/license/size and obtain only
  that bounded original. Show actual acquisition/feature/decoding progress.
- Decode the complete recording in a separate worker with complete candidate
  emissions and global Viterbi traceback. Later evidence can revise early states;
  this does not run the live recognizer or smooth already-decided live output.
- Show a complete timestamped timeline before playback, current/previous/next
  chords, provisional global key, uncalibrated scores and alternatives. Playback
  and seeking look up this map against the media element's authoritative clock.
- Cache by exact audio fingerprint, pipeline/model version and profile. Reloading
  and reselecting reuses native SQLite analysis. Audio is reacquired for playback;
  Harmonia does not retain a raw-audio library.
- Preserve corrections on whole-song Library reopen/reimport. Legacy analyses
  retain their own controller. Local whole-song import is secondary; Listen Live
  is an explicitly experimental Windows mode.

## Actual source and timing

[Final hidden Windows probe](review-evidence/search-native-03.json) uses real network
metadata, media acquisition, worker DSP and WebView2. The [first probe](review-evidence/search-native-01.json)
predates library/navigation review fixes. The second probe predates the explicit
HTTP no-store policy. None is a labeled accuracy benchmark.

Input: [Greensleeves by Julien Grandgagnage, tenor saxophone with accompaniment](https://commons.wikimedia.org/wiki/File:Greensleeves-by_Julien_Grandgagnage-tenorsax.oga),
Commons page 28670309, 3,580,170 bytes, 122.142630385 seconds. Official metadata
declares **CC BY-SA 3.0**, credited to Julien Grandgagnage. The UI displays source,
license and attribution during playback. Input SHA-256:
`d1901ebeb1d0931c1653ece414d35f2d84820b30bde97325f0f78c9bdceebfd0`.
The audio was not saved in the repository or used for training.

| Hidden probe                        | Complete preparation in UI | Worker | Cached preparation |
| ----------------------------------- | -------------------------: | -----: | -----------------: |
| Initial build                       |                     4.67 s | 3.16 s |             0.31 s |
| Review fixes, before no-store       |                     5.81 s | 4.22 s |             0.40 s |
| Final executable, explicit no-store |                     4.96 s | 3.49 s |             0.55 s |

These are individual observations on this developer PC. The second run overlapped
other verification work; neither establishes weak-PC performance. The final probe
verified complete coverage to song end while paused at zero; an immediate
never-played **80-second** lookup; matching display after seek; advancing playback
and changing chords; pause; reload and native SQLite reuse with the same analysis
ID. A separate browser test verifies a never-played **2:37** lookup in a 180-second
procedural input. Owned native/WebView processes, debug port and isolated data were
cleaned up. No visible GUI was opened.

## Remaining limits

The real recording generated **559 segments in 122 seconds**, including complex
estimates not established as correct. This exposes remaining over-segmentation and
recognition limitations, not improved musical accuracy. No model was promoted,
custom model fitted or locked test opened. The decoder's first-order transition
score does not understand measures or song form; bass is still locally estimated.
Tuning normalization, sections, local keys/modulations, downbeats, richer temporal
models and calibration remain unimplemented. See [research](whole-song-recognition-research.md)
and [exact strategy](whole-song-prototype.md).

**YouTube is not the analysis source.** Official metadata search accepts a supplied
session-only API key and has adapter tests; no live credential-backed search was
available for acceptance. Selection shows an explicit missing-analysis-input state
and a normal YouTube watch link. Existing official player/time bridge research is
preserved, but integrated YouTube playback with aligned permitted analysis is not
connected. No stream extraction, hidden downloading, capture workaround or automatic
alignment of different performances exists. Commons has a much narrower catalog.

Catalog attribution currently belongs to the selected playback source, not saved
analysis/export provenance. Saved timelines have no audio; reselect the catalog
recording for attributed playback. Network access/current rights metadata remain
acquisition prerequisites. Recognition, actual weak-PC, signing and clean-machine
installer acceptance remain open.

Verification: 825 unit/integration tests, lint/types, Rust fmt/28 tests/clippy and
optimized native build pass. The 35-test production campaign plus a scoped
navigation fix verifies all 33 functional flows. Two existing CPU-throttled
cached-reimport timing gates remain open: isolated frame-p95 values152.8/152.9ms
exceed the unchanged150ms limit. This is recorded as a failing performance check,
not waived or counted as passing. The real hidden-native whole-song path passes.

## Executable

Run manually when desired:
`apps/desktop/src-tauri/target/continuation-clean/release/harmonia.exe`.
SHA-256: `085a67e482256ef0bb3b57ef13bec61354cdcf0f59158a7debb9a87456a6a582`.
This is the optimized prototype executable, not a new final-release installer.
Search **Greensleeves**, choose the Julien Grandgagnage recording, **Analyze song**,
then **Play** or seek anywhere in its prepared timeline.

Final checks are recorded in `implementation-plan.md`. To repeat the hidden probe,
use a new report path: `node scripts/search-native-probe.mjs docs/review-evidence/search-native-next.json`.
It refuses to overwrite reports and cleans up its hidden processes and data.
