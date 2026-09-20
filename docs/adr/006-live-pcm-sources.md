# ADR006: Live PCM sources and independent playback providers

Status: implemented; narrowed Windows live-MVP acceptance verified 2026-09-20.
See [native evidence and limits](../live-mvp.md). Broader release gates remain open.

The user's product correction makes Listen Live the primary workflow. See the
[assumption audit and acceptance criteria](../live-input-correction.md). It supersedes
ADR001's file-first input choice, without changing the separate repository or
domain/infrastructure boundaries. Existing scientific freezes remain immutable.

Introduce separate timestamped PCM-source and streaming-analysis contracts.
Capture is not a seekable MusicProvider. Official playback/metadata providers can
optionally accompany capture, but do not own or promise raw PCM. Native Windows
process-tree capture is preferred; explicit named endpoint loopback is available.
Use direct windows0.61.3 bindings already present in the lock rather than a wrapper
whose process activation blocks indefinitely. Keep async activation callback state
alive until OS completion, reject late publication, and bound pending operations.

Transport is bounded pull, with20ms48kHz stereo f32 blocks and12-block native queue.
Each block carries capture identity, sequence, source frame, device/QPC timestamps,
silence and discontinuity/loss information. IPC carries at most four blocks. Worker
consumption drives pull; no unlimited event stream. A new stream worker performs
stateful downmix/resampling and windowed DSP; future ML strategies need independent
streaming-context/parity/latency evidence. Never truncate E010's future context
silently to advertise a low-latency model.

Measured process-loopback packets on this machine have a constant-zero device
position, despite advancing QPC. Treat that position as unavailable, preserving
QPC and the contiguous source-frame counter. Endpoint position checks remain in
place. Timestamp uncertainty alone does not mean audio loss and must not discard
partial PCM blocks. Actual discontinuities and queue loss still reset analysis.

Add a LiveSessionController and live stage beside existing file SessionController.
Listen Live is the default, with File analysis and Library retained. Pause local
playback before capture; stop capture before file playback/mode replacement. Live
state has capture-relative time, current estimate, recent bounded segments and
visible waiting/silence/error/ended states. No fabricated duration, seek, future
chord or calibrated probability. Raw PCM is ephemeral and never cached or saved.

Costs: native capture lifecycle/identity handling, bounded IPC, a stateful resampler
and live-specific UI states. Benefits: the intended no-import workflow, controlled
source scope and reuse of the existing recognition/domain modules. Provider
registration/policy, actual weak-PC performance and final release remain separate
measured gates. The visible desktop remains closed during implementation.
