# HU33 controlled validation experiments

The first two candidates completed under the
[predeclared protocol](hu33-selection-protocol.md). Results and artifact hashes
are in the separate
[HU33 registry](../../ml/experiments/results/E007-E008-hu33-registry.json).
E007 leads this research comparison; neither candidate is suitable for model
promotion or opening the locked test.

| Method              | Primary score | Root accuracy | Triad macro recall | Reduced structural exact |
| ------------------- | ------------: | ------------: | -----------------: | -----------------------: |
| E007 unweighted     |      0.310195 |        53.58% |             20.00% |                   19.48% |
| E008 class weighted |      0.290422 |        52.86% |             19.48% |                   14.79% |
| Python template DSP |      0.268608 |        43.45% |             24.75% |                   12.37% |

All methods used the same five full validation recordings and 23,250 valid
frames, 78.13% of their feature frames. The primary score equally averages the
last three columns. E007 exceeds E008 by 0.019773, so no runtime tie-break was
needed. The Python DSP is a separate implementation from the browser recognizer.
These are frame-level reduced-label results, not finished desktop timelines.

Both runs stopped after 13 epochs and selected zero-based epoch 7 using the
existing fixed-crop proxy. E007/E008 internal crop scores were 0.539137/0.530743;
these are different metrics and smaller subsets than the table above. Training
took 27.19/24.87 seconds excluding setup; peak Torch tensor VRAM was
37,266,432/37,267,456 bytes. Sampled process-tree RSS peaked at
3,132,551,168/3,108,208,640 bytes and minimum available system RAM stayed at
10,852,614,144/12,042,305,536 bytes. CUDA context/driver allocation is excluded
from Torch's VRAM count. Both used the same RTX 5070/bfloat16 training path and
float32 evaluation, two CPU threads and one worker.

E007 major recall was 99.97% but minor recall only 0.031%; diminished, augmented
and sus4 recall was zero. E008 improved minor recall to 5.78% and diminished to
4.01%, at the cost of major recall falling to 87.63%. Its aggregate primary score
fell despite those partial gains. E007 always predicted no seventh; E008's
minor-/diminished-seventh recalls were 0.84%/10.43%. Both missed all 13 positive
sixth-extension frames. Validation contains no ninth/eleventh/thirteenth
positives, so perfect negative-only extension accuracy is not evidence of
recognizing those chords.

Inversion exactness remained 1.52%/1.76%; inversion bass accuracy was
18.92%/19.38%. Boundary F1 at 50 ms was 0.0800/0.0756. Descriptive uncalibrated
root ECE was 0.0324/0.0358; it is not whole-chord confidence. Complete per-class
supports/metrics, calibration and boundary tolerances are in each full
validation JSON. Training lacks no-chord, sus2, sus4, power and several extension
classes; the small historical corpus also lacks broad genre/performer coverage.

No E004 or historical registry changes, test evaluation, export or promotion
occurred. The data and selected artifact hashes were reverified; critical
training source hashes matched preflight, completion and final verification.
The remaining question for the bounded follow-up is whether additional temporal
context/capacity improves these failures, not whether larger crops alone do so.

## E009 context/capacity follow-up

The separately predeclared follow-up changed only three TCN blocks to six,
increasing receptive context from 15 to 127 frames while also increasing model
capacity. Its protocol bytes precede training in
`ml/experiments/results/E009-hu33-context-tcn/protocol.md`; artifact hashes and
the comparison are in `E009-hu33-context-registry.json`. The parent resumed the
completed training artifact and ran only its pending full-validation evaluation.

E009's primary score is **0.330269**, versus E007's 0.310195. Root accuracy is
59.02%, triad macro recall 20.25%, and reduced structural exact 19.81%. Inversion
bass accuracy is 21.63%, inversion exactness 1.75%, and boundary F1 at 50 ms is
0.2372 (51 true positives, 112 false positives, 216 misses). These are the same
five recordings and valid-frame masks, with no test access. Minor recall remains
0.34%, diminished recall 1.08%, and augmented/sus4 recall zero. The improvement
does not close chord-quality, inversion, calibration or broad-corpus gates.

Training reached the 30-epoch cap in 50.05 seconds; peak allocated Torch VRAM was
44,507,648 bytes, sampled process-tree RSS 3,109,376,000 bytes, and minimum system
headroom 13,267,644,416 bytes. Source/config/data hashes were rechecked. E009 is
the research leader in this bounded adaptive study, not a final selected product
model. The study does not establish saturation: the last candidate reached its
epoch limit, and one seed/five compositions do not establish significance.
