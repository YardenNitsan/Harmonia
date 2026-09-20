# Harmonia

A music player with whole-song chord analysis for Windows. **Recognition accuracy
is not established.** Search & Analyze is primary: real YouTube typeahead alongside
eligible openly licensed recordings, complete analysis before automatic playback,
then play/pause/seek against a fixed timeline. Local files are secondary; Listen
Live is preserved under More as experimental.

Type **Greensleeves** in the main search field and choose the recording by
**Julien Grandgagnage**. Harmonia checks its license, temporarily obtains that
recording, prepares the full timeline locally and automatically opens the player.
Use the progress bar or click a chord to seek. Details & practice contains source
credits, musical estimates, corrections and explicit re-analysis.

YouTube search uses [native configuration](docs/youtube-configuration.md), with no
API-key form. **YouTube results currently cannot be analyzed or played inside
Harmonia:** official APIs do not provide whole-song analysis audio. Those results
show a clean unavailable message and a normal watch link. Licensed catalog results
are distinct recordings, never silently substituted for a YouTube performance.
See [consumer acceptance](docs/consumer-player-acceptance.md) for measured evidence.

```powershell
npm.cmd ci
npm.cmd run dev
```

Development serves a browser workspace and does not open the desktop GUI. Native
live capture requires the Windows desktop build. In **File analysis**, use an
authorized mono/stereo WAV, FLAC, MP3 or Ogg file. Other containers may require
conversion. Import limits: 100 MB, 20 minutes, with an additional decoded-memory
bound. **Earlier analysis profiles** preserves the previous DSP/experimental model
and authored demo. The new whole-song decoder uses no newly trained model.

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:e2e:production
```

The bundled ONNX artifact is hash checked and runtime assets are prepared automatically.
Training requires a separate Python environment and the audited corpus; it is not
required to run the application. See [training](docs/training.md).

See [AGENTS.md](AGENTS.md), [implementation plan](docs/implementation-plan.md),
[architecture](docs/architecture.md), [build instructions](docs/build-release.md),
[known limitations](docs/known-limitations.md) and the [checkpoint report](docs/final-report.md).
Do not launch a development build as the final product or infer release readiness
from an installer file. The full acceptance campaign is still incomplete.
