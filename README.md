# Harmonia

A local-first chord listening workspace for Windows. **In development; not a finished
recognition product.** Local playback, editable timelines, persistence and experimental
CPU inference work. The trained model's limited accuracy is documented openly.

```powershell
npm.cmd ci
npm.cmd run dev
```

Development serves a browser workspace and does not open the desktop GUI. Use an
authorized mono/stereo WAV, FLAC, MP3 or Ogg file, or the clearly labeled synthetic
demo. Other containers may require conversion. Import limits: 100 MB, 20 minutes.
The balanced profile is a DSP baseline; the experimental profile is not recommended
for dependable transcription. All analysis stays on this device.

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
