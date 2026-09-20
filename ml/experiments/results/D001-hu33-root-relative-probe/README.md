# D001: oracle-root probe results

This separate train-only diagnostic met its predeclared criterion. It does not
reopen E007-E009, measure deployable recognition, or select/promote a model.

All 78,350 valid HU33 training frames received out-of-fold predictions under
four composition-group folds. Validation/test prepared arrays were not read.

| Metric | Absolute features | Oracle-root-relative features |
| --- | ---: | ---: |
| Pooled macro triad recall | 0.248739 | 0.452108 |
| Frame accuracy | 0.520511 | 0.737983 |
| Major recall | 0.747823 | 0.808491 |
| Minor recall | 0.245793 | 0.699248 |
| Diminished recall | 0.001341 | 0.300693 |
| Augmented recall | 0 | 0 |

The absolute macro-recall gain is 0.203369, above the frozen 0.05 diagnostic
threshold. Every composition's present-class macro recall improved. This is not
a statistical significance claim. The four pooled class supports were
45,131 / 28,585 / 4,473 / 161; no additional classes are supported by this study.

All eight optimizations used the full 100 iterations. All nevertheless satisfied
the separate, predeclared convergence check: final objective-gradient infinity
norm <= 1e-5. The maximum was 9.9220949345e-6 (absolute arm, fold 0); thus the
result rests on that explicit threshold, not an optimizer success message or a
claim that optimization stopped early. Full histories, training fit, per-fold
normalization, gradient norms, supports and composition metrics are in report.json.

Measured elapsed time was 4.31 seconds, sampled peak process RSS 649,531,392 bytes,
and minimum sampled available system RAM 17,575,911,424 bytes across 858 samples.
Two CPU threads, one process, no workers or GPU were used. These are sampled
resource observations, not continuous peaks or desktop inference measurements.

The treatment receives ANNOTATED roots unavailable during actual inference.
Results support investigating root-conditioned quality representations in a
future independently frozen comparison. They do not demonstrate that estimated
roots retain this benefit, solve rare classes, or establish final recognition
quality. Existing datasets, checkpoints, candidate protocols and product models
remain unchanged.

Preflight was written before optimization and captures protocol/config/script/
test/manifest and twelve training-input hashes. After execution, all those hashes
and all eight ignored checkpoint hashes were independently reverified. Protocol,
configuration and executable source bytes were preserved after preflight.

Verification: three new rotation/normalization/split-access regressions passed;
the complete Python suite passed 76 tests with 25 existing export warnings.
Ruff lint and format check passed across 50 Python files. Run from ml/ with two
OMP/MKL/OpenBLAS threads:

```powershell
.venv/Scripts/python.exe experiments/root_relative_probe.py experiments/D001-hu33-root-relative-probe.json
```

The existing completed output is immutable, so that command refuses overwrite.
Any later study needs its own declared protocol, ID, config and output paths.
