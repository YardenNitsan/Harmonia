# Local database

Harmonia's desktop build stores its local library in `harmonia.db` inside the
platform-specific Tauri application-data directory for `local.harmonia.desktop`.
The browser preview uses its own repository adapter; it does not open this file.

## Ownership and schema

Rust owns SQLite access. SQL is confined to `apps/desktop/src-tauri/src/database.rs`
and versioned files under `apps/desktop/src-tauri/migrations/`. The current schema
version is `2`, recorded in SQLite's `PRAGMA user_version`.

`saved_tracks` has one row per `Analysis.id`, allowing separate profiles and model
versions for the same logical `Track.id` and audio fingerprint. The complete canonical `SavedTrack`
envelope is compact JSON in `record_json`, so `Track`, `Analysis`, and correction
history are replaced atomically in one transaction. Query metadata is duplicated in
typed columns:

| Column                                                  | Purpose                                             |
| ------------------------------------------------------- | --------------------------------------------------- |
| `record_id`                                             | Internal primary key; independent of track identity |
| `analysis_id`                                           | Unique analysis identity and upsert/delete target   |
| `fingerprint`                                           | Audio identity/cache lookup index                   |
| `favorite`, `imported_at`                               | Favorite-first, most-recent library ordering index  |
| `model_version`, `pipeline_version`, `analysis_profile` | Analysis provenance and future invalidation queries |
| `record_json`                                           | Canonical structured `SavedTrack` serialization     |
| `updated_at`                                            | Local row replacement time                          |

Waveform samples are currently part of the analysis envelope because the shared
domain type includes them. The native boundary caps the complete serialized record
at 32 MiB and caps each variable-size collection. Larger future feature tensors,
spectrograms, stems, and model files belong in a versioned filesystem cache, not in
SQLite.

## Validation and failure behavior

Every write and read validates the envelope before it crosses the repository
boundary. Validation includes:

- required structured track, analysis, segment, chord, boundary, and correction data;
- non-empty bounded identifiers and metadata;
- matching track and analysis fingerprints and nearly identical durations;
- supported profile and calibration labels;
- finite, bounded timing, waveform, probability, and chord values;
- ordered non-overlapping timeline segments; and
- correction `analysisId` ownership.

Malformed or oversized writes fail before the transaction begins. A failed upsert
therefore leaves the prior row unchanged. Malformed JSON or an invalid envelope
already stored in the database is reported in the library read's `issues` array;
healthy rows are still returned. Damaged rows remain untouched in SQLite for future
repair and never reach playback or synchronization code. Each issue includes the
analysis ID when available, otherwise the internal row ID, and an explanatory message.
Database-wide failures still reject the command. A database with a `user_version` newer than the
binary supports is refused instead of being downgraded.

SQLite uses the bundled `rusqlite` library, foreign keys, a five-second busy timeout,
WAL journaling, and `NORMAL` synchronization for file-backed databases. Each Tauri
command opens a short-lived connection inside `tauri::async_runtime::spawn_blocking`,
so database work does not execute on the webview/UI thread.

## Native command contract

The frontend calls the following snake-case commands with `@tauri-apps/api/core`:

```ts
await invoke<{
  records: SavedTrack[];
  issues: { id: string; message: string }[];
}>('list_saved_tracks');
await invoke<void>('save_track', { record });
await invoke<void>('delete_track', { id: analysis.id });
```

Saving the complete record is also how favorites and manual correction history are
updated. Deleting a library row does not delete or modify the user's source audio.
The frontend propagates favorite changes across the records sharing an audio fingerprint.

## Migration rules

Migrations execute in a transaction and advance `user_version` only after all SQL
succeeds. Add future migrations as immutable numbered files and apply them in order;
never edit a migration after a release that could have applied it. Back up a user's
database before any future destructive migration or repair workflow.

Migration 2 renames the old `track_id` column to the internal `record_id`, adds a
nullable unique `analysis_id`, and backfills it only for validated envelopes whose
legacy track identity matches the row. Corrupt or duplicate-analysis rows retain
their complete original JSON with a null analysis identity and appear as read issues.
No row is deleted or replaced by this migration. New records receive an independent
random internal row ID, so saving an analysis cannot overwrite a quarantined legacy row.

The browser adapter applies the same preservation policy during its IndexedDB
version 1 to 2 migration. It copies the first validated record for an analysis ID
(in legacy primary-key cursor order) into `analyses`. Later records with the same
analysis ID go into `quarantine`, retaining their complete source value and legacy
key and reporting a duplicate-identity issue on every library read. The original
`tracks` store remains untouched. Subsequent analysis upserts do not modify either
the legacy sources or quarantined copies.

## Verification

From `apps/desktop/src-tauri`:

```powershell
$env:CARGO_BUILD_JOBS = '2'
cargo test
```

The integration suite covers initial migration and indexes, atomic upsert, close and
reopen persistence, targeted deletion, bounded/corrupt input, and corrupt stored JSON.
It also checks mixed healthy/corrupt reads, analysis identity isolation, and migration
retention of corrupt, duplicate, and mismatched legacy records.

`npm.cmd test -- packages/persistence/repository.test.ts` verifies browser migration
and recovery behavior with IndexedDB, including distinct legacy rows sharing an
analysis ID, retained source data, persistent issues, and later healthy upserts.
