# D001: root-relative quality diagnostic

This is a separate, predeclared training-only study after the completed E007–E009
comparison. It uses annotated roots that are unavailable during deployment, so
its results are not model-selection validation accuracy or product improvement.
The immutable [protocol](../../ml/experiments/D001-hu33-root-relative-probe-protocol.md),
[preflight and report](../../ml/experiments/results/D001-hu33-root-relative-probe/README.md)
record configuration, source/data/checkpoint hashes and per-composition evidence.

The audit found no current HU33 encoding/masking/transposition/sampler bug. Minor
frames are present: 28,585 of 78,350 valid training frames. The next question was
whether pitch features become more useful for quality recognition when expressed
relative to an annotated root, rather than another arbitrary TCN training run.

Four composition-group folds inside training compositions02–13 compare identical
zero-initialized, unweighted, regularized linear classifiers. The treatment rotates
both chroma groups by the annotated root; energy/flux remain unchanged. Each arm
fits normalization exclusively on its nine fold-training compositions. The other
three compositions receive predictions once. Validation14–18 and test19–24 arrays
were never read. The four fixed qualities are major/minor/diminished/augmented.

| Pooled training-composition OOF measure | Absolute features | Oracle-root-relative features |
| --------------------------------------- | ----------------: | ----------------------------: |
| Macro recall, all four qualities        |            24.87% |                        45.21% |
| Major recall                            |            74.78% |                        80.85% |
| Minor recall                            |            24.58% |                        69.92% |
| Diminished recall                       |             0.13% |                        30.07% |
| Augmented recall                        |             0.00% |                         0.00% |

The +20.34-point macro gain exceeds the predeclared +5-point diagnostic threshold.
All eight fits used their100-iteration budget and satisfy the separately measured
gradient-infinity criterion≤1e-5; the largest was9.9221e-6. This is explicit
convergence evidence, not an inference from a successful process exit. There was
no search, retry or new arm. Runtime was4.31s, sampled peak process RSS649.5MB and
minimum system headroom17.58GB, with two CPU threads and no GPU.

The result supports investigating root-conditioned quality representations. It
does not establish how well predicted roots would work, statistical significance,
new-performer generalization, extensions, inversions or complete timelines.
Augmented support is only161frames and its recall remains zero. No model was
promoted, no historical result was replaced, and no test was opened. Future
deployable candidates require a fresh frozen comparison and honest checkpoint
selection: the old fixed-crop proxy covers only38.7% of full validation and differs
from the study's full-validation primary criterion.
