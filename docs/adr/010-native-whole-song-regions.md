# ADR010: Original native whole-song recognition and persistent regions

## v3 timing addendum, 2026-09-21

Original full-song LV inference, weights and joint HMM remain selected. After
the existing refinement, native v3 permits bounded acoustic-onset relocation
of uncertain pitched boundaries. It reuses the onset envelope and joint model
evidence, preserves labels/region count, and never imposes a beat grid. The
predeclared training/validation experiment raises boundary F1@50 ms from 0.19283
to 0.24609 without short-transition or root/reduced accuracy regression. See
`../boundary-timing-protocol.md` and `../recognition-timing-followup.md`.

Both runtime model identity and pipeline identity advance from v2 to v3 to
invalidate old timing caches before a new preparation. Historical callable
v1/v2 modes and saved corrections remain intact. This is a timing improvement;
do not claim that it solves inaccurate root/quality or commercial-song harmony.
The original decision/evidence below remains historical.

Status: accepted for the configured Windows development machine, 2026-09-21.
Scope: recognition and progression stabilization; ADR009 product/acquisition flow
is unchanged. See [comparison](../stabilization-model-comparison.md) and
[acceptance](../stabilization-acceptance.md).

## Evidence and decision

The exact 151.424-second Bob Dylan recording produced 1,052 DSP regions. Bass was
attached frame by frame **after** temporal decoding, bypassing its persistence;
dense flat templates also favored unsupported extensions. This cannot be fixed
only by changing displayed labels or scrolling.

On the same 23,250 labelled HU33 validation frames, original LV-Chordia wins over
retained E010 and whole-song DSP: root 62.66%, reduced exact 39.86%, versus DSP
42.81% / 6.17% and E010 59.01% / 25.41%. Use pinned LV-Chordia 1.1.0's original
five-network CPU ensemble, automatic-tuning CQT, full-sequence normalization and
bidirectional context, and original joint HMM. Do not substitute the failed ONNX
export, loosen its tolerances, train a new model, or reopen locked tests.

Keep triad/root, seventh, upper-extension and bass evidence distinct until joint
decoding. Bass is part of that decoder, never a frame-local label appended after
it. A conservative final A–B–A guard merges a brief weak decoration/bass change
only when matching harmonic flanks, containing-beat posterior averages and
whole-region log evidence agree. Strong/sustained changes, different roots/triads,
crossing-beat changes and no-chord are preserved. Missing beats disable that extra
guard. There is no song-specific chord rule, maximum chord count, unconditional
minimum duration or forced one-chord-per-measure grid.

The guard passes fixed synthetic evidence controls and is neutral on training
02/03 and validation 14–18; no incremental accuracy gain is claimed. The main
improvement comes from original joint full-context recognition/decoding. Native
v2 timestamps retain full precision; the original public API rounds centiseconds.

## Interfaces and lifecycle

`WholeSongRecognizer` accepts already decoded mono 22.05 kHz PCM. The existing
worker prepares it once; native Tauri sends bounded float32 bytes over stdin to
`scripts/native-whole-song.py`. No intermediate audio file, redundant decode,
model download or audio upload occurs. Output is validated and assembled in the
worker before the existing session freezes, caches and publishes its timeline.

Native requests have bounded input/output, at most two admitted requests and one
active subprocess, two CPU threads, a 240-second timeout, finite-data checks,
verified checkpoints and cancellation/EOF cleanup. Worker failure also cancels
inference. Native errors remain product-level errors; no silent DSP downgrade.
The browser preview and earlier profiles retain DSP/research behavior.

Pipeline `harmonia-whole-song-lv-v2` and model
`lv-chordia-1.1.0-submission-native-v2` invalidate older analysis before playback.
Audio fingerprint/provider identity and correction history retain existing
semantics. During playback, `audio.currentTime` only indexes the frozen segments;
Current/Previous/Next and progression use the same index. Scrolling follows that
index, pauses briefly for manual exploration and resumes immediately on seek.

## Tradeoffs and explicit limits

The current original runtime needs the repository's Python environment and pinned
local model artifacts. It is not a portable bundled inference deployment. A native
interpreter override is available through `HARMONIA_RECOGNITION_PYTHON`; script and
artifact paths are controlled internally. Runtime requires 8 GiB available RAM;
20-minute input bounds do not prove all maximum-size inputs fit weak machines.
No low-end hardware or GPU speed claim is made. Exact artifact/source identities
are retained in the stabilization runtime manifest.

Actual Bob analysis rises from 1.416 s DSP to 10.802 s native including decode and
process startup; click-to-ready with cached source bytes is 11.363 s. This is a
deliberate measured accuracy/stability tradeoff. Cached selection takes 0.111 s.

Boundary recall remains weak, and exact bass on reference inversions is worse
than DSP. Sixth/alteration vocabulary, diminished/sus/augmented recognition and
general advanced-harmony accuracy remain incomplete. The fixed validation has
no positive 9/11/13 references, so synthetic preservation tests do not establish
their real-recording recall. Scores are uncalibrated component support. Key is a
duration-weighted summary, not an enforced diatonic rule. Reliable downbeats,
meter, local keys/modulations and sections are not implemented.

LV notices and existing license audit remain in force. ChordMini BTC/ChordNet
checkpoint terms/runtime are unresolved and no comparison score is invented.
Software licensing does not convey rights to training or selected recordings.
