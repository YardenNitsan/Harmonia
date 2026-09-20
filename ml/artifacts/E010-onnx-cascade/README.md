# E010 ONNX cascade: CPU parity passed, research only

One frozen export/parity probe completed on 2026-09-20. The
[protocol](../../experiments/E010-onnx-cascade-protocol.md), [preflight](preflight.json),
[report](report.json) and [manifest](manifest.json) retain the contract, input/source
hashes, runtime environment and all ten case results. No fitting, model selection,
test access, app model installation or decoder changes occurred.

`model.onnx` is 447,455 bytes, SHA256
`f1fd6e356463fbb3387ca680ec705130ca73bbeffdb880de26028e239a8d561f`.
It embeds the frozen E009 float32 network/normalization and the exact E010 float64
predicted-root quality branch. Input is raw float32 `[1, frames, 26]`. The six
original E009 logits are exposed with `baseline_triad` explicitly named; the
additional outputs are float64 `quality_logits` and int64 `triad_decision`.

This is not a drop-in E004 decoder or confidence contract. The final triad is the
explicit integer output. The original baseline triad logits and four quality
scores are separate, uncalibrated quantities. No artificial eight-class ranking
head or float32 quality approximation was introduced.

All five procedural lengths (1, 17, 128, 1,024, 2,048) and all five existing HU33
validation recordings (compositions 14–18) passed. Validation included **29,759 raw
frames**, not only the 23,250 scored frames. Root, original baseline triad, final
cascade triad, seventh, bass and extension decisions matched the retained E010
archives exactly for both the Torch wrapper and ONNX CPU execution. Prepared and
retained masks matched. Boundary sigmoid values passed the unchanged tolerance.

| Numerical comparison                      | Largest observed absolute error | Frozen tolerance       |
| ----------------------------------------- | ------------------------------: | ---------------------- |
| E009 float32 raw heads                    |                    4.7683716e-6 | atol 1e-5, rtol 1e-4   |
| Float64 quality logits, ONNX versus Torch |                   7.1054274e-15 | atol 1e-10, rtol 1e-10 |
| Integer cascade triad decision            |                    0 mismatches | exact                  |

Quality logits also passed an independent comparison to the retained NumPy
coefficient computation using retained predicted roots. No tolerance was changed,
near-tie frame removed, failed case retried or artifact replaced. All frozen-file
hashes remained unchanged. Per-case evidence is retained in `case-01.json` through
`case-10.json`; no cases remain unexecuted.

The extension check used E010's CPU float32 Torch sigmoid followed by `>=0.5`.
It does not establish equivalent threshold rounding in a future JavaScript
decoder. Constructed tests include root-12 preservation and a quality decision
that float32 rounding would change; positive root-12 coverage is not supplied by
these five validation recordings.

Summed prepared-feature inference across the five validation sequences was
0.05809 seconds for ONNX CPU and 0.07564 seconds for the Torch wrapper. Session
creation took 0.01127 seconds. The sampled study timer covered 0.3927 seconds,
excluding Python/import startup; external process wall time was 3.09 seconds.
Sampled peak RSS was 666,554,368 bytes and minimum available system memory was
17,314,758,656 bytes. Two CPU/BLAS threads and one interop thread were used, without
GPU or workers. This single warmed pass is numerical feasibility evidence, not
a robust hardware benchmark or audio-to-timeline latency result.

Six constructed exporter tests passed after four initial missing-implementation
failures. They exercise mixed-precision dynamic frames, root-driven gathers,
root-12 behavior, exact decisions despite close logits, original extension
threshold rounding and retained failure reports even on completion headroom
failure. Scoped Ruff and formatting checks passed before the source freeze.

No browser/WASM runtime, audio preprocessing, chunk parity, weak-PC campaign,
UI adapter, calibration or release gate was validated. This first probe uses
complete recording context. A future chunking comparison would require the
127-frame receptive field's 63-frame halos and independent parity checks.
The E010 model-quality limitations and wrong-root regressions remain exactly as
reported in the [original study](../../experiments/results/E010-predicted-root-quality-cascade/README.md).
