use harmonia_lib::database::{Database, DatabaseError, MAX_SAVED_TRACK_BYTES, SCHEMA_VERSION};
use serde_json::{json, Value};
use tempfile::tempdir;

fn saved_track(id: &str, fingerprint: &str, favorite: bool) -> Value {
    json!({
        "track": {
            "id": id,
            "name": "Test track",
            "fingerprint": fingerprint,
            "duration": 8.0,
            "importedAt": "2026-09-20T12:00:00.000Z",
            "favorite": favorite
        },
        "analysis": {
            "id": format!("analysis-{id}"),
            "fingerprint": fingerprint,
            "profile": "balanced",
            "modelVersion": "baseline-1",
            "pipelineVersion": "pipeline-1",
            "duration": 8.0,
            "segments": [{
                "id": "segment-1",
                "start": 0.0,
                "end": 8.0,
                "chord": { "kind": "none" },
                "score": 0.5,
                "alternatives": []
            }],
            "beats": [],
            "tempo": null,
            "meter": null,
            "key": null,
            "waveform": [0.0, 0.2],
            "boundaries": [],
            "createdAt": "2026-09-20T12:00:00.000Z",
            "calibration": "uncalibrated",
            "warnings": []
        },
        "corrections": []
    })
}

fn source_provenance() -> Value {
    json!({ "provider": "commons", "id": "123", "title": "Song", "artist": "Artist", "thumbnail": null,
        "pageUrl": "https://commons.wikimedia.org/wiki/File:Song.ogg",
        "audio": { "url": "https://upload.wikimedia.org/wikipedia/commons/a/ab/Song.ogg", "license": "CC0 1.0",
            "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/", "attribution": "Artist CC0", "size": 1024 }
    })
}

#[test]
fn optional_source_provenance_survives_reopen_without_schema_migration() {
    let directory = tempdir().unwrap();
    let path = directory.path().join("sources.db");
    let db = Database::open(&path).unwrap();
    let legacy = saved_track("legacy", "abc", false);
    let mut sourced = saved_track("source", "abc", false);
    sourced["source"] = source_provenance();
    db.save(&legacy).unwrap();
    db.save(&sourced).unwrap();
    drop(db);
    let reopened = Database::open(path).unwrap();
    assert_eq!(reopened.user_version().unwrap(), SCHEMA_VERSION);
    let records = reopened.list().unwrap().records;
    assert!(records.contains(&legacy));
    assert!(records.contains(&sourced));
}

#[test]
fn rejects_untrusted_source_metadata_before_persistence() {
    let db = Database::open_in_memory().unwrap();
    for (path, value) in [
        ("/thumbnail", json!("javascript:alert(1)")),
        (
            "/audio/url",
            json!("https://upload.wikimedia.org.evil.test/wikipedia/commons/a/ab/Song.ogg"),
        ),
        (
            "/audio/url",
            json!("https://user@upload.wikimedia.org/wikipedia/commons/a/ab/Song.ogg"),
        ),
        ("/audio/size", json!(104857601)),
        (
            "/audio/licenseUrl",
            json!("https://creativecommons.org/licenses/by-nc/4.0/"),
        ),
        ("/provider", json!("arbitrary")),
        ("/id", json!("")),
    ] {
        let mut record = saved_track("invalid", "abc", false);
        let mut source = source_provenance();
        *source.pointer_mut(path).unwrap() = value;
        record["source"] = source;
        assert!(db.save(&record).is_err(), "accepted invalid source {path}");
    }
    assert!(db.list().unwrap().records.is_empty());
}

#[test]
fn migrates_a_new_database_and_sets_user_version() {
    let directory = tempdir().unwrap();
    let db = Database::open(directory.path().join("harmonia.db")).unwrap();

    assert_eq!(db.user_version().unwrap(), SCHEMA_VERSION);
    assert!(db.has_index("idx_saved_tracks_fingerprint").unwrap());
    assert!(db.has_index("idx_saved_tracks_favorite_imported").unwrap());
}

#[test]
fn upsert_is_atomic_and_survives_reopen() {
    let directory = tempdir().unwrap();
    let path = directory.path().join("harmonia.db");
    let db = Database::open(&path).unwrap();
    db.save(&saved_track("track-1", "fingerprint-1", false))
        .unwrap();
    db.save(&saved_track("track-1", "fingerprint-1", true))
        .unwrap();
    drop(db);

    let reopened = Database::open(&path).unwrap();
    let records = reopened.list().unwrap().records;
    assert_eq!(records.len(), 1);
    assert_eq!(records[0]["track"]["favorite"], true);
}

#[test]
fn delete_removes_only_the_requested_track() {
    let db = Database::open_in_memory().unwrap();
    db.save(&saved_track("track-1", "fingerprint-1", false))
        .unwrap();
    db.save(&saved_track("track-2", "fingerprint-2", false))
        .unwrap();

    db.delete("analysis-track-1").unwrap();

    let records = db.list().unwrap().records;
    assert_eq!(records.len(), 1);
    assert_eq!(records[0]["track"]["id"], "track-2");
}

#[test]
fn rejects_mismatched_fingerprints_without_replacing_existing_data() {
    let db = Database::open_in_memory().unwrap();
    db.save(&saved_track("track-1", "fingerprint-1", false))
        .unwrap();
    let mut corrupt = saved_track("track-1", "fingerprint-1", true);
    corrupt["analysis"]["fingerprint"] = json!("different");

    let error = db.save(&corrupt).unwrap_err();

    assert!(matches!(error, DatabaseError::InvalidRecord(_)));
    let records = db.list().unwrap().records;
    assert_eq!(records[0]["track"]["favorite"], false);
}

