# Whole-song recognition: bounded research and prototype recommendation

Research date: 2026-09-20. The latest user direction makes Search & Analyze the
primary workflow and preserves Listen Live as optional. This document proposes
work; it does not report a new accuracy experiment or promote a model. No models,
datasets or dependencies were downloaded, no training or locked-test evaluation
ran, and no GUI was opened for this research.

## Existing implementation and evidence

`packages/audio/pipeline.ts` currently scores each feature frame independently,
then votes over a symmetric radius of two or four frames. At the approximately
23 ms hop this is short lookahead, already technically noncausal. The complete
recording's key is estimated afterwards for display; it does not influence chord
selection. Novelty values are returned but do not determine production cuts.
`TemplateRecognizer.predict` retains only four candidates. Consequently, simply
calling this pipeline on a complete file is not global harmonic decoding.

Reuse these completed results and their original artifact identities:

| Evidence                                                                               | What it establishes                                                                                                                                                | What remains unestablished                                                                                                                |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [E006 and evaluation ledger](evaluation.md)                                            | Pinned native LV-Chordia achieved 47.68% root and 22.61% reduced structural exact on the fixed 12-track GuitarSet validation subset; paired E004 was 33.08%/7.53%. | General full-mix accuracy, unseen-song independence, production runtime. Original training overlap was not exhaustively established.      |
| [E010 report](../ml/experiments/results/E010-predicted-root-quality-cascade/README.md) | On five HU33 validation compositions, reduced exact improved 19.81% to 25.41%; minor recall improved to 53.53%, with major recall falling to 71.90%.               | Broad recognition quality, extensions or reliable inversions. This is a research cascade, not a release model.                            |
| [E010 export](training.md)                                                             | Frozen CPU ONNX output matches retained decisions on 29,759 raw frames; five procedural plus five full validation cases passed.                                    | Browser acceptance and audio-to-timeline quality. Do not refit or repeat the completed quality experiment.                                |
| [LV export decision](adr/003-lv-export-numerics.md)                                    | Native reference, checkpoints, CQT and numerical diagnostics are retained.                                                                                         | ONNX real-audio logit acceptance still fails; network 1 also fails the long procedural case. Full production preprocessing is unfinished. |
| [B001 result](evaluation.md)                                                           | Actual browser DSP and candidate segmentation were compared with exact valid-interval overlap.                                                                     | Candidate failed its short-transition guard; its changed segmentation must not silently become the default.                               |

GuitarSet guitar performances and HU33 classical voice/piano do not constitute a
representative commercial full-mix benchmark. E004's already-opened held-out test
must not become tuning data; HU33's locked test stays closed. D001/D002/D003 and
LV numerical probes are completed studies, not tasks to repeat under a new name.

## Mature approaches and actual availability

