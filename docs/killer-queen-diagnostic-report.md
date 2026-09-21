# Killer Queen: retained-recording diagnostic, 2026-09-21

The poor result is reproduced. The main measured problem is already present in
the model's component outputs, before timeline smoothing: every frame favors
**no seventh or upper extension**, and the opening contains pitched audio that
the model favors as no-chord. This pass does not establish a recognition-accuracy
fix. It does fix a separate general parser defect exposed by the dictionary audit.

## Source and preservation

The native SQLite record was read-only. It identifies Queen Official's
[Top Of The Pops, 1974 video](https://www.youtube.com/watch?v=2ZBtPf7FOoM), not a
generic studio recording. Its cached WebM SHA256 is
`4c4d6ef74eae0222b08ab75856fdf4d88eacd7483bfda730a65f948103a15c5c`.
The exact original record, cache manifest, audio, decoded PCM, six probability
heads and complete diagnostic outputs remain in ignored
`.superpowers/diagnostics/killer-queen/`; no private audio was added to Git.

The [protocol](killer-queen-diagnostic-protocol.md) was frozen before one full
CPU ensemble inference. No acquisition, training, locked-test access or old
accuracy experiment was repeated. The 191.970975-second recording decodes to
4,232,960 mono samples at 22,050 Hz. Mono RMS is 0.10018; channel correlation is
0.80227. There is no evidence of whole-recording stereo cancellation.

All 83 saved canonical regions are reproduced, with float32-identical scores.
Maximum JSON timing difference is 2.84e-14 seconds; score difference is
5.55e-17. This rules out an accidental different source, sample-rate mismatch or
canonical-root conversion error as the explanation for this retained result.
The measured original inference took 11.91 seconds, excluding Chromium decoding
and Python process startup. The v2 refinement merged zero regions.

## Separate failure mechanisms

**Quality:** All four extension heads select index zero on all 8,268 frames.
Mean no-seventh support is 0.9103; maximum dominant-seventh support anywhere is
only 0.2415. Ninth, eleventh and thirteenth absence means are 0.9765, 0.9931 and
0.9772. Even the unpenalized dictionary winner emits zero extended states. Thus
HMM smoothing is not the reason this recording loses all sevenths. Changing
only the dictionary cannot create the missing component evidence either.
The ultimate acoustic/model cause of this underactivation is not established.

**Root/no-chord:** The first region remains N until 17.647 seconds. The first
five seconds have negligible energy, but 8–16 seconds have RMS 0.026–0.035 and
clear pitched spectral peaks (for example, about 258, 517 and 772 Hz at 8–10 s).
N support is already 0.843 at 8–10 s, 0.778 at 10–12 s, 0.639 at 12–14 s and
0.475 at 14–16 s. Treating all of that opening region as literal silence would
therefore be misleading. These signal measurements are not aligned chord labels.

**Bass/dictionary:** The 301-state dictionary includes major/minor slash chords
but cannot represent a seventh chord and its non-root bass together. For example,
`C:7/3`, `C:7/b7` and `C:min7/b3` all have valid six-head encodings yet no
dictionary state. `C:maj6` is also encoded but absent. This is a general vocabulary
ceiling separate from the weak component evidence. Root-position sevenths and
elevenths are present, so vocabulary absence cannot explain their complete loss.

**Segmentation:** The predeclared single HMM15 sensitivity check used the retained
heads, without another inference. It changed 241 frames (2.91%) and produced 91
regions versus 83 with HMM30; slash regions increased from one to three, while
both produced zero extended regions and retained the same initial N endpoint.
The framewise winner produces 324 regions, 175 shorter than 250 ms. Those extra
regions are not evidence of improved musical accuracy.

One concrete suppressed observation run is 22.129–23.011 s: the local dictionary
evidence favors Ab minor over the decoded Ab major, with summed log advantage
19.95. Another is 60.581–61.672 s, favoring B minor over C minor by 40.27. An
isolated A–B–A insertion costs 60 log units at penalty 30, explaining how sustained
local evidence can be suppressed. Without aligned labels these are diagnostic
disagreements, not validated corrections. No lower penalty was promoted.

## Reference limits and tuning

[Pearson's official guide](https://qualifications.pearson.com/content/dam/pdf/GCSE/Music/2016/teaching-and-learning-materials/Killer_Queen_set_work_suport_guide.pdf)
describes E-flat tonality, an opening C-minor chord, inversions, seventh chords,
and an F11 example. Its
[published analysis sample](https://www.pearsonschoolsandfecolleges.co.uk/asset-library/pdf/Secondary/music/edexcel-gcse-music/section-3-area-of-study-2-queen-sample.pdf)
also documents rapidly changing harmony and explicitly accepts alternate names
for one upper-structure chord. Neither provides time-aligned ground truth for
the exact cached video. No full-song accuracy percentage is claimed.

For this source, tuning estimates differ by grid: -0.33 semitones on a 12-bin
grid versus +0.12 bins (+4 cents) on a 36-bin grid. This is a possible model
sensitivity, not proof of a conversion bug or a justification for a global shift.
The original research requirements already permitted librosa 0.7.2, whose
[CQT source](https://raw.githubusercontent.com/librosa/librosa/0.7.2/librosa/core/constantq.py)
also estimates tuning using the selected bins per octave. No audio retuning,
weight changes or speculative correction was applied.

## General parser correction and verification

The audit found that `fromHarte` rejected native `11` and `13` qualities: 24 of
the 301 possible dictionary labels. A recording emitting those labels could
fail while assembling its entire analysis. The parser now preserves their full
native degree sets, including the eleventh inside `13`. It does not infer a
guitar fingering, piano register or the original performer's voicing from a chord
label; practice arrangements must remain separately identified projections.

Four focused tests failed before the two alias entries were added. Afterwards:

- `npm.cmd test -- packages/domain/chord.test.ts packages/audio/native-whole.test.ts`:
  506 passed, including all 301 vocabulary states, exact 11/13 pitch sets,
  lossless export and complete native timeline assembly.
- Read-only native-encoding versus canonical root, structural triad, seventh and
  absolute bass comparison: all 301 states agree. Half-diminished canonical
  minor-plus-flat-fifth is treated as the equivalent diminished triad.
- `ml/.venv/Scripts/python.exe -m ruff check scripts/diagnostics/audit-native-evidence.py`
  and the corresponding `ruff format --check`: pass.

Working labels and recognition decisions are unchanged, so model/pipeline
identities remain v2. Formerly failing 11/13 labels had no successful cached
timeline to invalidate. Killer Queen emits neither, so the parser correction
must not be presented as improving its recognition. The reusable diagnostic
script is `scripts/diagnostics/audit-native-evidence.py`; its report refuses
overwrite and consumes retained heads without opening audio or invoking a model.
