# B001: retain the balanced baseline

The single predeclared five-recording HU33 validation comparison completed.
The candidate improves the primary boundary score but fails the mandatory
short-reference transition guardrail. Production segmentation stays unchanged.
No test recordings, training, parameter search or model promotion occurred.

| Pooled metric | Balanced baseline | Candidate |
| --- | ---: | ---: |
| Boundary F1 at 20 ms | 0.045491 | 0.062821 |
| Boundary F1 at 50 ms | 0.099445 | 0.135922 |
| Boundary F1 at 100 ms | 0.131711 | 0.191890 |
| Root agreement, exact time overlap | 0.417284 | 0.409238 |
| Reduced structural agreement, exact time overlap | 0.061716 | 0.061229 |
| Missed short-adjacent references at 50 ms | 0 / 4 | 1 / 4 |
| Scored predicted boundaries | 3,518 | 1,488 |
| Predictions excluded in unscored gaps/margins | 838 | 409 |

F1 at 50 ms rises by 0.036478, exceeding the required 0.02. Root agreement falls
by 0.008046 and reduced structural agreement by 0.000486, within their 0.01 limits.
However, short-adjacent misses increase; the acceptance decision is **retain
baseline**. Lower false-positive count also comes with substantially lower
boundary recall: 0.714829 to 0.452471 at 50 ms. Overall accuracy remains inadequate.

Scoring covers 539.80 exact seconds across the five compositions. There are 361
source rows, 311 strictly eligible rows and 267 precise prepared boundary times.
Four redundant reduced-label transitions are excluded, leaving 263 reference
boundaries. Zero additional reference cuts fall in unknown-edge exclusion margins
in these recordings. All masks preserve the existing global 0.1-second unknown-edge
neighborhood exclusions. A constructed regression caught and fixed an adapter
mistake involving a short neighboring valid row before any real inference or
metric computation. No coarse time grid substitutes for interval overlap.

The short-transition failure is composition 18 at 2.94 seconds, immediately after
a 0.22-second reference B-flat-major interval (2.72-2.94). The balanced pipeline
has a cut at 2.902494 seconds, within 50 ms. The candidate spans 2.716735-3.924172
with one D-diminished-seventh/B interval, so that reference cut is missed. Saved
provenance has no inserted/removed cut or timing move near this failure; this is
not evidence that timing snapping caused it. Chord correctness is distinct from
boundary timing: the baseline's nearby labels are also imperfect.

The runner verified every selected raw-audio, annotation and prepared-file hash,
and actual Chrome OfflineAudioContext decoding matched ordinary AudioContext PCM
sample-for-sample at 22,050 Hz, mono, with the original source frame counts.
Both arms used one frozen browser peak-chroma/prediction set per recording;
recomputed baseline predictions reproduced its segments exactly. Three strategy
timing runs were deterministic; quality metrics were computed once per arm.
The scientific sources and data still matched preflight after execution.

Measured browser campaign time was 9.83 seconds; full runner time including bundle
and evaluation was 10.45 seconds. Sampled process-tree RSS peaked at
1,261,678,592 bytes; minimum available system RAM was 14,712,700,928 bytes over 87
samples. One analysis worker ran sequentially with browser GPU disabled. Summed
RSS can double-count shared pages; these are sampled observations, not hard peaks.
An independently running full Python test suite may have overlapped this timing
window; exact overlap was not logged. Do not treat these as isolated benchmarks.
No rerun was performed to improve timing evidence. Baseline timing also includes
rhythm/key/analysis assembly while candidate timing covers segmentation alone;
the reported durations do not establish relative speedup.

The reduced projection retains root, triad, seventh, bass and four extension flags.
It is not full canonical chord agreement: other alterations/omissions and extension
alteration signs are outside this metric. These exact-overlap browser results are
not interchangeable with historical Python frame-sampled model metrics. One small
historical voice/piano corpus cannot establish broad musical or release quality.

## Artifacts and verification

`preflight.json` freezes protocol, implementation, adapter, transitive sources,
compiled worker, manifest and selected file hashes before inference. The exact
source bytes, including compiled worker, are retained in `source-snapshot.zip`;
its hash is in preflight. `report.json` contains pooled/per-recording metrics,
reference supports/exclusions, missed times, durations and operation counts.
`resources.json` records the sampled resource campaign.

`browser.json.gz` losslessly preserves raw browser outputs. The original
`browser.json` remains locally in place but is ignored to avoid a 12.7 MB repository
blob. Gzip uses mtime 0; its decompressed SHA256 must be
`ada7ae828de24306b7b0c505a84cac6f688b30f08b99c736396850316434f525`, also recorded in
`report.json`. Decompress into a fresh path, never overwrite retained evidence:

```python
import gzip, hashlib
from pathlib import Path

data = gzip.decompress(Path("browser.json.gz").read_bytes())
assert (
    hashlib.sha256(data).hexdigest()
    == "ada7ae828de24306b7b0c505a84cac6f688b30f08b99c736396850316434f525"
)
with Path("browser-restored.json").open("xb") as output:
    output.write(data)
```

Four adapter regressions pass: exact submillisecond overlap, gap/precise-boundary
handling, chronological one-to-one matching and global unknown-edge masking.
Scoped Ruff and isolated worker TypeScript checking pass. Parent coordinates the
current whole-suite result; this comparison is not a final release gate.

## Next research proposal, not executed

A new bounded training-only diagnostic could record why unchanged candidate and
sustained-evidence rules miss transitions or generate excess cuts on HU33 02-13.
Predeclare its trace categories and resource limits before running; distinguish
weak/brief evidence from unstable recognizer labels. Do not tune thresholds to the
observed composition-18 failure, add candidates to B001, or rerun its validation
to select a favorable result. Any subsequent candidate requires a fresh explicit
protocol; improving chord evidence may matter more than another boundary heuristic.
