# ADR007: Search, permitted analysis input and full-song decoding

Status: accepted implementation direction under the latest explicit user correction.

Primary flow is Search & Analyze → acquire a permitted recording → decode the
complete track → global sequence analysis → complete timestamped map → synchronized
playback. Local-file whole-song analysis is secondary. ADR006 live capture remains
available experimentally, with no change to its privacy or source-selection rules.

Discovery/playback identifiers and analysis-input identity are distinct. A YouTube
ID grants neither PCM access nor permission to extract audio. Official YouTube search
and playback may be used with their required credentials/client identity, but missing
analysis input is explicit. Never secretly download or record a provider stream.
Do not assume that two recordings with the same song title have matching timelines.

The usable credential-free prototype searches openly licensed Commons recordings
through its official API, verifies supported file/license metadata, downloads only
the selected bounded recording, analyzes it and plays those same bytes locally.
Attribution/license/source are visible. User-authorized local media is another input.
The YouTube catalog cannot promise automatic chord analysis without a separate
permitted, correctly aligned recording or legally supplied timeline service.

A separate versioned full-song pipeline performs global decoding and backtrace after
seeing the complete recording. It can revise early ambiguous states using later
evidence. Deterministic features/temporal decoding are appropriate prototype tools;
model promotion and quality claims still require measured same-dataset evidence.
E010/LV research stays intact. Cached results key on exact audio fingerprint and
analysis versions, independently of player position. Future-time lookup and seeking
work before the player has visited those timestamps.

Tradeoff: the openly licensed catalog is narrower than YouTube's catalog, but it
provides an honest, executable end-to-end workflow without stream extraction or
credentials. See the [implementation plan and official sources](../search-analyze-plan.md).
