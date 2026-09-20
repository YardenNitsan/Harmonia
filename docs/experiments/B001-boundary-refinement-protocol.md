# B001: reversible boundary candidates, offline comparison

Declared 2026-09-20 before new audio access or metric computation. This is a pure
strategy implementation and a proposed, predeclared real-validation comparison.
The implementation task does not execute that comparison. No default integration,
pipeline/model version change, training, calibration or locked-test access is
authorized by this document. Parent review of measured acceptance remains required.

## Design and frozen first candidate

Master specification sections 4–6 require harmonic-change proposals that later
recognition can split or merge. The current browser pipeline instead uses
radius-2/radius-4 weighted frame-label stabilization, with independent novelty
reported alongside it. Preserve that implementation as the baseline.

Implement a separate pure module in `packages/audio/segmentation.ts`:

1. Calculate uncalibrated novelty independently of chord predictions: the existing
   DSP detector's two-frame look-behind/look-ahead chroma cosine dissimilarity,
   multiplied by 2.4 and clamped to [0,1], with silence crossings scored 0.95 and
   two silent endpoints scored zero (RMS threshold 0.002). Select local maxima
   at or above 0.35; select the first frame of a flat peak. Endpoints 0/duration
   close the independent candidate intervals. These scores are not probabilities.
2. Examine consecutive top-ranked canonical chord runs, including bass, omitted
   tones, no-chord and unknown distinctions. A run supplies sustained evidence if
   its duration is at least 0.060 seconds and its duration-weighted mean top-minus-
   runner-up score margin is at least 0.05. A missing alternative has score zero.
   At each change between successive supported runs, insert a cut at the later
   run's start. Ignore unsupported runs for this insertion decision, retaining
   any cuts independently proposed by novelty. This support criterion limits
   splitting on isolated jitter; it is not a minimum output-segment duration.
3. Label the union of novelty and inserted intervals by duration-weighted top-frame
   scores. Break vote ties by first occurrence. Aggregate scores are rankings,
   not calibrated confidence. Merge adjacent intervals only if their canonical
   harmonic identities agree. Do not delete segments merely because they are
   short: a brief interval supported by candidates and different harmonic votes
   survives. Keep provenance for proposed/inserted/removed cuts.
4. Optionally refine each remaining boundary onto a strictly stronger novelty
   frame within 0.050 seconds and eight frame positions of its original cut.
   Ties prefer closest original time, then earlier time. Require the refined time
   to remain strictly between the midpoints to its original neighboring cuts,
   including 0/duration edges. Use original cuts for every search, preventing
   order-dependent crossings or zero-length segments. Preserve chord assignments
   and pre-refinement evidence scores; record every timing move explicitly.

Inputs must have 1–60,000 strictly increasing frames, start at zero, end before a
finite positive duration no greater than 1,200 seconds, matching finite novelty
scores in [0,1] and 1–8 score-sorted alternatives per frame. Feature vectors and
chords are validated before derived work; scores must be finite in [0,1]. Outputs
cover the complete track with positive contiguous segments. The pure module never
mutates input arrays or chords. Algorithmic bounds are O(N*A + N*W) work and O(N)
auxiliary storage for bounded chord records, A<=8 and W<=17 for the declared
refinement setting; no all-pairs segmentation or beat-grid search occurs.

This is an actual candidate/split/merge strategy, not a renamed smoother. Neither
candidate-only segmentation (irreversible misses) nor another local voting radius
(no separately revisable proposals) answers the architectural question. The chosen
strategy remains heuristic: sustained mistakes can introduce false transitions,
weak/brief changes can be missed, and novelty snapping can worsen timing.

## Tests and implementation sequence

Write behavioral tests and observe failures before implementing the algorithm.
Cover false novelty merging, missed-candidate splitting, bass/omission distinctions,
supported short chords, weak isolated jitter, duration-weighted evidence, silence
and unknown, flat peaks, timing movement/ties/no-crossing, invalid dimensions or
scores, deterministic output and input immutability. Run focused tests, TypeScript,
lint and the existing unit suite. These are engineering checks on constructed
inputs, not evidence of real-audio segmentation quality.

