CREATE TABLE saved_tracks (
    track_id TEXT PRIMARY KEY NOT NULL,
    fingerprint TEXT NOT NULL,
    favorite INTEGER NOT NULL CHECK (favorite IN (0, 1)),
    imported_at TEXT NOT NULL,
    model_version TEXT NOT NULL,
    pipeline_version TEXT NOT NULL,
    analysis_profile TEXT NOT NULL,
    record_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE INDEX idx_saved_tracks_fingerprint
    ON saved_tracks(fingerprint);

CREATE INDEX idx_saved_tracks_favorite_imported
    ON saved_tracks(favorite DESC, imported_at DESC);
