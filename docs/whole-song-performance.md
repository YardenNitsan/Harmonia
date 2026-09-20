# Whole-song production latency

The acquisition phase reuses the frozen `harmonia-whole-song-v1` /
`dsp-whole-song-v1` recognizer. This change measures and removes redundant work;
it does not promote a model, change chord scores, tune recognition, change sample
rate, or claim better real-song accuracy. E010 and LV-Chordia remain preserved.

## Measured bottleneck and change

The original worker constructed all 324 candidate chord objects twice for every
23.22 ms feature frame, even though the decoder only needs numeric emissions and
the final timeline needs full alternatives only at new segment boundaries.
On the 240-second fixture this consumed 4.119 seconds of the 5.231-second worker.

The optimized path writes the identical numeric emissions into the decoder's
existing row, reconstructs the chosen chord once per frame, and builds the full
alternatives only when starting a segment. It stores no full-song score matrix
and retains the existing bounded traceback. The existing live recognizer's
prediction path is unchanged. A separate legacy two-pass reference test checks
exact segment/chord/bass/alternative/score/boundary equality on varying rich
chords, silence, inversions and deterministic acoustic perturbations. Pipeline
and model versions therefore remain unchanged, preserving compatible caches.

## Production browser results

Run after `npm.cmd run build`, with CPU-intensive builds/experiments stopped:

```powershell
node scripts/whole-song-benchmark.mjs docs/review-evidence/<new-report-name>.json
```

The script owns a hidden Chrome process and production Vite preview on port 1437,
uses three generated full-length PCM16 mono 22050 Hz WAV recordings, and removes
its processes on exit. It refuses to overwrite evidence. Generation precedes
measurement. Fresh isolated browser contexts prevent cross-recording cache reuse.

| Recording   | Codec decode | Features | Scoring | Temporal decode | Rhythm/key | Complete worker | Click to ready | Cached reimport |
| ----------- | -----------: | -------: | ------: | --------------: | ---------: | --------------: | -------------: | --------------: |
| 30 seconds  |         4 ms |   144 ms |   21 ms |            4 ms |       1 ms |          180 ms |         498 ms |          129 ms |
| 240 seconds |        28 ms | 1,016 ms |  103 ms |           18 ms |       3 ms |        1,177 ms |       2,103 ms |          791 ms |
| 600 seconds |        73 ms | 2,834 ms |  311 ms |           44 ms |       5 ms |        3,291 ms |       5,910 ms |        1,899 ms |

Before optimization, click-to-ready was 1,039 / 6,206 / 16,652 ms respectively;
worker time was 635 / 5,231 / 13,966 ms. Feature extraction is now the largest
measured worker cost. This is one paired engineering measurement, not a statistical
hardware campaign. Both reports record the CPU, memory and production entry hash:

- [Before](review-evidence/whole-song-performance-before.json)
- [After](review-evidence/whole-song-performance-after.json)

These are **procedural latency fixtures**, not licensed commercial songs, not
recognition-quality evidence, and not network-acquisition measurements. Acquisition
is explicitly zero because the inputs already exist locally. Browser click/cache
figures include Playwright transfer of the full WAV and application fingerprinting;
they are not the native acquired-audio cache latency. Codec decode measures
`decodeAudioData`; metadata preflight and remaining application overhead are
included in click-to-ready. Native acceptance must report real provider acquisition
and native cache separately. Network throughput is not inferred from these results.

All three runs verify exactly one PCM decode and one whole-song worker, final
timeline arrival before autoplay, immediate late seeking, and cached reimport
without another decode or worker. Timeline segment counts remain 24/194/502.

## Diagnostic contract

`WholeSongAnalysisService.lastTimings` exposes a frozen diagnostic record only
after successful completion. The worker result includes `timings`. No timing
fields enter the persisted recognition schema or cache identity.

