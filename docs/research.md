# Research and decisions

Reviewed 2026-09-20. This records primary-source findings and proposed experiments. It does not certify that a model has been installed, trained, benchmarked, or integrated. Actual results must be recorded in the experiment registry and final report. See [dataset audit](data/dataset-audit.md) and [provider capabilities](provider-capabilities.md).

## Decisions that support implementation now

Build a deterministic local-file player and a replaceable DSP recognizer first. Use a structured chord domain richer than any individual model's vocabulary. Preserve frame evidence and boundary scores so later decoding can split or merge proposed segments. Start real-audio experiments with CC BY 4.0 GuitarSet and maintain narrow claims about its guitar-only coverage. Compare a small custom supervised network against DSP and licensed pretrained inference, rather than assuming a larger network wins.

The initial product should expose uncalibrated evidence scores as such. A template similarity, softmax maximum, or boundary novelty normalization is not a measured probability of correctness. A trained model is not automatically calibrated either.

## Chord representation and evaluation

[Harte's 2010 thesis](https://qmro.qmul.ac.uk/xmlui/bitstream/handle/123456789/534/HARTETowardsAutomatic2010.pdf?sequence=1) defines root spelling, chord quality/degree structure, and bass relative to the root. This supports a domain model with pitch class plus spelling, triad, fifth, seventh, extensions, alterations, additions, omissions and explicit bass. Store no-chord separately from unknown/unrecognized harmony. Keep semantic degrees: a sixth and a diminished seventh can share pitch class without having the same spelling or harmonic meaning.

Implementation implications: preserve 9/11/13 rather than collapsing all degrees modulo 12; derive pitch-class sets for acoustic scoring. Harte `C:maj/3` is display `C/E`, whereas `C:maj/5` is `C/G`. Display slash letters and Harte bass degrees are different boundary grammars. Unsupported notation must return a typed parse error, not silently become a major triad. Keep original annotation text and conversion provenance for auditability.

[mir_eval chord documentation](https://mir-eval.readthedocs.io/latest/api/chord.html) supplies root, maj/min, triad, seventh, inversion and segmentation comparisons. Its subalphabet scores can omit out-of-gamut references, so report coverage/denominator alongside every score. Duration-weighted recall is needed, but cannot alone establish extension quality. Add exact normalized structure, bass pitch class, per-component macro F1, per-quality confusion, rare-class support, and calibration metrics. Merge reference/estimated interval grids before duration scoring. Use explicit no-chord intervals to fill gaps.

## Current chord model candidates

| Candidate                 | Evidence and architecture                                                                   | Practical decision                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| DSP templates             | Deterministic pitch-class evidence plus duration/context penalties                          | Fast reference implementation; measure all limitations                                                                |
| BTC                       | Bidirectional Transformer over CQT; original repository also contains CRF and baseline code | Established baseline B candidate; pin code/checkpoint and adapt old dependencies in isolation                         |
| LV-Chordia / Jiang et al. | Decomposed chord prediction and temporal decoding from the 2019 structured-chord system     | Practical pretrained large-vocabulary baseline C candidate                                                            |
| ChordFormer               | Conformer, structured heads, reweighted loss, contextual decoder                            | Motivates a controlled CNN/TCN versus Conformer experiment; no official licensed checkpoint established in this audit |

[BTC's original repository](https://github.com/jayg996/BTC-ISMIR19) is MIT and supports major/minor and larger-vocabulary modes. Its data notes explicitly say annotations did not include recordings; historical collection from online music services is not an acquisition recipe for Harmonia. Model quality reported elsewhere must not be represented as a local benchmark.

[LV-Chordia](https://github.com/openmirlab/lv-chordia) modernizes the original implementation for PyTorch 2.x and exposes local-file, timestamped JSON inference. It bundles five checkpoints, about 28 MB total, and uses an HMM with selectable dictionaries. The [original author's repository](https://github.com/music-x-lab/ISMIR2019-Large-Vocabulary-Chord-Recognition) includes pretrained models and an MIT license; raw LICENSE text was checked in both repositories and attributes Music X Lab. Preserve notices, pin revision/package hashes and map labels into the canonical domain. Its unrestricted `full` dictionary is specifically described by the original authors as untested; use the documented submission vocabulary for the first reproducible comparison. Disable URL-based fetching in the app adapter. Keep this Python comparison harness separate from production deployment until export/latency measurements justify integration.

[ChordFormer](https://arxiv.org/html/2502.11840v1) combines CQT, convolution/self-attention, component prediction and class reweighting. It predicts combined root/triad, bass, seventh, ninth, eleventh and thirteenth categories. The paper reports improvements on its benchmarks, not Harmonia's data. Its representation is useful evidence for shared component learning but should not constrain our canonical model: explicit omissions, added tones and spelling still matter. Paper access does not grant a checkpoint license. No local reproduction, complete official code release or redistribution-ready checkpoint has been verified here.

Initial custom candidate: shared small temporal encoder with root, triad, fifth, seventh, bass, extension/alteration, pitch-class, no-chord and boundary outputs. Use masks for genuinely missing labels rather than treating unannotated components as absent. Predict mutually exclusive values within a degree, with explicit absent/unknown handling. Compare a CNN/TCN to a context-bearing CRNN or compact Conformer only after baseline learning curves exist. Keep acoustic likelihood separate from transition preference; rare progressions must remain possible.

## Features and harmonic boundaries

Candidate representations must use a single versioned feature implementation for training and inference. Planned comparisons:

| Representation        | Question to answer                                                         | Cost/limitation to measure                         |
| --------------------- | -------------------------------------------------------------------------- | -------------------------------------------------- |
| STFT chroma           | Does a small, deterministic template baseline provide useful chord timing? | Octave collapse; harmonic confusion                |
| CQT chroma / full CQT | Does log-frequency resolution improve bass and chord structure?            | Feature cost, tuning sensitivity and time smearing |
| Log-mel               | Does learned timbral context help beyond pitch-aligned bins?               | Pitch-shift equivariance and data demand           |
| HCQT                  | Does harmonic stacking improve fundamentals under overtones?               | Extra channels and memory                          |
| HPCP                  | Does peak-based pitch evidence improve detuned/noisy material?             | Peak selection and harmonic weighting              |
| Bass features         | Does an explicit low-register channel improve slash-chord accuracy?        | Instrument fundamental ambiguity                   |

Baseline boundary score: combine adjacent-window chroma/CQT change, bass change and onset novelty with robust local normalization. Retain continuous evidence at each frame, perform peak selection only for candidate proposals, and let chord posteriors add/remove boundaries later. A 20 ms tolerance cannot be justified by a 100 ms output grid; timing resolution and window-centering offsets must be measured explicitly.

Learned detector: boundary binary head trained with tolerance-aware targets; compare independent encoder, shared chord encoder and fused DSP+ML scores. Evaluate one-to-one event matching at 20/50/100 ms, precision, recall, F1, missed-reference fraction, false positives per minute, and absolute timing error. For frame false-positive rate, define negative frames and exclude annotated tolerance collars. Report annotation precision and avoid claiming sub-frame ground-truth accuracy from inferred GuitarSet boundaries.

Beat evidence may adjust boundary likelihood but must not hard-quantize every change. Keep original seconds, proposed musical alignment, and alignment confidence. Acoustic evidence must preserve syncopated transitions.

## Beat, downbeat, bar and meter

[Beat This!](https://github.com/CPJKU/beat_this) produces beat and downbeat times, supports CPU/CUDA, and explicitly publishes MIT code and weights. The smaller model is about 8.1 MB versus about 78 MB for the main model. Authors warn that evaluation on training datasets is optimistic and describe split-specific checkpoints. That warning applies to any comparison we run. Prefer its default non-DBN path initially and audit dataset overlap.

[madmom](https://github.com/CPJKU/madmom) has BSD code but generally CC BY-NC-SA 4.0 model/data files. It cannot be treated as a permissive pretrained dependency for this product. A code-only algorithm reuse decision must keep model files separate.

DSP onset/tempo tracking remains the CPU reference. Derive bars only when downbeat and meter evidence exists; an evenly spaced tempo grid is not proof of downbeats or a 4/4 meter. Store unknown meter and uncertain bar positions honestly. Benchmark beat/downbeat F1, continuity, tempo octave errors, variable tempo and offbeat chord transitions.

## Source separation

[Demucs v4](https://github.com/facebookresearch/demucs/blob/main/README.md) offers a Hybrid Transformer separation baseline and MIT code. The original repository is archived; its author's successor fork is only receiving limited fixes. This maintenance constraint matters for packaging and dependency risk. Check the selected weight artifact and provenance separately before redistribution.

Run paired experiments on original mixture, accompaniment, mixture+bass features, and accompaniment+bass. Keep the same song splits and chord model settings. Measure duration-weighted chord metrics, extensions, bass/inversions, boundary timing, peak memory, wall time and real-time factor. Separation artifacts can delete useful tones; improvement is a hypothesis. GuitarSet's solo-guitar microphone material is insufficient to validate benefits on vocals/drums/full ensembles. Do not enable an expensive “maximum accuracy” profile until a diverse authorized mixed-audio benchmark demonstrates a benefit.

## Training and calibration experiments

Planned registry entries, not completed runs:

| Experiment | Controlled change                                         | Acceptance evidence                                                      |
| ---------- | --------------------------------------------------------- | ------------------------------------------------------------------------ |
| E001       | DSP baseline on locked GuitarSet groups                   | Full metric report, durations, resource profile, failure examples        |
| E002       | LV-Chordia submission dictionary on identical test tracks | Comparable labels/coverage and runtime; disclose possible source overlap |
| E003       | Small structured encoder, chroma/CQT features             | Validation and locked-test metrics, multiple seeds, per-head support     |
| E004       | Log-mel versus CQT with matched encoder/budget            | Paired validation improvement and cost                                   |
| E005       | Bass channel ablation                                     | Bass/inversion gains with confidence intervals                           |
| E006       | Separate/shared boundary heads and DSP fusion             | Timing-tolerance metrics and false positives                             |
| E007       | Temporal encoder/decoder ablation                         | Rare-harmony preservation plus sequence accuracy                         |
| E008       | Training-only augmentation and class weights              | Rare-class gains without majority/calibration collapse                   |
| E009       | Validation-fitted temperature scaling                     | Held-out ECE, Brier score and reliability bins                           |
| E010       | ONNX/export/precision comparison                          | Numerical parity, quality delta, CPU/GPU cost                            |

Use composition/duplicate groups for splitting, with an additional performer-disjoint view. Preserve immutable manifests, source/license references, data hashes, code revision, seed, normalization configuration, hyperparameters, best/latest checkpoints and resource measurements. Learning curves should use nested training subsets with fixed validation/test sets. Pitch shifting must transpose root and bass and preserve degree structure. No evaluation augmentation. Never tune against the locked test; report test once after model selection, with subsequent independent test acquisition required for further tuning claims.

Detect the actual RTX 5070 and available memory rather than assuming capacity. Start with bounded batch/worker counts; leave Windows and development headroom, support checkpoint resume, and cap OOM retries. Record both data and model limitations when learning saturates. Synthetic renders can supplement rare structures but cannot replace real-audio final evaluation.

## Desktop inference and application architecture

[ONNX Runtime's DirectML page](https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html) now describes DirectML as sustained engineering and directs new Windows functionality toward WinML. CPU ONNX Runtime is the portability baseline; benchmark CUDA and Windows runtime options behind an adapter. Do not hardwire a GPU vendor. Export success is insufficient: verify frame logits/labels, padding, sequence length, CQT equivalence, timing alignment and numerical tolerance on real inputs. Quantization is accepted only after accuracy and runtime measurement.

[Tauri's process model](https://v2.tauri.app/concept/process-model/) separates the core process from webviews. Use native boundaries for local files, SQLite and runtime lifecycle, while workers/native tasks carry expensive analysis. [Tauri capabilities](https://v2.tauri.app/security/capabilities/) provide scoped frontend access to native commands. Scope access to selected files and app-owned storage; do not expose unrestricted shell execution for audio/model processing. These are architecture decisions, not a claim that clean-machine installers have been tested.

For the listening interface, build a stable current-chord hierarchy, neighboring context, duration-proportional timeline and inspection panel. Motion follows the playback clock and honors reduced-motion settings. This design direction must be evaluated in actual compact/1080p/1440p/high-DPI views, keyboard navigation and seek/loop flows. No external design tool is required to build that evidence.

## Evidence still required

No research-source headline establishes Harmonia accuracy, calibrated confidence, latency, GPU memory, or installer quality. Completion still requires executed baseline/custom comparisons, licensed diverse real-song coverage, held-out advanced/slash-chord analysis, shared-vs-independent boundary ablation, separation ablation, CPU/export checks, native interaction tests and a clean-machine release test. Dataset coverage is currently the main obstacle to a defensible broad commercial-music quality claim; it does not prevent building or measuring the local application and the licensed guitar-domain experiments.
