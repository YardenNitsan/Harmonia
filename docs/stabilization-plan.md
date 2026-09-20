# Recognition and progression stabilization plan

Scope: the user's 2026-09-21 stabilization specification. Product architecture is
frozen at 44ec717. No new providers/pages/live work, training, or locked-test access.
Use executing-plans and independent UI/model-comparison workers. Preserve all prior
protocols/results and unrelated untracked work. Visible GUI remains closed.

## Diagnosis and frozen comparisons

The exact user recording is BobDylanVEVO `rm9coqlk8fY`, 151.4239909297052 seconds,
acquired WebM SHA256 `1df50037c17822f83f5162dda09b86663fa030a448bf9f758f837a44827d409b`.
Existing saved v1 output contains 1052 regions; median duration 0.0464399093 s.
Read-only saved record and exact cached bytes are preserved privately before edits.

Initial code trace: peak chroma → 324 flat template similarities → uniform-cost
whole-sequence Viterbi → **frame-local bass attachment after decoding** → exact
identity merging. Thus bass changes bypass the temporal decoder. Rich templates
receive almost no added-tone evidence penalty; beats/key are estimated only after
the timeline. This is a structural segmentation/evidence problem, not only a model
ranking problem. The UI progression has no follow-scroll behavior.

Validation: fixed HU33 compositions 14–18, existing manifest SHA256
`a54ce6ed104a42b8216f5045e4bc0be0d4912e61c8678c920ddf896dc63faf4d` and B001 source
hashes. Reuse E010 retained predictions, compare original pinned LV-Chordia runtime
and current browser whole-song DSP using common valid masks and interval metrics.
Investigate BTC/ChordNet licenses/runtime before use. No tuning against the closed
test sets; no rerunning fits. Develop generic duration/complexity behavior on
procedural and training-only controls before one frozen final validation pass.
Bob Dylan is an unlabelled structural regression, not ground-truth accuracy evidence.

Report root/triad/seventh/reduced structural/bass accuracy, boundary P/R/F1 at
20/50/100 ms, class/inversion/extension PR where labelled, segment counts/durations
and all stage latencies. Do not trade away supported advanced harmony silently.
Do not label heuristic similarities as calibrated probabilities.

## Tasks

- [x] Save exact before timeline/diagnostics, source/bundle hashes, and timing.
- [x] Fix one authoritative playback index and progression follow/manual respite;
      demonstrate failing then passing seek/play/pause/click/scroll E2Es.
- [x] Compare existing recognizers on fixed validation and assess legal/runtime
      feasibility; record unavailable approaches without invented results.
- [x] Implement region-based beat-aware/non-causal decoding and hierarchical
      complexity/bass evidence with generic acoustic regressions. Preserve v1
      reference and increment cache pipeline/model identities for changed output.
- [x] Freeze candidate, run identical-audio before/after and labelled comparison;
      promote only a measured improvement with explicit minority-class limits.
- [x] Verify actual Bob workflow, immutable late seeks and progression visibility;
      run static/tests/build/native gates, report metrics/executable and checkpoint.

Implementation boundaries: presentation agent owns progression/player/clock/E2E;
comparison agent owns isolated model evaluation and its document; parent owns
baseline harness, audio region decoder, protocol/integration and final verification.

## Final checkpoint

All bounded implementation tasks above are verified; see `stabilization-acceptance.md`
and ADR010 for measured improvement and remaining recognition/deployment limits.
881 TS tests, 42 production E2Es, 63 Rust tests and 147 Python tests pass. Original
Python/model runtime remains required. Full-tree Ruff has one preserved historical
SIM105 style issue; new code passes. No new training, locked tests or visible GUI.
This closes the implementation pass, not broad musical accuracy or final release.
