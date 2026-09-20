# Security and privacy checkpoint

Audio import, DSP/ML, edits and history stay local. No analytics, remote model
download, provider ripping, OS audio capture, shell plugin or arbitrary filesystem
command is exposed to the webview. Hash-verified model/WASM files ship with the app.
The CSP allows local assets, media blobs and WebAssembly compilation; no remote scripts.

Untrusted saved timelines and nested chords/corrections are validated at repository
boundaries. Native payloads are limited to32MB; SQL and migrations reside in persistence
implementations. Healthy records survive corrupt-row migrations; damaged rows are retained
and reported. Audio fingerprints, model/pipeline/profile identity avoid cache collisions.

Imports are limited to100MB and20minutes. Header preflight rejects unverified layouts
and more than two channels before full decode. Decode jobs are serialized, workers
are cancellable, late callbacks are scoped to current requests/sources, and inference
uses bounded chunks and one CPU thread. Browser codecs are not a hard memory sandbox:
malicious contradictory headers, compressed metadata and OS allocation failure still
require a bounded native decoder and fuzz/stress validation before release approval.

Hidden native validation is explicitly opt-in. Its directory must be a marked unique
child of OS temp; windows are configured hidden before construction; no real user data
is used. The runner briefly enables an owned, loopback-only WebView2 debugging endpoint,
then terminates processes, verifies port closure and deletes only its marked temporary
data. Normal startup does not enable this debugging endpoint. Keep validation scripts
out of untrusted automation and never use CDP against personal listening sessions.

2026-09-20 npm production dependency audit:0reported vulnerabilities. This is not an
independent security audit or proof of absence. Rust/Python transitive advisory and
license inventories, signed installers, clean-machine lifecycle tests, hostile-file
fuzzing and comprehensive disk-full/OOM recovery remain open acceptance work.
