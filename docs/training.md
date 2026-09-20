# Reproducible ML workflow

Commands run from `ml/` with `.venv/Scripts/python.exe`; no system Python
packages are modified. `requirements-lock-win-py313.txt` captures the tested
Windows Python 3.13 environment. Install the recorded Torch CUDA build from
the PyTorch cu128 index before applying that lock. GPU training used Torch
2.11.0+cu128 on an RTX 5070. CPU-only deployment uses the ONNX artifact.

## Data and splits

Audit: `docs/data/dataset-audit.md`. Only the approved GuitarSet microphone
audio and annotations were acquired. The prepared manifest records archive
and per-file hashes, exact durations, label counts, transformations, feature
settings and train-only normalization. There are 360 tracks, 3.0468 hours
and 4,320 annotated segments. Family 1 is training, family 2 validation and
family 3 test, each with 120 tracks. Related tempi, performers, comp/solo
takes and augmentations stay inside their progression family. Performers
are shared across splits; the primary evidence is progression-disjoint,
not performer-disjoint generalization.

The training family has 104,958 major and 3,146 minor frames; validation
has 75,972 major and 65,016 minor frames. This extreme composition shift
limits learned chord-quality performance. Reweighting and pitch transposition
did not solve the shortage of representative training harmony. Synthetic
audio is used only for numerical and regression fixtures.

## Experiments

Configs live in `ml/experiments/`; validation, calibration, runtime and
held-out reports live in `ml/experiments/results/`. Raw audio, prepared
features and checkpoints remain ignored. Training results record source
hashes, config/data hashes, hardware, history, checkpoint paths and measured
resource use. E002/E003 predate the expanded provenance record.

| ID   | Change                                        | Conclusion                                                   |
| ---- | --------------------------------------------- | ------------------------------------------------------------ |
| E001 | Python chroma-template DSP                    | Measured baseline; differs from the browser DSP pipeline     |
| E002 | 12-feature chroma TCN                         | Low validation quality                                       |
| E003 | 26 features including bass, energy and flux   | Similar root quality; modest bass improvement                |
| E004 | Epoch propagation fix and pitch transposition | Better roots; changes are confounded versus E003             |
| E005 | E004 plus quality class weights               | Controlled single-change comparison; negligible overall gain |
| E006 | Pinned LV-Chordia 1.1.0 ensemble              | Stronger on the fixed 12-track validation subset             |

E004/E005 share seed 20260920, 64 channels, three blocks, dropout 0.15,
512-frame crops, three samples per track, batch size 8, learning rate 0.001,
AdamW weight decay 0.0001 and at most 12 epochs. The selected checkpoint
maximizes mean root/triad/seventh/bass validation accuracy with an improvement
threshold of 0.001 and patience 3. E004's saved score is 0.4144138940;
E005's is 0.4142909617. This tiny difference is not a significance claim.

Pitch augmentation rotates both chroma groups before normalization and
transposes absolute root/bass targets. Relative quality, extensions and
no-chord are preserved. This is feature-space augmentation: fixed bass
cutoff effects are not physically identical to waveform pitch shifting.
E005 uses inverse-square-root training-frequency weights capped at eight
for triad and seventh heads only.

## Resume and resource behavior

Persistent Windows DataLoader workers originally retained epoch zero.
A regression reproduced repeated crops; epoch state now uses a shared
tensor. Checkpoints now include scheduler and Python/NumPy/Torch/CUDA/sampler
RNG state. Sampler randomness is separated from worker creation randomness.
A two-epoch CPU test verifies uninterrupted and interrupted/resumed model
weights, histories and scheduler state are identical with persistent workers.
Changed scientific settings and legacy checkpoints lacking resume state
are rejected. E004/E005 were uninterrupted runs before the final sampler
stream separation; their checkpoints and original source hashes preserve
the measured result, but rerunning their configs with the final runner is
not claimed to reproduce their exact historical bit patterns. CUDA runs
are seeded but bitwise cross-device determinism is not claimed.

The runner caps workers at two, Torch CPU threads at two and the GPU allocator
fraction at 45%. E004/E005 used one worker, about 50.3 MB maximum Torch tensor
VRAM and final main-process RSS around 2.1 GB. RSS is a final snapshot, not
a measured peak including children; CUDA context/driver allocation is not
included in Torch's tensor metric. Training loops took 29.82 and 27.12 seconds,
excluding setup. OOM aborts rather than retrying indefinitely; the latest
completed epoch is available for resumption when its format is compatible.
Do not infer a total-machine hard memory cap from these measurements.

## Verified commands

```powershell
.venv/Scripts/python.exe -m pytest -q
.venv/Scripts/python.exe -m ruff check .
.venv/Scripts/python.exe -m ruff format --check .
.venv/Scripts/python.exe -m harmonia_ml.training.runner experiments/E004-transposition-tcn.json
.venv/Scripts/python.exe -m harmonia_ml.evaluation.report --manifest data/prepared/guitarset-v1/manifest.json --split validation --checkpoint checkpoints/E004-transposition-tcn/best.pt --output experiments/results/E004-validation.json
.venv/Scripts/python.exe -m harmonia_ml.evaluation.temperature --manifest data/prepared/guitarset-v1/manifest.json --checkpoint checkpoints/E004-transposition-tcn/best.pt --output experiments/results/E004-root-temperature.json
.venv/Scripts/python.exe -m harmonia_ml.export.onnx --checkpoint checkpoints/E004-transposition-tcn/best.pt --output artifacts/structured-chord-v1 --calibration experiments/results/E004-root-temperature.json
```

Do not rerun training into the selected checkpoint directory: selection and
test evaluation are frozen. For future research, create a new experiment ID
and output directory. A different corpus/split or representational change
requires a new feature/target version and a new independent test policy.

LV-Chordia's public API requires absolute local audio paths. Python 3.13 also
requires `audioop-lts==0.2.2` for its pydub dependency. Native WAV inference
succeeded despite pydub's missing-ffmpeg warning; this does not establish
compressed-format support. Five weight hashes and fixed subset IDs are in
`E006-lv-chordia/selection.json`. Its MIT notice is retained in
`ml/third-party/LV-Chordia-LICENSE.txt`; training-data rights are not implied
by the model's software license.
