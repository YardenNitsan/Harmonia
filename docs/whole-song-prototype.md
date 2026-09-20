# Whole-song DSP prototype

The separate `WholeSongAnalysisService` in
`packages/audio/whole-song-analysis.ts` implements the existing analysis contract.
It reuses bounded browser decoding and worker cancellation, then transfers all
PCM channels to `whole-song-worker.ts`. The worker reuses the existing optional
derived-feature cache and peak-chroma features. No live engine or learned model
is involved. Legacy service and pipeline versions stay unchanged.

The new identities are `harmonia-whole-song-v1` and `dsp-whole-song-v1`.
All profiles use the same frozen settings; selecting `accurate` does not imply a
different model. Existing authored demo behavior remains inherited and identified
as a demonstration rather than a recognition result.

The recognizer exposes all 324 existing template scores in stable order, while
its baseline method retains the same top-four scoring/bass behavior. A 325th
no-chord state is the only permitted state on silent frames. Elsewhere its
emission is impossible, matching the baseline's silence-based no-chord scope.
The decoder maximizes summed acoustic similarities minus **0.12 per chord-state
change**, with no imposed minimum duration or key filter. A final traceback uses
the entire sequence. Bass remains a separate framewise acoustic estimate; the
decoder does not model bass transitions independently.

Uniform transition cost allows exact O(TK) decoding. Typed backpointers and
rolling score buffers use `2*T*K + 2*T + 24*K` bytes, capped at 64 MiB, with at
most 60,000 frames and 512 states. This is decoder allocation, not total process
memory. Production uses 325 states and the existing 20-minute input bound.
Cancellation terminates the owned worker, including synchronous DSP work.

Global key and beat estimates use the full feature sequence. Tuning correction,
local keys, song sections, meter, downbeats, trained chord language models and
calibrated probabilities are **not implemented**. Warnings in every result state
these limits. Novelty is returned as acoustic evidence; final boundaries come
from decoded chord/bass changes. This is not promotion of failed B001 refinement.

## Procedural engineering comparison protocol

Declared before execution on 2026-09-20. One bounded local comparison uses
22,050 Hz procedurally generated PCM: 1-second silence, a 12-second sequence
of equal four-second C/G/A-minor triads, and a 30-second sustained C-major triad.
Each note is a 0.09-amplitude sinusoid with MIDI-derived frequency. Silence is
zero PCM. No recorded corpus, model artifact or locked test is accessed.

For each input, extract existing features once, then run legacy balanced analysis
and whole-song balanced analysis once in that order, sharing unchanged features.
Record source hashes, input hash, frame count, extraction and each pipeline's
elapsed time, segment counts, frame-duration-weighted output disagreement and
process memory snapshots. Snapshot RSS is not a peak measurement. Runtime excludes
browser media decoding, IPC and Vite/module startup; these are developer-machine
Node timings, not weak-PC or end-to-end browser figures. No tuning follows the
result. Save to a new evidence path and refuse overwrite.

This comparison shows runtime and changed behavior, not real-song accuracy.
Future dependence is separately tested with a 400-frame ambiguous prefix and a
later disambiguating suffix. Long-sequence tests verify bounded traceback memory;
worker/service tests cover full PCM, silence, final duration and cancellation.
Real product-flow acceptance remains a separate hidden-browser/native check.

Evidence path: `docs/review-evidence/whole-song-procedural.json`.
