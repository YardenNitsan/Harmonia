# Controlled recognition follow-up, 2026-09-21

Four bounded alternatives were evaluated against the retained original native
LV recognizer. None passed its predeclared training gate, so none was promoted
and none opened validation arrays. This is new measured evidence, including a
different published acoustic model; it does **not** establish a chord-identity
accuracy improvement. The separate onset-boundary work has its own protocol and
validation evidence and must not be described as a new trained recognizer.

## Comparable evidence

Every row below uses the same 9,548 valid prepared frames from HU33 training
compositions 02/03, including 2,110 inversion frames. Only the candidate changed;
the baseline comes from retained native v2 timelines, without repeated inference.
Each experiment has its own protocol frozen before candidate scoring. These two
classical voice/piano recordings are controls, not broad music benchmarks.

| Candidate                       |   Root |  Triad | Seventh |   Bass | Reduced exact | Bass on inversions |
| ------------------------------- | -----: | -----: | ------: | -----: | ------------: | -----------------: |
| Retained native LV              | 75.56% | 81.62% |  77.79% | 70.17% |        55.80% |             38.58% |
| R001 upstream full dictionary   | 75.30% | 81.38% |  77.79% | 69.83% |        55.18% |             38.58% |
| R002 overlapping LV context     | 77.04% | 78.93% |  76.26% | 69.68% |        55.44% |             38.63% |
| R003 published ChordNet runtime | 65.59% | 66.67% |  74.22% | 54.43% |        45.58% |              7.20% |
| R004 upstream layered LV decode | 76.01% | 82.31% |  76.91% | 70.90% |        55.40% |             38.63% |

Reduced exact uses the existing eight-component evaluation projection, including
its documented vocabulary reductions. It is not full canonical chord-string
accuracy. Per-track metrics, class supports and extension precision/recall remain
in the machine-readable reports under `ml/experiments/results/R00*-*/training.json`.
No locked tests, user-song labelled scoring, new training, parameter sweeps or
Bob Dylan accuracy checks occurred. These four studies did not invoke a model on
Killer Queen; the separate parent Windows acceptance checks run native v3 on the
exact user recordings and retain their evidence independently.

## What each controlled change established

[R001 protocol](recognition-vocabulary-audit-protocol.md): replace only the
submission dictionary with the unmodified upstream full dictionary, keeping
HMM30. Eligible output states increase from 301 to 2,737. Training-02 projected
dictionary coverage rises 87.26% to 100%; inversion coverage rises 58.38% to 100%.
Training-03 coverage rises 91.65% to 97.32%; inversion coverage rises 50.79% to
84.19%. Actual accuracy falls. Missing vocabulary is real, but adding states
does not repair insufficient acoustic evidence and can select additional errors.

Raw independent head diagnostics strengthen that distinction. On all 10,832
retained native frames, the seventh head selects dominant seventh on 1,132 frames
and diminished seventh on 54, while major seventh never wins. All three upper
extension heads select absence on every frame. On the masked scoring frames,
independent root/triad/seventh/bass accuracy is 76.49/81.64/77.15/69.99%.
The seventh head is therefore not globally disconnected or misindexed; its
complete underactivation on Killer Queen is recording-dependent evidence.

[R002 protocol](recognition-context-protocol.md): original full-audio CQT and
weights, 1,000-frame neural windows with 500-frame overlap, equal posterior
aggregation, then one global HMM30. This matches the original training sequence
length and tests sequence-wide normalization/context sensitivity without training.
The two recordings move in different directions: exact accuracy falls
48.93% to 43.77% on 02 and rises 59.94% to 62.46% on 03. Pooled root improves but
triad, bass and reduced exact regress. No alternate window size was tried.
Eight/twelve windows per network take 6.94/9.85 seconds, versus retained full-song
network timings 3.68/4.02 seconds. These are descriptive separate-run measurements.
CQT and candidate heads are cached locally for future reproducibility.

[R004 protocol](recognition-layered-protocol.md): use the original documented
two-stage decoder option: decode root/triad plus bass first, then suffixes
restricted to that path. Original heads, dictionary and HMM30 remain fixed.
The better root/triad/bass scores accompany worse seventh and reduced exact.
The predeclared guard correctly rejects that tradeoff; no lower penalty or
combination with onset alignment was chosen after seeing results.

## Published alternative model and exact limitations

