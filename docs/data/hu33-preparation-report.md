# HU33 preparation checkpoint

Recorded 2026-09-20. This is data preparation evidence, not model accuracy.

Post-experiment review added exact composition-to-source path checks and three
regressions rejecting swapped audio, annotations, or complete source pairs across
the fixed split. A read-only recheck confirmed all 23 original source identities
and hashes: [integrity evidence](hu33-review-integrity.json). No contamination was
found, and preparation or training was not repeated. The preparation report's code
hashes describe the original run; the later validation-only guard is recorded here.
The [machine-readable report](hu33-preparation-report.json) contains source/code
hashes, all training/validation head distributions, normalization and resource
measurements. Rights and source limitations remain those in the
[public expansion audit](public-expansion-audit.md).

## Acquisition and fixed split

The complete acquisition already existed when this continuation resumed. All 48
source files were checked against recorded SHA-256 values; 23 WAVs were decoded
and their CSV timing/parsed content revalidated. No download was repeated. The
existing acquisition received 118,086,126 HTTP range bytes, below its 130,000,000
budget; selected compressed members total 117,826,237 bytes, below 128,000,000.
Its per-member CRC verification records are retained. There was no ETag and the
whole mixed archive's MD5 remains unverified. No SC06 audio or song 01 is included.

The active continuation authorizes the HU33 remainder, superseding the pilot-only
next step in the earlier audit. Acquisition/preparation of a locked composition
does not authorize model evaluation or model selection against it.

| Split       | Compositions | Tracks | Audio seconds | Valid / total feature frames |
| ----------- | ------------ | -----: | ------------: | ---------------------------: |
| Training    | 02–13        |     12 |  2,123.441633 |     78,350 / 91,413 (85.71%) |
| Validation  | 14–18        |      5 |    691.350930 |     23,250 / 29,759 (78.13%) |
| Locked test | 19–24        |      6 |    991.770703 |        Distribution withheld |

Prepared files live under ignored `ml/data/prepared/winterreise-hu33-v1/`.
The locked manifest SHA-256 is
`a54ce6ed104a42b8216f5045e4bc0be0d4912e61c8678c920ddf896dc63faf4d`.
All 23 prepared-file hashes and the manifest lock were independently verified.
No model inference, training, test metrics or E004 artifact changes occurred.

## Targets, provenance and leakage checks

Features retain `chroma-bass-v1`; targets are explicitly versioned
`winterreise-strict-masked-v1`. Every frame has a boolean validity mask. Gaps, X,
source conflicts, parse failures and unsupported pitch sets are excluded. Only
explicit N can provide valid no-chord supervision. Excluded frames contain
placeholder target values, so every consumer must honor the mask.

Explicit triad degrees and at most one seventh are supported, with unmodified
6/9/11/13 extension flags. Altered extensions, omissions and unsupported degree
sets remain excluded. Absolute slash bass is normalized with its spelling
preserved. Unknown edges receive a 0.1-second exclusion margin; positive boundary
targets require adjacent valid annotations without a gap. This strict reduced
representation does not provide lossless canonical chord ground truth.

Preparation now checks all composition identities, predetermined assignments,
duplicate compositions, duplicate audio hashes, source paths and source hashes
before publishing features. Targets are reparsed from the hashed raw CSV instead
of trusting cached manifest labels. Regression tests reproduced the previous
duplicate/path acceptance and cached X-to-N override, then passed after the fix.

Normalization was fit to precisely 78,350 valid training frames. An independent
recalculation from the saved training arrays matched its mean and standard
deviation; validation/test frames were excluded. Tests also verify this on small
acoustic fixtures and confirm test distributions are absent from the report.
Composition separation does not establish performer/composer separation or
detect arbitrary remastered near-duplicates outside this pinned corpus.

## Training and validation coverage

Counts below are valid feature frames, not independent observations.

| Target                             | Training | Validation |
| ---------------------------------- | -------: | ---------: |
| Major triad                        |   45,131 |     13,916 |
| Minor triad                        |   28,585 |      6,456 |
| Diminished triad                   |    4,473 |      2,321 |
| Augmented triad                    |      161 |        478 |
| Suspended fourth                   |        0 |         79 |
| No seventh                         |   56,432 |     17,329 |
| Minor seventh                      |   19,178 |      5,221 |
| Major seventh                      |      145 |          0 |
| Diminished seventh                 |    2,595 |        700 |
| Extension 6                        |        0 |         13 |
| Extension 9                        |      162 |          0 |
| Extensions 11 / 13                 |    0 / 0 |      0 / 0 |
| Inversion (root differs from bass) |   21,878 |      8,180 |
| Explicit no-chord                  |        0 |          0 |

All 12 root and bass pitch classes occur in each split; complete counts are in
the JSON report. Training excludes 101 unsupported annotation rows and three
conflict/parse-error rows; validation excludes 48 and two respectively. Frame
exclusions also include gaps and edge margins. Training has no sus2, sus4 or
power-chord targets; validation has no sus2/power targets. Minor coverage improves
on GuitarSet's training distribution, but rare extensions and no-chord remain
unsupported. A single historical voice/piano cycle does not establish broad
full-mix generalization or perceptual alignment accuracy.

## Reproduction and verification

Run from `ml/`, using fresh output paths because existing evidence is protected:

```powershell
$env:OMP_NUM_THREADS='2'
$env:OPENBLAS_NUM_THREADS='2'
$env:MKL_NUM_THREADS='2'
.venv/Scripts/python.exe -m harmonia_ml.data.prepare_winterreise --source data/downloads/winterreise-hu33-v2.1 --output data/prepared/winterreise-hu33-v1
.venv/Scripts/python.exe -m pytest -q tests/test_winterreise.py tests/test_winterreise_prepare.py
.venv/Scripts/python.exe -m ruff check harmonia_ml/data/winterreise.py harmonia_ml/data/prepare_winterreise.py tests/test_winterreise.py tests/test_winterreise_prepare.py
.venv/Scripts/python.exe -m ruff format --check harmonia_ml/data/winterreise.py harmonia_ml/data/prepare_winterreise.py tests/test_winterreise.py tests/test_winterreise_prepare.py
```

Preparation took 6.88 seconds, one worker, CPU only. Maximum RSS observed after
each track was 140,066,816 bytes; this is not a continuously sampled process peak.
The 30 HU33 tests passed; scoped Ruff lint and formatting checks passed. A full
ML suite run during concurrent development passed 65 tests and failed
`test_evaluation_ignores_masked_labels_and_boundaries` (missing coverage field)
and `test_installed_first_network_exports_dynamic_raw_heads` (long-sequence
numerical parity). Those are tracked by their respective integration/export
owners; the scoped result is not a claim that the whole ML suite passed.

## Next controlled experiment

Before training, declare a fresh protocol and IDs for a two-arm data-addition
comparison: a rerun of the same small TCN using GuitarSet training only versus
the identical recipe plus HU33 training compositions. Preserve architecture,
optimizer, augmentation, seed, training-step budget and loss weights; fit each
arm's normalization on its own valid training data. Predeclare the sampling
ratio and evaluate both on the same fixed GuitarSet/HU33 validation compositions,
reporting corpus-specific and per-song macro scores, coverage and rare classes.
Choose one validation-only selection rule before either run. This comparison
measures the effect of the added corpus, not a simultaneous model redesign.

Do not compare the new selection directly with historical E004 as though every
setting were controlled. Keep its artifacts and already-evaluated test immutable.
Do not open HU33 test results until the new protocol and selected configuration
are frozen. Boundary improvements and new representations should be separate
later comparisons; these data do not support a production-promotion claim.
