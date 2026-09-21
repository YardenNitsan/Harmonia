# Original BTC feasibility and reproducibility audit

Prepared 2026-09-21 for the broader fixed benchmark. This is a different published
model from R003's ChordMini ChordNet; R001–R004 and their two-recording control
results remain frozen. No corpus was scored during this preflight. The benchmark
protocol owns track selection, model comparison and any promotion decision.

## Primary artifacts and license

The [original BTC authors' repository](https://github.com/jayg996/BTC-ISMIR19/tree/2682317be668032e6e4b269ded36adaa2ad57df0)
contains the model, explicit architecture configuration, inference script and
both published checkpoints. The selected candidate is the original 170-class
checkpoint, not the newer ChordMini continual-learning checkpoint. The repository
has the authors' [MIT license](https://github.com/jayg996/BTC-ISMIR19/blob/2682317be668032e6e4b269ded36adaa2ad57df0/LICENSE)
and explicitly documents inference with these files. Local research evaluation is
consistent with that published use. A future distribution audit must preserve
notices and distinguish model/software rights from underlying training recordings;
the README says those recordings are not distributed because of copyright.

Revision: `2682317be668032e6e4b269ded36adaa2ad57df0`.

| File                           |      Bytes | SHA256                                                             |
| ------------------------------ | ---------: | ------------------------------------------------------------------ |
| `test/btc_model_large_voca.pt` | 12,229,576 | `1673d23f8f9a55ae7f9e8b80a51da616debb22675b8d8b67ea6ce0ef37b0ab51` |
| `test/btc_model.pt`            | 12,154,754 | `71c2c5db17e8c43b8a9a9da5db36ef2d667158c07a214eba16344c154c00bf54` |
| `run_config.yaml`              |        791 | `47ee1db8753d5e3cd2fceea1204c87e4d050ff54b59276f966ef4834962a8756` |
| `btc_model.py`                 |      7,361 | `b8cc0b66f3e7bc92e9703ea408bce21d8a39b10c3133cb2ab569c285fceb3a27` |
| `utils/transformer_modules.py` |     10,480 | `a68458094e1af876b021d3f955b70f52382c30a818bb51aff908ffec35310ece` |

All source/checkpoint files and complete acquisition hashes remain in ignored
`.superpowers/diagnostics/btc-original-r005/`. The 25-class artifact was inspected
for safe loading but was not inferred or selected as a benchmark arm.

## Architecture and safe loading

The [original configuration](https://github.com/jayg996/BTC-ISMIR19/blob/2682317be668032e6e4b269ded36adaa2ad57df0/run_config.yaml)
explicitly supplies 8 bidirectional attention layers, 4 attention heads, hidden
size/key/value/filter depth 128, input size 144 and sequence length 108. Original
`test.py` changes only output classes from 25 to 170 for the large vocabulary.
This resolves the missing attention-head metadata problem encountered in R003.
The adapter uses these values directly, without architecture inference or tuning.

The 2019 artifacts use legacy PyTorch serialization. The modern ZIP-only unsafe
global scanner cannot inspect that container format. `weights_only=True` succeeds
with only NumPy's scalar constructor, dtype and float64 dtype class explicitly
allowed. No unrestricted pickle loader is used. All 221 parameter keys/shapes
match strictly, accounting for 3,036,842 parameters in the 170-class model.
Bundled normalization is mean -2.2279878897355596 and standard deviation
1.7191329394436938. The adapter validates source and checkpoint hashes before load.

Compatibility changes are restricted to in-memory imports: replace the removed
NumPy `np.float` alias with its original equivalent `float`; omit an unused
CLI-only YAML/HParams import; isolate upstream module names. Original files remain
unchanged. No model layer, activation, attention arrangement or weight changes.
The installed environment is Torch 2.11.0 CPU, NumPy 2.5.3 and librosa 1.0.0;
this is a modern compatibility run, not a claim of bitwise reproduction of 2019.

## Important preprocessing and timing details

The [original feature code](https://github.com/jayg996/BTC-ISMIR19/blob/2682317be668032e6e4b269ded36adaa2ad57df0/utils/mir_eval_modules.py)
computes CQT separately on consecutive ten-second PCM blocks: 22,050 Hz, 144 bins,
24 bins/octave, hop 2,048, default C1 minimum frequency and default fixed tuning.
The log transform is `log(abs(cqt) + 1e-6)`. Each complete block produces 108
frames. Features are normalized with checkpoint mean/std and inferred in
non-overlapping 108-frame windows, including normalized-zero final padding.
The adapter preserves this acoustic recipe and uses original model decisions.
It also retains full class posteriors for evidence and future declared decoders.

Two input/output edge corrections are explicit. The original helper assumes its
full-block loop ran and fails on files at or below ten seconds; the adapter handles a
single partial block. Original output uses a uniform `10/108` seconds per frame,
whereas actual hop duration is `2048/22050` and the next CQT block resets at exactly
ten seconds. The adapter records `block_start + frame_index * 2048/22050`, avoiding
within-block timing drift, and clamps the final endpoint to exact PCM duration.
It does not round centiseconds or discard short predicted regions.

Vocabulary is 12 roots × 14 qualities, plus X and N. It includes major/minor,
dim/aug/sus2/sus4, sixths and several seventh qualities. It has no explicit slash
bass, ninth, eleventh or thirteenth labels. Research comparison must therefore
measure root/quality/seventh accuracy separately from bass and vocabulary capacity,
while any production decision still reports the lost capabilities. X at index168
remains distinct from N at index169 in adapter outputs.

## Reusable adapter and procedural verification

From `ml/`, use `experiments.original_btc.OriginalBTC(170)` once and call
`recognize(pcm)` with finite float32 mono 22,050-Hz PCM. It returns a complete
`segments` timeline, identity/timings, and NumPy `features`, `times`, `predictions`
and `probabilities` for an exclusive caller-owned cache. It opens no audio or
annotation files, performs no network requests, uses two CPU threads and checks
8 GiB available RAM before model initialization.

The procedural 12.5-second sine probe passes exact endpoint, finite probabilities
and normalized row-sum checks. It produces 135 × 170 probabilities; frame108 is
exactly at 10.0 seconds. Setup takes 1.28 seconds, CQT 1.10 seconds including first
library/JIT use, and neural inference 0.046 seconds. This is numerical/runtime
evidence only, not musical recognition accuracy or a production speed claim.
Full preflight is retained in `runtime-preflight.json` in the ignored artifact
directory. Four unit tests cover sample-block partitions, original CQT parameters,
block-origin timing, endpoint/short-region preservation and vocabulary positions.
The adapter and tests pass Ruff lint and formatting.

## Chordino reconnaissance

The [authors' Chordino page](https://isophonics.net/nnls-chroma) documents NNLS
spectral-to-note features, global tuning, a chord dictionary and optional HMM
smoothing. It is a mature independent non-neural baseline, with more explicit
bass structure than BTC, but its authors describe the decoder as simple rather
than state of the art. Its [source license](https://github.com/c4dm/nnls-chroma/blob/master/README)
is GPLv2-or-later. Local benchmarking does not require linking it into Harmonia.

[Sonic Annotator](https://vamp-plugins.org/sonic-annotator/) is the supported
non-interactive Vamp command-line host. The current official GitHub release is
[1.7 for Windows x64](https://github.com/sonic-visualiser/sonic-annotator/releases/tag/sonic-annotator-1.7).
The authors' linked Chordino 1.1 Windows binary is x86, so an appropriate 32-bit
host/bridge or a verified build from original source is needed before claiming
that this particular combination works. The legacy binary URL timed out during
the read-only availability probe. No third-party binary, GUI or plugin installation
was used, and no Chordino score is claimed. BTC170 is the concrete ready candidate
for the current broader benchmark; Chordino remains a separately reproducible
baseline opportunity rather than a prerequisite blocking that work.
