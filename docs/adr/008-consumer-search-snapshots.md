# ADR008: Native search credentials and prepared playback snapshots

Status: accepted under the latest explicit consumer-player correction.

The normal interface exposes one typeahead search and a prepared player. Search
uses the official YouTube Data API through native requests, with bounded results,
timeouts, cancellation and redacted errors. API keys are runtime native secrets,
never Vite variables or UI fields. Local developer config is ignored; packaged
Windows uses per-user protected storage. This does not make a developer-owned key
an undiscoverable secret on a user's computer; service-scale distribution would
need a controlled backend and quota management.

YouTube IDs and analysis-input identity remain separate. A video with no permitted
exact audio source is unavailable for Harmonia chord playback, with normal access
to YouTube retained. Official APIs do not supply offline PCM. Licensed recordings
may appear alongside YouTube results, retaining their own identities and credits.
No provider dropdown, silent performance substitution or unauthorized extraction.

An analysis result becomes an immutable playback snapshot only after full-duration
analysis and validation. Autoplay follows that barrier. Playback, pause and seek
must not invoke the recognizer or mutate the timeline. Explicit correction and
re-analysis are separate user actions; background results never change playback.
Cache keys bind provider/stableID/exactsource/content/pipeline/model/profile;
provenance persists with the record, preserving credits and correction history.

Tradeoff: consumer flow is simpler, but arbitrary YouTube results can remain
unavailable. This limitation is reported honestly rather than hidden by false
analysis, mismatched recordings or a developer-oriented primary interface.
