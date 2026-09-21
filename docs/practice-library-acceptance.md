# Song practice acceptance — 2026-09-21

Practice controls are visible directly on the completed song page. The prepared
player, search/acquisition path, saved analyses and recognition versions are
preserved. No visible Harmonia window was launched during development/testing.

## Library and voicings

`packages/domain/practice-library.ts` groups the frozen final segments in first
appearance order. Identity includes root, effective bass and sorted pitch classes;
enharmonic spellings and equivalent added-tone notation share an entry, while
inversions and different harmonic roots remain distinct. Each entry retains its
first canonical label, all label variants, occurrence IDs/times, count and total
duration. No-chord and unknown intervals are excluded. Normalization reuses the
existing parser/normalizer, never rewrites the source timeline.

`packages/domain/practice-voicings.ts` uses original hand-entered open grips and
movable E/A families. Candidates must match the entire chord pitch set and actual
lowest bass. Standard-tuning diagrams show frets, fingers, barres, open and muted
strings. Common triads/sevenths, selected slash chords, sus2/sus4, power,
diminished/augmented, half-diminished and selected added/extended chords are covered.
Up to three exact candidates are represented; the UI shows the first practical
default. This is not an exhaustive guitar dictionary or detected fingering.

Piano uses an explicit left-hand bass and up to five right-hand notes within one
octave, with exact MIDI/octave labels. Dense voicings prioritize harmonic color
and explicitly name any omitted pitch classes. The analyzed label stays visible.
Unsupported guitar shapes show “Guitar diagram unavailable,” with a piano/chord-tone
alternative; no misleading nearest chord is substituted. The models allow future
alternate voicings without altering recognition or persistence.

`ChordLibrary.tsx` memoizes by timeline identity rather than playback time. Cards
show appearance counts, duration and occurrence seek buttons; Guitar/Piano/Both
views are selectable. `PracticeDiagrams.tsx` renders accessible original SVGs,
including textual fret/finger/barre instructions. Transposition is a derived
practice display, explicitly marked as leaving audio unchanged. Explicit saved
corrections update the library and survive cache reuse.

`ConsumerPlayer.tsx` replaces the old details accordion with a responsive controls
and inspector section; key/tempo, save/cache status, notation, transpose, speed,
volume, refine/export and the existing instrument maps remain available. Styling
is in `app.css`; existing progression clock/following code was not changed.

## Verification

- 926 TypeScript unit tests pass, including 41 new domain tests. Tests were first
  observed failing before implementation for domain and visible practice behavior.
- All 43 production-browser E2Es pass. The final three practice/library E2Es were
  rerun after the accessible description/legend changes and pass. Counts are checked
  against exported analysis; all instrument modes, occurrence seeks, transposition,
  unchanged exports, persisted corrections and responsive widths are covered.
- 147 Python tests pass; 22 focused native adapter TypeScript tests also pass.
  Original inference sources, dictionary and five weight hashes match the manifest.
- ESLint, TypeScript, formatting, diff checks, frontend production build and optimized
  Windows build pass. Existing dynamic-import and Python exporter/tracer warnings
  remain; no new Rust or Python production code was introduced.
- Browser screenshots of the actual practice/library sections were inspected.
  Layout checks pass at 390, 800 and 1440 pixels; previous suite sizes remain covered.
- Independent review checked 936 chord/slash combinations and 201 returned guitar
  voicings, plus snapshot memoization. Its accessibility finding was fixed.

## Actual native recording

[Hidden Windows evidence](review-evidence/practice-library-native.json) uses real
YouTube search for Bob Dylan's official `rm9coqlk8fY`, the exact retained acquired
WebM bytes and original native LV-Chordia. Audio is reused from cache to avoid
changing the regression recording; this pass does not remeasure download speed.

| Measurement                                          |                           Result |
| ---------------------------------------------------- | -------------------------------: |
| Recording duration                                   |                        151.424 s |
| Unique practice chords                               |              5: G, D, Am, C, Am7 |
| Counted chord occurrences                            | 65, excluding 2 no-chord regions |
| Final regions before / after this pass               |                          67 / 67 |
| Median region duration before / after                |                1.788 s / 1.788 s |
| Sub-200 ms / extension / alteration / slash regions  |             0% in this recording |
| Decode                                               |                           388 ms |
| Feature extraction                                   |                         1,750 ms |
| Model inference                                      |                         5,133 ms |
| Rhythm/key                                           |                           895 ms |
| Temporal decoding                                    |                            99 ms |
| Complete analysis, including worker/startup overhead |                         11.132 s |
| Selection to ready with cached audio                 |                         11.344 s |
| Cached selection to player                           |                           111 ms |
| Seek to 2:00 and assert precomputed G                |                          13.3 ms |

The native run verifies full analysis before autoplay, visible tools, both diagrams,
occurrence seeking, late seek, centered following, pause/resume, no timeline
replacement during playback, SQLite analysis reuse and no audio reacquisition.
Owned processes stopped, private debug port closed and isolated test data removed.

## Recognition outcome and limits

Recognition is unchanged, not newly improved by this UI pass. The retained winner
is original LV-Chordia's automatic-tuning CQT, full-song bidirectional ensemble,
joint HMM and conservative beat-supported transient refinement. No new model
training, validation selection, threshold adjustment or locked-test access occurred.
The prior fixed validation metrics remain root 62.66%, triad 66.42%, seventh 78.02%,
pooled bass 53.52%, reduced structural exact 39.86%; these are retained results,
not fresh accuracy measurements. Inversion-only bass is substantially weaker.

The audit found that the submission dictionary lacks seventh/extended slash states
and sixth labels, and the current refinement cannot restore states the HMM never
emits. A controlled dictionary/decoder evidence audit is the next justified research
step; speculative changes were not promoted. See
[recognition review and class limitations](practice-recognition-review.md).

## Run

Use `npm.cmd run desktop` or `Start-Harmonia.cmd` from the repository root.
The rebuilt optimized executable is:

`apps/desktop/src-tauri/target/continuation-clean/release/harmonia.exe`

SHA256: `1d1c713363ba78db42bf8ebb19d8fd7ad7c971fa4940111451448918e9fe2b6a`.
The native model still depends on this checkout's configured Python runtime and
8 GiB available RAM; standalone packaging remains a separate deployment gate.
