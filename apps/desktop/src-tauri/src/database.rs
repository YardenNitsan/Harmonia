use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{fs, path::Path, time::Duration};
use thiserror::Error;

pub const SCHEMA_VERSION: i64 = 2;
pub const MAX_SAVED_TRACK_BYTES: usize = 32 * 1024 * 1024;

const MAX_ID_BYTES: usize = 256;
const MAX_FINGERPRINT_BYTES: usize = 512;
const MAX_NAME_BYTES: usize = 4 * 1024;
const MAX_VERSION_BYTES: usize = 256;
const MAX_SEGMENTS: usize = 200_000;
const MAX_BEATS: usize = 1_000_000;
const MAX_WAVEFORM_POINTS: usize = 2_000_000;
const MAX_BOUNDARIES: usize = 200_000;
const MAX_CORRECTIONS: usize = 200_000;
const MAX_WARNINGS: usize = 1_024;

#[derive(Debug, Error)]
pub enum DatabaseError {
    #[error("database operation failed: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("could not prepare the database directory: {0}")]
    Io(#[from] std::io::Error),
    #[error("saved track payload is {actual} bytes; the limit is {limit} bytes")]
    PayloadTooLarge { actual: usize, limit: usize },
    #[error("invalid saved track: {0}")]
    InvalidRecord(String),
    #[error("stored track {0} is corrupt")]
    CorruptRecord(String),
    #[error("database schema version {found} is newer than supported version {supported}")]
    UnsupportedSchema { found: i64, supported: i64 },
}

pub struct Database {
    connection: Connection,
}

#[derive(Debug, Serialize)]
pub struct LibraryIssue {
    pub id: String,
    pub message: String,
}

#[derive(Debug, Default, Serialize)]
pub struct LibraryReadResult {
    pub records: Vec<Value>,
    pub issues: Vec<LibraryIssue>,
}

impl Database {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, DatabaseError> {
        let path = path.as_ref();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let connection = Connection::open(path)?;
        Self::initialize(connection, true)
    }

    pub fn open_in_memory() -> Result<Self, DatabaseError> {
        Self::initialize(Connection::open_in_memory()?, false)
    }

    fn initialize(mut connection: Connection, use_wal: bool) -> Result<Self, DatabaseError> {
        connection.busy_timeout(Duration::from_secs(5))?;
        connection.pragma_update(None, "foreign_keys", true)?;
        if use_wal {
            connection.pragma_update(None, "journal_mode", "WAL")?;
            connection.pragma_update(None, "synchronous", "NORMAL")?;
        }
        migrate(&mut connection)?;
        Ok(Self { connection })
    }

    pub fn save(&self, record: &Value) -> Result<(), DatabaseError> {
        let serialized = serde_json::to_vec(record)
            .map_err(|error| DatabaseError::InvalidRecord(error.to_string()))?;
        if serialized.len() > MAX_SAVED_TRACK_BYTES {
            return Err(DatabaseError::PayloadTooLarge {
                actual: serialized.len(),
                limit: MAX_SAVED_TRACK_BYTES,
            });
        }

        let metadata = validate_record(record)?;
        let body = String::from_utf8(serialized)
            .map_err(|error| DatabaseError::InvalidRecord(error.to_string()))?;
        let transaction = self.connection.unchecked_transaction()?;
        transaction.execute(
            "INSERT INTO saved_tracks (
                record_id, fingerprint, favorite, imported_at, model_version,
                pipeline_version, analysis_profile, record_json, updated_at, analysis_id
             ) VALUES (lower(hex(randomblob(16))), ?2, ?3, ?4, ?5, ?6, ?7, ?8, CURRENT_TIMESTAMP, ?1)
             ON CONFLICT(analysis_id) DO UPDATE SET
                fingerprint = excluded.fingerprint,
                favorite = excluded.favorite,
                imported_at = excluded.imported_at,
                model_version = excluded.model_version,
                pipeline_version = excluded.pipeline_version,
                analysis_profile = excluded.analysis_profile,
                record_json = excluded.record_json,
                updated_at = CURRENT_TIMESTAMP",
            params![
                metadata.analysis_id,
                metadata.fingerprint,
                metadata.favorite,
                metadata.imported_at,
                metadata.model_version,
                metadata.pipeline_version,
                metadata.analysis_profile,
                body,
            ],
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub fn list(&self) -> Result<LibraryReadResult, DatabaseError> {
        let mut statement = self.connection.prepare(
            "SELECT record_id, record_json, analysis_id
             FROM saved_tracks
             ORDER BY favorite DESC, imported_at DESC, record_id ASC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })?;

        let mut result = LibraryReadResult::default();
        for row in rows {
            let (record_id, body, analysis_id) = row?;
            let recovered = parse_stored_record(&body).and_then(|(value, metadata)| {
                if analysis_id.as_deref() != Some(metadata.analysis_id.as_str()) {
                    return Err(DatabaseError::InvalidRecord(
                        "stored analysis identity is missing, duplicated, or mismatched".into(),
                    ));
                }
                Ok(value)
            });
            match recovered {
                Ok(value) => result.records.push(value),
                Err(error) => result.issues.push(LibraryIssue {
                    id: analysis_id.unwrap_or(record_id),
                    message: error.to_string(),
                }),
            }
        }
        Ok(result)
    }

