# Provider capabilities and restrictions

Official documentation reviewed 2026-09-20. This matrix describes documented platform possibilities, not shipped connections or credentials. Local files are the reference implementation. Remote adapters must report disconnected/unavailable until they have an implemented, configured and tested official integration.

Playback and raw-audio analysis are separate capabilities. No provider adapter may capture protected playback, bypass DRM, scrape undocumented media endpoints, or turn streams into training data. A disabled analysis action should explain the capability limit and direct users to an independently authorized local file.

## Capability matrix

“Conditional” means account, credentials, content, region, SDK and product-policy conditions must all be satisfied. It is not a blanket promise that a Tauri webview is a supported playback platform.

| Capability                    | Local file                                          | Spotify                        | YouTube                                                             | Apple Music                                                         | SoundCloud                           |
| ----------------------------- | --------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------ |
| Authenticate                  | Not needed                                          | OAuth, scoped                  | OAuth for user/private data; key for eligible public Data API reads | Developer token; user authorization for subscriber/library features | Official OAuth / app credentials     |
| Search                        | Imported local library                              | Conditional catalog API        | Data API search                                                     | Catalog/library APIs                                                | Conditional API search               |
| Metadata/artwork              | File tags when supported                            | Conditional; branding rules    | Data API thumbnails/metadata                                        | MusicKit content-use rules                                          | API plus uploader attribution        |
| Play/pause                    | Yes                                                 | Conditional SDK/Connect device | Visible official embedded player                                    | Conditional MusicKit playback                                       | Official widget/authorized streaming |
| Seek                          | Yes, when decoded                                   | Conditional                    | Player API                                                          | Conditional MusicKit controls                                       | Widget/player controls               |
| Position/duration             | Local playback clock                                | SDK/Player state               | Player API                                                          | MusicKit state                                                      | Widget/player state                  |
| Raw analysis available        | Yes for user-authorized unprotected files           | No                             | No                                                                  | No                                                                  | No                                   |
| Offline available in Harmonia | Local file present                                  | No                             | No                                                                  | No                                                                  | No                                   |
| Training-data source          | Only separately licensed, explicitly collected data | No                             | No                                                                  | No                                                                  | No                                   |

### Local files

Import should retain user intent and use decoder-supported unprotected audio. File possession is not a blanket license to redistribute or train a product model. User analysis remains local; corrections are not silently uploaded. A decoder error or unsupported codec is an explicit state. Playback position is authoritative for half-open chord intervals `start <= time < end`.

### Spotify

[Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk) and [Web API](https://developer.spotify.com/documentation/web-api/reference/search) provide documented playback/catalog functionality subject to permissions and account eligibility. Browser SDK existence does not establish reliable DRM support in a Tauri webview; test compatibility before claiming in-app playback. An official external-device control path is a distinct adapter capability.

[Developer Policy](https://developer.spotify.com/policy) prohibits analysis of Spotify content/service and ingestion of Spotify content into ML/AI, including training. Raw audio access is therefore false; an accessible preview URL does not establish an analysis exception. Do not offer stem separation, fingerprinting or chord inference on Spotify content. Marketing must not imply Spotify chord analysis. Metadata/artwork retention and attribution must follow current terms.

The [February 2026 access update, including its March amendment](https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security) limits Development Mode to Premium developers, one Client ID and five authorized users. It positions that mode for personal/noncommercial experimentation. The March update postponed endpoint changes for existing integrations, so do not claim that every old client has identical endpoint access. A scalable commercial integration needs its own qualifying access; no such access is established here.

### YouTube

The [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference) supplies playback, seek, current time and duration around a visible embedded player. [Developer Policies](https://developers.google.com/youtube/terms/developer-policies) disallow unauthorized downloading/offline storage, separating audio/video, and background-player experiences. An audio-only hidden player or URL downloader is not an allowed fallback. Preserve ads and player behavior; handle embedding-disabled or unavailable videos explicitly. These APIs provide no approved raw-audio route for this application.

### Apple Music

[MusicKit](https://developer.apple.com/musickit/) supplies catalog and user music features and controlled playback on documented platforms. MusicKit JS authentication/player compatibility must be tested in the target shell; no configured integration is asserted here.

The [Apple Developer Program agreement](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/) restricts downloading, uploading, modifying and synchronization of MusicKit content and requires playback through permitted APIs. It also constrains monetization of access and use of music-related metadata. Inference from these restrictions: a synchronized third-party chord-analysis overlay cannot be presumed permitted solely because playback works. Do not ship that remote-source experience without documented authorization for its precise use. Raw analysis and app-managed offline copying remain false.

### SoundCloud

The [API guide](https://developers.soundcloud.com/docs/api/guide) documents authentication, search and authorized streaming. API availability varies with uploader permissions and app access. [API terms](https://developers.soundcloud.com/docs/api/terms-of-use) prohibit API-content AI input/development and fingerprint creation, prohibit ripping, and restrict caching to the session rather than offline persistence. They also constrain commercial uses. An uploader's “downloadable” setting does not override these API restrictions. Raw analysis is false. Independently obtaining a creator-licensed original outside the API is a separate local-file rights workflow, not a SoundCloud-stream analyzer.

## Adapter contract and tests

The current `packages/application/contracts.ts` exposes only playback controls and seven capability booleans: `play`, `pause`, `seek`, `position`, `duration`, `rawAnalysisAvailable` and `offlineAvailable`. `LocalFileProvider` is the connected product provider. An injected official `YouTubeProvider` now implements playback controls, availability/status and typed remote errors in isolation. Authentication, catalog search, metadata/artwork adapters and remote connection UI are **not implemented**. The matrix above must not be read as those features being shipped or merely awaiting a token.

For future remote adapters, extend the inward-facing application contract with `authenticate`, `search`, `metadata` and `artwork` capabilities. Supplement booleans with availability/reason codes where account and region change behavior. Methods for unsupported actions must return typed errors; no dummy success. Local capabilities describe supported operations; `available` separately reports whether a local audio source is loaded. A saved analysis alone cannot enable playback.

Application code selects behavior from capabilities, while authentication and provider-specific URLs remain inside adapters. Tokens belong in OS-backed secure storage, with minimum scopes, expiry/revocation handling and no secrets in the frontend bundle. Never invoke analysis merely because a player can produce sound.

Required tests: disconnected state, token expiry, revoked scopes, rate limits, unavailable content, seek/position synchronization, unsupported analysis rejection, offline failure, cancellation and provider switch races. Tests must confirm no raw-media download occurs when analysis is unavailable. Remote API tests require authorized credentials and should be clearly distinguished from mocks. The initial research did not authenticate or register an application. A subsequent isolated public YouTube adapter probe passed playback controls without credentials; it does not validate authenticated providers or native-shell integration.

### Current local-provider verification

`packages/providers/local.test.ts` exercises local media decode failures, loop restart rejection, stale errors after source replacement, and error subscription disposal. It also checks preservation of volume/speed when replacing the media element, unavailable-source duration, finite control values, valid loop bounds, and isolation from caller mutations of a loop range. These tests use a media-element test double; browser/native playback remains covered by the separate E2E and hidden smoke campaigns. The listening UI deliberately resets speed for a newly selected track; the adapter retains the last setting until its caller changes it.

### Remote implementation and external prerequisites

Rechecked against official sources on 2026-09-20. No provider account registration, credentials or paid subscription purchase was performed. Subsequent public YouTube playback evidence is recorded below. Credential absence is distinct from the remaining adapter/UI implementation work.

| Provider    | External prerequisite for live API validation                                                                                                                                              | Remaining implementation/verification                                                                                                                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spotify     | Authorized developer app Client ID and registered redirect URI; eligible Premium developer/account and authorized test users. No qualifying commercial access is established.              | Public-client PKCE authorization, secure token lifecycle, eligible catalog/device control endpoints, scope/expiry/rate-limit/content errors; separately verify SDK DRM support in the desktop shell.                                                                                              |
| YouTube     | Catalog search requires a Google Cloud project with YouTube Data API enabled and API credentials. User/private data additionally requires OAuth.                                           | Visible IFrame player, native-shell client identification, CSP and playback validation; Data API search/metadata, unavailable/embed-disabled/autoplay-blocked states. A public video embed itself does **not** require a Data API key, so its missing implementation is not a credential blocker. |
| Apple Music | Account Holder/Admin must create a media identifier and Media Services private key for developer-token signing; subscriber/user authorization for corresponding playback/library features. | Keep the signing key outside the frontend, implement token/user authorization and MusicKit adapter, validate desktop-shell playback and obtain documented permission for any synchronized content experience.                                                                                     |
| SoundCloud  | Registered app client credentials; the current guide requires Artist Pro for registration. No registration or eligible account is established here.                                        | The guide marks authorization-code and client-credentials flows as server-side; establish a supported secret-handling architecture before a distributed desktop client. Implement required PKCE/user consent where applicable, rotating refresh-token handling and content/access errors.         |

Spotify documents [Authorization Code with PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow); app access limits remain governed by the linked February/March update. Google documents [project/API credential setup](https://developers.google.com/youtube/v3/getting-started). Apple's [media identifier and signing-key setup](https://developer.apple.com/help/account/capabilities/create-a-media-identifier-and-private-key/) requires an Account Holder or Admin. SoundCloud's [current API guide](https://developers.soundcloud.com/docs/api/guide) lists registration, PKCE and server-side flow prerequisites, approximately one-hour access tokens and single-use refresh tokens.

The [YouTube IFrame reference](https://developers.google.com/youtube/iframe_api_reference) also defines error `153` for missing HTTP Referer or equivalent API client identification, besides removed/private content (`100`), disabled embedding (`101`/`150`) and HTML5 playback failures (`5`). Its `onAutoplayBlocked` event requires a visible user-recoverable state. A desktop integration must validate these behaviors rather than treating every failure as an expired token. No workaround may hide the player, extract media or bypass identification requirements.

### Isolated YouTube implementation evidence

`packages/providers/youtube.ts` accepts an injected official IFrame SDK factory,
validates supported video IDs/URLs, confirms readiness and actual PLAYING state,
and bounds pending operations. Replacement/disposal reject pending work and ignore
stale callbacks. Fifty tests cover URL spoofing, SDK errors, autoplay blocking,
timeouts, replacement and disposal. Raw-analysis/offline capabilities remain false.

`node scripts/youtube-provider-probe.mjs` passed against the official documentation
sample in isolated headless Chrome: visible 480?270 iframe, trusted user gesture,
advancing playback clock, pause, seek and complete iframe/browser/server disposal.
Source hashes, browser version and retained aborted-request diagnostics are in
`review-evidence/youtube-adapter-probe.json`. This muted control check does not prove
audible playback, native client identification, app UI or remote catalog support.
The remote SDK was never loaded into Harmonia's privileged app context. A secure
SDK isolation/connection design and native validation remain required.

The subsequent hidden native probe also passed in WebView2, using the exact
adapter and official SDK. It verified control/clock behavior and explicit ACL
denial of remote `list_saved_tracks`, `save_track` and `delete_track` calls; the
isolated database sentinel remained unchanged. Evidence is in
`review-evidence/youtube-native-probe.json`; reproduce with
`node scripts/youtube-native-probe.mjs`. The temporary native processes, profile,
debugging endpoint and HTTP server were verified cleaned. No product capability,
CSP, UI or Rust command was changed by this diagnostic.

Observed requests carried the browser's automatic loopback Referer. The official
[client identification requirements](https://developers.google.com/youtube/terms/required-minimum-functionality)
distinguish automatic Referer from explicit WebView headers and prescribe an
installed application identity when setting it explicitly. The probe did not
override headers or establish the final installed-app identity contract. A passing
diagnostic alone does not close the product/provider release gate.

The isolated endpoint and application-side proxy now share a strict playback-only
message protocol, verified by46 additional unit tests. It binds exact origins and
window sources, bounds JSON messages to2KiB, limits pending requests/rates, rejects
stale generations, and disposes abandoned playback after a five-second lease.
The endpoint uses the actual adapter; no raw audio or arbitrary native operation
crosses this contract. A real cross-origin browser harness is the next integration
check. Production CSP currently blocks such an iframe, so that harness must record
the negative gate separately from any explicit test-only embedding allowance.
