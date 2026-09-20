import hashlib
import json

import numpy as np
import pytest
import torch

from experiments.relative_bass_probe import (
    bass_metrics,
    feature_values,
    fit_linear,
    load_training,
    normalize_fold,
)
from experiments.root_relative_probe import Resources


def test_both_arms_include_the_same_oracle_context_and_relative_pitch_rotation():
    track = {"features": np.zeros((1, 26)), "root": np.array([5])}
    track["features"][0, [5, 17]] = 1
    control, treatment = (feature_values(track, arm) for arm in ("absolute", "root_relative"))
    assert control.shape == treatment.shape == (1, 38)
    np.testing.assert_array_equal(control[:, 26:], treatment[:, 26:])
    assert control[0, 5] == control[0, 17] == treatment[0, 0] == treatment[0, 12] == 1
    assert control[0, 31] == treatment[0, 31] == 1


def test_fold_normalization_never_fits_held_out_frames():
    tracks = [
        {"composition": 2, "features": np.zeros((2, 26)), "root": np.array([0, 1])},
        {"composition": 3, "features": np.ones((2, 26)), "root": np.array([2, 3])},
    ]
    mean, std = normalize_fold(tracks, {3}, "absolute")
    tracks[1]["features"][:] = 1e20
    updated = normalize_fold(tracks, {3}, "absolute")
    np.testing.assert_array_equal(mean, updated[0])
    np.testing.assert_array_equal(std, updated[1])
    assert mean[26] == mean[27] == 0.5
    assert mean[28] == 0


def test_inversion_scores_distinguish_correct_degree_detection_and_root_position_tradeoff():
    result = bass_metrics(np.array([0, 0, 3, 3, 7]), np.array([0, 4, 3, 7, 7]))
    assert result["inverted_frame_exact_accuracy"] == 2 / 3
    assert result["root_position_exact_accuracy"] == 0.5
    assert result["inversion_only_macro_recall"] == 0.75
    assert result["inversion_detection_precision"] == 0.75
    empty = bass_metrics(np.array([0, 0]), np.array([0, 0]))
    assert empty["inverted_frame_exact_accuracy"] is None
    assert empty["inversion_only_macro_recall"] is None
    assert empty["inversion_detection_precision"] is None


def test_loader_uses_relative_bass_and_never_opens_validation_or_test(tmp_path):
    records = []
    for composition in range(2, 14):
        name = f"Schubert_D911-{composition:02}_HU33.npz"
        path = tmp_path / name
        np.savez(
            path,
            features=np.zeros((2, 26)),
            root=np.array([5, 12]),
            bass=np.array([0, 12]),
            mask=np.array([True, False]),
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
        records.append({"split": split, "prepared_file": "MUST-NOT-OPEN.npz"})
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({"records": records}))
    tracks = load_training(manifest)
    assert len(tracks) == 12
    assert all(t["labels"].tolist() == [7] for t in tracks)


def test_optimizer_return_is_not_convergence_when_budget_is_exhausted():
    config = {
        "max_iterations": 1,
        "max_evaluations": 2,
        "l2_weights_and_biases": 1e-4,
        "convergence_gradient_infinity_max": 1e-6,
    }
    _, status = fit_linear(
        torch.zeros((12, 38), dtype=torch.float64),
        torch.zeros(12, dtype=torch.int64),
        config,
        Resources(1),
    )
    assert status["iterations"] == 1
    assert status["gradient_infinity_norm"] > 1e-6
    assert status["converged"] is False


def test_nonfinite_fit_aborts_instead_of_producing_argmax_metrics():
    config = {
        "max_iterations": 1,
        "max_evaluations": 2,
        "l2_weights_and_biases": 1e-4,
        "convergence_gradient_infinity_max": 1e-6,
    }
    with pytest.raises(ValueError, match="Nonfinite objective"):
        fit_linear(
            torch.full((12, 38), float("nan"), dtype=torch.float64),
            torch.zeros(12, dtype=torch.int64),
            config,
            Resources(1),
        )