    pub fn delete(&self, analysis_id: &str) -> Result<(), DatabaseError> {
        validate_text("analysis.id", analysis_id, MAX_ID_BYTES)?;
        self.connection.execute(
            "DELETE FROM saved_tracks WHERE analysis_id = ?1",
            params![analysis_id],
        )?;
        Ok(())
    }

    pub fn user_version(&self) -> Result<i64, DatabaseError> {
        Ok(self
            .connection
            .pragma_query_value(None, "user_version", |row| row.get(0))?)
    }

    pub fn has_index(&self, name: &str) -> Result<bool, DatabaseError> {
        Ok(self
            .connection
            .query_row(
                "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?1",
                params![name],
                |_| Ok(()),
            )
            .optional()?
            .is_some())
    }

    #[doc(hidden)]
    pub fn insert_raw_for_test(
        &self,
        track_id: &str,
        fingerprint: &str,
        record_json: &str,
    ) -> Result<(), DatabaseError> {
        self.connection.execute(
            "INSERT INTO saved_tracks (
                record_id, fingerprint, favorite, imported_at, model_version,
                pipeline_version, analysis_profile, record_json
             ) VALUES (?1, ?2, 0, '', '', '', 'balanced', ?3)",
            params![track_id, fingerprint, record_json],
        )?;
        Ok(())
    }
}

fn migrate(connection: &mut Connection) -> Result<(), DatabaseError> {
    let version: i64 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version > SCHEMA_VERSION {
        return Err(DatabaseError::UnsupportedSchema {
            found: version,
            supported: SCHEMA_VERSION,
        });
    }
    if version < 1 {
        let transaction = connection.transaction()?;
        transaction.execute_batch(include_str!("../migrations/0001_saved_tracks.sql"))?;
        transaction.pragma_update(None, "user_version", 1)?;
        transaction.commit()?;
    }
    if version < 2 {
        let transaction = connection.transaction()?;
        transaction.execute_batch(include_str!("../migrations/0002_analysis_identity.sql"))?;
        {
            let mut statement = transaction
                .prepare("SELECT record_id, record_json FROM saved_tracks ORDER BY record_id")?;
            let rows = statement.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?;
            for row in rows {
                let (record_id, body) = row?;
                if let Ok((_, metadata)) = parse_stored_record(&body) {
                    if metadata.track_id == record_id {
                        // Duplicate analysis IDs remain intact with NULL identity and are
                        // reported by list(), rather than replacing an existing record.
                        transaction.execute(
                            "UPDATE OR IGNORE saved_tracks SET analysis_id = ?1 WHERE record_id = ?2",
                            params![metadata.analysis_id, record_id],
                        )?;
                    }
                }
            }
        }
        transaction.pragma_update(None, "user_version", 2)?;
        transaction.commit()?;
    }
    Ok(())
}

fn parse_stored_record(body: &str) -> Result<(Value, SavedTrackMetadata), DatabaseError> {
    if body.len() > MAX_SAVED_TRACK_BYTES {
        return Err(DatabaseError::PayloadTooLarge {
            actual: body.len(),
            limit: MAX_SAVED_TRACK_BYTES,
        });
    }
    let value: Value = serde_json::from_str(body)
        .map_err(|error| DatabaseError::InvalidRecord(format!("invalid JSON: {error}")))?;
    let metadata = validate_record(&value)?;
    Ok((value, metadata))
}