## Proposed real-validation comparison

Before execution, freeze hashes of this protocol, implementation, comparison
runner, feature extractor, recognizer and untouched baseline pipeline. Use only the
existing HU33 validation compositions 14–18 under prepared manifest SHA-256
`a54ce6ed104a42b8216f5045e4bc0be0d4912e61c8678c920ddf896dc63faf4d`.
Verify the five selected source/annotation identities and hashes against existing
preparation/integrity records before decoding. Do not reprepare corpora, open
compositions 19–24, tune on GuitarSet's evaluated test, modify E004 or HU33 reports,
or use the isolated-guitar inspection pilot as labeled data.

Use the same verified mono/mix and 22,050 Hz decoding contract as the browser
pipeline, the same browser `peak-chroma-v1` features and `TemplateRecognizer`
predictions for both arms. Run baseline `analyzeFeatures` with profile `balanced`
and the new strategy with the exact defaults above. Cache one immutable set of
features/predictions for paired comparison; baseline recomputation must match.
Do not substitute Python prepared model features for browser features. If no
verified equivalent decode/evaluation adapter exists, stop before inference and
report that gap; do not silently switch contracts.

Reference boundary times must use the prepared NPZ's precise `boundary_times`,
checked against source annotations and the existing valid-interval policy. Do not
derive reference boundary times from feature-frame transitions or quantize them
to the browser feature grid. Reference evaluation uses only explicitly valid
annotation intervals, with no labels extrapolated over gaps. A scored boundary
must separate touching valid intervals with different existing encoded targets;
report exclusions of redundant same-target rows, even when the raw label spelling
differs. This evaluates the reduced representation, not every canonical distinction.
Neither track endpoints nor transitions across annotation gaps count. Exclude
predictions at unscored gaps from the scored boundary pool and report their count.
Report all reference and prediction inclusion/exclusion counts. Pair boundaries
one-to-one in time order within 20/50/100 ms tolerance; no many-to-one matches.

Primary: pooled boundary F1 at 50 ms improves by at least 0.02 absolute versus the
balanced baseline. Guardrails: time-weighted root and reduced-structural agreement
each lose no more than 0.01 absolute; the number of missed boundaries adjacent to
valid reference segments shorter than 0.25 seconds must not increase at 50 ms.
Use raw annotation segment duration before the existing 0.1-second unknown-edge
mask trimming for this definition; retain the existing mask for scored coverage,
and report short-reference support and exclusion counts explicitly.
Unsupported labels are not silently dropped from supported tasks; preserve the
existing explicit reference validity policy and report class supports. If a
guardrail cannot be measured faithfully, acceptance is unresolved.

Also report precision/recall/F1 at 20/50/100 ms, unmatched predictions per scored
minute, missed-transition rate, matched absolute timing error median/p95, pooled
and per-recording metrics, root/quality/bass/inversion supports, segment duration
distributions, each provenance operation count and failure cases. Define empty
boundary sets explicitly and keep undefined metrics null instead of inventing
perfect scores. Use exact interval overlap for time-weighted agreement, not an
arbitrarily chosen coarse sampling grid. The reduced metric is not full canonical
chord accuracy. No probability calibration claim is supported.

Run sequentially with one worker, at least 8 GiB available system memory, no GPU,
and no parameter search/retry with altered scientific settings. Measure strategy
time separately from decode/features/recognition, plus peak process memory and
full runtime. One warm-up on constructed data precedes three paired strategy timing
runs on retained features; compute each arm's metrics once. Save a new B001 report
without overwrite, including hashes, environment, exclusions and failures. A
regression or unmet gate retains the baseline. This five-composition corpus cannot
establish full-mix, broad-genre or release-quality performance even if gates pass.
