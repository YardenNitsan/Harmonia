# Free-first whole-song acquisition

Latest user correction supersedes ADR007/008's metadata-only YouTube selection.
Search retains exact YouTube identity; a separate local/native acquisition service
returns complete audio, and the existing worker/player consume the same bytes.
No new ML studies, locked data access, visible GUI, paid subscriptions or uploads.

## Design and boundaries

1. Native WholeSongAudioProvider chain: local yt-dlp, configured self-hosted Cobalt,
   optional configured SaveAPI. Secrets/native tool paths stay outside React.
   Reject DRM/private/login-only inputs without bypass. Software redistribution
   licenses do not grant rights to recordings; provider behavior is not a promise
   of platform authorization. Current upstream APIs/licenses are recorded separately.
2. Native service validates IDs and bounded media, owns child processes, temp/cache
   paths and a small deterministic circuit breaker. Browser receives only opaque
   tokens/metadata and bounded binary reads. Cancel/reject releases owned resources.
3. Content-hashed audio cache avoids reacquisition on reopen. Existing analysis
   cache includes stable video identity, exact fingerprint, pipeline/model/profile.
   Source provenance becomes an explicit union of licensed catalog input and
   externally acquired media; do not fabricate a Creative Commons license.
4. Full decode once at existing 22.05 kHz, complete worker context, freeze before
   autoplay. Invalid decoder input can reject an acquisition and continue failover;
   recognition or persistence faults must not masquerade as provider failures.
5. Keep provider details in diagnostics. Main UX: selecting a video starts real
   preparation and opens the prepared local player. All providers failing produces
   one clean message. Existing corrections/library/local files/live remain intact.
6. Measure acquisition, decode, features, inference/scoring, temporal decoding,
   rhythm/key, total ready and cache reopen. Optimize measured bottlenecks only with
   exact-output parity; preserve existing recognition limits. No lower sample rate
   or unvalidated GPU/model change to win latency numbers.

## Execution

- [x] Record current provider/tool licenses and setup; install pinned local tools.
- [x] Native provider chain, status-aware bounded retries, health/circuit tests.
- [x] Bounded atomic audio cache, safe cancellation/cleanup, binary IPC reads.
- [x] App/source-provenance integration and complete-song barrier/cache regressions.
- [x] Stage measurements and short/normal/long production benchmarks.
- [x] Actual native acquisition/playback/cache/seek acceptance plus simulated failover.
- [x] Update operating/spec/architecture/acceptance, checkpoint and stop; report limits.

Agent boundaries: native acquisition modules/wiring; tool installation/provider
research; audio timing/exact-parity performance. Parent owns app/domain/persistence
integration and final acceptance. Existing untracked unrelated files stay untouched.

Verification and remaining limits: `acquisition-acceptance.md`. Final review found
a stale retry after delayed audio rejection; a red/green regression and revision
guard now protect a replacement song. All 877 TypeScript tests pass. Long-duration
latency evidence is procedural; real long-media acquisition was blocked by the
provider and is explicitly not claimed successful. Recognition quality is unchanged.