struct SavedTrackMetadata {
    track_id: String,
    analysis_id: String,
    fingerprint: String,
    favorite: bool,
    imported_at: String,
    model_version: String,
    pipeline_version: String,
    analysis_profile: String,
}

fn validate_record(record: &Value) -> Result<SavedTrackMetadata, DatabaseError> {
    if let Some(source) = record.get("source") {
        validate_source(source)?;
    }
    let envelope: SavedTrackEnvelope = serde_json::from_value(record.clone())
        .map_err(|error| DatabaseError::InvalidRecord(error.to_string()))?;

    validate_text("track.id", &envelope.track.id, MAX_ID_BYTES)?;
    validate_text("track.name", &envelope.track.name, MAX_NAME_BYTES)?;
    validate_text(
        "track.fingerprint",
        &envelope.track.fingerprint,
        MAX_FINGERPRINT_BYTES,
    )?;
    validate_text("track.importedAt", &envelope.track.imported_at, 128)?;
    validate_duration("track.duration", envelope.track.duration)?;
    validate_text("analysis.id", &envelope.analysis.id, MAX_ID_BYTES)?;
    validate_text(
        "analysis.fingerprint",
        &envelope.analysis.fingerprint,
        MAX_FINGERPRINT_BYTES,
    )?;
    validate_text(
        "analysis.modelVersion",
        &envelope.analysis.model_version,
        MAX_VERSION_BYTES,
    )?;
    validate_text(
        "analysis.pipelineVersion",
        &envelope.analysis.pipeline_version,
        MAX_VERSION_BYTES,
    )?;
    validate_text("analysis.createdAt", &envelope.analysis.created_at, 128)?;
    validate_duration("analysis.duration", envelope.analysis.duration)?;

    if envelope.track.fingerprint != envelope.analysis.fingerprint {
        return Err(DatabaseError::InvalidRecord(
            "track and analysis fingerprints must match".into(),
        ));
    }
    if (envelope.track.duration - envelope.analysis.duration).abs() > 0.05 {
        return Err(DatabaseError::InvalidRecord(
            "track and analysis durations must match".into(),
        ));
    }
    if !matches!(
        envelope.analysis.profile.as_str(),
        "fast" | "balanced" | "accurate"
    ) {
        return Err(DatabaseError::InvalidRecord(
            "analysis.profile is unsupported".into(),
        ));
    }
    if !matches!(
        envelope.analysis.calibration.as_str(),
        "uncalibrated" | "temperature"
    ) {
        return Err(DatabaseError::InvalidRecord(
            "analysis.calibration is unsupported".into(),
        ));
    }

    validate_collection(
        "analysis.segments",
        envelope.analysis.segments.len(),
        MAX_SEGMENTS,
    )?;
    validate_collection("analysis.beats", envelope.analysis.beats.len(), MAX_BEATS)?;
    validate_collection(
        "analysis.waveform",
        envelope.analysis.waveform.len(),
        MAX_WAVEFORM_POINTS,
    )?;
    validate_collection(
        "analysis.boundaries",
        envelope.analysis.boundaries.len(),
        MAX_BOUNDARIES,
    )?;
    validate_collection("corrections", envelope.corrections.len(), MAX_CORRECTIONS)?;
    validate_collection(
        "analysis.warnings",
        envelope.analysis.warnings.len(),
        MAX_WARNINGS,
    )?;

    validate_timeline(&envelope.analysis)?;
    for beat in &envelope.analysis.beats {
        validate_time("analysis.beats", *beat, envelope.analysis.duration)?;
    }
    for sample in &envelope.analysis.waveform {
        if !sample.is_finite() || !(-1.0..=1.0).contains(sample) {
            return Err(DatabaseError::InvalidRecord(
                "analysis.waveform contains an invalid sample".into(),
            ));
        }
    }
    for boundary in &envelope.analysis.boundaries {
        validate_time(
            "analysis.boundaries.time",
            boundary.time,
            envelope.analysis.duration,
        )?;
        if !boundary.probability.is_finite() || !(0.0..=1.0).contains(&boundary.probability) {
            return Err(DatabaseError::InvalidRecord(
                "analysis boundary probability must be between 0 and 1".into(),
            ));
        }
    }
    if envelope
        .analysis
        .tempo
        .is_some_and(|tempo| !tempo.is_finite() || tempo <= 0.0)
    {
        return Err(DatabaseError::InvalidRecord(
            "analysis.tempo must be positive".into(),
        ));
    }
    if envelope.analysis.meter.is_some_and(|meter| meter == 0) {
        return Err(DatabaseError::InvalidRecord(
            "analysis.meter must be positive".into(),
        ));
    }
    if let Some(key) = &envelope.analysis.key {
        validate_pitch_class("analysis.key.root", key.root)?;
        if !matches!(key.mode.as_str(), "major" | "minor") || !key.score.is_finite() {
            return Err(DatabaseError::InvalidRecord(
                "analysis.key is invalid".into(),
            ));
        }
    }
    for warning in &envelope.analysis.warnings {
        if warning.len() > 4_096 {
            return Err(DatabaseError::InvalidRecord(
                "analysis warning is too long".into(),
            ));
        }
    }
    for correction in &envelope.corrections {
        validate_text("correction.id", &correction.id, MAX_ID_BYTES)?;
        if correction.analysis_id != envelope.analysis.id {
            return Err(DatabaseError::InvalidRecord(
                "correction analysisId does not match analysis.id".into(),
            ));
        }
        validate_text("correction.segmentId", &correction.segment_id, MAX_ID_BYTES)?;
        validate_text("correction.createdAt", &correction.created_at, 128)?;
        validate_segment(&correction.before, envelope.analysis.duration)?;
        validate_segment(&correction.after, envelope.analysis.duration)?;
    }

    Ok(SavedTrackMetadata {
        track_id: envelope.track.id,
        analysis_id: envelope.analysis.id,
        fingerprint: envelope.track.fingerprint,
        favorite: envelope.track.favorite,
        imported_at: envelope.track.imported_at,
        model_version: envelope.analysis.model_version,
        pipeline_version: envelope.analysis.pipeline_version,
        analysis_profile: envelope.analysis.profile,
    })
}

