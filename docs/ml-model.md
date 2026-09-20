# Structured chord model

The shipped research artifact is `ml/artifacts/structured-chord-v1/model.onnx`,
model ID `E004-transposition-tcn`. It is experimental and is not recommended as
the default recognizer. Its SHA-256 is
`26913443b06adb66c384130ae38fac26f4b9aaeeaed933fe1261c1058171ca79`.
Model selection was frozen before test evaluation in
`ml/experiments/results/selection-freeze.json`.

The encoder projects 26 features into 64 channels and applies three residual
temporal convolution blocks with dilations 1, 2 and 4, GELU and LayerNorm. Six
heads emit independent root, triad, seventh, bass, extension and boundary
logits. This is a small supervised model trained on real GuitarSet recordings,
not a pretrained general-purpose recognizer. The trainable weights occupy a
233,441-byte float32 ONNX artifact; the scientific Python stack is not needed
for ONNX inference.

## Input and output contract

The model accepts `features`, float32 `[batch, frames, 26]`, with arbitrary
positive frame count. Training normalization is embedded in ONNX. Do not
normalize features again. Outputs preserve batch and frame dimensions;
root/triad/seventh/bass/extensions have 13/8/4/13/4 channels, respectively.
Boundary output is `[batch, frames]`. The checked-in manifest is authoritative
for ordered class names, preprocessing and calibration metadata.

Audio must be mono float32 at 22,050 Hz. Training resampling used SciPy's
default rational polyphase resampler; input already at 22,050 Hz avoids
cross-runtime resampling differences. Frames use 2,048 samples, hop 512,
no centering, right zero-padding only for signals shorter than one frame,
and otherwise discard the incomplete final frame. The symmetric Hann window
uses denominator 2,047. Magnitude is the unnormalized real FFT magnitude.
Pitch bins start at 27.5 Hz and map to nearest MIDI pitch, ties to even.
Features 0–11 are independently L1-normalized C–B chroma; 12–23 use only
frequencies up to 330 Hz and a separate normalization. Feature 24 is
`log1p(100*sqrt(mean(windowed_frame**2)))`. Feature 25 is positive spectral
flux of L1-normalized full magnitudes, with the first value zero. Denominators
are clamped at `1e-8`. Frame centers are `(index*512+1024)/22050` seconds.

The receptive field is 15 frames. Chunked inference needs seven context
frames on both sides and must retain only interior predictions. File ends
use the model's zero convolution padding. The parity fixture contains
procedural audio, five exact feature frames, their times and all model
outputs; this fixture demonstrates numerical agreement, not music accuracy.
Non-native sample-rate parity must be assessed separately by the app.

Root and bass index 12 mean no chord. Triads are none, major, minor,
diminished, augmented, sus2, sus4 and power. Seventh classes are none,
minor, major and diminished. Extension bits indicate 6, 9, 11 and 13.
This representation cannot retain all alterations or missing degrees in
the application's richer canonical chord model. The original v1 Harte
encoder also simplifies shorthand such as half-diminished and implied
extended sevenths. Reported “exact structural” accuracy is exact only in
this reduced encoding. It is not full canonical-chord accuracy.

## Calibration and deployment evidence

Only the root component has a fitted validation temperature:
`1.1971407672683847`. Apply `softmax(root_logits / temperature)` explicitly;
the temperature is not embedded. Validation compositions used for fitting
and auditing are disjoint, with all associated performers kept together.
Audit ECE improved from 0.07103 to 0.06030. Both partitions previously
participated in model selection, so this is descriptive validation evidence.
Do not label a whole-chord score or the other heads calibrated.

ONNX Runtime 1.30 CPU matches PyTorch at lengths 1, 17, 128, 1,024 and 2,048;
the maximum measured absolute logit error is 0.00000334. With two CPU threads,
2,048 feature frames (47.55 seconds) took a median 2.20 ms for inference only.
Decoding, feature extraction and runtime loading are excluded. A separate
1875-frame comparison measured PyTorch CPU 2.16 ms and RTX 5070 CUDA 0.72 ms.
The model has no GPU requirement for inference.

Partial dynamic int8 quantization changed root predictions on 0.58% and bass
predictions on 0.66% of validation frames, while reducing the file by only
571 bytes. Float32 remains selected. The quantized artifact is a local
research output, not a production replacement. Full measurements are in
`ml/experiments/results/E004-runtime.json`.

## Limitations and attribution

Held-out family 3 root accuracy is 38.06%; minor triad recall and positive
extension recall are zero. Boundary recall is near zero, and inversion bass
accuracy is only 16.38%. Keep DSP boundary handling and expose this model
only as an experimental option. The LV-Chordia validation baseline is
stronger, but its CQT/ensemble/HMM runtime is not this ONNX artifact and has
not been integrated into the desktop's production runtime.

Training uses [GuitarSet 1.1.0](https://zenodo.org/records/3371780), by Qingyang
Xi, Rachel M. Bittner, Johan Pauwels, Xuzhou Ye and Juan P. Bello, under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Transformations:
microphone audio decoded and resampled; chroma/bass/energy/flux features;
performed labels reduced to component targets; trained model weights.
The dataset is not bundled. Retain the artifact's attribution notice.
