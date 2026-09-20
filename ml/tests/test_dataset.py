import json
from pathlib import Path

import numpy as np
import torch

from harmonia_ml.data.guitarset import load_performed_chords
from harmonia_ml.training.dataset import PreparedTrackDataset
from harmonia_ml.training.runner import training_class_weights


def test_prepared_dataset_pads_short_track_and_masks_padding(tmp_path: Path) -> None:
    np.savez_compressed(
        tmp_path / "track.npz",
        features=np.ones((3, 26), dtype=np.float32),
        root=np.array([0, 0, 0]),
        triad=np.array([1, 1, 1]),
        seventh=np.array([0, 0, 0]),
        bass=np.array([0, 0, 0]),
        extensions=np.zeros((3, 4), dtype=np.float32),
        boundary=np.zeros(3, dtype=np.float32),
    )
    dataset = PreparedTrackDataset([tmp_path / "track.npz"], sequence_length=5, seed=7)

    features, targets = dataset[0]

    assert features.shape == (5, 26)
    assert targets["mask"].tolist() == [True, True, True, False, False]
    assert features[3:].sum().item() == 0


def test_guitarset_adapter_selects_verified_performed_chords(tmp_path: Path) -> None:
    path = tmp_path / "00_BN1-120-C_comp.jams"
    payload = {
        "annotations": [
            {
                "namespace": "chord",
                "annotation_metadata": {"data_source": ""},
                "data": [{"time": 0.0, "duration": 1.0, "value": "C:maj"}],
            },
            {
                "namespace": "chord",
                "annotation_metadata": {"data_source": "manual verification"},
                "data": [{"time": 0.0, "duration": 1.0, "value": "C:maj7/3"}],
            },
        ]
    }
    path.write_text(json.dumps(payload), encoding="utf-8")

    assert load_performed_chords(path) == [(0.0, 1.0, "C:maj7/3")]


def test_optional_annotation_mask_excludes_unknown_frames_and_class_counts(tmp_path):
    path = tmp_path / "masked.npz"
    np.savez_compressed(
        path,
        features=np.ones((4, 26), dtype=np.float32),
        root=np.array([0, 12, 12, 0]),
        triad=np.array([1, 0, 0, 2]),
        seventh=np.array([0, 3, 3, 0]),
        bass=np.array([0, 12, 12, 0]),
        extensions=np.zeros((4, 4), dtype=np.float32),
        boundary=np.zeros(4, dtype=np.float32),
        mask=np.array([True, False, False, True]),
    )
    _, targets = PreparedTrackDataset([path], sequence_length=6, seed=7)[0]
    assert targets["mask"].tolist() == [True, False, False, True, False, False]
    weights = training_class_weights([path], torch.device("cpu"))
    assert weights["triad"][1].item() == 1
    assert weights["triad"][2].item() == 1
