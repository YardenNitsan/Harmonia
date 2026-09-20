# Desktop build and release

## Supported release target

The current checkpoint is the consumer Search & Analyze player, not a final
installer release. See [source, timing and executable](consumer-player-acceptance.md).
`node scripts/consumer-native-probe.mjs <new-report-path>` checks real configured
YouTube typeahead, licensed catalog acquisition, full analysis before autoplay,
seek/playback and SQLite reuse in a hidden WebView. Configure native search using
[the one-time protected setup](youtube-configuration.md); do not embed a key.
Rebuild the continuation-clean executable first.

The configured native release target is a Windows NSIS installer for the current
user. The product name is **Harmonia** and the stable application identifier is
`local.harmonia.desktop`. No MSI or non-Windows artifact has been validated yet.

The main window is 1440 x 960 with a 760 x 600 minimum. Its capability grants only
the persistence, source-discovery/capture and bounded YouTube search commands to the
local `main` WebView. No generic shell, filesystem, remote-provider capture, or
protected-audio bypass permission is present. The CSP permits local assets plus
`blob:` media and workers required for local decoded audio and analysis Web Workers;
it does not permit remote scripts. Search permits fetch to official Commons
metadata/media hosts; thumbnails have explicit image hosts. YouTube HTTP requests
are native-only; Google API access is excluded from the frontend CSP.
Remote provider scripts/iframes are not enabled in the app.

## Prerequisites

- Node.js 24 or newer and the locked npm dependencies (24.11.1 tested; native smoke uses `node:sqlite`)
- stable Rust with the `x86_64-pc-windows-msvc` target
- Microsoft C++ build tools and Windows SDK
- network access during packaging if the default WebView2 download bootstrapper is
  needed

Windows 10 and 11 normally provide WebView2. The NSIS setup remains configured with
Tauri's small download bootstrapper rather than embedding the approximately 127 MiB
offline runtime.

## Development checks

Run commands from the repository root unless the command changes directory explicitly:

```powershell
npm.cmd ci
npm.cmd run build

Push-Location apps/desktop/src-tauri
$env:CARGO_BUILD_JOBS = '2'
cargo fmt --check
cargo check
cargo test
cargo clippy --all-targets -- -D warnings
Pop-Location
```

`npm.cmd run desktop` starts the Vite server on port 1425 and opens the desktop GUI.
Do not run it during automated implementation or ML work. Per the project completion
gate, launch the production GUI only after the complete product has passed all final
validation.

## Installer build

After the production frontend exists and `npm.cmd run build` succeeds:

```powershell
$env:CARGO_BUILD_JOBS = '2'
npm.cmd run desktop:build
```

The Tauri config invokes the root frontend build, reads `apps/desktop/dist`, compiles
the release Rust binary, and creates an NSIS setup executable under:

```text
apps/desktop/src-tauri/target/release/bundle/nsis/
```

The build does not launch the application. The checked-in base64 icon sources are a
small deterministic build placeholder; replace them with reviewed Harmonia-branded
PNG/ICO assets before a public release.

## Hidden production WebView validation

After rebuilding the release executable, validate its real WebView2 and native SQLite
path without showing a desktop window:

```powershell
node scripts/native-smoke.mjs
```

The runner requires Windows, the installed WebView2 runtime, Playwright from the
locked npm dependencies, and Node with `node:sqlite` (validated toolchain: Node 24).
Use `--exe <absolute-release-exe>` and `--report <report-json>` to override defaults.
The default report is `docs/review-evidence/native-smoke.json`.

This is an explicit diagnostic mode. Normal application startup does not enable
remote debugging or change window visibility. The runner first checks the binary
for the `HARMONIA_HEADLESS_VALIDATION_V1` protocol marker and refuses older binaries
before launching them. It passes `--validation-headless --validation-data-dir <path>`
and uses `windowsHide: true` for its child process. The native mode changes every
configured window to `visible: false`, `focus: false`, and `skipTaskbar: true` on the
Tauri context **before** window construction; hiding in the setup callback would be
too late. It also verifies hidden state before writing the readiness file.

The data directory must already exist as a marked `harmonia-native-smoke-*` direct
child of the canonical system temporary directory. Invalid, missing, relative, or
unmarked paths make the app exit before creating a window. Native SQLite and the
WebView2 profile both use that directory, never the normal user library. The runner
imports a generated six-second PCM WAV, observes actual media playback and seeking,
edits a chord and favorite, reads the resulting SQLite rows, terminates the native
process, and launches it again to verify persisted state. It also imports the same
audio with a distinct filename under the experimental E004 profile to exercise the
packaged ONNX/WASM runtime, native CSP, and independent analysis identities. The
read-only SQLite probe lives in `packages/persistence/native-probe.mjs`. It does not substitute
authored analysis or fake the media clock. In a hidden WebView, the UI animation
clock may be throttled; the runner observes native media elements for playback time.

Only the runner's child environment sets `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` for
an unused port with `--remote-debugging-address=127.0.0.1`. Before attaching, it checks
Windows listener addresses and the owning WebView2 process's isolated profile path.
No registry settings or global environment variables are changed. While active,
CDP gives local clients control over this test WebView; the mode therefore uses only
synthetic audio and isolated temporary state. This follows the supported
[Playwright WebView2 connection flow](https://playwright.dev/docs/webview2) and
[Microsoft's WebView2 debugging configuration](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/debug-visual-studio-code).

Each native validation process has a 90-second automatic exit, and the runner has
a 120-second overall deadline. Success, failure, interruption, and timeout all enter
cleanup: terminate the owned native process tree, reap WebView2 processes naming
the unique test profile, confirm debugging ports closed, then remove only the
validated marked temporary directory. A cleanup failure makes the result fail and
reports the retained directory. No visible GUI fallback is attempted. This smoke
test establishes production WebView/IPC behavior on the current machine; it does
not establish installer behavior on a clean machine, signing, or other platforms.

## Release checklist

The continuation rebuilt into a fresh native target directory and then rebuilt
the integrated notation/provider changes there. Current unsigned artifact hashes
and sizes are in `docs/review-evidence/release-continuation.json`; its native
smoke report is `native-smoke-continuation.json`. This is a verified engineering
checkpoint with explicit unresolved model/release gates, not a final distribution.

1. Run the complete TypeScript, Rust, E2E, acoustic, and ML validation recorded in
   `docs/implementation-plan.md`.
2. Confirm the installer is built from a clean worktree and record its SHA-256 digest
   and size.
3. Sign the executable and installer with the release code-signing identity. No
   signing key or certificate belongs in the repository.
4. Install per-user on a clean Windows machine without development tools.
5. Verify startup, local-file import, analysis, playback, correction, favorite,
   restart persistence, update/repair behavior, and uninstall behavior.
6. Confirm source audio remains untouched and application data behavior matches the
   documented uninstall policy.

Do not describe an unsigned or untested installer as a production release. Record any
unavailable clean-machine, signing, or cross-platform checks as explicit gaps.
