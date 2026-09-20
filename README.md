# Harmonia

A local-first whole-song chord workspace for Windows. **Engineering prototype;
recognition accuracy is not established.** Search & Analyze is the primary mode:
search openly licensed recordings, prepare the complete chord timeline, then play
and seek against that timeline. Local file analysis is secondary; Listen Live is
preserved as experimental.

In **Search & Analyze**, try **Greensleeves**, select a Commons recording and choose
**Analyze song**. Harmonia checks its license, temporarily obtains that recording,
analyzes the full track locally and shows its complete timeline before playback.
Analysis and playback use the same bytes. Exact recording/model/pipeline matches
reuse cached analysis; audio is reacquired because the library does not store it.
YouTube metadata search requires your session-only Data API key. It does not provide
analysis audio or an integrated synchronized YouTube experience; no streams are
extracted. See [prototype acceptance and limitations](docs/search-analyze-acceptance.md)
and [optional live capture](docs/live-mvp.md).

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
