# Practical voicing sources and verification

Researched 2026-09-21. Practice voicings project the canonical chord; they never
modify recognition, timing, corrections or exports.

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

The nine-semitone/four-note-per-hand piano limit is a conservative product choice,
not a claim that every player can reach it. The primitive lookup provides static
grips; the arrangement layer now chooses among those grips using the actual
chord sequence. Neither is a transcription of the recording's fingering or
instrument arrangement. Dense chords may require both hands; hands never cross.
Isolated piano lookup remains within G2–G5; contextual alternatives allow C2–G5.
Lowest MIDI note must equal the requested slash bass, or the root when no slash
bass is supplied.

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

Exact means all and only the canonical pitch classes, with the actual requested
bass. In Song mode and primitive lookup, if no exact guitar grip exists, a
reduction may omit only the unaltered
fifth in colored chords and lower implied extensions. Root, quality tones,
seventh, highest extension, explicit added tones, alterations (including altered
fifths) and bass are preserved. The omitted note names are shown explicitly.
All alternatives in one result share the same omitted notes. Unsupported dense
harmony remains unavailable instead of changing its chord quality or bass.

Piano first distributes the full set across compact hand positions. Every
partition and close-position right-hand rotation is checked for span, number of
notes, register and noncrossing hands. Only when the full set cannot fit does it
try the same conservative reduction policy. The removed pitches are reported;
there is no blanket priority truncation. This is independent of spelling: root
and bass pitch classes determine pitch, and original chord spelling determines
labels and omitted-note text.

## Song voicings, Easy practice and capo

`buildPracticeArrangement` projects the frozen timeline into suggested occurrence
voicings and unique library entries. Song is the default mode and uses no capo.
It runs a bounded dynamic program over at most 16 guitar and 12 piano candidates
per occurrence, minimizing neighboring hand/fret movement with a small local
comfort cost. This uses both earlier and later chords. Piano alternatives
include close-position rotations and nearby bass octaves. Both modes retain
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

Before the implementation, added regressions failed on Cdim7 guitar availability,
the unnecessary reduction of C13#11/E on piano, and Cmaj7's 11-semitone right-hand
span. The revised suite covers all 12 roots of common suspended, diminished,
sixth, ninth and altered dominant guitar chords, common slash grips, and 1,248
piano root/color/slash combinations including every bass pitch class.
It independently checks actual tuning,
canonical pitches, actual bass, omission reporting and reach constraints.

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

Checks: `npm.cmd test` (939 passing tests in 41 files), `npm.cmd run typecheck`,
and `npm.cmd run lint` passed after integration of these domain changes. Parent
UI/native build verification is recorded separately.
