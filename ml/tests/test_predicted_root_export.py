import numpy as np
import onnxruntime as ort
import torch

from harmonia_ml.export.predicted_root import (
    OUTPUTS,
    PredictedRootCascade,
    compare_case,
    compare_retained,
    export_graph,
)


class ForcedRoots(torch.nn.Module):
    def forward(self, values):
        roots = values[:, :, 25:26] == torch.arange(13)
        shape = values[:, :, :1]
        triad = torch.zeros_like(shape).expand(-1, -1, 8)
        return {
            "root": roots.float() * 10,
            "triad": triad + torch.tensor([0, 0, 0, 0, 0, 0, 3, 0]),
            "seventh": torch.zeros_like(shape).expand(-1, -1, 4),
            "bass": roots.float() * 5,
            "extensions": torch.zeros_like(shape).expand(-1, -1, 4),
            "boundary": shape.squeeze(-1),
        }


def wrapper():
    weights = np.zeros((4, 26), dtype=np.float64)
    weights[0, 0] = 1
    weights[1, 1] = 2
    return PredictedRootCascade(
        ForcedRoots(),
        np.zeros(26, dtype=np.float32),
        np.ones(26, dtype=np.float32),
        {"mean": np.zeros(26), "std": np.ones(26), "weight": weights, "bias": np.zeros(4)},
    ).eval()


def outputs(model, features):
    with torch.inference_mode():
        return {
            name: value.numpy()
            for name, value in zip(OUTPUTS, model(torch.from_numpy(features)), strict=True)
        }


def test_wrapper_rotates_raw_features_from_predicted_roots_and_keeps_n_baseline():
    model = wrapper()
    features = np.zeros((1, 3, 26), dtype=np.float32)
    features[0, :, 0] = 1
    features[0, :, 25] = [0, 11, 12]
    result = outputs(model, features)
    assert result["quality_logits"].dtype == np.float64
    assert result["triad_decision"].dtype == np.int64
    np.testing.assert_array_equal(result["triad_decision"], [[1, 2, 6]])
    np.testing.assert_array_equal(result["quality_logits"][0, :2, :2], [[1, 0], [0, 2]])
    expected = ForcedRoots()(torch.from_numpy(features))
    for name in ("root", "seventh", "bass", "extensions", "boundary"):
        np.testing.assert_array_equal(result[name], expected[name].numpy())
    np.testing.assert_array_equal(result["baseline_triad"], expected["triad"].numpy())


def test_float64_branch_keeps_decision_lost_by_float32_rounding():
    model = wrapper()
    model.quality_weight[0, 0] = 1
    model.quality_weight[1, 0] = 1 + 1e-8
    features = np.zeros((1, 1, 26), dtype=np.float32)
    features[0, 0, 0] = 1
    actual = outputs(model, features)
    assert actual["triad_decision"][0, 0] == 2
    assert actual["quality_logits"].astype(np.float32).argmax(-1)[0, 0] + 1 == 1


def test_mixed_precision_graph_exports_dynamic_frames_with_strict_decisions(tmp_path):
    model = wrapper()
    path = tmp_path / "model.onnx"
    export_graph(model, path)
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(path), options, providers=["CPUExecutionProvider"])
    for size in (1, 17, 129):
        features = np.zeros((1, size, 26), dtype=np.float32)
        features[0, :, 0] = 1
        features[0, :, 25] = np.arange(size) % 13
        expected = outputs(model, features)
        actual = dict(zip(OUTPUTS, session.run(None, {"features": features}), strict=True))
        comparison = compare_case(expected, actual)
        assert comparison["passed"], comparison
        assert actual["quality_logits"].dtype == np.float64


def test_parity_cannot_hide_decision_change_or_cast_quality_under_close_logits():
    features = np.zeros((1, 1, 26), dtype=np.float32)
    expected = outputs(wrapper(), features)
    actual = {key: value.copy() for key, value in expected.items()}
    actual["triad_decision"][0, 0] += 1
    assert not compare_case(expected, actual)["passed"]
    actual = {key: value.copy() for key, value in expected.items()}
    actual["quality_logits"] = actual["quality_logits"].astype(np.float32)
    assert not compare_case(expected, actual)["passed"]
    actual = {key: value.copy() for key, value in expected.items()}
    actual["root"][0, 0, 0] += 0.01
    assert not compare_case(expected, actual)["passed"]


