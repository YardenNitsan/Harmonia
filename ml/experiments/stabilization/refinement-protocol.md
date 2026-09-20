# Native LV region evidence gate

Declared before training-control audio access and candidate validation.
No fitting, threshold search or test access. Original native LV inference and
its noncausal joint HMM are unchanged. This is an inference integration check.

Candidate: inspect consecutive A–B–A original HMM regions left to right once.
Only B with the same root/triad as A, entirely inside a detected beat interval,
and duration at most min(0.25 seconds, half that beat interval) is eligible.
For every differing bass/seventh/extension component, B's mean selected posterior
must be below 0.65 and its margin over A below 0.10. Each changed component's
containing-beat mean posterior must favor A. Sum of component log support over
the complete A–B–A region must favor A. Only then merge to A. Unknown/no-chord,
different-root/triad, crossing-beat, strong short decoration and sustained
offbeat evidence survive. No detected beat support means no extra merge.
No boundary snapping, downbeat assumption, global duration minimum or maximum.
Beat evidence is librosa onset-strength/beat-track on the identical decoded PCM;
posteriors are the same five-network ensemble outputs, with no second model.

First exercise procedural weak/strong seventh, inversion, sustained and offbeat
controls, then compositions 02 and 03 (training only) once. Require no decrease
in pooled reduced exact or bass accuracy; root/triad unchanged by construction.
If controls fail, stop without validation or changing settings. Neutral behavior
passes safety, but is explicitly not evidence of accuracy improvement.

After controls, freeze unchanged sources and original five weight identities
before one validation pass on exactly 14–18. Reuse prepared masks and B001 exact
interval references. Record pooled/per-track root/triad/seventh/bass/reduced,
extension and inversion PR, boundary precision/recall at 20/50/100 ms, short
transition misses and segment counts. Require no loss of reduced exact, bass,
inversion-bass exact or boundary F1@50ms, and no additional short-transition miss.
Compare native high-precision original HMM timestamps with candidate timestamps;
also verify original labels match the earlier original-API output after its
two-decimal formatting (last end clamps to exact PCM duration).

Freeze source/artifact hashes in exclusive files, preserve all earlier runs,
use two CPU threads/no GPU, retain at least 8 GiB available RAM. Candidate v2
may be activated only after these gates; original v1 remains available in Python.
Reports distinguish safety acceptance from measured improvement. The validation
set and original upstream training-overlap limitations remain unchanged.
