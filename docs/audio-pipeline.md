# Audio analysis pipeline

The local provider owns playback; its media clock is authoritative. Analysis does
not play or capture streams. An application request has a generation and abort
signal, so cancellation/replacement terminates the worker and ignores stale results.

```text
Authorized local file → fingerprint/cache lookup → header/duration preflight → decode
  → cancellable worker → DSP templates OR experimental ONNX recognizer
  → shared stabilization + DSP rhythm/novelty → validated canonical timeline
  → repository → playback-clock lookup → presentation
```

## Input and resource boundary

Encoded files are capped at 100 MB. Verified mono/stereo headers and a finite duration
at most 20 minutes are required before Web Audio decode at 22,050 Hz. Supported
preflight containers are common WAV, FLAC, MPEG audio, Ogg Vorbis/Opus; others need
conversion. Metadata inspection is capped at 1 MiB. Decode requests are serialized,
decoded layout/size rechecked, and channel buffers transferred to a module worker.
This limits ordinary inputs, not hostile codec allocations; see security.md.

The worker folds channels by arithmetic mean. Analysis, FFTs and model inference do
not execute on the React/UI thread. Audio is not sent to a service. Browser codecs
and resampling may differ by platform; this affects supported inputs and scientific parity.

## Baseline strategy

`peak-chroma-v1` uses a centered 4096-sample Hann window, approximately 23.22 ms hop,
interpolated spectral peaks, L2 chroma and low-frequency bass features. A structured
template vocabulary ranks 27 qualities at each pitch class and considers inversions.
Scores are acoustic similarities, not calibrated probabilities. Silence is explicit.

`NoveltyBoundaryDetector` computes harmonic-change candidates separately. Every
frame can still change chord, even when novelty misses a transition. Weighted local
voting merges short fluctuations: radius 2 for fast, 4 for balanced/experimental.
This is a simple stabilization baseline, not a learned joint split/merge decoder.
Segments cover the signal duration and time lookup uses half-open intervals.

Rhythm/key estimates are provisional. Meter/downbeats remain unknown rather than
being invented. The waveform is bounded to 900 bins. Candidate boundaries, segment
scores, alternatives, warnings and model/pipeline/profile provenance are saved.

## Experimental strategy

E004 uses its independent `chroma-bass-v1` training feature contract: uncentered
2048-sample symmetric Hann, hop 512, 12 L1 chroma +12 L1 bass +log RMS +spectral flux.
The pinned manifest specifies exact conventions; a Python-exported numerical fixture
tests TypeScript parity. Normalization is embedded in ONNX. Local WASM inference uses
one CPU thread and 1024-frame chunks with seven context frames on either side.

Independent output heads are converted to the canonical chord model. Sparse added
tones must not imply absent lower extensions or sevenths when formatted. Whole-chord
ranking scores stay uncalibrated. A root-only temperature is recorded for research,
not misrepresented as confidence for the complete chord. Hash failures are errors,
not silent fallback to the default DSP model.

The model's learned boundary head failed evaluation, so desktop segmentation uses
the shared DSP novelty/stabilization path. Thus Python raw-frame metrics are not
desktop end-to-end metrics. Non-22,050-Hz browser resampling is also not numerically
identical to the research resampler. E004 remains experimental; see evaluation.md.

## Cache and playback

Cache identity contains audio SHA-256, model identity, pipeline version and profile.
Corrections and favorites must survive another profile's analysis. Reopening a saved
session restores its selected profile; relinking the same file retains corrections.
Persistence work is behind repositories, native SQL runs in blocking worker tasks,
and failed saves remain visibly unsaved. Audio bytes are not persisted in the database.