fn validate_source(source: &Value) -> Result<(), DatabaseError> {
    let invalid = || DatabaseError::InvalidRecord("invalid prepared source provenance".into());
    let object = source.as_object().ok_or_else(invalid)?;
    if object.keys().any(|key| {
        ![
            "provider",
            "id",
            "title",
            "artist",
            "thumbnail",
            "pageUrl",
            "audio",
        ]
        .contains(&key.as_str())
    }) {
        return Err(invalid());
    }
    let provider = source_text(source, "provider", 16)?;
    let id = source_text(source, "id", 256)?;
    source_text(source, "title", 1000)?;
    source_text(source, "artist", 1000)?;
    let page = source_text(source, "pageUrl", 2048)?;
    match provider {
        "commons" => {
            if id.len() > 20
                || id.starts_with('0')
                || !id.bytes().all(|b| b.is_ascii_digit())
                || !source_url(page, &["commons.wikimedia.org"])?
                    .path()
                    .starts_with("/wiki/File:")
            {
                return Err(invalid());
            }
        }
        "youtube" => {
            if id.len() != 11
                || !id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
                || page != format!("https://www.youtube.com/watch?v={id}")
            {
                return Err(invalid());
            }
        }
        _ => return Err(invalid()),
    }
    match source.get("thumbnail") {
        Some(Value::Null) => (),
        Some(Value::String(value)) => {
            source_url(value, &["upload.wikimedia.org", "i.ytimg.com"])?;
        }
        _ => return Err(invalid()),
    }
    let audio = source.get("audio").ok_or_else(invalid)?;
    let audio_object = audio.as_object().ok_or_else(invalid)?;
    if audio_object
        .keys()
        .any(|key| !["url", "license", "licenseUrl", "attribution", "size"].contains(&key.as_str()))
    {
        return Err(invalid());
    }
    let url = source_url(source_text(audio, "url", 2048)?, &["upload.wikimedia.org"])?;
    let parts: Vec<_> = url.path().split('/').collect();
    let valid_audio = parts.len() == 6
        && parts[1] == "wikipedia"
        && parts[2] == "commons"
        && parts[3].len() == 1
        && parts[4].len() == 2
        && parts[3]
            .bytes()
            .chain(parts[4].bytes())
            .all(|b| b.is_ascii_hexdigit())
        && [".wav", ".mp3", ".flac", ".ogg", ".oga"]
            .iter()
            .any(|ext| parts[5].len() > ext.len() && parts[5].to_ascii_lowercase().ends_with(ext));
    if !valid_audio
        || !audio
            .get("size")
            .and_then(Value::as_u64)
            .is_some_and(|n| n > 0 && n <= 100 * 1024 * 1024)
    {
        return Err(invalid());
    }
    source_text(audio, "license", 100)?;
    source_text(audio, "attribution", 8000)?;
    let license = source_url(
        source_text(audio, "licenseUrl", 2048)?,
        &["creativecommons.org"],
    )?;
    let parts: Vec<_> = license.path().split('/').collect();
    if parts.len() != 5
        || !parts[4].is_empty()
        || !(parts[1] == "publicdomain" && parts[2] == "zero" && parts[3] == "1.0"
            || parts[1] == "licenses"
                && ["by", "by-sa"].contains(&parts[2])
                && ["1.0", "2.0", "2.5", "3.0", "4.0"].contains(&parts[3]))
    {
        return Err(invalid());
    }
    Ok(())
}

