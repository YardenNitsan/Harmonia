# LV-Chordia CPU export investigation — 2026-09-20

This is numerical deployment research against the audited installed LV-Chordia
1.1.0, using procedural magnitude-CQT inputs. No recordings, annotations,
training, model selection, held-out evaluation, or production integration are
part of this study. E004 and its frozen reports remain unchanged.

## Finding and numerical decision

The original float32 ONNX InstanceNormalization export passed lengths 1, 17,
128 and 1,024, then failed at 2,048 frames: 17 of 149,504 triad logits violated
the existing tolerance. The largest absolute error among those violations was
0.0001713. The first convolution differed by at most 4.7684e-7; the following
normalization differed by 5.8174e-5. Giving that normalization exactly the same
input isolated its error: ORT versus a float64 centered reference differed by
5.6267e-5, while PyTorch versus that reference differed by 1.9074e-6. The layer
diagnostic disables ORT graph optimization to expose intermediate boundaries.

An explicit float32 centered-variance decomposition still failed; at 8,192
frames it also failed probability tolerance. Explicit float64 centered mean,
variance, and normalization arithmetic, followed by a float32 cast, passed
the first network through 8,192 frames. This is an explicit mixed-precision
export decision, not a threshold change. The independent installed PyTorch
network is unchanged: a deep copy alone receives export normalization modules.
Weights, CQT input, convolution/recurrent computation, layer outputs and final
logits remain float32. The non-affine/input-stat-only normalization assumptions
are checked before replacement.

The unchanged elementwise acceptance criteria are `atol=5e-5, rtol=5e-4`
for logits and `atol=1e-5, rtol=5e-4` for per-head probabilities. An absolute
error above `atol` alone does not imply failure; the relative term also applies.

Evidence:

- [Layer isolation](../../artifacts/lv-chordia-diagnostic/layer-diagnostic.json)
- [Float32 centered trial](../../artifacts/lv-chordia-diagnostic/centered-diagnostic.json)
- [Float64 normalization trial](../../artifacts/lv-chordia-diagnostic/double-normalization-diagnostic.json)
- [First-network acceptance](../../artifacts/lv-chordia-cpu-centered/report.json)
- [Five-network acceptance through 4,096 frames](../../artifacts/lv-chordia-cpu-ensemble-4096/report.json)
- [Remaining network-1 / 8,192-frame diagnostic](../../artifacts/lv-chordia-diagnostic/s1-8192-diagnostic.json)

## Ensemble and remaining numerical limit

After first-network acceptance, all five networks passed lengths 1, 17, 128,
1,024, 2,048 and 4,096. Ensemble calculation preserves the installed order:
float32 softmax separately for each network and head, then NumPy mean across
five distributions, then the unchanged submission-dictionary XHMMDecoder,
with layer decoding and beat constraints disabled. Averaged probabilities meet
the same probability tolerance and decoded segments match exactly. These
random-magnitude fixtures decode to N-only segments, so this is a limited
decoder equivalence check, not a representative chord-transition test.

The optional 8,192-frame ensemble extension is **not accepted**. Network 1
has two triad-logit violations out of 598,016 values (maximum absolute error
over that head 0.00010467). All its probability heads pass the existing
probability criterion and have zero argmax disagreements. Feeding exactly the
same PyTorch CNN features through the isolated ONNX LSTM and final linear
layer yields only 6.1989e-6 maximum error and no logit violations. Thus the
remaining mismatch involves sensitivity to upstream CNN/normalization
differences, rather than establishing an incorrect recurrent export. No
tolerance was relaxed and later networks were not accepted at this length.

The exporter now writes a failed report before re-raising parity failures and
stops before exporting later networks. `MAX_RESEARCH_FRAMES=8192` is an input
research bound, not a claim that every network/input passes at that length.

## Runtime interpretation and integration constraints

The five exported networks total 9,496,335 bytes. Reports retain checkpoint and
ONNX hashes, dependency versions, source hash, operator counts, input hashes,
per-head errors, three-repetition timing medians and process memory snapshots.
Timing is warmed CPU inference only, with two Torch/ORT intra-op threads and
one ORT inter-op thread. Ensemble latency is explicitly the sum of individual
network medians, not an independently timed whole-pipeline measurement.

4,096 frames span 95.109 seconds at hop 512 / 22,050 Hz. Network initialization,
audio decode/resampling, automatic tuning, CQT and ensemble arithmetic are
excluded from inference timing; HMM time is reported separately. Process
lifetime peak RSS includes both reference and exported runtimes and allocator
history. It is not the standalone production memory requirement.

The external preprocessing contract remains the installed CQTV2: mono audio
at 22,050 Hz, magnitude hybrid CQT, hop 512, 36 bins per octave, F#0 minimum,
288 bins, automatic tuning; the graph embeds crop 18:270. No waveform or CQT
port was implemented or validated here. Sequence-wide normalization and the
bidirectional LSTM prohibit treating arbitrary chunks as equivalent inference.
Do not promote these artifacts or advertise arbitrary-song duration support
from these fixtures. Representative CQT inputs, nontrivial decoded transitions,
longer-sequence parity, preprocessing/runtime integration and end-to-end cost
remain separate gates. The parent retains independent browser/WASM evidence.

## Commands and regression evidence

Run from `ml/`:

```powershell
.venv/Scripts/python.exe -m harmonia_ml.export.lv_chordia --output artifacts/lv-chordia-cpu-centered --lengths 1 17 128 1024 2048 4096 8192
.venv/Scripts/python.exe -m harmonia_ml.export.lv_chordia --output artifacts/lv-chordia-cpu-ensemble-4096 --all-networks --lengths 1 17 128 1024 2048 4096
.venv/Scripts/python.exe -m pytest -q
.venv/Scripts/python.exe -m ruff check .
.venv/Scripts/python.exe -m ruff format --check .
```

The long first-network regression was observed failing at 2,048 frames before
the normalization change and passed through 8,192 afterwards. Tests also cover
five-distribution averaging, original HMM use, and durable failure reporting
that prevents later exports. The full ML suite passed 70 tests; Ruff and format
checks passed 42 files. Legacy Torch export deprecation/tracing warnings remain;
the fixed batch size is one and dynamic sequence lengths are exercised.
The package warns that ffmpeg is missing; this study never decodes audio.
