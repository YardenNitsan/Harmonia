# Harmonia product specification

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