| Approach                                   | Whole-song mechanism and runtime tradeoff                                                                                                                                                                                                                                            | Licensing and decision                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NNLS Chroma / Chordino                     | Tuned, whitened log-frequency analysis estimates note activations, then bass/treble chroma. Global tuning and HMM/Viterbi operate on the recording. Native C++ Vamp integration adds a host/plugin deployment task, but needs no learned checkpoint.                                 | Author repository specifies GPL-2.0-or-later. Preserve notices and evaluate distribution obligations before embedding or bundling; a subprocess is not an automatic exemption. Good independent reference candidate; not already installed or benchmarked here. [Official source and parameters](https://github.com/c4dm/nnls-chroma).                                                                                     |
| Chroma templates plus HMM/Viterbi          | Established global sequence decoding; a self-transition preference discourages unstable switching. Cheap CPU computation relative to neural models, with explicit backpointer memory. Acoustic mistakes can persist or be amplified.                                                 | Implement the published algorithm independently using existing Harmonia scores. The FMP explanation is an algorithm reference; its notebooks and library have distinct licenses. [Author tutorial](https://www.audiolabs-erlangen.de/resources/MIR/FMP/C5/C5S3_ChordRec_HMM.html), [libfmp MIT license](https://raw.githubusercontent.com/groupmm/libfmp/master/LICENSE).                                                  |
| Joint key/chord/bass context               | Established dynamic Bayesian models infer key, chord, bass and metric position together; this is more than filtering chords to one estimated key. Larger state spaces and bad key estimates can damage chromatic/modulating passages.                                                | Research reference, not a newly audited distributable runtime. Start without a key constraint; any later soft prior needs an explicit ablation. [QMUL/Isophonics method description](https://isophonics.net/content/automatic-annotations.html).                                                                                                                                                                           |
| BTC, ISMIR 2019                            | Bidirectional Transformer over CQT; future context exists within its configured inference window. Attention/context and original chunking must be preserved; bidirectional does not itself mean an unlimited full-song receptive field. Python/PyTorch and frontend export add work. | Official code is MIT. An exact redistributable pretrained artifact and its provenance still require separate confirmation; third-party model-card claims are insufficient. [Official repository](https://github.com/jayg996/BTC-ISMIR19), [license](https://raw.githubusercontent.com/jayg996/BTC-ISMIR19/master/LICENSE), [paper](https://archives.ismir.net/ismir2019/paper/000075.pdf).                                 |
| LV-Chordia / chord structure decomposition | Already audited and measured locally. CQT, five networks, full-sequence normalization, bidirectional recurrence and HMM provide substantial offline context. Native Python reference is available; a production sidecar adds large dependencies, startup and packaging costs.        | Original repository and package declare MIT; exact locally pinned artifacts are approved for baseline inference in the [existing audit](data/dataset-audit.md). Reuse them. ONNX promotion remains blocked by ADR003. [Original model repository](https://github.com/music-x-lab/ISMIR2019-Large-Vocabulary-Chord-Recognition), [package license](https://raw.githubusercontent.com/openmirlab/lv-chordia/master/LICENSE). |
| ChordFormer                                | Conformer and structured heads are relevant architecture research. Published improvements do not establish Harmonia quality or CPU feasibility.                                                                                                                                      | The authors' paper was verified; an official redistributable checkpoint/code package was not established in this research. The paper's license is not a model license. Similarly named guitar-classification repositories are not proof of authorship or equivalence. [Authors' paper](https://arxiv.org/abs/2502.11840).                                                                                                  |

Chordino's authors explicitly describe its decoding as a simple baseline. LV's
original repository recommends the `submission` dictionary and says `full` is
untested and not recommended. Enlarging a dictionary does not establish reliable
recognition of its rare chords. No claim of present-day state of the art follows
from this inventory.

## Minimum genuinely global prototype

Recommendation: a separately versioned offline strategy that scores the existing
features, then performs one final Viterbi traceback across the complete recording.
This avoids new training and isolates whether global decoding helps the current
acoustics. It is an engineering prototype with unmeasured accuracy.

1. Keep the current baseline callable. Expose complete acoustic candidate scores
   for the decoder instead of using only top-four frame decisions. Specify a
   bounded, canonical chord-state vocabulary, including explicit no-chord. Avoid
   changing feature extraction and vocabulary at the same time as decoding.
2. Maximize `sum(emission[t, state[t]]) - changePenalty * numberOfChanges` with
   equal initial scores and deterministic tie-breaking. This is a Viterbi-style
   score objective, not calibrated probabilistic inference. Specify emission
   scaling, penalty and silence handling before any validation run. A zero penalty
   must reduce to independent acoustic decisions. No hard minimum chord duration.
3. Retain only rolling path scores plus typed backpointers; a uniform change cost
   permits an exact best/second-best predecessor optimization, O(TK) rather than
   O(TK²). Set explicit frame/state/memory bounds. Worker cancellation and progress
   must remain responsive; return final segments only after full traceback.
4. Prove future dependence with a constructed ambiguous prefix whose decoded
   label changes when informative later frames are appended beyond the existing
   smoothing radius. Also verify preservation of silence, an acoustically strong
   short chord, final duration and deterministic ties. These prove behavior, not
   musical accuracy.
5. Leave key as provisional metadata initially. If introduced later, use a bounded
   soft term with an unknown-key option, never a hard diatonic filter. Compare
   key-free and key-aware decoders separately on modulating/chromatic material.
6. Version the strategy/settings in analysis identities and caches; expose its
   uncalibrated status. Acoustic alternatives remain acoustic alternatives, not
   claimed sequence posteriors. Live output retains its separate latency contract.

Adding only a global key label, a longer voting window, or joining completed live
segments would not implement this recommendation. Nor does global traceback mean
the model understands song form: a first-order transition objective remains simple.

## Meaningful comparison without restarting research

Before execution, freeze one new decoder protocol, source/config hashes, dataset
identities, vocabulary mappings and stopping rules. No grid search or adaptation
to the validation result. Reuse the B001 retained baseline and exact masked
interval evaluator when its input/runtime identities match. Run only the new
decoder arm on the already authorized five HU33 validation compositions; a
historical baseline with different inputs must be identified as unmatched.

Report paired per-composition and pooled time-weighted root and reduced-structural
agreement, major/minor/diminished recall and support, inversion performance,
no-chord support, and boundary precision/recall/F1 at 50/100 ms. Keep unsupported
classes visible. Track short-transition misses and over/under-segmentation so a
smoother timeline cannot win by deleting difficult chords. Retain B001's original
report and failed guard unchanged; any new protocol needs its own acceptance
criteria. Five songs permit descriptive findings, not broad statistical claims.

Use the retained E006 LV outputs only for matching recordings and metrics. No
repeat download, refit, parity study or historical test evaluation is necessary.
A later Chordino/LV comparison on additional licensed complete recordings requires
a separate immutable validation manifest and acquisition audit; source audio
rights and annotation rights are distinct. This document authorizes no acquisition.

Measure actual end-to-end decode/features/recognition/traceback time, sampled peak
memory, cancellation and UI responsiveness in a hidden worker/runtime harness,
including cold and cached runs. Bound long-song stress fixtures separately from
real-song accuracy. Existing prepared-array or 128-frame WASM timings cannot stand
in for this measurement. The prototype may ship only as clearly identified
experimental behavior until its declared comparison passes; switching the product
workflow does not turn the research evidence into recognition acceptance.
