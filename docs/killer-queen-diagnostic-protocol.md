# D004: cached full-mix recognition diagnosis

Frozen before missing-evidence inference, 2026-09-21. This is a descriptive
diagnostic of the user's retained Killer Queen recording, not model selection or
a labelled accuracy benchmark. No training, locked tests, historical experiments,
new acquisition or other-song accuracy probes are authorized by this protocol.

The read-only native record identifies Queen Official's **Top Of The Pops, 1974**
video `2ZBtPf7FOoM`, 191.970975 seconds. Its exact cached WebM SHA256 is
`4c4d6ef74eae0222b08ab75856fdf4d88eacd7483bfda730a65f948103a15c5c`.
The saved v2 timeline has 83 regions. Original record, manifest and audio copies
remain ignored under `.superpowers/diagnostics/killer-queen/`. Never overwrite them.

1. Decode those bytes once using Chromium Web Audio at 22,050 Hz and the existing
   arithmetic mono rule. Retain PCM plus checksum, channel metrics and duration.
   This reproduces the browser decoding contract; exact WebView sample identity
   cannot be assumed until compared with retained analysis evidence.
2. Inspect source pitch, silence and stereo cancellation using this PCM. Verify
   root/bass/quality encoding and Harte conversion independently of recognition.
   Published Pearson analysis describes the studio composition, not a timestamped
   annotation of this video; report source differences and alternate harmonies.
3. Since saved records contain no frame probabilities, run **one** original CPU
   LV ensemble on the complete retained PCM with v2 refinement. Save all six heads,
   unrefined/refined timelines, model/input/source hashes and timings. Compare with
   the frozen saved timeline to identify reproduction limits.
4. Reuse these heads without inference: audit dictionary representability and
   head disagreement, and inspect framewise dictionary evidence versus HMM30
   suppression. At most one additional fixed decoder-only diagnostic, HMM15,
   may quantify sensitivity; it is not eligible for default promotion. No sweep.
5. Freeze short, independently specified structural fixtures for any demonstrated
   integration defect before fixing it. Discuss production changes with parent.
   Report root, quality, bass and segmentation separately. A composition guide
   alone cannot yield full-song accuracy or prove a new decoder is better.

Stop after the diagnosis and evidence-backed general correction, if one exists.
Preserve weights, original dictionary and all prior reports. Any changed decisions
need new pipeline identities and appropriate general regressions before release.
