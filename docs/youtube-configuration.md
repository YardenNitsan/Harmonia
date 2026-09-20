# Native YouTube search configuration

YouTube search uses the official [search.list](https://developers.google.com/youtube/v3/docs/search/list)
and [videos.list](https://developers.google.com/youtube/v3/docs/videos/list) APIs.
Enable YouTube Data API v3 for the Google Cloud project and restrict the key to
that API. Native requests cannot use browser referrer restrictions. Never use a
`VITE_` credential, commit credentials, or paste a key into a product form.

For development, put `YOUTUBE_API_KEY=<your key>` in the ignored repository-root
`.env.local`. The debug native process reads this file at runtime when started
from the repository or its desktop directory. It accepts a single plain or quoted
value, with optional `export`; it does not expand shell variables. No build script,
frontend asset, or Rust compile-time environment reads this file.

For the packaged Windows app, run once from the repository root:

```powershell
powershell.exe -NoProfile -File scripts/configure-youtube.ps1
```

This imports the ignored `.env.local` value into
`%LOCALAPPDATA%\Harmonia\youtube-api-key.dpapi`, encrypted with Windows DPAPI for
the current user. The script prints status only and preserves existing protected
configuration. Add `-Replace` for an intentional update. Alternatively use
`-Prompt` to enter the key with a masked PowerShell prompt. The same Windows user
must run the app. There is no primary key field in the application.

Native precedence is runtime `YOUTUBE_API_KEY`, then debug-only repository
`.env.local`, then the protected per-user file. Release builds never read the
repository configuration file. `search_status` returns only `{ configured }`;
this indicates a locally readable key, not a successful Google authentication.
Configuration is read per request, so no rebuild is needed after setup.

The native client is HTTPS-only, rejects redirects, and calls only fixed Google
API endpoints. Each response is limited to 2 MiB, each result list to 12, query
text to 200 characters, and simultaneous searches to eight. Connection timeout is
5 seconds, each HTTP request timeout is 12 seconds, and a full search has a
20-second deadline. Cancelling a request drops its in-flight HTTP future;
request IDs isolate cancellation and bounded tombstones cover IPC ordering races.
Window exit cancels outstanding work. Returned text/IDs/thumbnail hosts are
validated. Error bodies and request URLs are never returned or logged.

Search metadata includes durations, but official APIs provide no analysis PCM.
YouTube results therefore carry `audio: null`. The browser preview reports native
search unavailable. Protected storage does not make a key inaccessible to other
code running as the same Windows user; DPAPI prevents plaintext disk storage and
binds decryption to that account. See [Microsoft DPAPI documentation](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptunprotectdata).

A deliberate real-API check (consumes one search plus one durations request):

```powershell
$env:CARGO_BUILD_JOBS = '2'
$env:CARGO_TARGET_DIR = Join-Path (Get-Location) 'apps/desktop/src-tauri/target/continuation-clean'
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib search::tests::configured_live_search -- --ignored --nocapture
```

Normal tests use synthetic metadata and a fake DPAPI credential; they make no API
requests. The deliberate live check prints only result count and elapsed time.