fn source_text<'a>(value: &'a Value, key: &str, max: usize) -> Result<&'a str, DatabaseError> {
    let text = value
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| DatabaseError::InvalidRecord(format!("source.{key} must be text")))?;
    if text.trim().is_empty()
        || text.encode_utf16().count() > max
        || text.chars().any(|c| c <= '\u{1f}' || c == '\u{7f}')
    {
        return Err(DatabaseError::InvalidRecord(format!(
            "source.{key} is invalid or too long"
        )));
    }
    Ok(text)
}

fn source_url(value: &str, hosts: &[&str]) -> Result<tauri::Url, DatabaseError> {
    let invalid = || DatabaseError::InvalidRecord("unsupported prepared source URL".into());
    if value.encode_utf16().count() > 2048 {
        return Err(invalid());
    }
    let url = tauri::Url::parse(value).map_err(|_| invalid())?;
    if url.scheme() != "https"
        || !url.host_str().is_some_and(|host| hosts.contains(&host))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.fragment().is_some()
        || url.query().is_some()
    {
        return Err(invalid());
    }
    Ok(url)
}

fn validate_timeline(analysis: &AnalysisRecord) -> Result<(), DatabaseError> {
    let mut previous_end = 0.0;
    for (index, segment) in analysis.segments.iter().enumerate() {
        validate_segment(segment, analysis.duration)?;
        if index > 0 && segment.start < previous_end {
            return Err(DatabaseError::InvalidRecord(
                "analysis segments overlap or are out of order".into(),
            ));
        }
        previous_end = segment.end;
    }
    Ok(())
}

fn validate_segment(segment: &ChordSegment, duration: f64) -> Result<(), DatabaseError> {
    validate_text("segment.id", &segment.id, MAX_ID_BYTES)?;
    if !segment.start.is_finite()
        || !segment.end.is_finite()
        || segment.start < 0.0
        || segment.end <= segment.start
        || segment.end > duration + 0.05
        || !segment.score.is_finite()
    {
        return Err(DatabaseError::InvalidRecord(
            "analysis segment timing or score is invalid".into(),
        ));
    }
    validate_chord(&segment.chord)?;
    if segment.alternatives.len() > 64 {
        return Err(DatabaseError::InvalidRecord(
            "analysis segment has too many alternatives".into(),
        ));
    }
    for alternative in &segment.alternatives {
        validate_chord(&alternative.chord)?;
        if !alternative.score.is_finite() {
            return Err(DatabaseError::InvalidRecord(
                "chord alternative score is invalid".into(),
            ));
        }
    }
    Ok(())
}

