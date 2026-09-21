# Practical voicing sources and verification

Researched 2026-09-21. Practice voicings project the canonical chord; they never
modify recognition, timing, corrections or exports.

Latest user direction: [Classic shapes](classic-practice.md) supersedes contextual
Song voicings as the default. Normal references are static per chord: familiar
open/common barre guitar forms and root-position piano chords unless a slash bass
specifies an inversion. One-hand reach and explicit reductions remain. The earlier
contextual design and its measurements below are historical evidence.

## Educational references

- [Berklee Online: Piano Voicing Techniques](https://online.berklee.edu/takenote/basic-piano-voicing-techniques/)
  explains the root and quality-defining tones of triads, sixths and sevenths,
  and why an altered fifth belongs to the basic chord sound. This informs our
  protected tones; it is not a license to copy the article or its diagrams.
- [Berklee Online: Voice Leading Paradigms](https://online.berklee.edu/takenote/voice-leading-paradigms-for-harmony-in-music-composition/)
  describes a bass plus upper-voice arrangement and omission of the fifth in
  seventh-chord voicing. Our original piano algorithm uses this general concept.
- [JustinGuitar: G7](https://www.justinguitar.com/chords/g7) provides the familiar
  open dominant-seventh grip and its actual notes, a reference check on the
  original G7 mapping. No educator images or database content were scraped.
- [Fender: What Is a Capo?](https://www.fender.com/articles/parts-and-accessories/what-is-a-capo)
  explains the use of a capo to raise pitch while retaining familiar open chord
  shapes. Our capo arithmetic shifts the played shape down by the capo fret so
  that its sounding pitch stays in the song's original key.

The current piano view uses one hand and one keyboard diagram. Triads use three
close notes; larger chords use at most five notes within eleven semitones, with
nine semitones preferred. Power chords or explicit omissions can contain fewer
notes. These are product constraints, not a guarantee of every player's reach.
Unslashed piano chords offer close inversions; an explicit slash bass remains the
lowest note. Context chooses nearby positions across the song. No separated bass
note or left/right-hand layout is shown. See [practice revision](practice-revision.md)
for the correction and measured before/after evidence.

Additional primary references consulted on 2026-09-21:

- [Berklee Keyboard Method](https://online.berklee.edu/courses/berklee-keyboard-method)
  teaches root position, first and second inversions, close positions and triad
  voice leading with one hand. Our layout follows these general concepts.
- [JustinGuitar: Triad Chord Grips](https://www.justinguitar.com/guitar-lessons/triad-chord-grips-im-151)
  teaches smaller grips on string groups and notes that another instrument can
  supply the bass. This supports a disclosed accompaniment reduction when an
  exact slash-bass grip is unavailable; it does not certify our generated results.

## Licensed guitar data

Source: [tombatossals/chords-db](https://github.com/tombatossals/chords-db),
revision [`df06fa7b425cf5fd29485ff6591236b3557e3fac`](https://github.com/tombatossals/chords-db/tree/df06fa7b425cf5fd29485ff6591236b3557e3fac).
The repository's [MIT license](https://github.com/tombatossals/chords-db/blob/df06fa7b425cf5fd29485ff6591236b3557e3fac/LICENSE)
is Copyright (c) 2016 David Rubert. An unmodified notice is retained in
`packages/domain/data/chords-db.LICENSE` and must accompany redistributed data.
No piano data or unrelated instrument data from that repository are used.

Input `lib/guitar.json` SHA-256:
`cfe439962b2f444d2c341b1f0261403b4c3a3416e321147286fc608922699974`.
License SHA-256:
`ca1f5a79ed75347924bba07c979bc7a6d0f7438e82d655f7e8dcdfa32939a3d9`.

`node scripts/generate-guitar-voicings.mjs` fetches this pinned input, verifies its
hash and regenerates `packages/domain/data/guitar-shapes.json`. An optional local
source path avoids the download. Run Prettier on the generated JSON afterwards.
The production application loads only the vendored result and makes no database
network request. Regeneration is a maintenance operation, not a build step.

The input contains 3,283 positions. The generator rejects 125 positions with
inconsistent finger/barre assignments and 13 with missing/invalid fingers, then
deduplicates valid positions to 2,935 grips. It converts relative frets to absolute
frets (while keeping open strings open), recomputes every MIDI note from standard
EADGBE tuning and requires agreement with the source MIDI. It also enforces
frets 0–15, a maximum three-fret difference between pressed notes, four fingers,
consistent repeated-finger barres and no lower/open sounding string underneath
a barre. Higher frets cannot require lower-numbered fingers across the grip.

Source chord names are deliberately not used for correctness. Some positions in
named root-chord entries are inversions. Every runtime result is matched against
its actual pitch set and lowest sounding MIDI note. Muting lower strings of a
validated grip supplies additional inversions while retaining and trimming its
existing fingering. No new arbitrary string-by-string fingering is synthesized.
These are mechanically validated library grips, not a claim of individual human
performance review of all 2,935 positions.

## Exactness and reduction

Exact guitar means all and only the canonical pitch classes with the requested
bass. Lookup first tries exact grips, then conservative reductions omitting only
an unaltered fifth or lower implied extensions while keeping the defining colors.
If those fail, it searches the same validated grip index for an accompaniment
reduction: root and basic quality remain, more colors may be removed, and every
omitted note is named. Requested bass is preferred before a changed-bass fallback;
the latter explicitly identifies both requested and actual played bass. All
alternatives share one pitch set and bass, so their disclosure stays accurate.
A grip never adds pitches absent from the original chord. Unsupported harmony
still returns unavailable; physically arbitrary string placements are never used.

Piano uses all pitches for chords of five notes or fewer. Denser harmony prioritizes
explicit bass, root and quality-defining notes, seventh, then colors; an unaltered
fifth and lower implied extensions yield first. It names every omitted pitch.
Each candidate is a single close-position rotation within C3-B5. Slash bass is
preserved; without an explicit slash bass, inversions remain harmonically exact.
Thus piano exactness means the full pitch set and any explicit bass, not a
root-position requirement on an unslashed chord. This never claims the recording's
original register, fingering or instrumentation.

## Song voicings, Easy practice and capo

`buildPracticeArrangement` projects the frozen timeline into suggested occurrence
voicings and unique library entries. Song is the default mode and uses no capo.
It runs a bounded dynamic program over at most 16 guitar and 12 piano candidates
per occurrence, minimizing neighboring hand/fret movement with a small local
comfort cost. This uses both earlier and later chords. Piano alternatives
include close-position rotations and nearby registers for the whole hand. Both modes retain
piano voice leading. Gaps longer than two seconds reset movement cost.

Library representatives are duration-weighted modal choices actually used by
the occurrence path. Counts and original labels stay intact, while the current
chord can use the suggestion for that particular occurrence. Timing and
occurrence aggregation use maps, and repeated transition costs are cached.

Easy mode deliberately offers a quality triad plus the requested slash bass,
removing sevenths and color tones when needed. Altered thirds/fifths and original
omissions remain; the reduced pitches must be a subset of the original chord.
These reductions are marked simplified and list exactly which sounding notes
were omitted. Guitar chooses the easiest eligible grip; piano still uses nearby
positions across the progression. Easy mode never changes the timeline chord,
playback key, or recognition.

Capo recommendation evaluates frets 0–7 against all song chords, weighted by
their durations, using barre count, pressed fingers, fret height, open strings,
unavailable coverage and a small penalty for higher capo placement. A nonzero
recommendation must not worsen unavailable coverage and must improve the cost
by both one point and 15 percent. Otherwise zero is recommended. This is a
practice heuristic, not identification of a capo used in the recording.

Applying a recommendation is explicit through the arrangement option. Song
mode always stays at fret zero. Guitar MIDI/frets describe the played shape:
add the capo fret to its MIDI notes to obtain sounding notes and bass. Piano
MIDI remains in the sounding key regardless of guitar capo. The separate
`shapeLabel` reports the played shape; entry labels and requested labels retain
the original sounding chord.

## Regression evidence

The initial implementation's regressions covered Cdim7 guitar availability and
two-hand reach. Those former piano requirements are superseded by the explicit
one-hand correction. Current regressions fail on the previous implementation's
wide triads, missing piano inversions, dense two-hand layouts and unavailable
E13/C#, Cmaj9/B, Eb7(#9)/Bb and D11/G guitar grips. They cover 1,248 piano
root/color/slash combinations, actual tuning, pitch subsets, omission reporting,
requested bass and overall hand span. See [practice revision](practice-revision.md)
for current counts and browser checks.

The guitar pitch-mask/bass index is built once. Exact lookup uses two map reads;
reduced lookup compares precomputed masks in the requested bass bucket. A
developer-PC probe of 50 distinct chords measured 1.70 ms total guitar lookup
and 3.25 ms total piano lookup. These are local lookup timings, not a weak-PC
benchmark or browser frame-time measurement.

Arrangement tests verify reduced movement through an ascending chromatic
progression, beneficial capo recommendation for Gb/Bbm/Db/Ebm, no capo for
G/C/D/Em, explicit Dbmaj9/F to C/E reduction with capo one, preserved actual
bass, unchanged input, and representative choices from real occurrences.
A 1,000-segment/50-unique-chord local probe measured 53.81 ms for Song mode and
39.14 ms for Easy mode after indexing aggregation and caching transitions.

Initial checkpoint checks: `npm.cmd test` (939 passing tests in 41 files), `npm.cmd run typecheck`,
and `npm.cmd run lint` passed after integration of these domain changes. Parent
UI/native build verification is recorded separately.
