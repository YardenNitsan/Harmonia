# Known limitations and open acceptance gates

This is an **incomplete engineering checkpoint**, not a list of cosmetic issues
on an approved product. The master specification's professional recognition,
complete feature and release criteria remain unmet. The integration test/build
ledger belongs in [final report](final-report.md); numerical ML evidence is in
[evaluation](evaluation.md).

The **Search & Analyze prototype** uses permitted Commons recordings and a
non-causal whole-song DSP decoder. Product-flow correctness is verified separately
from accuracy; the real 122-second probe still produced 559 segments, including
implausible complex chords. Global tuning, sections, local-key/modulation analysis,
downbeats and learned harmonic context are not implemented. Whole-song global key
and beat estimates remain provisional. See [prototype evidence](search-analyze-acceptance.md).

YouTube offers real native-configured typeahead and a normal watch link. Live
credential-backed search is verified; the key never enters the primary UI or
frontend JavaScript. See [consumer evidence](consumer-player-acceptance.md). Integrated YouTube
player synchronization and a permitted matching analysis-input source are not
connected. No general commercial-song analysis capability is claimed. Commons is
a limited open-recordings catalog; rights metadata is revalidated on selection.
Catalog credits are shown with playback but are not persisted as library/export
provenance. Reopening a timeline alone has no audio; reselect the catalog recording
to restore playback with attribution and exact-content cache reuse.

Two preserved legacy CPU-throttle performance tests currently fail cached-reimport
frame-p95 (152.8/152.9ms versus the unchanged150ms ceiling on the isolated run).
Their functional playback/cache assertions pass. This remains an open performance
gate, not evidence of physical low-end-PC readiness.

The narrower **Windows Listen Live MVP passed native acceptance**; see
[live evidence and usage](live-mvp.md). Real Chrome and system output work through
WASAPI. This does not establish song-level recognition accuracy, Spotify-specific
compatibility or full-release readiness. Live timing is capture-relative; upcoming
chords and provider track metadata are unavailable. It remains optional/experimental;
the latest correction supersedes the earlier live-only budget. No arbitrary new
model training or full-release polishing is part of this prototype phase.

## Recognition quality and representation

- The default browser DSP recognizer has no broad real-song accuracy benchmark.
  The reported Python DSP uses a different feature/recognition implementation.
- The optional E004 ONNX model is trained only on sparse GuitarSet acoustic-guitar
  recordings. Its held-out root accuracy is 38.06%, reduced structural exact
  accuracy 15.13%, and inversion bass accuracy 16.38%. These do not establish
  commercial full-mix quality.
- E004's test minor, suspended/power and positive extension recalls are zero.
  Major-triad accuracy largely reports the majority-class rate. Altered dominants,
  rich extensions, half-diminished harmony and other advanced classes have not
  passed the requested acoustic acceptance campaign.
- The application's canonical chord model is richer than the ML targets. The v1
  training encoder loses alterations, omitted degrees and some implied shorthand
  intervals. “Reduced structural exact” is not full canonical-chord accuracy.
- Learned boundaries find only five of 1,800 test references at 50 ms with 40 false
  positives. The application uses DSP novelty and stabilization instead, whose
  full-mix timing quality is also unestablished. Segmentation remains heuristic.
- Tempo, beats and key are provisional DSP estimates. Meter/downbeats are unknown;
  variable-tempo, syncopation and bar-alignment acceptance is incomplete. Source
  separation and richer contextual models are research proposals, not implemented
  accuracy features.

## Model integration and evidence boundaries

- Worker-based ONNX CPU/WASM integration exists and is experimental. Python/native
  ONNX frame metrics do not measure the browser's full model/DSP decoding pipeline.
- Feature parity fixtures cover audio already sampled at 22,050 Hz. WebAudio's
  conversion of other rates differs from training's SciPy polyphase resampler.
  Full preprocessing equivalence at other sample rates is not established.
- The fitted temperature concerns only root probabilities. Whole-chord scores and
  other heads remain uncalibrated; the UI presents uncalibrated model scores.
