# External audio acquisition: audited local tools

Audit and direct smoke measurements: 2026-09-20, this Windows development PC.
The latest user instruction explicitly selects local yt-dlp, then private Cobalt,
then optional SaveAPI. These are acquisition adapters, separate from YouTube Data
API search and Harmonia's whole-song recognition. Software licenses do not grant
rights in recordings or override platform terms. This is not an official YouTube
audio API. No account cookies, DRM bypass, token-generation service, external
plugin, browser impersonation configuration or remote executable script was used.

## Provisioning and reproducibility

Run from Harmonia in PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-acquisition-tools.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-acquisition-tools.ps1 -VerifyOnly
```

The script installs only into `%LOCALAPPDATA%/Harmonia/tools`, retains reviewed
license notices first, downloads fixed official release assets, checks SHA256
before execution, and extracts only the expected Deno archive entry. Temporary
installation cleanup is restricted to that tools directory. It does not download
media, update to an unknown latest release, run on app startup, or package tools
into Harmonia's installer. Native overrides are `HARMONIA_YTDLP_PATH` and
`HARMONIA_JS_RUNTIME_PATH`.

| Asset                | Pinned version | SHA256                                                             |
| -------------------- | -------------- | ------------------------------------------------------------------ |
| yt-dlp.exe           | 2026.08.19     | `66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a` |
| Deno Windows x64 zip | 2.9.7          | `a0c3101b4158d1dfb7d6a78a7bf0f3de80c96bb423c152beec8beb22786f2238` |
| Extracted deno.exe   | 2.9.7          | `e020f3e232bd16e33768dee528e5983349c962952051ced0a5d58ad42f5d9b33` |

Pins were obtained from the official [yt-dlp release](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19)
and [Deno release](https://github.com/denoland/deno/releases/tag/v2.9.7), including
GitHub's published asset digests. Hash matching is not a claim that an independent
signature-verification process was performed. Updating a pin requires another
license review, checksum update and real acquisition regression.

## Licenses and redistribution

The [yt-dlp source](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/LICENSE)
uses the Unlicense, but its Windows PyInstaller executable is a combined
**GPLv3-or-later** work. Do not describe that binary as public-domain-only.
Its [bundled component notices](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/THIRD_PARTY_LICENSES.txt)
are retained verbatim under `docs/licenses/acquisition`. A distributed binary
bundle needs the applicable notices and corresponding-source obligations reviewed;
local developer installation is not an installer-distribution clearance.

[Deno's license](https://github.com/denoland/deno/blob/v2.9.7/LICENSE.md) is MIT;
preserve its copyright and license notice. Deno contains dependencies including
V8; a future redistribution review must inventory their notices too. The retained
top-level license alone is not a complete bundled dependency audit. No Deno
binary is committed or embedded into the application package.

[Cobalt API](https://github.com/imputnet/cobalt/blob/a636575b09de1fc55d9b8cd98cac88f5f2f16b42/api/package.json)
11.7.1 is AGPL-3.0. Source, notices, modifications and network-service source-offer
obligations must be considered before distributing/operating a modified public
service. This task uses unmodified pinned source as a private localhost service.
It does not incorporate Cobalt source into Harmonia's recognition pipeline.

## Private Cobalt setup

Docker CLI exists on this PC, but its Linux engine is not running. No visible
Docker Desktop was launched. The supported [Node development deployment](https://github.com/imputnet/cobalt/blob/a636575b09de1fc55d9b8cd98cac88f5f2f16b42/docs/run-an-instance.md)
works with installed Node 24.11.1 and pinned pnpm 9.6.0:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/cobalt-local.ps1 Prepare
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/cobalt-local.ps1 Start
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/cobalt-local.ps1 Status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/cobalt-local.ps1 Stop
```

Source commit is `a636575b09de1fc55d9b8cd98cac88f5f2f16b42`, installed outside Git
under `%LOCALAPPDATA%/Harmonia/tools/cobalt-a636575`. Dependencies use the frozen
lockfile and disabled lifecycle scripts. Available native `isolated-vm` prebuilds
worked. FFmpeg is not installed; only original M4A passthrough is verified.

