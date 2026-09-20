# Primary product correction: Listen Live

Authority: the user's explicit 2026-09-20 product correction supersedes the
file-first interpretation in the original implementation. Harmonia's primary
workflow is continuous recognition of locally rendered Windows audio, preferably
from one selected application/process tree. Optional file import remains available.
This amendment does not authorize protected-stream circumvention, provider API
misuse, uploading audio, training on captured playback, or a visible development GUI.

## Repository assumptions that conflict

| Current assumption and location                                                                                        | Required change                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/architecture.md` explicitly rejects system capture as conflicting with the product                               | Replace that interpretation with a live-first capture architecture; keep Harmonia separate from GuitarScaleViewer.                                                  |
| ADR001 and `docs/product-spec.md` start with local files                                                               | Mark the input decision superseded by this amendment; preserve historical evidence.                                                                                 |
| `AudioAnalysisService` in `packages/application/contracts.ts` requires File, fingerprint and finite completed Analysis | Add generic timestamped PCM source/stream-analysis contracts; keep offline orchestration as a secondary consumer.                                                   |
| `packages/application/session.ts` couples preparation, saved track and local playback                                  | Add a live session lifecycle independent of a file or SavedTrack; coordinate mode switches and cancellation.                                                        |
| `App.tsx` defaults to a file-centric 'listen' tab and gates the stage on state.current                                 | Default to Listen Live, real source selection, start/stop and continuous state; retain File analysis and Library.                                                   |
| `PlaybackStage`, `HarmonyStage`, `Timeline` expect duration, seeking, future neighbors and a local player clock        | Reuse chord/instrument rendering with a live stage showing capture-relative elapsed time and bounded recent history; no invented future chords or seekability.      |
| `import-worker.ts` receives all channels at once, computes a whole result, then ends                                   | Add a persistent bounded stream worker with format/generation/sequence validation and reset on loss.                                                                |
| `extractFeatures` pads both ends and offline stabilization sees future frames                                          | Feed only fully available windows, preserve explicit analysis delay, never pad unknown future audio as if observed.                                                 |
| E009/E010's symmetric127-frame TCN needs63 future frames                                                               | Preserve research; its roughly1.46s model lookahead is not a low-latency live acceptance result. Keep measured DSP as the initial live baseline.                    |
| File SHA and OPFS feature caching assume reproducible complete input                                                   | Live audio is ephemeral; no raw PCM persistence/cache/upload. Saving a stopped chord transcript is an explicit separate action.                                     |
| Native Rust exposes only database commands                                                                             | Add privileged source discovery/capture lifecycle and bounded PCM pull; remote provider views receive no capture capability.                                        |
| Provider rawAnalysisAvailable=false was treated as absence of an input path                                            | Provider playback/control and local OS PCM capture are independent capabilities; API metadata/playback does not grant PCM or capture permission.                    |
| Current smoke/E2E acceptance centers on importing generated files                                                      | Add real native process-isolation, system-output, continuous capture, silence/resume, switching, loss and cleanup acceptance. Preserve offline regression coverage. |

## Supported Windows architecture

Use Microsoft's process loopback API with INCLUDE_TARGET_PROCESS_TREE, selected
PID plus creation-time identity, and a retained process handle. Enumerate audio
sessions on active render endpoints; show application identity and capture scope.
This is process-tree capture, not isolated browser-tab capture. Explicit system
mode captures a named render endpoint; it must not claim to combine every output
device. Do not silently fall back from an unavailable process source to all audio.

References: [application loopback sample](https://learn.microsoft.com/en-us/samples/microsoft/windows-classic-samples/applicationloopbackaudio-sample/),
[process parameters](https://learn.microsoft.com/en-us/windows/win32/api/audioclientactivationparams/ns-audioclientactivationparams-audioclient_process_loopback_params),
[endpoint loopback](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording).
The sample requires build20348 or later; probe actual API support and report errors.
Protected audio may be withheld by Windows. Silence alone cannot identify DRM:
show no accessible audio with pause/protection possibilities, not a fabricated
protected-content diagnosis. Explicit OS errors must remain visible.

Native capture runs on a dedicated COM MTA thread using direct windows bindings.
Preserve packet timestamps, silent/discontinuity flags and loss accounting under
the [GetBuffer contract](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudiocaptureclient-getbuffer).
Bound activation waits and late-callback ownership; timeout is not cancellation of
the operating-system operation. At most one activation may remain outstanding.

Use fixed48kHz stereo float32 capture blocks of20ms, bounded to12 queued blocks
(240ms/92,160 PCM bytes), with drop accounting and explicit discontinuity. Pull at
most four blocks per IPC response; a slow consumer never grows an unbounded queue.
The dedicated analysis worker downmixes and statefully resamples to22,050Hz, then
reuses the existing FFT/chroma/recognizer and canonical chord model. No analysis
runs on the UI or capture thread. Native capture does not render/monitor its input.

Source/format changes, loss and stop invalidate old generations. Silence clears
the current estimate automatically; resumed audio starts fresh evidence. Continuous
track changes update recognition without requiring import. Exact song boundaries,
titles and seek position require reliable provider/session metadata; PCM alone
does not supply them. Recent captured time and unavailable upcoming content are
shown honestly. Scores remain explicitly uncalibrated until measured calibration.

## Acceptance additions

- Startup opens Listen Live without a file or completed analysis. Actual available
  app/session sources and explicit system-output choices can be refreshed/selected.
- Controlled hidden native playback produces nonzero captured PCM and live chord
  updates; a second process's different tones do not enter selected-process capture.
- System mode captures the selected endpoint mix and clearly identifies its scope.
- Silence, pause/resume, source exit, rapid source replacement, stop during activation,
  device errors, sequence loss and worker lag cannot leave a stale displayed chord.
- Queues, retained PCM and timeline/history remain bounded during sustained listening;
  latency is measured end-to-end, separately from recognition quality and lookahead.
- Generic source and worker tests cover arbitrary chunk boundaries, resampling,
  timestamp gaps, format validation, cancellation and stale-generation rejection.
- Remote provider origins cannot enumerate or capture local sources. Search & Play
  remains official API/player work, with local capture only where permitted; no raw
  PCM assumption is made about provider APIs.
- Existing file/library/correction workflows remain usable as secondary features.
- Complete lint/types/unit/native checks, headless live/offline flows, build and
  hidden native capture smoke before claiming the new primary flow works. Existing
  scientific, low-end hardware and final release gates still apply. No visible GUI.
