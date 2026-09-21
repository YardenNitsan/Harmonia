# R004: final bounded upstream layered decoder comparison

Frozen 2026-09-21 before scoring. This is the final decoder candidate in this
investigation; no subsequent mode or parameter sweep. Use the pinned upstream
`XHMMDecoder.layer_decode` with the existing submission dictionary, original
six-head predictions and transition penalty 30. First decode joint root/triad
and bass, then decode suffixes restricted to that path, exactly as upstream.
No new inference, N-likelihood changes, start-state changes, or smoothing.

Training compositions 02/03 only first, compared with their retained native
timelines. Advancement requires strict pooled reduced-exact improvement and no
decrease in root, triad, bass or inversion-bass accuracy. If it fails, stop.
If it passes, freeze unchanged sources and run once on validation 14–18 with the
same component guards plus boundary F1@50 nonregression and no additional
short-transition misses. Report all component/class/extension/inversion metrics
and validation boundaries at 20/50/100 ms. Do not combine with onset timing in
response to validation; any combination needs its own prior gate.

No training, model downloads, audio access, locked tests, user-song tuning or
Bob Dylan. Two CPU threads, exclusive outputs under R004-layered-audit. Existing
HU33 domain, upstream overlap, and previously exposed validation limits apply.
