import json
from pathlib import Path

import numpy as np
import pytest

from harmonia_ml.evaluation.boundaries import boundary_metrics
from harmonia_ml.evaluation.calibration import expected_calibration_error
from harmonia_ml.evaluation.report import evaluate


def test_locked_test_requires_frozen_selection(tmp_path: Path) -> None:
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({"records": []}))
    with pytest.raises(ValueError, match="frozen validation selection"):
        evaluate(manifest, "test", tmp_path / "report.json", dsp=True)
    assert not (tmp_path / "report.json").exists()


def test_boundary_matching_is_one_to_one_at_each_tolerance() -> None:
    reference = np.array([1.0, 2.0])
    estimated = np.array([0.98, 1.02, 2.08])

    narrow = boundary_metrics(reference, estimated, tolerance=0.05, duration=3.0)
    wide = boundary_metrics(reference, estimated, tolerance=0.10, duration=3.0)

    assert (narrow.true_positives, narrow.false_positives, narrow.false_negatives) == (1, 2, 1)
    assert (wide.true_positives, wide.false_positives, wide.false_negatives) == (2, 1, 0)
    assert wide.false_positives_per_minute == 20.0


def test_ece_uses_confidence_bins_and_correctness() -> None:
    confidence = np.array([0.9, 0.8, 0.2, 0.1])
    correct = np.array([1, 0, 1, 0], dtype=bool)

    result = expected_calibration_error(confidence, correct, bins=2)

    assert result == pytest.approx(0.35)


def test_evaluation_ignores_masked_labels_and_boundaries(tmp_path):
    features = np.zeros((4, 26), dtype=np.float32)
    times = np.array([0.5, 1.5, 2.5, 3.5])
    targets = dict(
        root=np.array([0, 12, 12, 0]),
        triad=np.array([1, 0, 0, 1]),
        seventh=np.zeros(4, dtype=int),
        bass=np.array([0, 12, 12, 0]),
        extensions=np.zeros((4, 4), dtype=int),
        boundary_times=np.array([1.5]),
    )
    np.savez(
        tmp_path / "track.npz",
        features=features,
        times=times,
        mask=np.array([True, False, False, True]),
        **targets,
    )
    predictions = tmp_path / "predictions"
    predictions.mkdir()
    np.savez(predictions / "track.npz", **{**targets, "root": np.array([0, 1, 1, 0])})
    manifest = tmp_path / "manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "records": [
                    {
                        "track_id": "track",
                        "prepared_file": "track.npz",
                        "split": "validation",
                        "performer_id": "fixture",
                        "style": "fixture",
                        "duration_seconds": 4,
                    }
                ]
            }
        )
    )
    report = evaluate(
        manifest,
        "validation",
        tmp_path / "report.json",
        prediction_dir=predictions,
        method_name="fixture",
    )
    assert report["frames"] == 2
    assert report["annotation_frame_coverage"] == 0.5
    assert report["component_metrics"]["root"]["accuracy"] == 1
    assert report["boundary"]["0.05"]["true_positives"] == 0
