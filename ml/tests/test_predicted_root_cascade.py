import numpy as np
import pytest
import torch

from experiments.predicted_root_cascade import (
    baseline_predictions,
    cascade_predictions,
    fit_quality,
    paired_metrics,
    quality_metrics,
    relative_normalization,
    require_convergence,
    run,
    select_records,
)


def baseline(roots):
    size = len(roots)
    return {
        "root": np.array(roots, dtype=np.int64),
        "triad": np.full(size, 4, dtype=np.int64),
        "seventh": np.zeros(size, dtype=np.int64),
        "bass": np.array(roots, dtype=np.int64),
        "extensions": np.zeros((size, 4), dtype=np.int64),
        "boundary": np.arange(size, dtype=np.float32) / size,
    }


def classifier():
    weight = np.zeros((4, 26))
    weight[0, 0] = 1
    weight[1, 1] = 1
    return {"weight": weight, "bias": np.zeros(4), "mean": np.zeros(26), "std": np.ones(26)}


def test_cascade_uses_predicted_roots_and_preserves_n_all_other_heads_and_inputs():
    features = np.zeros((3, 26), dtype=np.float32)
    features[:, 0] = 1
    original = baseline([0, 11, 12])
    result = cascade_predictions(features, original, classifier())
    np.testing.assert_array_equal(result["triad"], [1, 2, 4])
    np.testing.assert_array_equal(original["triad"], [4, 4, 4])
    for head in original.keys() - {"triad"}:
        np.testing.assert_array_equal(result[head], original[head])
        assert result[head].dtype == original[head].dtype
    assert features[:, 0].sum() == 3


def test_normalization_uses_training_rotated_features_and_preserves_energy_flux():
    features = np.zeros((2, 26), dtype=np.float64)
    features[0, [2, 14, 24, 25]] = [1, 2, 3, 4]
    features[1, [7, 19, 24, 25]] = [1, 2, 5, 8]
    x, mean, std = relative_normalization(features, np.array([2, 7]))
    assert mean[0] == 1
    assert mean[12] == 2
    np.testing.assert_array_equal(mean[24:], [4, 6])
    assert std[0] == 1e-4
    np.testing.assert_array_equal(x[:, 24:], [[-1, -1], [1, 1]])


def test_primary_macro_includes_unsupported_reference_quality_and_reports_absent_classes():
    result = quality_metrics(np.array([1, 2, 3, 4, 6]), np.array([1, 2, 3, 4, 1]))
    assert result["macro_recall_present_classes"] == 0.8
    assert result["present_classes"] == [1, 2, 3, 4, 6]
    assert result["support"][6] == 1
    assert result["recall"][6] == 0
    assert result["recall"][5] is None
    assert np.array(result["confusion"]).shape == (8, 8)
    assert quality_metrics(np.array([], dtype=int), np.array([], dtype=int))["accuracy"] is None


def test_pair_metrics_mask_truth_only_keep_wrong_root_and_report_changes():
    truth = baseline([0, 0, 0, 0])
    truth["triad"] = np.array([1, 2, 6, 4])
    original = baseline([0, 11, 0, 0])
    original["triad"] = np.array([1, 1, 1, 4])
    candidate = {key: value.copy() for key, value in original.items()}
    candidate["triad"] = np.array([2, 2, 2, 4])
    actual = paired_metrics(truth, original, candidate, np.array([True, True, True, False]))
    assert actual["baseline"]["quality"]["macro_recall_present_classes"] == pytest.approx(1 / 3)
    assert actual["candidate"]["quality"]["macro_recall_present_classes"] == pytest.approx(1 / 3)
    assert actual["candidate"]["wrong_root"]["frames"] == 1
    assert actual["candidate"]["wrong_root"]["quality"]["accuracy"] == 1
    assert actual["changes"] == {"changed": 3, "corrected": 1, "damaged": 1}
    assert actual["baseline"]["reduced_structural_exact"] == pytest.approx(1 / 3)
    assert actual["candidate"]["reduced_structural_exact"] == 0
    candidate["bass"][0] = 7
    with pytest.raises(ValueError, match="Unchanged"):
        paired_metrics(truth, original, candidate, np.ones(4, dtype=bool))


def test_split_selection_does_not_accept_duplicates_swapped_identity_or_test():
    records = [
        {
            "split": "validation",
            "composition_id": f"Schubert_D911-{i:02}",
            "track_id": f"Schubert_D911-{i:02}_HU33",
            "prepared_file": f"Schubert_D911-{i:02}_HU33.npz",
        }
        for i in range(14, 19)
    ]
    records.append({"split": "test", "prepared_file": "NEVER-OPEN.npz"})
    assert len(select_records({"records": records}, "validation")) == 5
    with pytest.raises(ValueError):
        select_records({"records": records}, "test")
    with pytest.raises(ValueError):
        select_records({"records": records + [records[0]]}, "validation")
    records[0]["prepared_file"] = records[1]["prepared_file"]
    with pytest.raises(ValueError):
        select_records({"records": records}, "validation")


