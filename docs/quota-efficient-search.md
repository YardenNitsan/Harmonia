# Quota-efficient autocomplete

The search/player architecture and recognition pipeline are unchanged. This pass
reduces redundant YouTube requests without requiring Enter or exposing configuration.

## Request policy

- Wait 550 ms after meaningful input changes; require three Unicode letters/digits.
- Normalize NFKC, case and whitespace for request identity only; preserve typed text
  and the input caret. Case/spacing edits do not restart the request.
- Share one adapter across the application. Coalesce identical in-flight queries;
  cancel stale subscribers and cancel transport when no subscriber remains.
- Keep at least two seconds between uncached dispatches. Superseded queued work
  never reaches the API. Cancellation cannot refund a request already sent.
- Cache up to 100 normalized queries, including empty results, for 24 hours in
  memory and local storage. Validate stored public metadata and discard expired or
  corrupt data. Storage failures fall back to session memory.
- Reuse the longest cached prefix when at least three results match every new query
  term. Otherwise obtain fresh results so a weak broad match does not hide a song.
- Navigation and selection do not search again. Selection uses the exact existing
  video ID and metadata.
- Suppress repeated failures for 60 seconds; quota errors temporarily block new
  uncached queries while cached results remain usable. Explain quota exhaustion
  clearly instead of saying search is unavailable on this computer.

An identical query is not sent again while its cache is valid. Expiration, eviction
or a failed request after its retry cooldown can require another call. This is a
bounded single-application cache, not a promise of unlimited provider availability.

## Diagnostics and measured regression results

Application diagnostics count dispatches, cache/prefix hits, coalescing, cancellations
and rate limits. Native diagnostics separately count actual `search.list` and
`videos.list` HTTP dispatch attempts. Logs contain endpoint names and counts, never
keys or raw provider error bodies. Dispatch counts are not authoritative billing.

All measurements below use mocks and consume zero real YouTube quota:

| Scenario                                                            | Search calls |
| ------------------------------------------------------------------- | -----------: |
| Type Boulevard of Broken Dreams, reuse matching prefix results      |            1 |
| Navigate and select an existing result                              |      0 extra |
| Reload and reopen the cached query                                  |      0 extra |
| Type killer queen with 600 ms pauses and no reusable prefix results |            4 |

The browser regression attaches `youtube-api-call-counts.json` to its Playwright
report. The slow-typing unit regression logs its request counts. The Rust counter
test performs no network request. The existing live API test remains ignored.

Verification: 959 application tests and 46 production browser tests passed;
eight native search tests passed, with the quota-consuming live test ignored.
Type checking, lint, formatting, frontend build and optimized Windows build passed.
No recognition changes or new model experiments were made.

An additional legacy `native-smoke.mjs` check failed before exercising search: its
landing-page locator expects an `Open a song` button that is absent from the current
search-first landing page. See `review-evidence/quota-search-native-smoke.json`.
This does not constitute passing native end-to-end acceptance. Its owned hidden
processes and temporary data were cleaned up; no visible GUI or live API call was
used. The current production browser acceptance suite passed all 46 flows.

Built executable:
`apps/desktop/src-tauri/target/continuation-clean/release/harmonia.exe`.

Tests cover minimum length, normalization, cache persistence/expiry/capacity,
empty results, prefix quality, shared cancellation, dispatch pacing, cooldowns,
untrusted stored metadata, selection, reload, stale responses and caret retention.

The provider's project quota remains external. Reducing future calls does not
restore exhausted quota. See the official
[YouTube quota documentation](https://developers.google.com/youtube/v3/determine_quota_cost).