- `decodeMs`: metadata validation, serialized decoder wait, full decode and resample.
- `normalizeMs`: worker input checks and arithmetic channel mixing.
- `featuresMs`: feature cache access/extraction and cache write when applicable.
- `inferenceMs`: acoustic template similarities and chord reconstruction.
- `temporalDecodingMs`: complete-sequence Viterbi excluding emission scoring.
- `timelineMs`: interval merging and alternatives handling excluding scoring.
- `boundaryMs`: feature validation and existing harmonic novelty.
- `rhythmKeyMs`: existing global key, tempo and beat estimation.
- `pipelineMs`, `workerMs`, `analysisMs`: inclusive wall-clock totals at each layer.

The service also publishes bounded Performance entries:
`harmonia.whole.decode` and `harmonia.whole.analysis`; the latter's `detail` holds
the timing record. Each successful analysis replaces the preceding diagnostic
entry, so long-running sessions do not accumulate performance records. A cache hit
does not create a new entry; acceptance must compare worker/entry counts.

No new tuning, downbeat, meter, local-key/modulation or section estimator was added.
Those remain explicitly unsupported/provisional in the existing analysis warnings.
Synthetic parity verifies behavior preservation, not musical correctness. The
uncalibrated DSP baseline still needs a separate real-song accuracy phase.

Decode/input validation errors carry `code: INVALID_AUDIO_INPUT`, permitting
acquisition failover for corrupt media. Cancellation is preserved, and recognition
failures are not misclassified as provider input errors. A successful acquired file
is decoded once and its PCM reused by all existing whole-song stages.

## Acquired-container decode preflight

Acquisition exposed an integration gap: extension filtering accepted M4A and WebM,
but the previous PCM-allocation preflight understood neither container. The bounded
preflight now walks MP4 atom hierarchy into the single audio track's `mp4a`/`esds`
AAC-LC configuration, including `moov` after `mdat`. It checks the AAC channel
configuration rather than assuming the sample-entry channel field is authoritative.
WebM inspection walks EBML/Segment/Tracks/TrackEntry/Audio and verifies the OpusHead
channel count against track metadata (including the specified default of one).
Media payload is skipped structurally; matching magic bytes inside it is never
accepted as metadata. Atom/element counts and sizes are bounded.

Multiple tracks, encryption, invalid sizes, unknown channel layouts, AAC program
configurations/HE-AAC and unsupported WebM codecs fail closed. Raw ADTS AAC is still
unsupported. Current provider-preferred AAC-LC M4A and Opus WebM are supported.
The encoded file is limited to 100 MB and read once for both preflight and decode;
the existing decoded PCM/channel/duration budgets remain enforced. Native-provided
metadata is not trusted to bypass these checks.

Real local fixtures, verified in headless Chrome:

| Input                                          | Encoded bytes | Verified channels | Decoded duration |  PCM rate |
| ---------------------------------------------- | ------------: | ----------------: | ---------------: | --------: |
| `gHKT4uU8Zng.m4a`                              |        82,643 |                 2 |        5.06195 s | 22,050 Hz |
| `channel-fixture.webm` (same test video, Opus) |         2,554 |                 2 |        5.00390 s | 22,050 Hz |

Both browser metadata loads completed. The existing 4,253,263-byte
`UXqq0ZvbOnk.m4a` also passes structural stereo preflight. Fixtures stay outside
Git under the ignored per-user tools directory. These checks establish codec
integration, not recognition quality or matching fingerprints across containers.
The service can additionally require the selected song's expected duration; a
decoded difference exceeding the greater of 3 seconds or 2% rejects the input
before recognition, allowing provider failover without decoding successful input
twice.

Format references: [Matroska elements](https://www.matroska.org/technical/elements.html),
[Matroska codec mappings](https://www.matroska.org/technical/codec_specs.html),
[MP4 registration authority](https://mp4ra.org/),
[Opus identification header](https://www.rfc-editor.org/rfc/rfc7845.html),
and [FFmpeg's MPEG-4 audio configuration parser](https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/mpeg4audio.c).
