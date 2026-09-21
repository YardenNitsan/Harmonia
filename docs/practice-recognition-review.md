# Practice pass: recognition review, 2026-09-21

Recognition remains on the accepted native LV v2 pipeline. This pass changes no
recognizer, model weights, dictionary, decoding thresholds or cache identities.
The practice library's canonical chord vocabulary is broader than the production
recognizer's output dictionary; supporting a chord in practice does not establish
that audio recognition can identify it reliably.

## Exact current pipeline

1. `WholeSongAnalysisService` decodes the selected complete recording once. The
   whole-song worker validates bounded mono/stereo input, averages channels and
   passes the decoded mono 22,050 Hz float32 samples to `NativeWholeSongRecognizer`.
2. Tauri `RecognitionService` admits at most two requests, runs one subprocess at a
   time and enforces a 240-second timeout. Binary PCM travels over bounded stdin;
   cancellation closes the owned process. There is no intermediate audio file.
3. `scripts/native-whole-song.py` calls `infer(pcm, refine=True)`. It requires the
   pinned local LV-Chordia 1.1.0 environment, verifies five checkpoint SHA256 values,
   disables GPU inference, uses two CPU threads and requires 8 GiB available RAM.
   Input is at most 1,200 seconds; JSON output is at most 16 MiB plus newline.
4. `harmonia_ml/inference/whole_song.py` uses original automatic-tuning CQT,
   512-sample hop, full-sequence model normalization/context and five original
   networks. It averages six posterior heads: joint root/triad, absolute bass,
   seventh, ninth, eleventh and thirteenth. Their shapes are `[T,73]`, `[T,13]`,
   `[T,4]`, `[T,4]`, `[T,3]`, `[T,3]`.
5. Original `XHMMDecoder` jointly scores the submission dictionary using these
   components. The actual call is `decode_to_chordlab(entry, probabilities, False)`:
   layer decoding, beat restrictions and downbeat restrictions are disabled. The
   original uniform chord-change penalty is 30 log units; every frame may change
   state. Beat positions are estimated afterwards and do not constrain this HMM.
6. The v2 guard examines A–B–A regions once. B must share the flanking root/triad,
   fit within one detected beat and last no more than the smaller of 250 ms and
   half that beat. Every changed component needs selected support below 0.65,
   margin below 0.10, containing-beat evidence favoring A and positive summed
   whole-region log evidence for A. Strong changes, different roots/triads,
   sustained/crossing-beat changes and no-chord survive. Missing beats disable
   this extra consolidation. There is no forced minimum chord duration.
7. The worker validates contiguous full-precision regions, converts Harte labels
   to canonical chords and normalizes only the final endpoint to sample duration.
   Key is a duration-weighted harmonic summary. Scores remain uncalibrated triad
   support. Playback indexes the completed, cached timeline and runs no inference.

Identities remain `lv-chordia-1.1.0-submission-native-v2` and
`harmonia-whole-song-lv-v2`. Native errors do not silently downgrade to DSP. The
browser preview and earlier profiles retain their documented DSP/research paths.
See [ADR010](adr/010-native-whole-song-regions.md) and the
[frozen refinement protocol](../ml/experiments/stabilization/refinement-protocol.md).

## Retained labelled evidence

These are existing results, not a new validation run. All rows use the same
23,250 valid frames from HU33 compositions 14–18. This is five classical
voice/piano recordings, with prior validation exposure and uncertain upstream
training overlap; it does not establish broad commercial-song accuracy.

| Method                  |   Root |  Triad | Seventh |   Bass | Reduced exact |
| ----------------------- | -----: | -----: | ------: | -----: | ------------: |
| Whole-song DSP          | 42.81% | 46.28% |  47.81% | 36.26% |         6.17% |
| Retained E010           | 59.01% | 58.86% |  74.70% | 47.56% |        25.41% |
| Production native LV v2 | 62.66% | 66.42% |  78.02% | 53.52% |        39.86% |

The authoritative LV row is the full-precision
[refinement report](../ml/experiments/stabilization/results/refinement-validation.json).
The DSP/E010 rows come from the retained
[comparison report](../ml/experiments/stabilization/results/comparison-with-dsp.json).
That earlier report uses the public LV API's rounded timestamps and gives LV
39.84% reduced exact; timestamp precision explains this difference. Reduced exact
compares eight projected components and is not full canonical chord-string accuracy.

