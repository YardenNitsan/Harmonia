"""D003: one train-only nonlinear residual on immutable oracle-root D001 controls."""

from __future__ import annotations

import argparse
import json
import os
import platform
import time
import zipfile
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import torch
from torch import nn

from experiments.root_relative_probe import (
    Resources,
    digest,
    fold_normalization,
    load_training_tracks,
    metrics,
    save_new,
    transform,
)


class ResidualQuality(nn.Module):
    def __init__(self, weight: np.ndarray, bias: np.ndarray, seed: int):
        super().__init__()
        if weight.shape != (4, 26) or bias.shape != (4,):
            raise ValueError("Unexpected frozen control shape")
        if not np.isfinite(weight).all() or not np.isfinite(bias).all():
            raise ValueError("Nonfinite frozen control")
        self.register_buffer("control_weight", torch.from_numpy(weight.copy()).to(torch.float64))
        self.register_buffer("control_bias", torch.from_numpy(bias.copy()).to(torch.float64))
        with torch.random.fork_rng(devices=[]):
            torch.manual_seed(seed)
            self.hidden = nn.Linear(26, 16, dtype=torch.float64)
            self.output = nn.Linear(16, 4, dtype=torch.float64)
            nn.init.xavier_uniform_(self.hidden.weight)
            nn.init.zeros_(self.hidden.bias)
            nn.init.zeros_(self.output.weight)
            nn.init.zeros_(self.output.bias)

    def control(self, x: torch.Tensor) -> torch.Tensor:
        return nn.functional.linear(x, self.control_weight, self.control_bias)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.control(x) + self.output(torch.tanh(self.hidden(x)))


def checked_normalization(tracks: list[dict], heldout: set[int], mean, std) -> None:
    actual = fold_normalization(tracks, heldout, "root_relative")
    if not np.array_equal(mean, actual[0]) or not np.array_equal(std, actual[1]):
        raise ValueError("Frozen D001 normalization differs from fold-only values")


def quality_metrics(truth: np.ndarray, predicted: np.ndarray) -> dict:
    result = metrics(truth, predicted)
    confusion = np.asarray(result["confusion"])
    result["recall"] = [
        v if n else None for v, n in zip(result["recall"], result["support"], strict=True)
    ]
    result["precision"] = [
        v if n else None for v, n in zip(result["precision"], confusion.sum(0), strict=True)
    ]
    return result


def assess(control: dict, candidate: dict, converged: bool, config: dict) -> dict:
    gains = {
        "major_recall": candidate["recall"][0] - control["recall"][0],
        "minor_recall": candidate["recall"][1] - control["recall"][1],
        "diminished_recall": candidate["recall"][2] - control["recall"][2],
        "macro_recall": candidate["macro_recall_present_classes"]
        - control["macro_recall_present_classes"],
        "accuracy": candidate["accuracy"] - control["accuracy"],
    }
    limits = {
        "major_recall": config["minimum_major_recall_gain"],
        "minor_recall": -config["maximum_minor_recall_loss"],
        "diminished_recall": -config["maximum_diminished_recall_loss"],
        "macro_recall": config["minimum_macro_recall_gain"],
        "accuracy": config["minimum_accuracy_gain"],
    }
    gates = {k: v >= limits[k] for k, v in gains.items()}
    return {
        "gains": gains,
        "gates": gates,
        "all_folds_converged": converged,
        "decision": "inconclusive"
        if not converged
        else (
            "supports_separate_predicted_root_investigation"
            if all(gates.values())
            else "no_signal_under_declared_tradeoff"
        ),
    }


def fit_residual(model, x, y, config: dict, resources: Resources) -> dict:
    optimizer = torch.optim.LBFGS(
        model.parameters(),
        lr=1,
        max_iter=config["max_iterations"],
        max_eval=config["max_evaluations"],
        tolerance_grad=1e-8,
        tolerance_change=1e-12,
        history_size=100,
        line_search_fn="strong_wolfe",
    )
    history = []
    started = time.perf_counter()

    def objective():
        resources.check()
        optimizer.zero_grad()
        value = nn.functional.cross_entropy(model(x), y)
        value = (
            value + config["residual_l2"] * sum(p.square().sum() for p in model.parameters()) / 2
        )
        if not torch.isfinite(value):
            raise ValueError("Nonfinite objective; abort D003")
        value.backward()
        if any(p.grad is None or not torch.isfinite(p.grad).all() for p in model.parameters()):
            raise ValueError("Nonfinite objective gradient; abort D003")
        history.append(float(value.detach()))
        return value

    optimizer.step(objective)
    final = float(objective().detach())
    gradient = max(float(p.grad.abs().max()) for p in model.parameters())
    return {
        "iterations": optimizer.state[model.hidden.weight]["n_iter"],
        "objective_evaluations": len(history),
        "objective_history": history,
        "final_objective": final,
        "gradient_infinity_norm": gradient,
        "converged": gradient <= config["convergence_gradient_infinity_max"],
        "fit_seconds": time.perf_counter() - started,
    }


