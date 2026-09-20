# ML operating rules

The root `../AGENTS.md` applies. Read the dataset audit before acquisition.
Use this directory's `.venv`; never modify the system Python installation.
Run Python module commands from this directory. Use `ruff check .`,
`ruff format --check .`, and `pytest -q` through the virtual-environment interpreter.

GuitarSet's locked split groups progression families and all associated performers,
styles and takes: family 1 training, 2 validation, 3 test. Do not change the locked
test to improve results or split frames randomly. The current training split has
very little minor/rare harmony; report this distribution shift and unsupported classes.
GuitarSet is not evidence of broad commercial full-mix recognition quality.

Store experiments in `experiments/`, raw audio in ignored `data/downloads/`, prepared
features in ignored `data/prepared/`, and checkpoints in ignored `checkpoints/`.
Record code/data/config hashes and versions. Audit and preserve pretrained model
licenses. Avoid pickle/untrusted checkpoints; load only artifacts created here or
verified audited distribution artifacts, and prefer ONNX for production deployment.

Resource defaults: at most two CPU workers, at most 45% GPU memory, retain at least
8 GB system headroom where feasible. Explicitly bound OOM recovery. No silent device,
preprocessing, vocabulary or numerical-precision changes between experiments.
Label inference-only latency as such; it excludes decode/feature/runtime initialization.
Do not report uncalibrated component softmax as whole-chord confidence.

## Frozen evaluation and artifact

Selection is frozen in `experiments/results/selection-freeze.json` for
E004-transposition-tcn. Its family-3 test and the Python DSP test have been
evaluated once. Do not tune against, overwrite or rerun these reports.
The selected output is `artifacts/structured-chord-v1/model.onnx`, with raw
26-feature input and normalization embedded. Root calibration is optional,
external to ONNX, and does not calibrate whole chords. Preserve attribution.
The default application profile must remain DSP given the measured failures.

The checked-in dependency snapshot is `requirements-lock-win-py313.txt`.
The current suite also tests persistent-worker epoch propagation, exact CPU
interrupted resume, dynamic ONNX numerical parity and temperature fitting.
See `../docs/training.md` for commands and the historical sampler caveat.
