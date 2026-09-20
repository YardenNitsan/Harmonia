import json
import subprocess

import numpy as np
import pytest
import torch

from experiments.d003_watchdog import supervise
from experiments.residual_quality_probe import (
    ResidualQuality,
    assess,
    checked_normalization,
    fit_residual,
    quality_metrics,
)
from experiments.root_relative_probe import Resources


def test_zero_output_residual_exactly_preserves_control_and_freezes_its_parameters():
    weight = np.arange(104, dtype=float).reshape(4, 26) / 100
    bias = np.arange(4, dtype=float)
    model = ResidualQuality(weight, bias, 17)
    x = torch.arange(52, dtype=torch.float64).reshape(2, 26) / 10
    torch.testing.assert_close(
        model(x), x @ torch.from_numpy(weight).T + torch.from_numpy(bias), rtol=0, atol=0
    )
    assert sum(p.numel() for p in model.parameters()) == 500
    model(x).sum().backward()
    assert model.control_weight.grad is model.control_bias.grad is None
    duplicate = ResidualQuality(weight, bias, 17)
    torch.testing.assert_close(model.hidden.weight, duplicate.hidden.weight, rtol=0, atol=0)


def test_preserved_normalization_rejects_even_small_change_and_ignores_heldout_values():
    tracks = [
        {"composition": 2, "features": np.zeros((2, 26)), "root": np.zeros(2, dtype=int)},
        {"composition": 3, "features": np.full((2, 26), 1e12), "root": np.zeros(2, dtype=int)},
    ]
    checked_normalization(tracks, {3}, np.zeros(26), np.full(26, 1e-4))
    with pytest.raises(ValueError, match="normalization"):
        checked_normalization(tracks, {3}, np.full(26, 1e-10), np.full(26, 1e-4))


def test_absent_quality_is_null_and_present_augmented_remains_in_macro():
    m = quality_metrics(np.array([0, 0, 1, 3]), np.array([0, 1, 1, 0]))
    assert m["recall"] == [0.5, 1.0, None, 0.0]
    assert m["macro_recall_present_classes"] == 0.5
    assert m["precision"][2] is None


def test_major_gain_cannot_hide_minor_regression_or_nonconvergence():
    config = {
        "minimum_major_recall_gain": 0.03,
        "maximum_minor_recall_loss": 0.02,
        "maximum_diminished_recall_loss": 0.02,
        "minimum_macro_recall_gain": 0.005,
        "minimum_accuracy_gain": 0.0,
    }
    control = {"recall": [0.8, 0.7, 0.3, 0], "accuracy": 0.73, "macro_recall_present_classes": 0.45}
    candidate = {
        "recall": [0.9, 0.6, 0.4, 0],
        "accuracy": 0.74,
        "macro_recall_present_classes": 0.475,
    }
    assert (
        assess(control, candidate, True, config)["decision"] == "no_signal_under_declared_tradeoff"
    )
    candidate["recall"][1] = 0.7
    assert (
        assess(control, candidate, True, config)["decision"]
        == "supports_separate_predicted_root_investigation"
    )
    assert assess(control, candidate, False, config)["decision"] == "inconclusive"


def test_one_iteration_is_not_accepted_as_convergence_and_control_stays_identical():
    model = ResidualQuality(np.zeros((4, 26)), np.zeros(4), 3)
    config = {
        "max_iterations": 1,
        "max_evaluations": 2,
        "residual_l2": 1e-4,
        "convergence_gradient_infinity_max": 1e-5,
    }
    result = fit_residual(
        model,
        torch.zeros((8, 26), dtype=torch.float64),
        torch.zeros(8, dtype=torch.int64),
        config,
        Resources(1),
    )
    assert result["converged"] is False
    assert result["gradient_infinity_norm"] > 1e-5
    assert torch.count_nonzero(model.control_weight) == torch.count_nonzero(model.control_bias) == 0


def test_nonfinite_input_aborts_without_metrics():
    model = ResidualQuality(np.zeros((4, 26)), np.zeros(4), 3)
    config = {
        "max_iterations": 1,
        "max_evaluations": 2,
        "residual_l2": 1e-4,
        "convergence_gradient_infinity_max": 1e-5,
    }
    with pytest.raises(ValueError, match="Nonfinite objective"):
        fit_residual(
            model,
            torch.full((8, 26), float("nan"), dtype=torch.float64),
            torch.zeros(8, dtype=torch.int64),
            config,
            Resources(1),
        )


def test_external_watchdog_kills_and_reaps_timeout_and_refuses_repeat(tmp_path, monkeypatch):
    config = tmp_path / "config.json"
    output = tmp_path / "results"
    config.write_text(
        json.dumps(
            {
                "output": str(output),
                "checkpoint_dir": str(tmp_path / "checkpoints"),
                "watchdog_seconds": 600,
            }
        )
    )
    calls = []

    class Child:
        def wait(self, timeout=None):
            calls.append(("wait", timeout))
            if timeout is not None:
                raise subprocess.TimeoutExpired("fixture", timeout)
            return -9

        def kill(self):
            calls.append(("kill", None))

    def spawn(command, **kwargs):
        assert (
            kwargs["env"]["OMP_NUM_THREADS"]
            == kwargs["env"]["MKL_NUM_THREADS"]
            == kwargs["env"]["OPENBLAS_NUM_THREADS"]
            == "2"
        )
        return Child()

    monkeypatch.setattr(subprocess, "Popen", spawn)
    assert supervise(config) == 124
    assert calls == [("wait", 600), ("kill", None), ("wait", None)]
    assert json.loads((output / "watchdog.json").read_text())["timed_out"] is True
    with pytest.raises(ValueError, match="overwrite"):
        supervise(config)


def test_external_watchdog_reaps_child_on_interruption(tmp_path, monkeypatch):
    config = tmp_path / "config.json"
    config.write_text(
        json.dumps(
            {
                "output": str(tmp_path / "results"),
                "checkpoint_dir": str(tmp_path / "checkpoints"),
                "watchdog_seconds": 600,
            }
        )
    )
    calls = []

    class Child:
        def wait(self, timeout=None):
            calls.append(("wait", timeout))
            if timeout is not None:
                raise KeyboardInterrupt
            return -9

        def kill(self):
            calls.append(("kill", None))

    monkeypatch.setattr(subprocess, "Popen", lambda *args, **kwargs: Child())
    with pytest.raises(KeyboardInterrupt):
        supervise(config)
    assert calls == [("wait", 600), ("kill", None), ("wait", None)]
