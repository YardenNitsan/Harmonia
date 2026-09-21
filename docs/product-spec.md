# Harmonia product specification

## Song practice library

The completed song page exposes practice tools without an accordion: key/tempo,
saved state, refinement/export, notation, transposition, speed, volume and the
current chord inspector. A visible Chord Library derives unique harmonic entries
from the frozen final timeline in first-appearance order, with occurrence counts,
total duration and timestamp seek buttons. Repeated chords share a card; inversions
remain distinct. Guitar boxes and compact piano voicings are practice references,
not detected fingerings. Unsupported/reduced voicings are identified honestly.
Transposition changes the practice display only; the saved analyzed labels and
audio remain intact. No recognition or timeline mutation occurs during playback.
See `practice-library-plan.md` and `practice-recognition-review.md`.

Default **Song voicings** considers neighboring harmony to suggest reachable
guitar positions and piano voice leading. These are arrangements, not verified
transcriptions of the original performer. **Easy practice** explicitly identifies
reduced played shapes while retaining analyzed chord labels. It compares capo
frets 0–7 across the song and recommends a capo only when useful; users may override
it. Show both sounding chord and played guitar shape. Piano stays in the displayed
song key, with separate left/right hand diagrams. Capo does not transpose playback.
The current inspector and library share the same arrangement; an entry may show
the most-used occurrence voicing while other occurrences use nearby alternatives.

## Frozen stabilization requirement

Preserve the acquisition/search/local-playback flow. A completed timeline must
represent persistent musical regions, not frame-local bass or template flicker.
Complex decorations and inversions require supporting component/temporal evidence;
weak brief contradictions may merge only with corroborating surrounding/beat
context. Strong short/offbeat changes must remain possible. Do not impose a
song-specific progression or fixed chord-count/one-chord-per-measure rule.

One authoritative `audio.currentTime` indexes the immutable segments. Hero neighbors,
progression highlight and centered follow-scroll share that index for play, pause,
resume, all seek controls and chord clicks. Brief manual exploration must not
fight scrolling. Recognition never reruns during playback. Current measured
implementation and limitations: [stabilization acceptance](stabilization-acceptance.md).

Latest correction: **YouTube typeahead → native free-first audio acquisition →
complete whole-song analysis → fixed timeline → local playback of those exact
bytes**. Follow `acquisition-plan.md` and ADR009. yt-dlp is primary; self-hosted
Cobalt and optional configured SaveAPI are replaceable fallbacks. Native secrets,
bounded caches/cancellation, no required paid converter, no recognition during
playback and measured click-to-ready/cache latency are acceptance requirements.

## Current acceptance: consumer prepared player

The latest correction requires a single prominent song/artist search field with
300ms debounced real configured YouTube search results as text changes. No Enter
requirement, primary provider selector or API-key field. Search credentials stay
in native configuration; developer `.env.local` is ignored and examples contain
no real key. A native per-user protected configuration supports packaged Windows.

Selection prepares the entire permitted recording, freezes a complete timeline,
then opens the player and requests playback automatically. Artwork/title/artist,
large current/previous/next chords, controls, progress seeking and a complete
highlighted clickable progression form the main interface. Playback only looks up
the prepared snapshot; no recognition is triggered by playback or seeking.
Corrections are explicit user edits. Re-analysis is explicit, stops playback and
preserves prior edited records. Source/provider/content and pipeline/model identity
determine cache reuse. Reopening a source-backed library record restores playback
without a manual file prompt.

YouTube discovery does not confer analysis-audio rights. Unavailable results get a
clean song-unavailable message; a separate licensed catalog supplies playable
recordings in the same consumer search. Different performances are never silently
substituted or synchronized. Local files and Live capture remain secondary.
Follow `consumer-player-plan.md`; the earlier prototype acceptance below is historical.

## Latest product correction: Search & Analyze

The primary experience is song search → permitted whole-song audio input → real
analysis/preparation → complete harmonic timeline → synchronized playback and seek.
Use full-song past/future context and final decoding, not rolling live estimates.
Distinguish provider discovery/player access from rights and technical access to
analysis audio. Commons licensed recordings provide the credential-free prototype;
YouTube APIs alone do not provide its analyzable recording. See ADR007 and
`search-analyze-plan.md`. Local import is secondary, Listen Live experimental.
Older live-primary wording below is superseded; its implementation is preserved.

Authority: `../../instructions.txt`, sections 1–89, plus the user's persistent-guide
request and latest Search & Analyze correction (ADR007), which supersedes the
intermediate Listen Live correction (`live-input-correction.md`).

Build a local-first Tauri 2 / React / TypeScript desktop music-analysis application.
The optional experimental Listen Live workflow selects a Windows application's playback or
explicit system output, play music normally, and recognize its exposed PCM stream
continuously without importing a file. It displays current/recent chords with honest
capture timing, latency and uncalibrated confidence. Upcoming content is available
only when actually known. Optional authorized file analysis retains play/pause/seek,
and synchronized previous/current/next chords,
a proportional waveform/chord timeline, musical position, and editable harmony.

Use a canonical compositional chord model capable of extended and altered chords
and inversions. Separate probabilistic harmonic-boundary detection from chord
recognition, retain frame evidence, and permit later segment splits and merges.
Playback position is authoritative and timeline lookup uses half-open intervals.

Build the deterministic local player and DSP baseline first. Establish legal data,
pretrained baselines, reproducible structured supervised models, learned boundaries,
calibration and real-recording evaluation before claiming recognition quality.
Provide inspectable alternatives and distinguish estimates from calibrated confidence.
Synthetic demonstrations and regression fixtures must be visibly identified.

Visual direction: an instrument-like dark listening workspace with warm ivory type,
restrained mint accents, large chord typography, fine timing marks, a central harmony
stage, an editable timeline, and optional piano/fretboard detail. No generic dashboard.
Keyboard access, compact layouts, reduced motion, loading/error/empty states are required.

Engineering and scientific acceptance criteria remain the full master specification.
No phase is accepted merely because it compiles. Real-audio quality, packaging on a
clean machine, low-end performance and platform coverage require measured evidence.
Outstanding gates remain visible in the implementation plan and final report.
