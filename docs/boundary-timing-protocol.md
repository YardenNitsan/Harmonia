# Boundary timing investigation

Frozen before candidate scoring, 2026-09-21. The user reports incorrect chord
changes and beat alignment on Switch (41BZrKQY1IM) and Killer Queen (2ZBtPf7FOoM).
Do not use Bob Dylan as an accuracy check. Preserve all existing reports/caches.

Native v2 maps full-context HMM frames directly to hop-grid boundaries; beat
estimation follows decoding and the existing conservative cleanup changes no
boundaries on the fixed labelled validation. Investigate whether nearby acoustic
attacks improve timestamp precision independently of chord identity.

Use retained native v2 timelines/heads for HU33 training compositions 02/03,
and decode each source WAV once for a reusable onset envelope. No model inference
or training. Compare only two predeclared candidates: librosa default detected
onset peaks, and those peaks backtracked to preceding envelope minima. Reuse
the native hop 512/22050 and onset_strength defaults. Original labels/count stay
unchanged. Only pitched-to-pitched boundaries may move. Maximum movement is
150 ms and one quarter of either neighboring original region; retain short and
offbeat changes. A move must lose no more than 0.5 mean log-evidence units per
reassigned frame for the two adjacent dictionary states. Missing support means
no move; no unconditional beat snapping or imposed one-chord-per-beat grid.

Choose the candidate with highest pooled boundary F1 at 50 ms on 02/03, provided
F1 improves, root/reduced frame accuracy lose no more than 0.2 percentage points,
and short-adjacent boundary misses do not increase. Freeze its implementation and
selected mode before one validation evaluation on existing compositions 14–18.
Validation must improve F1 at 50 ms by at least 0.01 absolute, not reduce recall,
not increase short-adjacent misses, and retain the same 0.2-point root/reduced
guard. Otherwise do not promote. Do not try further thresholds after validation.
Record results even if neither candidate passes. This small voice/piano dataset
does not establish commercial full-mix recognition accuracy or beat-tracker accuracy.

Source: [librosa onset detection/backtracking](https://librosa.org/doc/0.11.0/generated/librosa.onset.onset_detect.html).
Backtracking is explicitly designed for acoustic slice points; it is a hypothesis,
not evidence that every detected note attack is a harmonic boundary.
