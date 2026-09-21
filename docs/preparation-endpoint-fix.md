# Preparation failure: native endpoint rounding

User report: the official **פסטיגל Imagine - שיר הנושא** recording
(`mqvjNTx4gE4`, search duration 3:17) fails with the generic preparation message.
The isolated hidden Windows reproduction confirms successful yt-dlp acquisition
in 2.6–2.7 seconds, followed by successful native recognition into 74 regions.
Failure occurs in TypeScript timeline validation, before playback.

The complete decoded signal contains 4,337,920 mono samples at 22,050 Hz. After
native JSON transport, its final segment endpoint is `196.7310657596372`, while
JavaScript's exact sample-count division gives `196.73106575963718`. The difference
is `2.842170943040401e-14` seconds. The adapter's existing microsecond coverage
check accepts that insignificant difference, but the strict domain validator
rejects any segment end greater than the analysis duration. The search controller
then replaces the useful internal error with the generic preparation message.

The adapter now normalizes only the verified final endpoint to the authoritative
PCM duration before domain validation. Interior boundaries, chord identities,
model output, cache identities and the strict domain validator remain unchanged.
Materially incomplete/overlong timelines still fail the original coverage check.
This is a transport/assembly fix, not a new recognition experiment or relaxed
model-parity gate. Existing valid cached analyses need no invalidation.

Four regressions cover native rounding above/below the exact endpoint, unchanged
input and chord decisions, and rejection of genuine under/overcoverage. Both
rounding cases failed before the fix. The acquisition E2E additionally injects a
rounded native endpoint and verifies complete preparation, autoplay and cache reuse.
All 885 TS tests and both affected production E2Es pass; lint/typecheck pass.

Current diagnostics are not persistent per-search logs. Provider health/recent
failure categories live in native memory, and successful analyses persist in the
library; failed preparation details are not recorded in a durable event log.
For this investigation the original bytes/model result and failure trace were
retained privately under ignored `.superpowers/diagnostics/`. No personal audio,
credentials or raw PCM belongs in Git. The visible application and user library
were not used as test state.

The rebuilt optimized Windows executable passes the exact-song hidden acceptance:
real search, the identical retained WebM, complete 74-region native timeline before
autoplay, progression following, play/pause/±10-second/chord-click seeking, and
unchanged analysis during playback. Direct seeking to 120 seconds displays the
precomputed F chord in 9.7 ms. Preparation with already acquired audio takes
18.390 s on this run; cached selection takes 0.110 s. These are observations from
this investigation, not a new model/performance comparison. Test processes and
isolated state were cleaned up. See [native evidence](review-evidence/preparation-festigal-native.json).

Executable: `apps/desktop/src-tauri/target/continuation-clean/release/harmonia.exe`.
SHA256: `e596225e1d3a6a5470381c6e7b016c3018aa76ccb9a368629848fea3c614ebf5`.
This supersedes the binary hash in the original stabilization report; its recorded
recognition comparison and frozen inference sources remain unchanged.
