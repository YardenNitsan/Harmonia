# LV SELU arithmetic diagnostic

Frozen before the retained-recording run. The completed constructed activation
probe (`artifacts/lv-chordia-diagnostic/selu-kernel.json`) suggests cancellation
in float32 Exp(x)-1. Its float64 difference substantially reduces near-zero
error against native PyTorch, but does not match every subnormal value. This is
a numerical investigation, not a new quality experiment or production acceptance.

Replace only standard SELU nodes in the original mixed-normalization s0 graph
with the tested float64 Exp/Sub, float32 cast, float32 precombined alpha*gamma
negative coefficient and float32 positive multiplication. Select by x>=0.
Keep all convolutions, normalization, recurrent layers, weights and output types
unchanged. Do not combine with the failed all-convolution variant or search
alternative graphs. Graph optimization is disabled, matching the earlier
layer-localization diagnostic. Check the original graph hash and audited weight
hash before execution. The unchanged native PyTorch model is the reference.

Read only the already retained E006 validation recording
`00_Funk2-108-Eb_solo` (1,531 CQT frames). Verify source audio against the existing
prepared manifest and selection. No other recordings, training arrays or locked
tests are accessed. Freeze source/test/helper/protocol/package/input identities
before extracting audio. Save CQT and native output arrays for future numerical
investigations, so reference generation need not be repeated.

Run each complete sequence once through the native reference and the candidate.
Require finite outputs and exact dimensions. Retain original logit tolerances
atol=5e-5, rtol=5e-4 and probability tolerances atol=1e-5, rtol=5e-4. Report every
head's violations, maximum absolute error and argmax disagreements. A passing
single-recording diagnostic would only justify separate broader parity checks;
it would not erase previous failures or approve production.

Use two Torch/ORT/BLAS CPU threads, one interop thread, no GPU/workers. Require
8 GiB available RAM before expensive stages. Record sampled memory/headroom,
versions, inference elapsed time and hashes. Use a 120-second external watchdog;
no automatic retry. Exclusively create
`artifacts/lv-chordia-diagnostic/selu-arithmetic/`, preserve failures, verify
frozen identities afterward, and refuse any existing output directory.
