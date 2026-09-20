# Search & Analyze implementation plan

Latest user correction supersedes live-primary instructions. Execute autonomously
in the current working tree, preserving all uncommitted work, live capture and
frozen research. No visible GUI. Stop after the prototype acceptance path passes.

## Feasibility and reuse

YouTube Data API provides search metadata and requires project credentials. The
official IFrame player provides playback time/seek, not a decoded PCM stream.
YouTube policies prohibit unauthorized audiovisual downloading and audio separation;
WASAPI recording is not an analysis-input workaround. Official player access must
not be gated on supplying another recording or completing analysis. Existing bridge,
provider tests and isolation ADR005 remain useful, but do not establish audio rights.

Sources reviewed: [Data API search](https://developers.google.com/youtube/v3/docs/search/list),
[IFrame API](https://developers.google.com/youtube/iframe_api_reference),
[developer policies](https://developers.google.com/youtube/terms/developer-policies),
[policy guide](https://developers.google.com/youtube/terms/developer-policies-guide).

The strongest credential-free end-to-end path uses Commons' official search and
file metadata APIs, accepting only supported audio files with explicit CC0,
CC BY or CC BY-SA license URLs, attribution and no additional restrictions. The
analyzed audio and played audio are the same downloaded recording. Never match a
different performance to a YouTube video by title/duration and claim synchronization.
This is an openly licensed recordings catalog, clearly labeled as such, not fake
YouTube results or a commercial-catalog guarantee. Downloading is explicit on
selection and bounded; no raw media is persisted or used for training.

[Commons reuse rules](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia),
[official search](https://www.mediawiki.org/wiki/API:Search),
[file metadata](https://www.mediawiki.org/wiki/API:Imageinfo).
Live API inspection already found a 122-second licensed Greensleeves performance
by Julien Grandgagnage (CC BY-SA 3.0); this is product-input feasibility, not data
acquisition for research. Per-result license metadata must still be checked.

Reuse canonical chords, complete Analysis timelines, player clock/seek, correction
UI, library repository, fingerprint/model/pipeline cache identity, decode budgets,
workers and cancellation. Preserve the existing short-window and model pipelines
as baselines. Add a separate versioned whole-song strategy with a complete-sequence
decoding/backtrace, not the live engine or its output smoothing. Investigate tuning,
beat/local-key/section context and mature ACR sources; distinguish implemented
estimates from unimplemented/downbeat/extended-quality claims. No new model fitting.

## Tasks and acceptance

- [x] Document source restrictions and mature whole-song recognition options; update
      AGENTS/product/architecture/ADR/active continuation before substantial code.
- [x] Add bounded Commons catalog/authorized audio acquisition and official YouTube
      metadata search with user-supplied session-only API key; never invent PCM.
      Test invalid licenses/URLs, size limits, network failure and cancellation.
- [x] Add genuinely non-causal whole-song worker/service with final sequence decode,
      whole-track context and versioned provenance. Test future evidence revising an
      earlier ambiguous chord, silence, complete duration, rich-chord retention and
      cancellation. Run a separately recorded baseline comparison, no locked tests.
- [x] Add Search & Analyze landing, real selection/preparation progress, attribution,
      full timeline/current/previous/next/key, authoritative seek/playback and cache
      reuse. Keep local import secondary and live capture explicitly experimental.
      Unavailable YouTube input is a truthful state, never a simulated analysis.
- [x] Test real network licensed selection → worker analysis → paused ready timeline
      → play/seek, including a never-played future timestamp and reopen cache reuse.
      Exercise errors/cancellation and preserve offline/live regressions.
- [x] Build optimized Windows executable, hidden native acceptance, document actual
      input/license, measured preparation/analysis time and remaining limitations.
      Checkpoint useful work locally; do not publish or launch a visible GUI.

Implementation boundaries: provider modules own search/rights/download validation;
application modules own selection and cancellation; audio modules own whole-track
processing; React renders workflow and existing timeline/player components.
Recognition accuracy and product-flow correctness are separate gates. Existing
E010/LV evidence is reused, not promoted or repeated to decorate this prototype.

Product-flow prototype acceptance is recorded in `search-analyze-acceptance.md`.
The broader phase/release is not complete: two legacy CPU-throttle timing checks,
recognition quality and integrated YouTube analysis/playback remain open. Stop
after the local checkpoint; do not infer authorization to launch the visible GUI.
