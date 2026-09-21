# R006 real validation gate

Frozen after the training screen passed and before candidate validation inference.
Keep the exact 12-bin estimator, 1/6-semitone activation threshold and 3x CQT-bin
unit conversion. No fitting, offset sweep or retuning from validation.

Use all 120 R005 GuitarSet family-2 recordings and HU33 compositions 14–18, with
identical cached/verified PCM and existing prepared targets. Reuse original LV
outputs and do not rerun any baseline. Unchanged candidate inputs reuse their
baseline too. GuitarSet candidate timestamps use the same centisecond comparison
convention; HU33 retains full precision and its strict masked annotation evaluator.

For each domain separately, root, triad, seventh, bass and reduced exact must not
lose more than 0.5 percentage points. At least one real domain must gain at least
one point of root accuracy AND half a point of reduced exact; synthetic gains alone
are insufficient. HU33 boundary F1@50ms must not lose more than two points and
short-adjacent misses must not increase. Report every metric, rare-class limits,
activated recordings and latency, including losses within allowed bounds.

If the gates pass, integrate behind a new explicit inference/pipeline version,
retain v1/v2/v3 modes, reuse v3 boundary alignment, and check native parity and
playback/cache immutability. If failed, stop with production unchanged; do not tune
the activation threshold. Locked test sets and Bob Dylan remain untouched.
