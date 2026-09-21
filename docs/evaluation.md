# Evaluation evidence

Latest broad check: `broad-recognition-results.md` records 150 GuitarSet recordings
and five HU33 validation recordings. In the 60 GuitarSet accompaniment validation
takes, original LV root/reduced exact84.98%/38.73% beats original BTC17080.03%/36.77%.
Aggregating solos obscures that comparison; neither dataset score proves commercial
full-mix accuracy. BTC also loses HU33 root/exact and creates more short regions.
No replacement is promoted. R006 musical-grid tuning passes synthetic detuning
robustness but fails the fixed minimum real-data gain, so production LV v3 remains
unchanged. Detailed per-class, boundary, source, split and timing evidence is retained.

Current native v3 timing follow-up: the separately frozen onset-alignment
candidate improves fixed HU33 boundary precision/recall/F1@50ms from
23.50/16.35/19.28% to 29.89/20.91/24.61%. Root accuracy 62.662→62.667% and reduced
exact 39.862→39.953%; short-adjacent misses remain 4. Full per-class reports and
limitations: `recognition-timing-followup.md`. No new test-set evaluation.

## Latest stabilization: original native LV, not ONNX or new training

The fixed HU33 validation comparison selects native original LV-Chordia over
retained E010 and whole-song DSP: root 62.66% / reduced exact 39.86%, versus DSP
42.81% / 6.17%. Full-precision production boundary F1@50ms is 0.19283; short
transition and inversion recall remain weak. The separate beat-supported transient
guard changes no decisions on the frozen validation and is not credited with an
accuracy gain. Bob's identical audio yields 67 regions instead of 1,052.

See [complete comparison and class limitations](stabilization-model-comparison.md),
[actual Windows flow/timing](stabilization-acceptance.md), and ADR010. No new fits,
locked-test access, rewritten historical reports or relaxed ONNX parity tolerances.
Later historical statements about unchanged production refer to those experiments.

## Latest continuation studies

E010 is a separate predicted-root quality cascade fitted on HU33 training only,
then compared once against frozen E009 on the five validation compositions.
All-present-class triad macro recall improves20.25%→27.02%, minor recall0.34%→53.53%,
and reduced structural exact19.81%→25.41%. Root accuracy remains59.01%. Major recall
falls99.86%→71.90% and overall triad accuracy59.97%→58.86%; augmented/sus4 remain zero.
The bounded research criterion passes; this is not final recognition acceptance.
Its paired CPU baseline differs from the historical GPU baseline by one root/exact
frame out23,250. Preserve both reports. See
`ml/experiments/results/E010-predicted-root-quality-cascade/README.md`.

The separate E010 ONNX CPU export passes five procedural and five full validation
sequences with exact retained decisions on all29,759 raw frames. Largest raw
float32 error is4.77e-6 and float64 quality error7.11e-15, within the unchanged
tolerances. This is runtime parity, not a second quality evaluation. Browser WASM
verification is separate and pending; no model promotion occurred.

D002 uses only four composition folds within HU33 training. Relative features
raise exact inverted-bass recognition0.86%→5.57%, below the declared five-point
gain, while root-position accuracy falls94.21%→90.50%, exceeding the allowed loss.
Inversion macro gain also misses its threshold. All eight fits converge, so the
result is a failed research direction under this protocol, not an interrupted
optimizer. See `ml/experiments/results/D002-hu33-relative-bass/README.md`.

B001 evaluates the actual browser DSP on the same five validation compositions,
using exact valid-interval overlap and precise prepared boundary times. Boundary
F1@50ms improves0.099445→0.135922, but short-adjacent misses increase0→1 among four
eligible references. Root agreement41.73%→40.92% and reduced agreement6.17%→6.12%
remain within the predeclared loss guards. The mandatory short-transition guard
fails, so production segmentation is unchanged. The baseline has188 matched cuts
and3330 false positives; the candidate119 and1369: reduced false positives also
cost substantial recall. See `ml/experiments/results/B001-boundary-refinement/README.md`.
These interval metrics are not interchangeable with historical Python frame scores.

The all-convolution LV precision diagnostic also failed unchanged logit acceptance.
Matching probabilities/argmax does not close this gate; details remain in ADR003.
The subsequent SELU-only arithmetic diagnostic also retains29/2/15 violations;
its improved constructed near-zero activation precision does not solve model parity.

The separate D001 [root-relative diagnostic](data/hu33-representation-diagnostic.md)
uses only training-composition cross-validation and oracle reference roots. Its
24.87%→45.21% quality macro recall is not comparable to E009 full-validation
accuracy and does not authorize production promotion or test access.

## Public-data continuation

HU33 preparation and E007–E009 validation are recorded in
[the controlled experiment report](data/hu33-experiment-results.md). On five
composition-disjoint validation recordings, the longer-context E009 research
candidate achieved root 59.02%, reduced structural exact 19.81%, and boundary
F1 0.2372 at 50 ms. Minor recall was only 0.34%; this is not release-quality
recognition. These HU33 figures are not comparable to the GuitarSet percentages
below. No new locked-test evaluation or production model promotion occurred.

LV-Chordia CPU export now passes all five networks and the original HMM on
procedural sequences through 4,096 frames. The first network passes procedural
sequences through 8,192, but network 1 fails there. A real-audio parity probe of
the existing E006 validation selection matched the first recording's 15 decoded
segments, then failed network 0 on the second recording: 28 of 111,763 triad
logits exceeded the unchanged tolerance, maximum violating error 0.00016919.
The probe stopped and did not claim acceptance for the remaining ten tracks.
See `ml/experiments/results/LV-Chordia-real-audio-parity.json` and the
[CPU investigation](../ml/experiments/results/LV-Chordia-export-cpu.md).