[R003 protocol](recognition-chordnet-protocol.md) compares the published ChordMini
ChordNet 2E1D checkpoint at revision
`aa6e3a8d7b017f082fd2aaff9329d5c26af49c03`. The
[author's README](https://github.com/ptnghia-j/ChordMini/blob/aa6e3a8d7b017f082fd2aaff9329d5c26af49c03/README.md)
explicitly supplies the checkpoint and a local inference command. That supports
this author-intended local research evaluation; the earlier absence of an explicit
checkpoint redistribution statement was not treated as a prohibition on running
the published example. The README's MIT scope names source/config/docs and excludes
third-party dataset rights. Checkpoint bundling remains unresolved; this experiment
does not redistribute its weights.

The downloaded 27,523,646-byte artifact has SHA256
`ecc3de5e7b5b4affdd8e903106e11c24440631e5f43cf22d2a5975b3f160229a`.
PyTorch's unsafe-global scan is empty and `weights_only=True` loads it successfully.
All parameter keys/shapes match strictly: 2,290,441 parameters, 170 classes.
The artifact's normalization is mean -2.227988 and standard deviation 1.719133.
All 170 checkpoint/runtime vocabulary projections agree; spelling differences
are enharmonic, so canonical pitch spelling does not explain the loss.

The [official inference implementation](https://github.com/ptnghia-j/ChordMini/blob/aa6e3a8d7b017f082fd2aaff9329d5c26af49c03/src/evaluation/utils/inference.py)
is used with overlap 0.5, Gaussian kernel 9, logit aggregation and majority
smoothing, after its original CQT/log transform and normalization. Complete
coverage is preserved with the CLI default minimum duration zero. Unchanged
modules are loaded directly, bypassing unrelated plotting/YAML package initializer
imports; no package installation or model-function edits were needed. Candidate
feature extraction takes 0.482/0.088 seconds and model inference 0.133/0.140 seconds
on 02/03, excluding imports/model setup. Fast execution does not compensate for the
measured accuracy regression or the lack of slash-bass outputs.

There is a material reproducibility limitation in the
[published loader](https://github.com/ptnghia-j/ChordMini/blob/aa6e3a8d7b017f082fd2aaff9329d5c26af49c03/src/models/common/checkpoint_loading.py):
the checkpoint has no architecture configuration or attention-head metadata.
The loader infers frequency/time head counts by choosing a divisor of a weight
dimension, producing f8/t8/d4 here. Attention-head count is not uniquely encoded
by those tensor shapes, so strict weight matching cannot prove the original
training architecture. The checkpoint's first publication commit
`2cc7c740e3b5ea2e0b74bbd314b1c1583e4193d8` already has that same heuristic.
No authoritative alternative was established and no head-count sweep occurred.
R003 measures this **published runtime configuration**, not the architecture's
best possible result or a definitive rejection of all ChordMini models.

The runtime also uses installed librosa 1.0.0, NumPy 2.5.3 and Torch 2.11.0 CPU,
where upstream pins older versions. Dependency parity and checkpoint architecture
provenance would need resolution before claiming research reproduction. BTC CL
and original BTC remain separate alternatives; they were not downloaded or scored.
The [original BTC authors](https://github.com/jayg996/BTC-ISMIR19) document their
bi-directional Transformer and historical training corpus; that does not prove
performance on Harmonia's controlled recordings or settle newer checkpoint terms.

## Adapter/preprocessing investigation

Native LV still agrees with the original
[CQT implementation](https://github.com/music-x-lab/ISMIR2019-Large-Vocabulary-Chord-Recognition/blob/master/extractors/cqt.py)
and [model inference](https://github.com/music-x-lab/ISMIR2019-Large-Vocabulary-Chord-Recognition/blob/master/chordnet_ismir_naive.py):
mono 22,050 Hz, hop 512, 288 bins/36 per octave from F-sharp0, automatic tuning,
crop 18:270, original InstanceNorm/bidirectional LSTM, softmax per head, then
mean of five networks. The native sample-rate contract matches librosa's default
used by the original extractor. No root offset, swapped seventh index, accidental
training-mode normalization or missing softmax was found.

The HMM forces its first frame to N, and N marginalizes undefined suffixes while
pitched states score all applicable suffixes. These are upstream modeling choices,
not established integration bugs. A forced first N could affect immediate pitched
starts, but it does not explain Killer Queen's many seconds of high raw N support.
Replacing undefined N suffixes with absence probabilities was considered and
not run: marginalizing undefined targets is legitimate, so that change would need
its own evidence rather than being presented as a correction.

## Preservation and verification

Reports and stage/source/input hashes are exclusive files in R001–R004 result
directories. R001's exact run source is retained as `source-at-run.py.txt`; its
only post-run source edit adds a Ruff import-position annotation, with no numerical
change. Downloaded source/checkpoint and ChordNet features/predictions remain in
ignored `.superpowers/diagnostics/chordnet-r003/`. R002 CQT/head archives remain
local and ignored. Existing historical diagnostic artifacts are untouched.

All four new experiment sources pass Ruff lint and formatting. Procedural window
aggregation preserves exact inputs across lengths 1, 999, 1000, 1001, 1499, 1500,
1501 and 6475. Every completed training report records failure; their validation
entry points refuse evaluation before reading validation arrays. No GUI was opened.