@pytest.mark.parametrize("gradient", [1.01e-5, float("nan"), float("inf")])
def test_nonconvergence_blocks_validation(gradient):
    with pytest.raises(ValueError, match="converg"):
        require_convergence(gradient, 1e-5)
    require_convergence(1e-5, 1e-5)


@pytest.mark.parametrize("kind", ["root", "features", "normalization", "mask"])
def test_rejects_invalid_model_inputs_without_silent_repair(kind):
    features = np.zeros((2, 26))
    original = baseline([0, 0])
    quality = classifier()
    if kind == "root":
        original["root"][0] = 13
    if kind == "features":
        features[0, 0] = np.nan
    if kind == "normalization":
        quality["std"][0] = 0
    with pytest.raises(ValueError):
        if kind == "mask":
            paired_metrics(original, original, original, np.array([1, 0]))
        else:
            cascade_predictions(features, original, quality)


def test_baseline_keeps_full_context_float32_and_exact_extension_threshold():
    class FixedHeads(torch.nn.Module):
        def forward(self, values):
            assert values.dtype == torch.float32
            assert values.shape == (1, 3, 26)
            torch.testing.assert_close(values[0, :, 0], torch.tensor([0.0, 1.0, 2.0]))
            outputs = {
                key: torch.zeros(1, 3, count)
                for key, count in (("root", 13), ("triad", 8), ("seventh", 4), ("bass", 13))
            }
            outputs["extensions"] = torch.tensor([[[-1.0, 0.0, 1.0, 0.0]] * 3])
            outputs["boundary"] = torch.zeros(1, 3)
            return outputs

    features = np.ones((3, 26), dtype=np.float32)
    features[:, 0] = [1, 3, 5]
    checkpoint = {
        "normalization_mean": np.ones(26, dtype=np.float32),
        "normalization_std": np.full(26, 2, dtype=np.float32),
    }
    result = baseline_predictions(FixedHeads(), checkpoint, features)
    np.testing.assert_array_equal(result["extensions"], [[0, 1, 1, 1]] * 3)
    np.testing.assert_array_equal(result["boundary"], [0.5] * 3)


def test_fixed_solver_fits_constructed_four_class_features_with_measured_gradient():
    class MemoryChecks:
        calls = 0

        def check(self):
            self.calls += 1

    resources = MemoryChecks()
    features = np.zeros((40, 26))
    labels = np.arange(40) % 4
    features[np.arange(40), labels] = 1
    quality, report = fit_quality(
        [{"features": features, "root": np.zeros(40, dtype=int), "labels": labels}],
        {"max_iterations": 100, "l2": 1e-4, "convergence_gradient_infinity_max": 1e-5},
        resources,
    )
    assert report["converged"]
    assert report["gradient_infinity_norm"] <= 1e-5
    assert report["training_fit"]["accuracy"] == 1
    assert resources.calls == report["objective_evaluations"]
    assert quality["weight"].dtype == np.float64


def test_failed_fit_retains_evidence_without_opening_validation_arrays(tmp_path, monkeypatch):
    import hashlib
    import json
    from pathlib import Path

    import experiments.predicted_root_cascade as study

    config = json.loads(Path("experiments/E010-predicted-root-quality-cascade.json").read_text())
    records = []
    for i in range(2, 19):
        name = f"Schubert_D911-{i:02}_HU33.npz"
        (tmp_path / name).write_bytes(b"hash-only; never valid NPZ")
        records.append(
            {
                "split": "train" if i < 14 else "validation",
                "track_id": name[:-4],
                "composition_id": f"Schubert_D911-{i:02}",
                "prepared_file": name,
                "prepared_sha256": hashlib.sha256((tmp_path / name).read_bytes()).hexdigest(),
            }
        )
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({"records": records}))
    checkpoint = tmp_path / "E009.pt"
    checkpoint.write_bytes(b"hash-only; never valid checkpoint")
    config.update(
        manifest=str(manifest),
        manifest_sha256=hashlib.sha256(manifest.read_bytes()).hexdigest(),
        checkpoint=str(checkpoint),
        checkpoint_sha256=hashlib.sha256(checkpoint.read_bytes()).hexdigest(),
        output=str(tmp_path / "results"),
        checkpoint_dir=str(tmp_path / "outputs"),
    )
    config_path = tmp_path / "config.json"
    config_path.write_text(json.dumps(config))
    monkeypatch.setattr(study, "load_training_tracks", lambda path: [])
    monkeypatch.setattr(
        study,
        "fit_quality",
        lambda tracks, config, resources: (
            classifier(),
            {"converged": False, "gradient_infinity_norm": 0.1},
        ),
    )
    monkeypatch.setattr(torch, "set_num_interop_threads", lambda count: None)
    monkeypatch.setattr(study.Resources, "check", lambda self: None)
    report = run(config_path)
    assert report["status"] == "inconclusive_optimization"
    assert not report["validation_arrays_opened"]
    assert (tmp_path / "results" / "report.json").exists()
    assert (tmp_path / "outputs" / "quality.npz").exists()
