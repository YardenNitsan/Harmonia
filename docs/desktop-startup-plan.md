# One-command Windows startup plan

Goal: `npm.cmd run desktop`, or `Start-Harmonia.cmd` without Node installed yet,
prepares the existing source-based app and starts it. No product/recognition
redesign, new providers or ML runs. Existing user autonomy authorizes implementation.

Architecture: a PowerShell entry point orchestrates idempotent checks and setup.
Separate workflow and Windows environment adapters allow mocked installation and
launch tests without changing this machine. Reuse pinned acquisition and protected
credential scripts. Missing system prerequisites use exact WinGet IDs; never
bypass installer verification, silently reboot or replace a working Python env.

Files: `Start-Harmonia.cmd`, `scripts/start-harmonia.ps1`,
`scripts/startup-workflow.ps1`, `scripts/startup-environment.ps1`,
`scripts/check_recognition_environment.py`, `scripts/startup.test.ps1`, npm commands,
and a small optional-empty prompt addition to `configure-youtube.ps1`.

- [x] Write failing workflow checks: existing setup reuse, missing dependency order,
      failed install/recheck stops launch, check-only never mutates, setup-only
      never launches, key present/absent/skip/noninteractive, failed key setup.
- [x] Implement supported Windows prerequisite discovery/provisioning: Node 24+,
      MSVC + SDK, stable MSVC Rust, WebView2, Python 3.13; refresh process PATH.
- [x] Install locked npm/Python dependencies only when needed; verify pinned weights
      and acquisition tools; keep credentials out of arguments/logs/frontend.
- [x] Add npm entry points and CMD launcher; preserve direct development command.
- [x] Run mocked tests and real check/setup-only verification with no visible app.
      Document first-run downloads/UAC/WinGet and untested fresh-machine limits.
- [x] Update README/operating plan and checkpoint useful work.

Sources: [WinGet install](https://learn.microsoft.com/en-us/windows/package-manager/winget/install),
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), existing lockfiles,
verified provisioning scripts and ADR010. This is convenient source setup, not a
portable installer or a way to create a Google API key without the user's account.

Verification: 10 mocked workflow scenarios, 6 Python environment regressions, Ruff,
PowerShell syntax, actual npm check-only/setup-only and CMD check-only all pass.
885 application tests, ESLint, TypeScript and frontend production build pass.
No visible GUI or fresh-machine installers were run. Independent review found
and fixed old-Node PATH precedence and noninteractive CMD failure pausing.
Fresh Windows provisioning/UAC/reboot behavior remains a deployment check.