Start binds exclusively to `127.0.0.1:19000`, launches hidden, keeps a process-ID
and start-time ownership record, and fails if an unrelated process owns the port.
Stop kills only the recorded Node process with matching start time. This is an
explicit developer service, not automatic app startup. It is currently left running
for Harmonia's configured fallback and native acceptance; use the Stop command
when that fallback is no longer needed. Logs stay outside Git and
are replaced on restart. The API has a 1,200-second duration bound, 20 requests
per minute and 60-second tunnel lifetime. No public Cobalt instance is used.

Native-only `%LOCALAPPDATA%/Harmonia/acquisition.env` contains:

```dotenv
COBALT_API_URL=http://127.0.0.1:19000/
```

An externally managed private instance may require `COBALT_API_KEY`. Never place
it in React. The local adapter sends `downloadMode: audio`, `audioFormat: best`;
see the pinned [API contract](https://github.com/imputnet/cobalt/blob/a636575b09de1fc55d9b8cd98cac88f5f2f16b42/docs/api.md).
HTTP 200 plus an empty tunnel response is failure, not successful acquisition.

## Measured direct-provider smoke checks

These are real network acquisitions, not mocks. Timings include metadata resolve
and complete file download unless stated. They do not include Harmonia analysis
or playback; integration evidence is recorded separately.

| Exact video ID | Provider                      | Duration    | Result                                              | Elapsed |
| -------------- | ----------------------------- | ----------- | --------------------------------------------------- | ------- |
| `BaW_jenozKc`  | yt-dlp                        | unavailable | Original historical test video unavailable; stopped | 1.52 s  |
| `gHKT4uU8Zng`  | yt-dlp                        | 5 s         | M4A/AAC, 82,643 bytes                               | 3.516 s |
| `gHKT4uU8Zng`  | Cobalt                        | 5 s         | M4A/AAC, 82,643 bytes                               | 0.721 s |
| `gHKT4uU8Zng`  | script-managed Cobalt restart | 5 s         | M4A/AAC, 82,643 bytes                               | 0.904 s |
| `LrM_Y39Gmhk`  | yt-dlp                        | 130 s       | Monkeys Spinning Monkeys, M4A/AAC, 2,106,037 bytes  | 3.059 s |
| `UXqq0ZvbOnk`  | yt-dlp                        | 263 s       | CHARGE, M4A/AAC, 4,253,263 bytes                    | 3.223 s |
| `UXqq0ZvbOnk`  | Cobalt                        | 263 s       | Empty tunnel response: invalid media                | 1.368 s |
| `YE7VzlLtp-4`  | yt-dlp                        | 597 s       | Big Buck Bunny metadata worked; media HTTP 403      | 2.370 s |
| `YE7VzlLtp-4`  | Cobalt                        | 597 s       | Empty tunnel response: invalid media                | 1.415 s |

The successful 5-second fixture is a current [upstream yt-dlp test](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/yt_dlp/extractor/youtube/_video.py).
Its files from both providers have identical SHA256
`f96b578fbd37457b3097aa893572b9f963073dc1d94f3ed956d94b4ee951374a`.
CHARGE is Blender Studio's [open movie](https://studio.blender.org/projects/charge/).
Downloaded smoke files are under the per-user tools directory, never Git or a
training corpus. Failed empty files were removed. No workarounds were attempted
for unavailable or forbidden responses. Short success does not establish broad
catalog availability, recognition quality, or reliable failover for every song.

## Optional SaveAPI

Current [official documentation](https://saveapi.org/en/docs/) provides
`https://api.saveapi.org/v1/youtube/info` (2 credits), then
`/youtube/create` (10 credits), using bearer authentication. The free signup
allowance is 1,000 non-expiring credits, **not an unlimited or monthly refreshed
free service**. Its 10-request/minute limit and Retry-After must be respected.
No account, key or paid service was created for this task, so real SaveAPI latency
and reliability remain unmeasured. It cannot be the required personal-use backend.

The [audio guide](https://saveapi.org/en/guides/youtube-mp3-api/) recommends M4A
for original AAC; MP3 adds transcoding. Use metadata inspection and `quality=m4a`
when available. Tunelio and SocialKit are not required dependencies or configured
providers in the free-first design.
