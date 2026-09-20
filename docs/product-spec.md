# Harmonia product specification

Authority: `../../instructions.txt`, sections 1–89, plus the user's persistent-guide request.

Build a local-first Tauri 2 / React / TypeScript desktop music-analysis application.
The primary workflow is import an authorized local audio file, analyze the complete
recording, play/pause/seek, and display synchronized previous/current/next chords,
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
