import json
import random
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

from harmonia_ml.training import runner
from harmonia_ml.training.dataset import PreparedTrackDataset


def _track(path: Path) -> None:
    features = np.zeros((100, 26), dtype=np.float32)
    features[:, 0] = 1
    features[:, 12] = 1
    features[:, 24] = np.arange(100)
    np.savez(
        path,
        features=features,
        root=np.zeros(100, dtype=np.int64),
        bass=np.zeros(100, dtype=np.int64),
        triad=np.ones(100, dtype=np.int64),
        seventh=np.zeros(100, dtype=np.int64),
        extensions=np.zeros((100, 4)),
        boundary=np.zeros(100),
    )


def test_persistent_workers_observe_new_epoch(tmp_path: Path) -> None:
    _track(tmp_path / "track.npz")
    dataset = PreparedTrackDataset([tmp_path / "track.npz"], sequence_length=8, seed=7)
    loader = DataLoader(dataset, num_workers=1, persistent_workers=True)
    first = next(iter(loader))[0]
    dataset.set_epoch(3)
    second = next(iter(loader))[0]
    assert not torch.equal(first, second)


def test_transposition_rotates_both_chromas_and_absolute_labels(tmp_path: Path) -> None:
    _track(tmp_path / "track.npz")
    dataset = PreparedTrackDataset([tmp_path / "track.npz"], sequence_length=8, seed=7)
    dataset.configure(
        samples_per_track=1,
        feature_indices=list(range(26)),
        mean=np.zeros(26),
        std=np.ones(26),
        transpose=True,
    )
    seen = set()
    for epoch in range(12):
        dataset.set_epoch(epoch)
        features, target = dataset[0]
        root = int(target["root"][0])
        seen.add(root)
        assert features[0, :12].argmax().item() == root
        assert features[0, 12:24].argmax().item() == root
        assert target["bass"][0].item() == root
        assert target["triad"][0].item() == 1
    assert len(seen) > 4


def test_rng_restore_repeats_all_random_streams() -> None:
    generator = torch.Generator().manual_seed(19)
    state = runner.capture_rng_state(generator)
    expected = (
        random.random(),
        np.random.random(),
        torch.rand(3),
        torch.rand(3, generator=generator),
    )
    runner.restore_rng_state(state, generator)
    actual = (
        random.random(),
        np.random.random(),
        torch.rand(3),
        torch.rand(3, generator=generator),
    )
    assert actual[:2] == expected[:2]
    assert torch.equal(actual[2], expected[2])
    assert torch.equal(actual[3], expected[3])


def test_interrupted_training_matches_uninterrupted_weights(tmp_path: Path) -> None:
    _track(tmp_path / "track.npz")
    manifest = {
        "feature_normalization": {"mean": [0] * 26, "std": [1] * 26},
        "feature_config": {"version": "test"},
        "feature_names": [str(i) for i in range(26)],
        "records": [
            {"split": split, "prepared_file": "track.npz"} for split in ("train", "validation")
        ],
    }
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps(manifest))
    base = {
        "experiment_id": "resume-test",
        "manifest": str(manifest_path),
        "feature_set": "chroma_bass",
        "device": "cpu",
        "seed": 41,
        "hidden_channels": 8,
        "blocks": 1,
        "dropout": 0.2,
        "sequence_length": 8,
        "validation_sequence_length": 8,
        "samples_per_track": 3,
        "batch_size": 1,
        "workers": 1,
        "epochs": 2,
        "early_stopping_patience": 5,
        "learning_rate": 0.001,
        "weight_decay": 0.0001,
        "resume": True,
    }
    config_path = tmp_path / "config.json"
    full = dict(base, output_dir=str(tmp_path / "full"))
    config_path.write_text(json.dumps(full))
    runner.train(config_path)
    partial = dict(base, output_dir=str(tmp_path / "resumed"), epochs=1)
    config_path.write_text(json.dumps(partial))
    runner.train(config_path)
    partial["epochs"] = 2
    config_path.write_text(json.dumps(partial))
    runner.train(config_path)
    complete = torch.load(tmp_path / "full/latest.pt", weights_only=False)
    resumed = torch.load(tmp_path / "resumed/latest.pt", weights_only=False)
    for key, value in complete["model_state"].items():
        assert torch.equal(value, resumed["model_state"][key]), key
    assert complete["history"] == resumed["history"]
    assert complete["scheduler_state"] == resumed["scheduler_state"]
