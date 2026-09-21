# R006: semitone-scale tuning, fixed robustness screen

Frozen before inference. This is deterministic preprocessing research with the
unchanged original LV weights/HMM, not new custom ML training.

Librosa's automatic CQT tuning is in fractions of a frequency bin; LV uses 36
bins/octave, so its automatic correction wraps every third of a semitone. The
existing Killer Queen diagnosis found a -0.33-semitone estimate on the normal
12-bin musical grid, versus a near-zero estimate on the finer grid. That is a
hypothesis about detuning sensitivity, not proof that shifting the song is correct.
Sources: [official pitch estimator](https://github.com/librosa/librosa/blob/main/librosa/core/pitch.py),
[official CQT](https://github.com/librosa/librosa/blob/main/librosa/core/constantq.py).

One fixed candidate: estimate whole-file tuning with 12 bins/octave. If its
absolute value exceeds 1/6 semitone, pass three times that value as the explicit
36-bin CQT tuning. Otherwise retain the original extractor exactly. No audio is
retuned for production; only the analysis frequency grid changes. There is no
key-dependent, song-specific or label-dependent correction.

Screen only the 15 accompaniment recordings in the already-frozen R005 training
selection, plus controlled +0.33/-0.33-semitone speed/resampling variants of each.
Map annotation/sample times by the exact resampling ratio; keep the reference
chord identities. These are robustness fixtures derived from training audio,
not new real-song validation. Reuse canonical R005 baseline timelines. Every
new shifted input is decoded/resampled once and shared by baseline/candidate.

Predeclared gates: canonical root, triad, seventh, bass and reduced exact must
each lose no more than 0.5 percentage points; shifted aggregate root, triad and
reduced exact must each improve at least 3 percentage points; no label fitting,
offset sweep, song-specific exceptions or weakened gates. If failed, stop and
keep production unchanged. If passed, a separate once-only fixed validation
comparison on existing GuitarSet accompaniment and HU33 validation is still
required before promotion; synthetic gains alone are insufficient.

Two CPU threads, at least 8 GiB available RAM, all artifacts local, exclusive
outputs and frozen source/input hashes. No test-set or user audio inference in
this screen; do not repeat completed canonical baselines or prior candidates.