fn validate_chord(chord: &Chord) -> Result<(), DatabaseError> {
    let Chord::Pitched {
        root,
        triad,
        fifth,
        seventh,
        extensions,
        alterations,
        added_tones,
        omitted_tones,
        bass,
        spelling,
    } = chord
    else {
        return Ok(());
    };
    validate_pitch_class("chord.root", *root)?;
    if bass.is_some_and(|pitch| pitch > 11)
        || !matches!(
            triad.as_str(),
            "major" | "minor" | "diminished" | "augmented" | "sus2" | "sus4" | "power"
        )
        || !(-1..=1).contains(fifth)
        || seventh
            .as_ref()
            .is_some_and(|value| !matches!(value.as_str(), "minor" | "major" | "diminished"))
        || !matches!(spelling.as_str(), "sharp" | "flat")
        || extensions.len() > 16
        || alterations.len() > 16
        || added_tones.len() > 16
        || omitted_tones.len() > 16
        || alterations
            .iter()
            .any(|alteration| alteration.degree == 0 || !(-2..=2).contains(&alteration.accidental))
    {
        return Err(DatabaseError::InvalidRecord("chord is invalid".into()));
    }
    Ok(())
}

fn validate_text(field: &str, value: &str, max_bytes: usize) -> Result<(), DatabaseError> {
    if value.trim().is_empty() || value.len() > max_bytes || value.chars().any(char::is_control) {
        return Err(DatabaseError::InvalidRecord(format!("{field} is invalid")));
    }
    Ok(())
}

fn validate_duration(field: &str, value: f64) -> Result<(), DatabaseError> {
    if !value.is_finite() || value <= 0.0 || value > 7.0 * 24.0 * 60.0 * 60.0 {
        return Err(DatabaseError::InvalidRecord(format!("{field} is invalid")));
    }
    Ok(())
}

fn validate_time(field: &str, value: f64, duration: f64) -> Result<(), DatabaseError> {
    if !value.is_finite() || value < 0.0 || value > duration + 0.05 {
        return Err(DatabaseError::InvalidRecord(format!("{field} is invalid")));
    }
    Ok(())
}

fn validate_pitch_class(field: &str, value: u8) -> Result<(), DatabaseError> {
    if value > 11 {
        return Err(DatabaseError::InvalidRecord(format!("{field} is invalid")));
    }
    Ok(())
}

fn validate_collection(field: &str, actual: usize, limit: usize) -> Result<(), DatabaseError> {
    if actual > limit {
        return Err(DatabaseError::InvalidRecord(format!(
            "{field} contains {actual} entries; the limit is {limit}"
        )));
    }
    Ok(())
}

#[derive(Deserialize)]
struct SavedTrackEnvelope {
    track: TrackRecord,
    analysis: AnalysisRecord,
    corrections: Vec<CorrectionRecord>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrackRecord {
    id: String,
    name: String,
    fingerprint: String,
    duration: f64,
    imported_at: String,
    favorite: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnalysisRecord {
    id: String,
    fingerprint: String,
    profile: String,
    model_version: String,
    pipeline_version: String,
    duration: f64,
    segments: Vec<ChordSegment>,
    beats: Vec<f64>,
    tempo: Option<f64>,
    meter: Option<u32>,
    key: Option<KeyEstimate>,
    waveform: Vec<f64>,
    boundaries: Vec<Boundary>,
    created_at: String,
    calibration: String,
    warnings: Vec<String>,
}

#[derive(Deserialize)]
struct KeyEstimate {
    root: u8,
    mode: String,
    score: f64,
}

#[derive(Deserialize)]
struct Boundary {
    time: f64,
    probability: f64,
}

#[derive(Deserialize)]
struct ChordSegment {
    id: String,
    start: f64,
    end: f64,
    chord: Chord,
    score: f64,
    alternatives: Vec<ChordAlternative>,
}

#[derive(Deserialize)]
struct ChordAlternative {
    chord: Chord,
    score: f64,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum Chord {
    #[serde(rename = "chord")]
    Pitched {
        root: u8,
        triad: String,
        fifth: i8,
        seventh: Option<String>,
        extensions: Vec<u8>,
        alterations: Vec<Alteration>,
        #[serde(rename = "addedTones")]
        added_tones: Vec<u8>,
        #[serde(rename = "omittedTones")]
        omitted_tones: Vec<u8>,
        bass: Option<u8>,
        spelling: String,
    },
    None,
    Unknown,
}

#[derive(Deserialize)]
struct Alteration {
    degree: u8,
    accidental: i8,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CorrectionRecord {
    id: String,
    analysis_id: String,
    segment_id: String,
    before: ChordSegment,
    after: ChordSegment,
    created_at: String,
}
