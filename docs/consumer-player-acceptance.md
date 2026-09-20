# Consumer search and prepared player acceptance

The consumer flow works for eligible licensed recordings. Real YouTube typeahead
works, but **arbitrary YouTube Search → Analyze → integrated playback remains
unavailable**: no permitted exact analysis audio is connected for those videos.
This checkpoint is not recognition-quality approval or final release acceptance.
The visible desktop GUI was never launched.

### Search bug follow-up

[Native follow-up evidence](review-evidence/consumer-native-03.json) verifies the
user-reported Guns N' Roses / Sweet Child O' Mine search against the real API and
rebuilt Windows executable. Numeric HTML references such as `&#39;` now display
as apostrophes; channel/title decoding remains bounded, plain-text, single-pass
and redacted. Rows show **Analyze & play** or **Watch only · no chord analysis**
before selection. Search clearly reports when it found no analyzable recordings.
The separate licensed catalog now has ten seconds instead of two to respond;
YouTube suggestions still publish immediately. These changes do not connect a
YouTube analysis source or enable chord playback for those videos.

861 unit tests, 37 Rust tests and all nine affected production browser tests pass;
lint, types, formatting, clippy and optimized build pass. Hidden native validation
also rechecks full licensed-song preparation (4.40s), autoplay, late seeking and
SQLite cache (0.82s), with complete cleanup. The following earlier measurements
are retained as checkpoint evidence rather than overwritten.

## Verified behavior

- One search combobox, 300 ms debounce, real native YouTube requests without Enter,
  thumbnails/channel/duration, keyboard navigation and stale-response protection.
  Native YouTube results publish immediately when received; the supplementary
  licensed catalog can finish later. No static suggestions, provider dropdown or
  ordinary API-key textbox.
- Select an eligible recording → genuine acquisition/analysis progress → complete
  validated frozen snapshot → automatic player/playback. Autoplay denial keeps
  the prepared timeline and offers Play. Cancellation blocks late analysis/play.
- Current/previous/next chords, remaining-change time, play/pause, ten-second
  controls, progress-bar seek, complete proportional timeline and readable
  clickable chord progression. Both views highlight the current segment.
- Playback uses authoritative media time and timeline lookup. No recognition
  worker starts or analysis changes while playing/seeking. Explicit corrections
  create a new snapshot; explicit re-analysis prepares a separate saved revision.
- SQLite/IndexedDB cache binds provider, stable recording ID, canonical original
  URL, byte fingerprint, pipeline, model and profile. Credits persist/export with
  provenance. Cached reopen skips recognition but reacquires media for playback.
  Choosing an older library revision preserves that exact revision/corrections;
  ordinary reopening after re-analysis prefers the newest revision.
- Local whole-song import, library/favorites/corrections and experimental Live
  Listen remain. No ML experiment, frozen evaluation or model promotion changed.

## Real source and timing

[Initial consumer native evidence](review-evidence/consumer-native-02.json) exercises the then-fresh
release executable, actual Google API, Commons API/original media, whole-song
worker, real hidden Windows WebView2 playback and isolated native SQLite.

Search provider: **YouTube Data API v3**, with licensed **Wikimedia Commons**
recordings added behind the same search service. Playback provider for analyzed
recordings: **local HTML media element in WebView2**, playing the exact acquired
bytes. No YouTube player is integrated for analyzed videos.

Analysis input: [Greensleeves by Julien Grandgagnage, tenor saxophone with accompaniment](https://commons.wikimedia.org/wiki/File:Greensleeves-by_Julien_Grandgagnage-tenorsax.oga),
Commons page 28670309; **CC BY-SA 3.0**, 3,580,170 bytes, 122.142630385 seconds.
Fingerprint: `d1901ebeb1d0931c1653ece414d35f2d84820b30bde97325f0f78c9bdceebfd0`.
Rights are checked before acquisition. No input audio is persisted or used for
training. No ripping, capture workaround, DRM bypass or performance substitution.

| Measurement on this machine                                       |    Time |
| ----------------------------------------------------------------- | ------: |
| Typing `bou` to actual YouTube suggestions, including debounce    | 1.343 s |
| Selection to prepared player/autoplay                             | 4.426 s |
| Full-song worker                                                  | 2.546 s |
| Cached selection after page reload, including media reacquisition | 0.825 s |
| Direct 2:00 seek and matching display assertion                   | 20.9 ms |

The worker finished before the first playback request, with coverage from zero
to song end. The native 2:00 seek correctly returned the precomputed **N** in the
recording's ending silence. A separate 80-second seek followed actual playback
and changing chord labels; browser tests exercise 2:00 and 2:37 on a 180-second
procedural input. These check synchronization, not chord correctness. SQLite
analysis hashes stayed unchanged; cached reload started zero analysis workers.
Native processes, debug port and isolated data were cleaned up.

The [initial native probe](review-evidence/consumer-native-01.json) found overlapping
click targets for very short segments. Timeline padding was corrected and a
readable progression strip added. The retained failure is not represented as a
pass. [Search screenshot](review-evidence/consumer-search.png) and
[player screenshot](review-evidence/consumer-player.png) came from hidden testing.

## Credentials and limits

The user-supplied key was moved from `.env.example` to ignored `.env.local` and
imported into Windows CurrentUser DPAPI storage. `.env.example` contains only
`YOUTUBE_API_KEY=`. Native requests own the key; frontend CSP excludes Google API
connections. A scan confirmed the real key is absent from tracked files, built
frontend assets and the release executable. Nothing was pushed to GitHub.
See [configuration and key restrictions](youtube-configuration.md).

Official YouTube search/player APIs do not expose an analysis PCM stream.
YouTube selections therefore display an unavailable-song message and normal watch
link, not a fabricated timeline. The licensed catalog is much narrower than
YouTube. General commercial-song coverage needs a licensed exact input or licensed
aligned analysis service; metadata/API-key access does not solve this.

Recognition still uses `harmonia-whole-song-v1` / `dsp-whole-song-v1`: complete
feature/candidate sequence and global Viterbi traceback. It is genuinely non-causal,
but this recording still yields **559 segments**, including implausible complex
chords. Tuning normalization, sections, local key/modulation tracking, downbeats,
advanced temporal models and calibrated confidence remain open. Global key/tempo
are provisional. E010/LV-Chordia research is preserved, not promoted by this UX work.

## Verification and executable

859 TypeScript unit/integration tests, all 38 production functional browser
tests and both unchanged CPU-throttled campaigns pass. Rust formatting, 36 tests (one deliberate network test ignored in the
ordinary suite), clippy with denied warnings, lint, type checking and optimized
Windows build pass. The separate deliberate native Google API test returned 12
results with durations; the final hidden probe additionally proves actual UI
typeahead. Mocked browser API tests are labeled as mocks.

Broader recognition, actual low-end-PC, installer/signing and final release gates
remain open. Historical CPU-throttled failures are retained in checkpoint4ff6a28
and the implementation ledger; the current isolated rerun passes without changing
thresholds. This observation does not establish a performance improvement or
actual low-end-hardware acceptance.

Run when ready:
`C:\Users\yarde\Documents\codexp\Harmonia\apps\desktop\src-tauri\target\continuation-clean\release\harmonia.exe`

Current SHA-256: `b81821a4188714cc7cd045b8140fe448b7f91e0ffe9ddccf93ac28ea8f1e14e7`.
This executable was verified hidden and left closed.
