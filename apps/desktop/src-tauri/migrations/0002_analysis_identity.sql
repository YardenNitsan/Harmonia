ALTER TABLE saved_tracks RENAME COLUMN track_id TO record_id;
ALTER TABLE saved_tracks ADD COLUMN analysis_id TEXT;
CREATE UNIQUE INDEX idx_saved_tracks_analysis_id ON saved_tracks(analysis_id);