def test_retained_comparison_enforces_original_sigmoid_rounding_and_all_decisions():
    features = np.zeros((1, 1, 26), dtype=np.float32)
    features[0, 0, 0] = 1
    actual = outputs(wrapper(), features)
    actual["extensions"] = np.array([[[-1.0, -1e-8, 0.0, 1.0]]], dtype=np.float32)
    retained = {
        "baseline_root": np.array([0]),
        "baseline_triad": np.array([6]),
        "baseline_seventh": np.array([0]),
        "baseline_bass": np.array([0]),
        "baseline_extensions": np.array([[0, 1, 1, 1]]),
        "baseline_boundary": torch.sigmoid(torch.tensor([1.0])).numpy(),
        "candidate_triad": np.array([1]),
    }
    assert compare_retained(actual, retained)["passed"]
    retained["candidate_triad"][0] = 2
    assert not compare_retained(actual, retained)["passed"]


def test_export_failure_and_completion_headroom_error_keep_preflight_and_report(
    tmp_path, monkeypatch
):
    import hashlib
    import json
    from pathlib import Path

    import harmonia_ml.export.predicted_root as study

    config = json.loads(Path("experiments/E010-onnx-cascade.json").read_text())
    manifest, records, saved = {"records": []}, [], {}
    for i in range(14, 19):
        track = f"Schubert_D911-{i:02}_HU33"
        prepared = tmp_path / f"{track}.npz"
        prepared.write_bytes(b"hash-only input; no real arrays")
        row = {
            "split": "validation",
            "track_id": track,
            "composition_id": f"Schubert_D911-{i:02}",
            "prepared_file": prepared.name,
            "prepared_sha256": hashlib.sha256(prepared.read_bytes()).hexdigest(),
            "duration_seconds": 1,
        }
        records.append(row)
        saved[track] = {
            "predictions_path": str(prepared),
            "predictions_sha256": row["prepared_sha256"],
        }
    manifest["records"] = records
    source = tmp_path / "manifest.json"
    source.write_text(json.dumps(manifest))
    preflight = tmp_path / "preflight.json"
    preflight.write_text("{}")
    report = tmp_path / "retained.json"
    report.write_text(
        json.dumps(
            {
                "status": "completed",
                "fit": {"converged": True},
                "preflight_sha256": hashlib.sha256(preflight.read_bytes()).hexdigest(),
                "tracks": saved,
            }
        )
    )
    quality = tmp_path / "quality.npz"
    np.savez(
        quality, mean=np.zeros(26), std=np.ones(26), weight=np.zeros((4, 26)), bias=np.zeros(4)
    )
    checkpoint = tmp_path / "checkpoint.pt"
    checkpoint.write_bytes(b"hash only; no model deserialization")
    for name, path in (
        ("manifest", source),
        ("retained_report", report),
        ("quality", quality),
        ("checkpoint", checkpoint),
    ):
        config[name], config[f"{name}_sha256"] = (
            str(path),
            hashlib.sha256(path.read_bytes()).hexdigest(),
        )
    config["output"] = str(tmp_path / "new-output")
    config_path = tmp_path / "config.json"
    config_path.write_text(json.dumps(config))
    monkeypatch.setattr(torch, "set_num_interop_threads", lambda count: None)
    monkeypatch.setattr(
        study,
        "load_baseline",
        lambda *args: (
            ForcedRoots(),
            {
                "normalization_mean": np.zeros(26, dtype=np.float32),
                "normalization_std": np.ones(26, dtype=np.float32),
            },
        ),
    )
    calls = 0

    def check(self):
        nonlocal calls
        calls += 1
        if calls == 3:
            raise MemoryError("constructed completion headroom breach")

    def fail_export(model, path):
        raise RuntimeError("constructed exporter failure")

    monkeypatch.setattr(study.Resources, "check", check)
    monkeypatch.setattr(study, "export_graph", fail_export)
    import pytest

    with pytest.raises(RuntimeError, match="constructed exporter failure"):
        study.run(config_path)
    output = tmp_path / "new-output"
    assert (output / "preflight.json").exists()
    result = json.loads((output / "report.json").read_text())
    assert result["status"] == "failed_resources"
    assert result["error"].endswith("constructed exporter failure")
    assert len(result["remaining_cases_unexecuted"]) == 10
    assert not (output / "model.onnx").exists()
