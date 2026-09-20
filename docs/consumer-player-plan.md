# Consumer search and prepared player

Latest user correction supersedes the prior Commons-only prototype acceptance.
Preserve checkpoint4ff6a28, live capture, all research and existing untracked files.
No visible GUI and no new ML experiments. Implement autonomously in the existing
workspace; the detailed user specification supplies design approval.

## Reuse and required changes

Reuse WholeSongAnalysisService/global Viterbi, SessionController, canonical Analysis,
SQLite/IndexedDB, clock/timeline/corrections, and licensed Commons acquisition.
Replace the primary developer search form with a single accessible combobox and
300ms debounced, cancellable requests to the configured official YouTube Data API.
Search returns current API results, never a static suggestion list. Superseded
requests must not replace newer suggestions. Escape/arrows/Enter support keyboard use.

Native code owns credentials and official YouTube HTTP requests. Frontend receives
only bounded sanitized metadata, never the key. Development reads ignored local
configuration; packaged Windows should support per-user native protected storage.
The user supplied a development credential. It was moved out of `.env.example`
into ignored `.env.local` and imported into per-user Windows DPAPI storage.
`.env.example` contains only an empty placeholder. Real API acceptance is measured
separately from explicitly labeled browser mocks.

Official search/player APIs still do not supply analysis PCM. Rechecked
[search API](https://developers.google.com/youtube/v3/docs/search/list),
[player API](https://developers.google.com/youtube/iframe_api_reference), and
[policies](https://developers.google.com/youtube/terms/developer-policies).
Do not gate access to the official YouTube player on analysis, rip streams, capture
them as a workaround, or falsely synchronize a different performance. YouTube
results with no permitted exact input have a clean unavailable-song message.
An internal licensed catalog can also supply playable recordings in the same
search service; their original source credits remain available without a provider
selector. These are clearly distinct recordings, not analysis of the YouTube video.

Separate search/preparation from a consumer player page. Selected playable input
is fully analyzed/cached, its result becomes a fixed playback snapshot, and only
then playback is requested automatically. If autoplay is denied, retain the ready
timeline and present Play. Player shows artwork/title/artist, large current chord,
previous/next, next-change countdown, full highlighted clickable timeline, seek
controls/time and a secondary details/correction area. No recognition runs while
playback advances/seeks. Manual corrections are explicit edits; no background
analysis silently changes a playing song. Re-analysis is explicit and stops playback.

Persist provider/stable recording ID/exact source identity alongside immutable
pipeline/model/fingerprint cache identity. Preserve corrections across reopen.
Do not silently cross-match YouTube and Commons recordings by title. Key/tempo/
meter/sections use only existing supported estimates; unavailable values stay absent.

## Work and verification

- [x] Native-only configured YouTube search, safe key handling, bounded HTTP/requests,
      sanitized errors, cancellation/stale guards and configuration documentation.
- [x] Consumer search abstraction/typeahead and provider-aware persisted source identity.
- [x] Whole-song preparation barrier, fixed snapshot and automatic playback with
      cancellation/replacement/cache/corrections tests.
- [x] Consumer search/loading/player UI, secondary local/Live/library functions,
      keyboard/responsive player and timeline interaction.
- [x] Production E2E: actual typeahead requests, stale ordering, selection/preparation,
      autoplay, pause/seek2:00, no worker/reanalysis during playback, cache reopen,
      unavailable-song/config states and no ordinary key/provider form.
- [x] Real configured YouTube search and permitted-source native acceptance where
      credentials/input permit; never replace this with a mock and call it live.
- [x] Update product/architecture/acceptance, record timing/provenance/limits, build
      optimized Windows executable, checkpoint and stop without visible GUI.

Evidence and scope: [consumer acceptance](consumer-player-acceptance.md). 859 unit
tests, 38 functional browser tests plus both unchanged CPU-throttled campaigns,
36 Rust tests, static checks and optimized build pass. Real YouTube UI typeahead
and the licensed recording's complete preparation/autoplay/cache/seek pass in a
hidden Windows process. Arbitrary YouTube audio analysis/integrated playback is
still unavailable; this is not full commercial-catalog or recognition acceptance.

Independent review found selected library revisions were lost during reacquisition
and local forced revisions could revert after restart. Both have failing-then-passing
regressions. YouTube results now publish before the supplementary catalog finishes.
Native testing found tiny proportional chord targets overlapped; zero horizontal
padding and a readable progression strip fix clicking without changing analysis.
No ML work, protected input, visible GUI or remote publication occurred.
