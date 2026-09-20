# LV all-convolution precision diagnostic

Declared before execution. Prior layer tracing showed float32 convolution backend
differences accumulating through ten convolution/normalization blocks. Changing
only the first convolution did not close acceptance. This next bounded diagnostic
replaces all ten export-copy Conv operators with float64 patch/matrix multiplication
and bias accumulation, casting each result back to float32. Existing double
normalization and all other operators, weights and source input remain unchanged.

Use only network0 and the retained failing E006 validation recording
`00_Funk2-108-Eb_solo` (1531 frames). Verify source and audited weight hashes.
The reference is the unchanged installed PyTorch float32 model, not a modified
reference. Keep logit atol5e-5/rtol5e-4 and probability atol1e-5/rtol5e-4.
No parameter search, altered tolerance, chunking, new data or test access.

Verify transformed convolution semantics on constructed multichannel fixtures
before the one full-recording diagnostic. Disable ORT graph optimization as in
the prior layer probe; this is not the production runtime contract. Two CPU
threads, no GPU, at least8GiB available memory before heavy phases, no OOM retry.
Save fresh preflight/source/model hashes, per-head violations, timing and memory;
refuse existing output directories. A failure remains visible and returns nonzero.
Even a pass authorizes neither ensemble acceptance nor production integration:
the existing long-sequence/real-set/browser/preprocessing/resource gates remain.
