# Beat This! feasibility and evaluation limits

Read-only audit, 2026-09-21. No checkpoint/audio download, package installation,
inference, training, locked-test inspection or application change was performed.
**Promising research candidate; not yet eligible for production promotion.**

## Official artifact and overlap

Code inspected at [`b95c8ab0`](https://github.com/CPJKU/beat_this/tree/b95c8ab0c58c2d9fcfd40508ae8dffbc05ac4f5c),
annotations at [`fd9fcc08`](https://github.com/CPJKU/beat_this_annotations/tree/fd9fcc0896cb78730bae735102c8753ef3a3badd).
The authors explicitly release code **and published weights under MIT**, retaining
a caveat about copyrighted/restricted training recordings. This grants artifact
reuse under the notice; it does not establish unrestricted training-audio rights.
[Official license statement](https://github.com/CPJKU/beat_this/tree/b95c8ab0c58c2d9fcfd40508ae8dffbc05ac4f5c#license),
[MIT notice](https://github.com/CPJKU/beat_this/blob/b95c8ab0c58c2d9fcfd40508ae8dffbc05ac4f5c/LICENSE).

| Checkpoints                           | Declared training / evaluation implication                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------- |
| `final0–2`, approximately 78 MB each  | Full training collection except GTZAN; overlaps GuitarSet                                     |
| `small0–2`, approximately 8.1 MB each | Same collection; smaller model does not remove overlap                                        |
| `single_final*`, `fold*`              | Can evaluate only their corresponding published held-out IDs, after matching versions         |
| `hung0–2`                             | Earlier, narrower Hung corpus; excludes GuitarSet according to the paper's dataset definition |

These are published checkpoint variants, not models acquired locally by this
audit. [Official model descriptions](https://github.com/CPJKU/beat_this/tree/b95c8ab0c58c2d9fcfd40508ae8dffbc05ac4f5c#available-models).

The paper uses **GuitarSet comping takes and excludes solos**. Official annotation
tree inspection found 180 `*_comp_mix.beats` files. Harmonia's microphone versions
are another capture of those performances, not independent test recordings.
Solo takes still share compositions/performers, so cannot establish clean
composition-disjoint generalization. Winterreise/HU33 is absent from the declared
corpus; the annotation tree contains other Schubert works in ASAP but no
Winterreise/D911/HU33 paths. This is evidence against known recording overlap,
not an independently verified provenance guarantee for every training file.
[Paper, §4.1](https://arxiv.org/html/2407.21658v1#S4.SS1),
[official GuitarSet annotation directory](https://github.com/CPJKU/beat_this_annotations/tree/fd9fcc0896cb78730bae735102c8753ef3a3badd/guitarset).

## Runtime and safe local loading

`load_checkpoint` uses `torch.load(..., weights_only=True)` for an existing local
path, but **a missing path triggers a network-download fallback**. That fallback
calls `torch.hub.load_state_dict_from_url` without hash or `weights_only` options;
PyTorch 2.11 defaults these to false. A Harmonia adapter should require a resolved,
existing, hash-verified local checkpoint before loading, pin reviewed code and
dependency versions, prohibit fallback downloads, and keep `weights_only=True`.
Do not use unpinned `torch.hub.load` or arbitrary user-supplied checkpoint URLs.
Hyperparameters also need bounded validation before constructing the model.
[Official loader](https://github.com/CPJKU/beat_this/blob/b95c8ab0c58c2d9fcfd40508ae8dffbc05ac4f5c/beat_this/inference.py),
[PyTorch 2.11 loader defaults](https://github.com/pytorch/pytorch/blob/v2.11.0/torch/hub.py).

Inference needs NumPy, PyTorch, torchaudio, einops, rotary-embedding-torch and soxr;
CLI guidance also includes tqdm. Lightning is unnecessary for inference; madmom
is optional for DBN. Prefer the default non-DBN path and `Audio2Beats` with already
decoded local PCM. This avoids depending on another file-decoding fallback chain.
[Package metadata](https://github.com/CPJKU/beat_this/blob/b95c8ab0c58c2d9fcfd40508ae8dffbc05ac4f5c/pyproject.toml),
[preprocessing](https://github.com/CPJKU/beat_this/blob/b95c8ab0c58c2d9fcfd40508ae8dffbc05ac4f5c/beat_this/preprocessing.py).

Local metadata inventory: torch `2.11.0+cu128`, NumPy `2.5.3`, soxr `1.1.0`;
torchaudio, einops, rotary-embedding-torch, tqdm and beat-this are absent.
The authors' historical known-working pins use torch/torchaudio 2.3.1 and NumPy
1.26.4, unlike this Python 3.13 runtime. Installing that old stack over the live
recognizer would be inappropriate; validate a compatible isolated environment.
[Historical pins](https://github.com/CPJKU/beat_this/blob/b95c8ab0c58c2d9fcfd40508ae8dffbc05ac4f5c/requirements.txt).

## CPU evidence

Official CPU execution is supported, but no reproducible CPU latency/RAM benchmark
was found in the inspected paper, README or release notes. The paper describes
approximately 20 million parameters for the main model and 2 million for the
small model. Neither parameter count nor checkpoint size establishes latency.
[Paper, §4.3](https://arxiv.org/html/2407.21658v1#S4.SS3).

Source inspection establishes 22,050-Hz mono preprocessing, 128 mel bins at 50
frames/s, and 1,500-frame inference chunks with six-frame borders. Whole-file
features/results still scale with duration. A future bounded CPU probe must
measure cold/warm end-to-end time and peak RSS, with fixed threads and identical
PCM; no real-time or weak-PC claim is supported yet. Small-model testing would
be the cheaper first feasibility probe, not automatic model selection.

## Is suitable ground truth already local?

**No independently validated, performed beat-timing reference was established in
the current local licensed material.** This is distinct from lacking all timing
annotations.

- GuitarSet has beats, but the inspected training fixture
  `00_BN1-129-Eb_comp.jams` contains 48 equally spaced times at `60/129` seconds,
  interval standard deviation below `1e-15`, and empty annotation-method metadata.
  The official Beat This conversion has the same times. Such a tempo grid can
  test nominal pulse following, not expert-judged played onset timing; final/small
  models additionally overlap its performance. This confirms the parent's grid
  diagnosis without opening a held-out annotation.
  [Matching official training annotation](https://github.com/CPJKU/beat_this_annotations/blob/fd9fcc0896cb78730bae735102c8753ef3a3badd/guitarset/annotations/beats/00_BN1-129-Eb_comp_mix.beats).
- The published Winterreise release provides **audio measure/downbeat positions**.
  Its retained README defines `ann_audio_measure` as audio seconds plus score
  measure position; terminal partial-measure markers also exist. The local HU33
  subset contains only `ann_audio_chord`, not measure CSVs. The paper describes
  explicit measure alignments and transferred annotations, not an independently
  labeled onset for every beat. [Publisher release](https://zenodo.org/records/10839767),
  [authors' paper](https://dbc.library.uu.nl/bitstream/handle/1874/412333/3429743.pdf?isAllowed=y&sequence=1).
- Cached user songs have no independently aligned beat labels. Existing chord
  boundaries and acoustic attacks are not automatically beat ground truth.

A concrete next research step is to acquire only eligible HU33 training/validation
measure annotations under the existing license audit, verify the reference
performance/offset/terminal markers, then evaluate **downbeats**. Do not evenly
interpolate within measures and report those points as performed beat labels.
Keep test compositions locked. Broader beat evaluation needs a separately audited
corpus and overlap check. Better beat scores would still not justify snapping
every chord boundary to a beat or claiming improved chord identity.
