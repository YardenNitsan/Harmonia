# Compact practice voicings revision

2026-09-21; follows checkpoint `b0d555e`. Practice projections do not change
analyzed labels, timing, saved records, search, playback or recognition decisions.

## Diagnosis and sources

The prior piano algorithm intentionally separated a bass part from an upper hand,
even for triads. Per-hand checks allowed a total span of several octaves; the UI
faithfully drew those separate parts. The correction replaces this with a single
compact voicing and nearby inversions through the progression.

The guitar lookup indexed 2,935 mechanically validated grips and supported exact
common inversions. It refused unusual colored slash chords when the entire
protected color set and bass could not fit a grip. The new fallback changes the
reduction policy, not the fingering database: keep basic quality, use only notes
in the analyzed chord, and name removed tones and any changed lowest bass.

[Berklee's piano voicing guidance](https://online.berklee.edu/takenote/basic-piano-voicing-techniques/)
distinguishes defining thirds/sevenths and altered fifths from an omittable natural
fifth. Its [Keyboard Method syllabus](https://online.berklee.edu/courses/berklee-keyboard-method)
covers close positions, triad inversions and one-hand voice leading.
[JustinGuitar's triad lesson](https://www.justinguitar.com/guitar-lessons/triad-chord-grips-im-151)
uses small string-group grips and distinguishes their function from another
instrument's bass. These support the musical choices; no educator diagrams were
copied and these sources do not certify all library grips or player reach.

## Result

Piano has one `midiNotes` array and one accessible keyboard SVG, with exact pitch
and octave labels. Left/right-hand parts and labels were removed. Triads contain
three close notes. Five or fewer unique pitches remain complete; denser chords
reduce to five notes with explicit omissions, prioritizing bass, basic quality
and seventh before less defining colors. C13(#11)/E, for example, plays E, F#, A,
Bb and C within one octave and discloses D and G as omitted.

Every candidate spans at most eleven semitones; nine or fewer is preferred.
Explicit slash bass is the lowest note. Otherwise close inversions are candidates
for the existing whole-song movement optimization. Song and Easy modes retain
frozen labels and capo arithmetic. Keyboard notes stay in the sounding key when
a guitar capo is applied. Power chords and explicit omissions can have fewer
than three notes.

Guitar tries exact and conservative colored reductions first. Only if these fail
does it offer a broader quality-preserving reduction from existing grips. A changed
lowest bass is never labeled exact. Alternatives share pitches/bass, and arrangement
disclosures account for actual capo-transposed MIDI. No arbitrary nearest-note
fingering synthesis was introduced. Physical tests and the MIT notice remain.

## Retained-data inventory

The local SQLite library was opened read-only. Only chord records were inspected;
no audio was decoded, recognition rerun, or saved data changed. Private per-label
evidence remains under ignored `.superpowers/practice-before.json`,
`practice-after.json`, and `practice-matrix.json`. Counts measure diagram
availability, not recognition accuracy.

| Retained record                                          | Unique labels | Missing guitar before | Missing guitar after |
| -------------------------------------------------------- | ------------: | --------------------: | -------------------: |
| Killer Queen, source 2ZBtPf7FOoM, 83 regions             |            19 |                     0 |                    0 |
| Switch / ImagineFestigal, source 41BZrKQY1IM, 59 regions |            15 |                     0 |                    0 |
| Older 1,052-region retained record                       |           182 |                    51 |                    0 |

The older record now has 70 exact and 112 explicitly reduced guitar entries
(previously 70 exact, 61 reduced, 51 unavailable). Other retained records also
had zero missing guitar entries before and after. This does not establish that
the user's previously displayed binary used the current mappings.

For each requested source, a before/after arrangement matrix covered twelve
transpositions and nine views (Song/no capo, Easy/capo 0–7): 108 views per source.
Both revisions produced zero missing guitar entries in every matrix view.
Across these views, maximum total piano span changed from 28 to 9 semitones
for Killer Queen and from 34 to 10 for Switch. Maximum note counts were three
and four respectively. Baseline code came from `b0d555e`; temporary baseline
modules were removed afterwards.

## Verification and limits

Tests were changed before implementation. The baseline produced twelve failing
checks for unavailable guitar reductions, wide/dense piano voicings and missing
inversion candidates. A further failed regression caught loss of the dominant
seventh in a dense reduction; the fix retains it ahead of the natural fifth.

- `npm.cmd test`: 945 passing tests in 41 files at this practice checkpoint.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run test:e2e -- tests/e2e/practice-library.spec.ts`: two passing headless
  browser flows. They verify one piano diagram, no Left/Right hand labels,
  a rendered/disclosed E13/C# guitar reduction in inspector and library, preserved
  analysis exports across mode/capo/transpose, seeking and narrow layouts.
  Screenshot review also caught keyboards expanding to fourteen white keys when
  a voicing crossed C. A failing geometry regression demonstrated the issue; the
  corrected diagram frames the actual notes with seven or eight white keys.
  Both E2Es passed again and the final screenshot was visually reviewed.

Parent integration records final production builds, broader E2Es and hidden
native checks separately. No visible GUI was launched for this work. Compact
span is a practical bound, not a claim of individual accessibility or original
recording fingering. Dense reductions may omit audible colors; the original
analyzed chord stays visible. Unknown/no-chord intervals remain unavailable.