#[test]
fn rejects_corrupt_and_oversized_envelopes() {
    let db = Database::open_in_memory().unwrap();
    let missing_analysis = json!({ "track": { "id": "track-1" } });
    assert!(matches!(
        db.save(&missing_analysis),
        Err(DatabaseError::InvalidRecord(_))
    ));

    let mut too_large = saved_track("track-1", "fingerprint-1", false);
    too_large["analysis"]["warnings"] = json!(["x".repeat(MAX_SAVED_TRACK_BYTES)]);
    assert!(matches!(
        db.save(&too_large),
        Err(DatabaseError::PayloadTooLarge { .. })
    ));
}

#[test]
fn corrupt_stored_json_is_reported_instead_of_returned() {
    let db = Database::open_in_memory().unwrap();
    db.insert_raw_for_test("track-1", "fingerprint-1", "{not-json")
        .unwrap();

    let result = db.list().unwrap();
    assert!(result.records.is_empty());
    assert_eq!(result.issues.len(), 1);
    assert_eq!(result.issues[0].id, "track-1");
    assert!(result.issues[0].message.contains("invalid JSON"));
}

#[test]
fn one_corrupt_row_does_not_hide_healthy_tracks() {
    let db = Database::open_in_memory().unwrap();
    db.save(&saved_track("healthy", "fingerprint-1", true))
        .unwrap();
    db.insert_raw_for_test("broken", "fingerprint-2", "{not-json")
        .unwrap();

    let result = db.list().unwrap();
    assert_eq!(result.records.len(), 1);
    assert_eq!(result.records[0]["track"]["id"], "healthy");
    assert_eq!(result.issues.len(), 1);
    assert_eq!(result.issues[0].id, "broken");
    assert!(result.issues[0].message.contains("invalid JSON"));
    // A second read still reports the damaged row: recovery never deletes it.
    assert_eq!(db.list().unwrap().issues.len(), 1);
    let wire = serde_json::to_value(result).unwrap();
    assert_eq!(wire["issues"][0]["id"], "broken");
    assert_eq!(wire["records"][0]["track"]["id"], "healthy");
}

#[test]
fn analyses_of_the_same_track_do_not_overwrite_each_other() {
    let db = Database::open_in_memory().unwrap();
    let mut first = saved_track("same-track", "same-audio", false);
    first["corrections"] = json!([{
        "id": "correction-1",
        "analysisId": "analysis-same-track",
        "segmentId": "segment-1",
        "before": first["analysis"]["segments"][0],
        "after": first["analysis"]["segments"][0],
        "createdAt": "2026-09-20T12:00:00.000Z"
    }]);
    let mut second = first.clone();
    second["analysis"]["id"] = json!("analysis-2");
    second["analysis"]["profile"] = json!("accurate");
    second["corrections"] = json!([]);
    db.save(&first).unwrap();
    db.save(&second).unwrap();

    let result = db.list().unwrap();
    assert_eq!(result.records.len(), 2);
    assert!(result.issues.is_empty());
    db.delete("analysis-2").unwrap();
    assert_eq!(db.list().unwrap().records, vec![first]);
}

#[test]
fn migrates_legacy_rows_without_losing_corrupt_or_duplicate_data() {
    let directory = tempdir().unwrap();
    let path = directory.path().join("legacy.db");
    let old = rusqlite::Connection::open(&path).unwrap();
    old.execute_batch(include_str!("../migrations/0001_saved_tracks.sql"))
        .unwrap();
    old.pragma_update(None, "user_version", 1).unwrap();
    let first = saved_track("a-healthy", "audio-1", true);
    let mut duplicate = saved_track("b-duplicate", "audio-2", false);
    duplicate["analysis"]["id"] = first["analysis"]["id"].clone();
    let mismatched = saved_track("other-id", "audio-3", false);
    let fixtures = [
        ("a-healthy", first.to_string()),
        ("b-duplicate", duplicate.to_string()),
        ("c-broken", "{not-json".to_owned()),
        ("d-mismatched", mismatched.to_string()),
    ];
    for (id, body) in &fixtures {
        old.execute(
            "INSERT INTO saved_tracks (track_id, fingerprint, favorite, imported_at, model_version, pipeline_version, analysis_profile, record_json) VALUES (?1, 'audio', 0, '', '', '', 'balanced', ?2)",
            rusqlite::params![id, body],
        ).unwrap();
    }
    drop(old);

    let migrated = Database::open(&path).unwrap();
    assert_eq!(migrated.user_version().unwrap(), 2);
    let result = migrated.list().unwrap();
    assert_eq!(result.records, vec![first]);
    assert_eq!(result.issues.len(), 3);
    assert_eq!(result.issues[0].id, "b-duplicate");
    assert_eq!(result.issues[1].id, "c-broken");
    assert_eq!(result.issues[2].id, "d-mismatched");
    drop(migrated);

    let raw = rusqlite::Connection::open(&path).unwrap();
    for (id, original) in fixtures {
        let retained: String = raw
            .query_row(
                "SELECT record_json FROM saved_tracks WHERE record_id = ?1",
                [id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(retained, original);
    }
    drop(raw);
    assert_eq!(
        Database::open(path).unwrap().list().unwrap().issues.len(),
        3
    );
}
