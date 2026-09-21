# R002: training-context inference protocol, 2026-09-21

Declared before candidate audio access/inference. No training, fitting, new
weights, acquisition, test access, or song-specific rules. R001's failed full
dictionary candidate is excluded.

Hypothesis: LV's original training uses 1,000-frame sequences, whereas production
applies input-statistic InstanceNorm2d and a bidirectional LSTM to the entire song.
Changing the duration changes normalization/context. Matching the original
training context might improve acoustic root/quality evidence. This is a
controlled alternative to upstream inference, not an established adapter bug.

One fixed candidate: original complete-audio CQT, original five networks,
1,000-frame windows at 500-frame stride, plus one full-length right-aligned window
when needed. Each window uses original model inference. Average all overlapping
posteriors equally per frame, then average the five networks. Songs shorter than
1,000 frames use one complete window. The original submission vocabulary and
HMM30 decode the complete aggregated sequence globally, with no independent
chunk labels or extra smoothing. Do not alter tuning, mix channels, or weights.

Use retained native baseline heads/timelines; do not rerun original inference.
Save CQT and candidate heads once, with exact audio/prepared/source/weight hashes
and stage timings. First evaluate training compositions 02/03. Require strict
pooled reduced-exact improvement and no decrease in root, triad, bass or inversion
bass. On failure stop without validation or trying another window setting.

Only on training pass, freeze unchanged candidate sources and evaluate it once on
validation compositions 14–18. Require strict pooled reduced-exact improvement,
no decrease in root, triad, bass, inversion bass or boundary F1 at 50 ms, and no
additional short-transition misses. Report per-track, rare-quality, extension,
inversion and boundary metrics at 20/50/100 ms regardless of pass/fail. Any future
combined temporal candidate needs a separate predeclared gate; do not combine in
response to validation results.

Two CPU threads, CPU only, at least 8 GiB available RAM, one process, exclusive
report writes. No repeat completed inference. Runtime can be compared against
retained measurements descriptively only, because this is not a simultaneous
hardware benchmark. HU33 classical voice/piano and previously exposed validation
cannot establish broad full-mix generalization. Killer Queen and the exact user
Festigal source are unlabelled regression context, not tuning targets. Bob Dylan
and both locked test splits are excluded.
