import json

import numpy as np

from experiments.root_relative_probe import fold_normalization, load_training_tracks, transform


def test_oracle_rotation_preserves_intervals_and_nonpitch_features():
    features = np.zeros((1, 26), dtype=np.float64)
    features[0, [2, 5, 9]] = 1
    features[0, 14] = 1
    features[0, 24:] = [0.3, 0.7]
    actual = transform(features, np.array([2]), "root_relative")
    np.testing.assert_array_equal(np.flatnonzero(actual[0, :12]), [0, 3, 7])
    assert actual[0, 12] == 1
    np.testing.assert_array_equal(actual[0, 24:], features[0, 24:])
    shifted = features.copy()
    shifted[:, :12] = np.roll(features[:, :12], 4, axis=1)
    shifted[:, 12:24] = np.roll(features[:, 12:24], 4, axis=1)
    np.testing.assert_array_equal(transform(shifted, np.array([6]), "root_relative"), actual)


def test_normalization_excludes_held_out_composition():
    tracks = [
        {"composition": 2, "features": np.zeros((2, 26)), "root": np.zeros(2, dtype=int)},
        {"composition": 3, "features": np.ones((2, 26)), "root": np.zeros(2, dtype=int)},
    ]
    before = fold_normalization(tracks, {3}, "absolute")
    tracks[1]["features"][:] = 1e12
    after = fold_normalization(tracks, {3}, "absolute")
    np.testing.assert_array_equal(before[0], after[0])
    np.testing.assert_array_equal(before[1], after[1])
    np.testing.assert_array_equal(after[0], np.zeros(26))


def test_loader_never_opens_validation_or_test_files(tmp_path):
    import hashlib

    records = []
    for composition in range(2, 14):
        name = f"Schubert_D911-{composition:02}_HU33.npz"
        path = tmp_path / name
        np.savez(
            path,
            features=np.zeros((1, 26)),
            root=np.array([0]),
            triad=np.array([1]),
            mask=np.array([True]),
        )
        records.append(
            {
                "split": "train",
                "composition_id": f"Schubert_D911-{composition:02}",
                "prepared_file": name,
                "prepared_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            }
        )
    for split in ("validation", "test"):
        records.append({"split": split, "prepared_file": "DO-NOT-OPEN.npz"})
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({"records": records}))
    assert len(load_training_tracks(manifest)) == 12