A separate headless browser probe runs the first exported network with local
CPU/WASM, one thread and desktop CSP: 128 procedural frames pass all six head
tolerances. Its roughly 204 ms initialization and 94 ms inference exclude CQT,
audio decoding and ensemble/HMM work. This establishes operator compatibility,
not production preprocessing, full-song parity or an app quality improvement.

## Frozen GuitarSet evidence

All percentages below concern prepared real GuitarSet microphone recordings.
They do not measure commercial full mixes. Equal-hop frame accuracy weights
time approximately, and excludes incomplete final FFT frames. The Python
DSP baseline uses the same prepared features as the learned model; it is
not a measurement of the application's different browser DSP implementation.

## Validation and selection

Full validation contains 120 family-2 tracks, 168,792 frames and 1.0914 hours.

| Method                 |   Root |   Bass | Reduced structural exact |
| ---------------------- | -----: | -----: | -----------------------: |
| E001 Python DSP        | 26.20% | 16.12% |                    3.09% |
| E002 chroma TCN        | 30.50% | 23.72% |                    4.89% |
| E003 chroma+bass TCN   | 30.29% | 24.99% |                    5.02% |
| E004 transposition TCN | 34.04% | 27.06% |                    5.40% |
| E005 weighted TCN      | 33.62% | 27.44% |                    5.57% |

The predeclared four-component mean selected E004, not the highest reduced
exact score. E004 and E005 differ by only 0.000123 in that saved selection
score. No confidence interval or statistical significance is claimed.
The freeze record at 2026-09-20 09:25:29 UTC records model, dataset and
calibration hashes before the held-out evaluation.

## Pretrained matched subset

Twelve validation tracks were selected before inference to cover all six
performers, all five styles, and comp/solo modes. The fixed IDs, pinned
five checkpoint hashes and outputs are retained under
`ml/experiments/results/E006-lv-chordia/`. This is a small descriptive subset,
not a replacement for the full 120-track comparisons.

| Method on identical subset              |   Root | Reduced structural exact |
| --------------------------------------- | -----: | -----------------------: |
| Python DSP                              | 23.88% |                    2.56% |
| Selected E004                           | 33.08% |                    7.53% |
| LV-Chordia 1.1.0, submission dictionary | 47.68% |                   22.61% |

LV-Chordia boundary F1 is 0.3293 at 50 ms and 0.4016 at 100 ms. It processed
6.50 minutes in 5.72 seconds including repeated model loading and feature
extraction, with imported-library setup and first-call JIT warm-up outside
that measured interval. Root confidence/ECE is unavailable from its returned
segments. Original training overlap was not exhaustively established.
Its separate CQT/ensemble/HMM runtime has not been exported or integrated
into the desktop application.

## Once-only held-out family 3

After selection was frozen, E004 and Python DSP were each evaluated once on
120 tracks, 169,056 frames and 1.0931 hours. No parameters or model selection
were changed in response to these results. The evaluator requires a matching
freeze record and refuses to overwrite an existing test report.

| Metric                            | Python DSP |   E004 |
| --------------------------------- | ---------: | -----: |
| Root accuracy                     |     31.22% | 38.06% |
| Triad accuracy                    |     57.39% | 67.80% |
| Bass accuracy                     |     21.22% | 32.03% |
| Reduced structural exact          |      7.81% | 15.13% |
| Boundary F1, 20 ms                |     0.0247 | 0.0043 |
| Boundary F1, 50 ms                |     0.0402 | 0.0054 |
| Boundary F1, 100 ms               |     0.0515 | 0.0054 |
| Bass accuracy on inversion frames |     15.85% | 16.38% |

E004's triad head predicts major on every test frame. Its 67.80% triad
accuracy is therefore the majority-class rate, not broad chord-quality
recognition. Minor recall is zero on 36,132 frames; sus2, sus4 and power
recall are also zero. Positive recall for each extension degree is zero;
high extension-bit accuracy reflects negatives. There are 45,284 inversion
frames, where reduced structural exact accuracy is only 2.34% for E004.
At 50 ms the learned boundary head finds five of 1,800 reference boundaries,
with 40 false positives. This boundary head is unsuitable as the default
segmentation mechanism.

E004 root accuracy by GuitarSet style is bossa nova 31.14%, funk 33.52%, jazz
29.00%, rock 47.02% and singer-songwriter 46.15%. These are annotated guitar
styles, not broad full-mix genre performance. Per-performer and per-class
precision/recall/F1, supports, inversion metrics and extension-degree metrics
are in `E004-test.json`. Annotation boundaries originate from GuitarSet's
instructed segmentation and note-derived performed chord labels; they are
not independent expert boundary judgments for arbitrary music.

## Interpretation and remaining gaps

“Reduced structural exact” requires agreement of root, triad, seventh,
absolute bass and four extension bits. Alterations, omitted degrees and
some implied shorthand intervals are not retained by the v1 label encoder.
This metric must not be described as full canonical chord-string accuracy.
The parser/model vocabulary should be versioned and improved in a future
experiment using a fresh evaluation policy, not retroactively tuned against
this test set.

Root temperature calibration used only validation data. On its separate
composition audit partition, ECE changed 0.07103 to 0.06030 and NLL 2.09573
to 2.07838, with unchanged argmax accuracy. This is a root-component result;
whole-chord confidence remains uncalibrated. DSP similarity is not a
probability. Test ECE in the preserved report describes raw model softmax.

Runtime parity and CPU/GPU/partial-quantization measurements are documented
in `docs/ml-model.md` and `E004-runtime.json`. No full-pipeline CPU latency,
end-to-end desktop recognition accuracy, alternate operating system,
commercial-song or robust rare-chord acceptance gate is established by
these experiments. The model remains experimental, with DSP as the app's
default analysis profile.
