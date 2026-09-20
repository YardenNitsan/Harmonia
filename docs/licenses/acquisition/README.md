# Acquisition component license records

Fetched from fixed upstream revisions before local installation, 2026-09-20.
These files are software notices, not licenses for acquired media.
Upstream notice bytes are preserved, including trailing spaces in the yt-dlp
third-party notice. Whitespace checks exclude these verbatim `.txt` records;
application and documentation changes pass the ordinary check.

| File                                       | Source                                                                                                       | SHA256                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| yt-dlp-2026.08.19-LICENSE.txt              | [source](https://raw.githubusercontent.com/yt-dlp/yt-dlp/2026.08.19/LICENSE)                                 | `7e12e5df4bae12cb21581ba157ced20e1986a0508dd10d0e8a4ab9a4cf94e85c` |
| yt-dlp-2026.08.19-THIRD_PARTY_LICENSES.txt | [source](https://raw.githubusercontent.com/yt-dlp/yt-dlp/2026.08.19/THIRD_PARTY_LICENSES.txt)                | `472aefe951c7db35e1657c1d13fd337140511ed6f2b329205105ad441c5a02b7` |
| deno-v2.9.7-LICENSE.txt                    | [source](https://raw.githubusercontent.com/denoland/deno/v2.9.7/LICENSE.md)                                  | `f62497fffecc0852960c8d3e6934b9db86d16396e9b604072e923892cae3a588` |
| cobalt-a636575-LICENSE.txt                 | [source](https://raw.githubusercontent.com/imputnet/cobalt/a636575b09de1fc55d9b8cd98cac88f5f2f16b42/LICENSE) | `ebe435fddb16699248ec09087bfb121517701aac63b679315aec33eb05e4f404` |

yt-dlp's Windows bundled executable is GPLv3+, despite the source Unlicense.
Deno's MIT top-level notice is not a complete dependency inventory. Cobalt API is
AGPL-3.0. See [acquisition audit](../../acquisition-providers.md) for installation,
measured availability and remaining redistribution gates. External executables
and the Cobalt source checkout remain outside this repository and the installer.
