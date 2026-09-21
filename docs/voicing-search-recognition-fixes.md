# Voicing, typing and recognition follow-up

User correction: fix unavailable/unreachable practice voicings using published
references, fix caret/space loss while search loads, and investigate general
recognition failures using the existing Killer Queen recording. Stop using Bob
Dylan as an accuracy check; preserve historical evidence, do not rerun it here.

## Plan and evidence boundaries

Additional user requirement: default to suggested song voicings with neighboring
chord context, offer explicit Easy practice, and recommend a songwide capo only
when it improves playable coverage/effort. Chord symbols alone cannot establish
the original guitarist's fingering or piano register. Contextual voice leading is
a suggested arrangement, not an extracted instrumental transcription. Preserve
sounding analyzed labels and disclose reduced played shapes. Piano stays in the
sounding key when guitar uses a capo. Show separate reachable left/right hands.

- [x] Add bounded full-timeline voicing selection, shared by current inspector and
      library; explicit easy reductions and useful 0–7 capo recommendation, with
      pitch/hand-span/transition/immutability tests and UI mode/capo regressions.

- [x] Reproduce asynchronous query normalization rewriting the controlled input;
      retain exact typed text/caret while normalizing only provider requests.
      Add controller and actual typing/caret E2E regressions.
- [x] Verify published/licensed guitar data and hand-position principles; extend
      practical shapes with pitch/bass/finger validation and honest reductions.
      Replace fixed-octave piano placement with reachable hand voicings, tested
      over roots, inversions, extended and altered chords. Record provenance.
- [x] Inspect the exact cached Killer Queen timeline/audio and freeze a bounded
      diagnostic before new inference. Identify general decoder/vocabulary/evidence
      limits. No hardcoded progression, training or locked-test access; change
      defaults only if controlled evidence and general regressions justify it.
- [x] Verify all application tests, affected full production UI flows, static checks,
      rebuilt Windows app and hidden native acceptance without Bob accuracy runs.
      Report measured outcomes and remaining limitations honestly.

The product flow and immutable timeline remain unchanged. Published guitar shapes
are references, not evidence about the recorded performance. Piano hand-span rules
are conservative defaults, not a guarantee for every player's hand size.

## Implemented result

The search debounce used to write a trimmed query back to the controlled field,
removing the space just typed. Only the provider request is normalized now;
delayed/stale responses preserve raw text, caret and Hebrew input.

Guitar lookup now indexes 2,935 validated grips from pinned MIT-licensed chords-db.
Piano uses independently reachable left/right hands instead of a fixed pitch-class
octave or a map that lights every equivalent key. Song arrangements use surrounding
chords to reduce movement; Easy practice exposes reductions and a useful capo
recommendation/override. Capo affects the guitar shape only. Original labels,
occurrence counts, corrections, audio and frozen recognition remain intact.
See [sources and exact rules](practical-voicing-sources.md).

The [Killer Queen diagnosis](killer-queen-diagnostic-report.md) identifies weak
seventh/extension output, vocabulary limits and suppression of some short changes.
A lower decoder penalty did not recover missing harmonic detail and was not
promoted. No accuracy gain is claimed for that recording. A separate general parser
fix accepts all 301 native dictionary labels, including previously rejected 11/13
qualities; the recording emits neither. No training or locked-test access occurred.

## Acceptance evidence

- `npm.cmd test`: **939 tests / 41 files pass**.
- `npm.cmd run test:e2e:production -- --reporter=line`: **44 pass**, including
  real browser typing/caret, reachable-hand UI, Song/Easy/capo, frozen exports,
  responsive library and authoritative playback/progression following.
- Lint, typecheck, formatting and `git diff --check` pass. The new diagnostic
  script passes Python Ruff lint/format; recognition runtime and Rust are unchanged.
- Frontend and optimized Windows `desktop:build -- --no-bundle` pass. Build retains
  an ineffective Tauri dynamic-import warning and now reports a 557.64 kB minified
  entry chunk (124.63 kB gzip), including the local grip database. No warning was
  suppressed. Source-based runtime packaging remains an open deployment limitation.
- Hidden native Windows WebView:
  [recorded evidence](review-evidence/voicing-killer-queen-native.json) passes real
  configured YouTube typeahead, exact cached WebM, complete-before-play timeline,
  visible library/instruments, occurrence seek, play/pause, late seek, centered
  progression, no playback mutation, SQLite reuse and bounded cleanup. No visible
  window or new acquisition was requested.

Exact source: Queen Official, `2ZBtPf7FOoM`, _Killer Queen (Top Of The Pops, 1974)_,
191.971 s. Its unchanged 83 regions include 79 pitched occurrences grouped into
19 library entries; median duration 1.277 s, no sub-200 ms regions. This preserves
the known recognition limitations rather than proving musical correctness.

| Native measurement                                       |     Time |
| -------------------------------------------------------- | -------: |
| Click to ready, with cached exact audio and new analysis | 12.466 s |
| Decode                                                   |  0.509 s |
| Features                                                 |  1.783 s |
| Model inference                                          |  6.083 s |
| Rhythm/key                                               |  0.919 s |
| Temporal decoding                                        |  0.124 s |
| Boundary + timeline assembly                             | 0.0065 s |
| Cached selection to player, no recognition/acquisition   |  0.124 s |
| Seek to 2:00 and assert precomputed chord                |  20.9 ms |

Stage values exclude different orchestration/model-load costs and should not be
added as an alternative to measured click-to-ready time. Native playback uses
original LV-Chordia CPU inference with v2 pipeline/model identity. No model was
promoted. The separately measured 1,000-region/50-chord arrangement takes 53.81 ms
in Song mode and 39.14 ms in Easy mode on this PC; it is memoized, not repeated
on playback ticks. These are not low-end hardware claims.

Run `npm.cmd run desktop`, or the rebuilt source-dependent executable:

`apps/desktop/src-tauri/target/continuation-clean/release/harmonia.exe`

SHA-256: `cd49bffc90119c0003b8494a23915b2697e4f41c394af7bacc55ce1d1b066f0f`.
Original performance fingering/register transcription, universally available exotic
guitar grips, and improved Killer Queen recognition remain unimplemented.
