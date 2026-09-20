# Canonical chord representation

Harmonia uses the structured `Chord` union in `packages/domain/types.ts` as its only
domain truth. Display symbols and Harte labels are boundary representations; application
and persistence code must not inspect or edit chord strings to make musical decisions.

## States and pitched chords

`{ kind: "none" }` means that no chord is sounding. `{ kind: "unknown" }` means that a
chord may be sounding but is not known. They are deliberately different states and map
to `N` and `X` at notation boundaries.

A pitched chord contains:

| Field          | Meaning                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| `root`         | Absolute pitch class, C = 0 through B = 11                                                                 |
| `triad`        | Major, minor, diminished, augmented, suspended 2/4, or power foundation                                    |
| `fifth`        | Perfect-fifth alteration: -1, 0, or +1; intrinsic diminished/augmented triad fifths remain part of `triad` |
| `seventh`      | Minor, major, diminished, or absent seventh                                                                |
| `extensions`   | Structural 6th/9th/11th/13th extensions                                                                    |
| `alterations`  | Altered degrees such as b9 or #11                                                                          |
| `addedTones`   | Explicit added degrees such as `add9`, distinct from a ninth extension                                     |
| `omittedTones` | Explicitly absent degrees such as `no3` or `no5`                                                           |
| `bass`         | Absolute bass pitch class for an inversion, or `null`                                                      |
| `spelling`     | Preferred sharp or flat family for display only                                                            |

For example, `G13(b9)/B` has G (`7`) as root, a major triad, minor seventh,
extensions `[9, 13]`, alteration `{ degree: 9, accidental: -1 }`, and B (`11`) as
absolute bass. The natural ninth implied by the extension is replaced by b9 when
deriving sounding pitch classes.

Multiple alterations of the same degree coexist: `C7(b9,#9)` includes both Db
and D#. The unaltered degree is removed once before all altered pitches are added.
An explicit omission such as `no9` then removes every version of that degree.

## Boundary operations

- `parseChord` accepts musician-facing symbols including extended, altered, suspended,
  diminished, half-diminished, added-tone, omitted-tone, and slash chords.
- `formatChord` emits one deterministic display spelling. For example, `Asus` becomes
  `Asus4`; enharmonic equality does not depend on this spelling preference.
- `normalizeChord` wraps absolute pitch classes, sorts degree collections, and removes
  duplicate degree entries. It does not turn malformed persisted data into valid data.
- `validateChord` strictly checks the complete object shape, nested alteration shape,
  pitch-class ranges, enums, and supported degree ranges. Unknown properties are rejected.
- `transposeChord` moves only absolute root and bass pitch classes. Relative quality,
  extensions, alterations, omissions, and additions are unchanged.
- `equalChords` compares normalized musical structure while ignoring sharp-versus-flat
  display preference.
- `chordPitchClasses` returns unique, sorted absolute sounding pitch classes after degree
  replacement and omission.

JSON persistence stores the structured object, never the formatted symbol. Persisted
objects are passed through `validateChord` (as part of `validateAnalysis`) before use.

## Harte conversion

Harte notation is used for MIR interchange. The grammar has the form
`root:shorthand(degree-list)/bass`, represents omitted degrees with `*`, and expresses
the bass as a scale interval relative to the root. These rules follow Harte's formal
syntax and the interoperable behavior documented by
[mir_eval](https://mir-eval.readthedocs.io/latest/api/chord.html).

Examples:

| Display        | Harte               |
| -------------- | ------------------- |
| `C7(b9,no5)/E` | `C:7(b9,*5)/3`      |
| `G13(b9)/B`    | `G:7(9,13,*9,b9)/3` |
| `Bm7b5`        | `B:hdim7`           |
| `F6`           | `F:maj6`            |
| `Dadd9`        | `D:maj(9)`          |
| `CmMaj9`       | `C:minmaj7(9)`      |
| `C9sus4`       | `C:sus4(b7,9)`      |
| `Caug7`        | `C:aug(b7)`         |
| `C7#5`         | `C:7(*5,#5)`        |
| `Cm7(no3)`     | `C:min7(*b3)`       |

`toHarte` chooses standard shorthands only where they preserve the triad and seventh.
Otherwise it keeps the triad shorthand and adds the seventh as `b7`, `7`, or `bb7`.
Alterations include explicit removals of the pitches they replace; omissions retain
the actual accidental, so omitting a minor third emits `*b3`. Paired removal/addition
degrees are recognized as replacements on import, including compound degrees such
as `*4,#11`.

`fromHarte` recognizes explicit sevenths before classifying extension degrees, regardless
of token order. Added 9/11/13 degrees on a seventh chord become structural extensions;
the same degrees on a triad become added tones. Harte cannot encode every distinction
between the domain's extension, added-tone and alteration fields: for example `add9`
on a seventh chord and a structural ninth share an interchange label. Canonical JSON
is the lossless persistence format; Harte is a musical interchange boundary, not a
replacement for it. Suspended sevenths display as `C7sus4` and `Cmaj7sus4`.

The current interchange boundary intentionally supports single-accidental roots and
degrees through 13, matching the canonical model. It does not preserve arbitrary Harte
double-accidental root spellings or voicing/octave information; the domain stores pitch
classes and harmonic composition, not individual notes.