def load_control(config: dict) -> tuple[dict, list[dict]]:
    path = Path(config["control_report"])
    if digest(path) != config["control_report_sha256"]:
        raise ValueError("Frozen D001 control report changed")
    control = json.loads(path.read_text())
    folds = [f for f in control["folds"] if f["arm"] == "root_relative"]
    if control["status"] != "completed" or not control["all_folds_converged"] or len(folds) != 4:
        raise ValueError("Incomplete D001 controls")
    for index, fold in enumerate(folds):
        if fold["fold"] != index or fold["heldout"] != config["folds"][index]:
            raise ValueError("D001 control fold identity mismatch")
        if digest(Path(fold["checkpoint"])) != fold["checkpoint_sha256"]:
            raise ValueError("Frozen D001 control checkpoint changed")
    return control, folds


def run(config_path: Path) -> dict:
    config = json.loads(config_path.read_text())
    if (
        config["folds"] != [[2, 6, 10], [3, 7, 11], [4, 8, 12], [5, 9, 13]]
        or config["hidden_units"] != 16
    ):
        raise ValueError("Declared folds or architecture changed")
    manifest = Path(config["manifest"])
    if digest(manifest) != config["manifest_sha256"]:
        raise ValueError("Frozen training manifest changed")
    control, controls = load_control(config)
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    torch.use_deterministic_algorithms(True)
    resources = Resources(config["minimum_available_ram_bytes"])
    resources.check()
    output = Path(config["output"])
    checkpoints = Path(config["checkpoint_dir"])
    if checkpoints.exists():
        raise ValueError("Refusing to overwrite D003 checkpoints")
    output.mkdir(parents=True, exist_ok=False)
    sources = [
        config_path,
        Path(config["protocol"]),
        Path(__file__),
        Path("experiments/root_relative_probe.py"),
        Path("experiments/d003_watchdog.py"),
        Path("tests/test_residual_quality_probe.py"),
    ]
    hashes = {str(p.resolve().relative_to(Path.cwd())): digest(p) for p in sources}
    dependencies = {
        str(manifest): digest(manifest),
        config["control_report"]: digest(Path(config["control_report"])),
    }
    dependencies.update({f["checkpoint"]: f["checkpoint_sha256"] for f in controls})
    archive = output / "source-snapshot.zip"
    with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED) as saved:
        for path, expected in hashes.items():
            if digest(Path(path)) != expected:
                raise ValueError("Source changed before preflight")
            saved.writestr(path.replace("\\", "/"), Path(path).read_bytes())
    save_new(
        output / "source-preflight.json",
        {
            "study": config["study_id"],
            "frozen_at_utc": datetime.now(UTC).isoformat(),
            "stage": "before training-array access and optimization",
            "source_sha256": hashes,
            "dependency_sha256": dependencies,
            "source_archive_sha256": digest(archive),
            "python": platform.python_version(),
            "numpy": np.__version__,
            "torch": torch.__version__,
            "threads_environment": {
                k: os.environ.get(k)
                for k in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS")
            },
            "watchdog_seconds": config["watchdog_seconds"],
            "resources": resources.report(),
        },
    )
    tracks = load_training_tracks(manifest)
    save_new(
        output / "input-preflight.json",
        {
            "study": config["study_id"],
            "stage": "before optimization",
            "prepared_splits_read": ["train"],
            "source_preflight_sha256": digest(output / "source-preflight.json"),
            "inputs": [{k: t[k] for k in ("composition", "path", "sha256")} for t in tracks],
            "support": np.bincount(
                np.concatenate([t["labels"] for t in tracks]), minlength=4
            ).tolist(),
        },
    )
    checkpoints.mkdir(parents=True, exist_ok=False)
    report = {
        "study": config["study_id"],
        "status": "running",
        "folds": [],
        "candidate_compositions": {},
        "input_preflight_sha256": digest(output / "input-preflight.json"),
        "control": control["arms"]["root_relative"],
        "trainable_parameters": 500,
        "total_parameters": 608,
    }
    try:
        truths, predictions, baseline_predictions = [], [], []
        for fold, frozen in enumerate(controls):
            resources.check()
            held = set(frozen["heldout"])
            with np.load(frozen["checkpoint"], allow_pickle=False) as source:
                weight, bias, mean, std = (
                    source[k].copy() for k in ("weight", "bias", "mean", "std")
                )
            checked_normalization(tracks, held, mean, std)
            training = [t for t in tracks if t["composition"] not in held]

            def values(t, mean=mean, std=std):
                return (transform(t["features"], t["root"], "root_relative") - mean) / std

            x = torch.from_numpy(np.concatenate([values(t) for t in training]))
            y = torch.from_numpy(np.concatenate([t["labels"] for t in training]))
            model = ResidualQuality(weight, bias, config["seed"] + fold)
            baselines = {}
            for track in tracks:
                if track["composition"] not in held:
                    continue
                with torch.no_grad():
                    baseline = model.control(torch.from_numpy(values(track))).argmax(1).numpy()
                original = report["control"]["compositions"][str(track["composition"])]
                if quality_metrics(track["labels"], baseline)["confusion"] != original["confusion"]:
                    raise ValueError("Frozen D001 composition control prediction mismatch")
                baselines[track["composition"]] = baseline
            fit = fit_residual(model, x, y, config, resources)
            with torch.no_grad():
                fit["training_fit"] = quality_metrics(y.numpy(), model(x).argmax(1).numpy())
            fold_truth, fold_predictions = [], []
            for track in tracks:
                if track["composition"] not in held:
                    continue
                with torch.no_grad():
                    tensor = torch.from_numpy(values(track))
                    candidate = model(tensor).argmax(1).numpy()
                baseline = baselines[track["composition"]]
                report["candidate_compositions"][str(track["composition"])] = quality_metrics(
                    track["labels"], candidate
                )
                artifact = checkpoints / f"composition-{track['composition']:02}-oof.npz"
                np.savez(artifact, truth=track["labels"], baseline=baseline, candidate=candidate)
                report["candidate_compositions"][str(track["composition"])].update(
                    predictions=str(artifact), predictions_sha256=digest(artifact)
                )
                fold_truth.append(track["labels"])
                fold_predictions.append(candidate)
                baseline_predictions.append(baseline)
            truth, prediction = np.concatenate(fold_truth), np.concatenate(fold_predictions)
            checkpoint = checkpoints / f"residual-fold-{fold}.npz"
            np.savez(
                checkpoint,
                **{k: v.detach().numpy() for k, v in model.state_dict().items()},
                mean=mean,
                std=std,
            )
            if not np.array_equal(model.control_weight.numpy(), weight) or not np.array_equal(
                model.control_bias.numpy(), bias
            ):
                raise ValueError("Frozen control parameters changed")
            fit.update(
                fold=fold,
                heldout=frozen["heldout"],
                seed=config["seed"] + fold,
                training_compositions=[t["composition"] for t in training],
                normalization_frames=len(y),
                checkpoint=str(checkpoint),
                checkpoint_sha256=digest(checkpoint),
                heldout_metrics=quality_metrics(truth, prediction),
                unseen_training_classes_with_heldout_support=np.flatnonzero(
                    (np.bincount(y.numpy(), minlength=4) == 0)
                    & (np.bincount(truth, minlength=4) > 0)
                ).tolist(),
            )
            report["folds"].append(fit)
            truths.append(truth)
            predictions.append(prediction)
            print(
                json.dumps(
                    {
                        k: fit[k]
                        for k in ("fold", "converged", "gradient_infinity_norm", "fit_seconds")
                    }
                ),
                flush=True,
            )
        truth = np.concatenate(truths)
        paired_control = quality_metrics(truth, np.concatenate(baseline_predictions))
        if paired_control["confusion"] != report["control"]["pooled_oof"]["confusion"]:
            raise ValueError("Frozen D001 pooled control prediction mismatch")
        candidate = quality_metrics(truth, np.concatenate(predictions))
        report.update(
            status="completed",
            candidate_pooled_oof=candidate,
            control_predictions_match=True,
            **assess(
                report["control"]["pooled_oof"],
                candidate,
                all(f["converged"] for f in report["folds"]),
                config,
            ),
        )
    except Exception as error:
        report.update(
            status="failed", decision="inconclusive", error=f"{type(error).__name__}: {error}"
        )
        raise
    finally:
        report["resources"] = resources.report()
        report["source_control_unchanged"] = all(
            digest(Path(p)) == h for p, h in {**hashes, **dependencies}.items()
        )
        report["training_inputs_unchanged"] = all(
            digest(Path(t["path"])) == t["sha256"] for t in tracks
        )
        if not report["source_control_unchanged"] or not report["training_inputs_unchanged"]:
            report.update(status="integrity_failed", decision="inconclusive")
        save_new(output / "report.json", report)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", type=Path)
    args = parser.parse_args()
    result = run(args.config)
    raise SystemExit(0 if result["status"] == "completed" else 1)
