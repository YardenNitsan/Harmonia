# Classic practice references

2026-09-21, following `aeca57a`. The user requests the classic version of each
chord instead of a contextual or performer-like arrangement. This supersedes
the earlier default Song voicings design without changing recognized harmony.

The default is now **Classic shapes**. Familiar full open guitar forms and common
E/A barre forms rank ahead of partial library grips when their actual pitches
and lowest bass match. G uses `320003`, C `x32010`, D `xx0232`, and Am `x02210`.
Other chord qualities retain the validated guitar index and explicit reduction
policy. A minor, seventh, extended or slash chord remains that analyzed chord;
any physically necessary omission or changed guitar bass stays disclosed.

Piano defaults to a conventional root-position close chord near the middle
register; an explicit slash bass selects that inversion. Each reference remains
one hand and one keyboard, at most five notes within eleven semitones. Dense
chords retain explicit reductions. C, for example, is C4–E4–G4 in every song.
The diagram retains the recent compact keyboard crop. No original instrument
fingering or register is claimed.

Contextual movement optimization and duration-weighted representative selection
were removed from the practice arrangement. Every occurrence now shares its
library entry's fixed reference. Counts, timestamps, labels and seek behavior
remain derived from the frozen timeline. Optional Easy practice and guitar capo
remain available; their reductions do not change the analyzed song or audio.
The application mode is now `classic | easy`; no preference is persisted under
the old `song` name, so no saved-data migration is needed.

## Verification

Two new domain checks first failed on the previous default mode and contextual
partial C grip. Revised tests assert the exact common G/C/D/Am fret arrays,
consistent C piano notes across different progressions and repeated occurrences,
root-position/seventh/slash identity, counts, occurrence times and immutable input.

- `npm.cmd test`: 947 passing tests across 41 files.
- `npm.cmd run typecheck` and `npm.cmd run lint`: passed.
- `npm.cmd run test:e2e -- tests/e2e/practice-library.spec.ts`: two passing headless
  flows, covering Classic shapes selected by default, the full open C grip,
  identical C piano diagrams after seeking to each occurrence, unchanged exports
  through mode/capo/transpose changes, and the disclosed rare slash-chord fallback.

This is a practice-reference change only. There are no recognition, timing,
model, player/search architecture or saved-record modifications in these modules.
No visible GUI or commit was created by this subtask. Parent integration records
the production build and broader acceptance separately.