- LV-Chordia performs better on a small fixed validation subset, but its CQT,
  five-model ensemble and HMM are not integrated into the app. Training-corpus
  overlap was not exhaustively established. It is not the bundled ONNX artifact.
  Export research now passes procedural fixtures, but a real validation recording
  exceeds the unchanged logit tolerance. The complete production port remains gated.
  HU33 E010 improves minor recall to53.53% and reduced exact to25.41%, with major
  recall declining to71.90%. Its ONNX CPU parity passes, but browser parity,
  production preprocessing and final quality selection remain open. D002's
  training-only relative-bass study fails its inversion/root-position guards.
- Family-disjoint GuitarSet splits retain performers across splits and have severe
  quality imbalance. There is no broad performer-/artist-disjoint commercial-song
  benchmark, multiple-seed significance analysis or comprehensive learning curve.
- The selected test was evaluated once after freezing. It must not become a tuning
  set. Historical E004/E005 checkpoints precede the final sampler-stream separation;
  exact historical replay with the current runner is not claimed.

## Local workflow and feature coverage

- Novelty scores are computed, but independent boundary-candidate split/merge
  refinement is not integrated. B001 improved precision but failed its mandatory
  short-transition guard and substantially reduced recall; it was not promoted.
  Worker-owned OPFS now reuses versioned DSP/model features with bounded cleanup;
  decoding still runs when no completed analysis is available. See ADR 004.

- Audio imports are limited to 100 MB and 20 minutes; decoding depends on platform
  codec support. No claim covers arbitrary corrupt, protected or unusual codecs.
- Saved analyses and corrections persist, but source audio is not embedded. Users
  must reselect the file after reopening a saved analysis to resume listening.
- Display transposition does not pitch-shift audio. Guitar/piano pitch displays
  are not a complete ergonomic voicing/fingering or score-generation engine.
- JSON and Harte .lab timeline exports are implemented, along with full/simplified,
  Roman and Nashville display modes. Degrees use a major-reference tonic and do
  not infer modulation or functional harmony. Other musician and advanced
  library workflows require an explicit feature audit before claiming completion.
- The authored synthetic demo and procedural acoustic fixtures are interaction/
  numerical checks, not evidence of real-song accuracy.

## Providers, privacy and recovery

- Live Windows audio is the primary input; local files remain the connected offline
  playback provider. An isolated YouTube IFrame
  adapter implements playback controls and explicit SDK errors, with 50 unit tests.
  A strict message bridge adds46 tests; isolated browser/native SDK feasibility
  passed, including native database ACL rejection. Product connection, final
  embedding/navigation restrictions and installed-client identity remain open;
  this does not establish catalog/search or other remote-provider integrations.
- Supported remote playback APIs do not authorize Harmonia to analyze raw protected
  streams. No ripping, DRM bypass, unrequested capture or training-data acquisition
  from these providers is implemented or approved.
- Local-only processing, record validation, model hashing and restricted native
  commands reduce risk but are not an independent security/supply-chain audit.
  Complete corruption, unavailable-model, offline, OOM and provider-failure recovery
  scenarios remain part of the final campaign.

## Performance, UI and release

- Import currently verifies mono/stereo WAV, FLAC, MPEG audio and Ogg channel
  headers before decoding. M4A/AAC/AIFF/WebM and files with unusually large leading
  metadata may require conversion. A post-decode check cannot impose a hard OS
  memory cap against malicious or contradictory compressed metadata; bounded native
  streaming decode remains a hardening task.

- Native ONNX/PyTorch timings exclude decode, features and startup. They are not
  browser-WASM, end-to-end desktop or low-end-PC measurements. A hard total-system
  memory ceiling and stressed recovery are not established by allocator settings.
- Screenshots and headless flows do not certify animation frame times, high-DPI
  behavior, screen-reader accessibility, long-session stability or every keyboard
  flow. The full UI/performance/stress campaign remains open.
- Existing Windows packaging is not signed or verified through clean-machine
  install/main-flow/upgrade/uninstall tests. No non-Windows release or
  low-end hardware result is established. Installer WebView2 bootstrap may need
  network access, and placeholder branding assets need release review.
  The continuation's rebuilt binary and installer now have source/artifact hashes
  in `docs/review-evidence/release-continuation.json` and a passing hidden native
  smoke report; these do not establish clean-machine install or release approval.
- The complete acceptance gates must pass before the production GUI is presented
  as the finished application. A successful build or passing unit suite does not
  override this requirement.
