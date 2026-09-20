# ADR 005: Isolate remote playback from the local application

Status: adapter/native feasibility verified; message bridge passes46 unit tests.
Product connection remains unfinished. The visible desktop stays gated.

The local application owns audio, analysis and database capabilities. Official
remote playback does not grant access to protected audio for analysis. Loading a
provider SDK in the privileged application would give third-party code access to
local page state, so inject the official player factory only in a separate origin.

An isolated loopback page with fixed assets has passed the real YouTube adapter's
play/pause/seek/dispose checks in Chrome and the hidden native WebView. The remote
native page attempted every database command and received explicit ACL denials;
the isolated sentinel record remained unchanged. No remote capability, Rust
command or production CSP was changed for this probe. Reports:
`review-evidence/youtube-adapter-probe.json` and `youtube-native-probe.json`.

Use a narrow playback message contract between the application and the isolated
context. Both sides pin the exact peer origin and window/source identity. Bound
serialized messages before parsing, accept only known operation/status/error
schemas, and bind replies to request IDs plus session/generation identifiers.
Clock values and seeks must be finite and bounded. Pending operations have
deadlines; replacement/disposal rejects stale work. A lease stops playback when
the owning application disappears. Tokens distinguish sessions; they do not make
the remote page trusted or authorize arbitrary native calls.

Remote SDK assets, scripts and network destinations belong only to that origin's
CSP. The privileged application keeps its local-only script policy. A future
local server may serve fixed compiled assets only, with no filesystem routes,
generic proxy, arbitrary evaluation, credentials or application data. Final
navigation restrictions, peer bootstrap, server lifetime, iframe/native-view
boundaries and native negative tests remain implementation work.

If adding a native child WebView, first narrow the privileged capability from
window-wide `windows: ["main"]` to the exact main webview. Tauri's
[capability configuration](https://v2.tauri.app/reference/config/#capability)
states that a window match includes its webviews. Assign no native capability to
the provider view and do not add remote permission URLs. An ordinary browser
iframe needs its own same-origin/navigation/IPC tests; top-level probe success
does not prove every embedding arrangement is secure.

The official player remains visible and unobscured with its controls intact.
Autoplay denial is recoverable through a real user gesture. Raw-analysis and
offline capabilities are false; no sound capture, ripping or provider training.
The probe's automatic loopback Referer is recorded, not overridden. Verify the
final installed client identity against the official YouTube requirements before
claiming release acceptance. Catalog/authenticated features have separate actual
registration and credential dependencies.

Tradeoffs: an extra origin, strict message validation and explicit lifetime
management add implementation cost. They keep remote playback independent of the
user's local audio/library and make cancellation, outage and permission boundaries
testable. None of these foundations makes the final provider gate complete.