Production boundary F1 at 20/50/100 ms is 0.08969/0.19283/0.30493. At 50 ms,
precision/recall is 23.50%/16.35%: 43 matches, 140 false positives, 220 misses.
All four eligible short-adjacent references are missed. DSP/E010 F1 at 50 ms is
0.06607/0.06589. Exact bass on reference inversion frames is LV 27.29%, E010
21.61%, DSP 35.13%; the better pooled LV score does not erase that limitation.

The original API comparison reports LV diminished recall 6.64%, augmented/sus4
recall zero, minor recall 62.58%, and minor-seventh recall 44.21%. Sixth recall is
zero on only 13 positive frames. There are no positive ninth/eleventh/thirteenth
reference frames, so this set cannot support a real-recording recall claim for
those extensions. Full class supports and precision/recall remain in the reports.

The v2 guard made zero consolidations on training controls 02/03 and validation
14–18, with unchanged decisions versus native v1. This is retained nonregression
evidence, not an incremental accuracy gain. Bob's identical unlabelled recording
went from 1,052 DSP regions to 67 LV regions; that is structural evidence only.
See [complete comparison](stabilization-model-comparison.md).

## Concrete limits and next controlled investigation

The pinned `submission_chord_list.txt` contains slash variants only for major and
minor triads. It contains root-position sevenths/upper extensions, but no seventh
or extended slash variants and no sixth labels. For example, canonical `C7/E`
cannot be emitted with both its seventh and bass preserved by this dictionary.
The post-HMM guard can only merge existing states; it cannot introduce a missing
dictionary state or recover a transition the HMM never emitted. This is a source
inspection finding, not evidence that changing the dictionary will improve scores.

The strongest next bounded investigation is a separately frozen **training-only
dictionary coverage and decoder-evidence audit**, with no fitting:

- First measure how many annotated inversion/seventh/sixth intervals are exactly
  representable by the pinned six-head encoding and current dictionary. Separate
  encoding limits from absent dictionary states and from ordinary recognition
  errors. This first stage needs annotations and vocabulary only, not inference.
- For representable inversion errors, inspect existing retained evidence where
  sufficient. Only a separately declared, missing-evidence run should capture
  training-only posterior margins to distinguish weak bass evidence from HMM
  suppression. Do not repeat the completed training-control or validation gates.
- Consider one additional dictionary or decoding candidate only if that diagnosis
  supports it. Freeze the candidate and acceptance policy before any new scoring;
  retain the current method as the reference. Require no loss in reduced exact,
  bass, inversion-bass exact or boundary F1, and no extra short-transition misses,
  while reporting rare-class support and false positives. A changed decision path
  requires new model/pipeline identities and its own evaluation policy.

This recommendation does not authorize a dictionary expansion, a smaller global
transition penalty, renewed D002 fitting, B001 threshold search or a rerun of the
already completed validation comparison. No such experiment was started here.
The present evidence does not justify changing recognition defaults during the
practice-library pass.

## Fresh verification

Run on this checkout on 2026-09-21:

- From `ml/`, `.venv/Scripts/python.exe -m pytest -q
tests/test_whole_song_inference.py tests/test_region_evidence.py`: 21 passed.
- From repository root, `npm.cmd test -- packages/audio/native-whole.test.ts
packages/audio/whole-song-analysis.test.ts
packages/audio/whole-song-worker.test.ts`: 22 passed across three files.
- From `ml/`, `.venv/Scripts/python.exe -m pytest -q`: 147 passed in 28.15 s,
  with 28 existing export deprecation/tracing warnings.
- Read-only SHA256 comparison against
  [runtime-manifest.json](../ml/experiments/stabilization/results/runtime-manifest.json):
  `whole_song.py`, `regions.py`, `native-whole-song.py`, the submission dictionary
  and all five model weights match their frozen identities.

The scoped regressions cover finite/exact PCM, weight rejection, bounded timelines,
weak and strong decoration/inversion preservation, beat corroboration, no-chord,
native result identity/endpoint handling, worker assembly and service integration.
No recognition source was edited, no corpus training/evaluation experiment was
rerun, and neither locked test set was accessed. Fresh native product-flow/build
verification belongs to the integrating practice pass; these checks alone do not
establish installer readiness or additional musical accuracy.
