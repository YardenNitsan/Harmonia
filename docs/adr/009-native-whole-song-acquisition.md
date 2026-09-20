# ADR009: Free-first native audio acquisition and exact-byte local playback

Status: accepted under the latest explicit acquisition correction. Supersedes
ADR007/008's metadata-only limitation as the product design, not their evidence.

YouTube Data API remains the search/identity adapter. WholeSongAudioProvider is a
separate acquisition boundary: native yt-dlp, configured self-hosted Cobalt, optional
SaveAPI. Native code owns credentials, bounded network responses, hidden child
processes, deterministic status-aware health/circuit breaking and exact-byte cache.
No paid dependency, public Cobalt instance, DRM/login/bot-check workaround or
automatic arbitrary executable/plugin download exists in normal playback.

The frontend passes only a validated video ID and reads owned opaque cache tokens
in bounded chunks. It constructs one local file used by both analysis and playback.
Native checksum is rechecked against those bytes before saved-analysis selection.
Full decoder failure invalidates that provider's acquired result and tries the next
provider. Recognition/persistence faults do not trigger unrelated acquisition.

Audio cache has count/size/age bounds and atomic publication; partial downloads are
temporary. Final analyses preserve video ID, content hash, pipeline/model/profile
and correction history. Provider names belong in provenance/developer diagnostics;
UI shows actual acquisition/preparation progress and a single failure message.

Acquired provenance is a distinct variant from the Commons licensed-source record.
It does not invent a media license, retain expiring signed URLs, or equate tool
software licensing with permission to download a recording. Deployment and
distribution implications are in `../acquisition-providers.md`.

Recognition reuses complete 22.05 kHz decoded PCM, shared features and the existing
non-causal decoder. Measured optimization must preserve outputs; no arbitrary ML
or sample-rate change is justified by acquisition work. Stage timing is observable
through bounded Performance measures and native diagnostics. Full timeline must
exist before autoplay; the playback clock only looks it up.
