import copy
import importlib
import json

import numpy as np
import pytest
import soundfile as sf

from harmonia_ml.data.prepare import file_sha256
from harmonia_ml.data.winterreise import composition_split, parse_annotations


def prepare_module():
    try:
        return importlib.import_module("harmonia_ml.data.prepare_winterreise")
    except ModuleNotFoundError:
        pytest.fail("Masked Winterreise preparation is not implemented")


def test_unknown_gaps_conflicts_and_unrepresentable_labels_are_never_n_targets():
    csv = (
        "start;end;shorthand;extended;majmin;majmin_inv\n"
        "1;2;C:maj;C:(3,5);C:maj;C:maj\n"
        "2;3;A:(3,5,b7,b9);A:(3,5,b9);A:maj;A:maj\n"
        "3;4;D:(b9);D:(b9);D:maj;D:maj\n"
        "4;5;N;N;N;N\n"
        "5;6;G:min/A#;G:(b3,5)/A#;G:min;G:min/A#\n"
    )
    rows = parse_annotations(csv, duration=7)
    times = np.array([0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5])
    targets, boundary_times, excluded = prepare_module().masked_targets(rows, times)
    assert targets["mask"].tolist() == [False, True, False, False, True, True, False]
    assert targets["root"][targets["mask"]].tolist() == [0, 12, 7]
    assert targets["bass"][5] == 10
    assert boundary_times.tolist() == [5.0]
    assert excluded == {"source_conflict_or_parse_error": 1, "unrepresentable": 1}


def test_reduced_target_preserves_diminished_triad_and_explicit_seventh():
    csv = (
        "start;end;shorthand;extended;majmin;majmin_inv\n"
        "0;1;C:hdim7;C:(b3,b5,b7);C:min;C:min\n"
        "1;2;D:dim7;D:(b3,b5,bb7);D:min;D:min\n"
    )
    targets, _, _ = prepare_module().masked_targets(
        parse_annotations(csv, duration=2), np.array([0.5, 1.5])
    )
    assert targets["mask"].tolist() == [True, True]
    assert targets["triad"].tolist() == [3, 3]
    assert targets["seventh"].tolist() == [1, 3]


def acquisition_fixture(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    tracks, files = [], []
    for song, split, frequency in [(2, "train", 220), (14, "validation", 440), (19, "test", 880)]:
        name = f"Schubert_D911-{song:02d}_HU33"
        audio = source / "01_RawData/audio_wav" / f"{name}.wav"
        annotation = source / "02_Annotations/ann_audio_chord" / f"{name}.csv"
        audio.parent.mkdir(parents=True, exist_ok=True)
        annotation.parent.mkdir(parents=True, exist_ok=True)
        samples = np.arange(22050 * 2) / 22050
        sf.write(audio, 0.2 * np.sin(2 * np.pi * frequency * samples), 22050)
        annotation.write_text(
            "start;end;shorthand;extended;majmin;majmin_inv\n"
            "0;1;X;X;X;X\n1;2;C:maj;C:(3,5);C:maj;C:maj\n"
        )
        tracks.append(
            {
                "id": name,
                "composition": f"Schubert_D911-{song:02d}",
                "split": split,
                "audio_path": audio.relative_to(source).as_posix(),
                "annotation_path": annotation.relative_to(source).as_posix(),
                "annotations": parse_annotations(annotation.read_text(), duration=2),
            }
        )
        files.extend(
            {"path": p.relative_to(source).as_posix(), "sha256": file_sha256(p)}
            for p in (audio, annotation)
        )
    manifest = {
        "split": composition_split(),
        "tracks": tracks,
        "files": files,
        "audio_rights": "fixture",
        "annotation_license": "fixture",
    }
    (source / "manifest.json").write_text(json.dumps(manifest))
    return source, manifest


@pytest.mark.parametrize(
    "change", ["duplicate_composition", "duplicate_audio", "wrong_id", "wrong_split"]
)
def test_preparation_rejects_leakage_before_publishing_features(tmp_path, change):
    source, manifest = acquisition_fixture(tmp_path)
    if change == "duplicate_composition":
        manifest["tracks"].append(copy.deepcopy(manifest["tracks"][0]))
    elif change == "duplicate_audio":
        manifest["tracks"][1]["audio_path"] = manifest["tracks"][0]["audio_path"]
    elif change == "wrong_id":
        manifest["tracks"][1]["id"] = "../outside"
    else:
        manifest["tracks"][1]["split"] = "train"
    (source / "manifest.json").write_text(json.dumps(manifest))
    output = tmp_path / "prepared"
    with pytest.raises(ValueError):
        prepare_module().prepare_dataset(source, output)
    assert not output.exists()


def test_preparation_reparses_hashed_source_and_normalizes_only_valid_training_frames(tmp_path):
    source, manifest = acquisition_fixture(tmp_path)
    # A changed cached annotation must not convert X to a valid no-chord label.
    manifest["tracks"][0]["annotations"][0]["normalized"]["extended"] = "N"
    (source / "manifest.json").write_text(json.dumps(manifest))
    output = tmp_path / "prepared"
    result = prepare_module().prepare_dataset(source, output)
    with np.load(output / "Schubert_D911-02_HU33.npz") as track:
        assert not track["mask"][track["times"] < 1].any()
        values = track["features"][track["mask"]].astype(np.float64)
    normalization = result["feature_normalization"]
    assert normalization["fit_frame_count"] == len(values)
    np.testing.assert_allclose(normalization["mean"], values.mean(axis=0), atol=1e-12)
    np.testing.assert_allclose(
        normalization["std"], np.maximum(values.std(axis=0), 1e-4), atol=1e-10
    )
    assert set(result["train_validation_distribution"]) == {"train", "validation"}
    assert result["target_version"] == "winterreise-strict-masked-v1"
    assert json.loads((output / "manifest.lock.json").read_text())["test_evaluated"] is False


@pytest.mark.parametrize(
    "fields", [("audio_path",), ("annotation_path",), ("audio_path", "annotation_path")]
)
def test_preparation_rejects_swapped_train_validation_sources_with_valid_hashes(tmp_path, fields):
    source, manifest = acquisition_fixture(tmp_path)
    training, validation = manifest["tracks"][:2]
    for field in fields:
        training[field], validation[field] = validation[field], training[field]
    (source / "manifest.json").write_text(json.dumps(manifest))
    output = tmp_path / "prepared"
    with pytest.raises(ValueError, match="source identity"):
        prepare_module().prepare_dataset(source, output)
    assert not output.exists()
