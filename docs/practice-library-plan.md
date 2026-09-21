# Song practice library implementation plan

Goal: keep the successful prepared-song player and expose its practice tools beside
a useful, song-level library of guitar and piano voicings. User authorization and
the existing operating plan permit autonomous implementation and bounded delegation.

## Design

Keep search/acquisition/recognition/cache/playback unchanged. Replace the consumer
player's collapsed details container with a visible practice section, using a
responsive controls/inspector layout. Below it, show unique song chords in first
appearance order, counts, duration and occurrence seek buttons. A shared Guitar /
Piano / Both view selector controls practical diagrams. All entries derive from
the immutable completed timeline, never the playback classifier. Transposition is
a derived practice view; exports and saved analysis retain original chords.

Pure domain modules reuse the canonical chord parser/normalizer, group equivalent
harmonic structures while preserving inversions, and resolve explicit instrument
voicings. Preserve original labels; clearly describe any reduction. Unsupported
guitar shapes get an honest unavailable state, not a misleading nearest chord.
SVG diagrams are original native UI, require no external images or voicing dataset.

## Tasks

- [x] Domain: failing tests for grouping/counts/duration/identity/no mutation,
      aliases/slash normalization, exact guitar notes/bass, compact piano notes,
      advanced/unsupported fallback; implement reusable library and voicing modules.
- [x] UI: failing consumer E2E for visible tools; replace details accordion, add
      memoized ChordLibrary and accessible guitar/piano diagrams with occurrences.
      Keep timeline/hero/index/following code and explicit corrections intact.
- [x] Regression: test counts against exported snapshot, all instrument modes,
      late occurrence seeking, pause/play/transposition/cache and no timeline mutation;
      update former accordion-opening tests to assert visibility directly.
- [x] Recognition: inspect retained same-dataset evidence and current decoder;
      run existing correctness regressions. Promote no speculative threshold/model
      changes; document measured weaknesses and next controlled improvement if no
      change has evidence of a benefit. No training or locked-test access.
- [x] Verify full unit/production E2E, formatting/lint/types, relevant Python checks,
      optimized native build and hidden native player regression; inspect responsive
      screenshots. Update specification/architecture/implementation-plan and report.

## Review focus

Inversions must not merge with root-position entries. Enharmonic spelling must not
duplicate a shape unnecessarily. No-chord/unknown intervals are not playable shapes.
Guitar diagrams must include only notes actually played, with muted/open strings,
usable fingerings and honest bass. Dense chords must not become an impossible
one-hand piano stretch. Library aggregation and voicing lookup must not run on each
playback tick. Many unique chords must wrap without horizontal page overflow.

Recognition quality is a separate measured concern: retaining identical production
decisions is acceptable for this pass; do not claim a quality gain from practice
normalization or chart display. Keep visible GUI closed throughout development.
