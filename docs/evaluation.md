# Evaluation evidence

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
