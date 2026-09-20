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

Use a capability object with `authenticate`, `search`, `metadata`, `play`, `pause`, `seek`, `position`, `duration`, `artwork`, `rawAnalysisAvailable` and `offlineAvailable`. Supplement booleans with availability/reason codes where account and region change behavior. Methods for unsupported actions return typed errors; no dummy success.

Application code selects behavior from capabilities, while authentication and provider-specific URLs remain inside adapters. Tokens belong in OS-backed secure storage, with minimum scopes, expiry/revocation handling and no secrets in the frontend bundle. Never invoke analysis merely because a player can produce sound.

Required tests: disconnected state, token expiry, revoked scopes, rate limits, unavailable content, seek/position synchronization, unsupported analysis rejection, offline failure, cancellation and provider switch races. Tests must confirm no raw-media download occurs when analysis is unavailable. Remote API tests require authorized credentials and should be clearly distinguished from mocks. This research task has not authenticated to any provider, created an app registration or executed live playback tests.
