"""D002: fixed train-only oracle-root bass-interval diagnostic."""

from __future__ import annotations

import argparse
import json
import os
import platform
import zipfile
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import torch
from torch import nn

from experiments.root_relative_probe import Resources, digest, save_new, transform


def load_training(manifest_path: Path) -> list[dict]:
    records = json.loads(manifest_path.read_text())["records"]
    tracks = []
    for record in records:
        if record["split"] != "train":
            continue
        composition = int(record["composition_id"].removeprefix("Schubert_D911-"))
        name = f"Schubert_D911-{composition:02}_HU33.npz"
        if composition not in range(2, 14) or record["prepared_file"] != name:
            raise ValueError("Unexpected training identity")
        path = manifest_path.parent / name
        if digest(path) != record["prepared_sha256"]:
            raise ValueError("Training file hash changed")
        with np.load(path, allow_pickle=False) as source:
            mask = source["mask"]
            if mask.dtype != np.bool_ or mask.shape != (len(source["features"]),):
                raise ValueError("Expected frame-aligned explicit boolean mask")
            features = source["features"][mask].astype(np.float64)
            root = source["root"][mask].astype(np.int64)
            bass = source["bass"][mask].astype(np.int64)
        if features.shape[1] != 26 or not np.isfinite(features).all() or not len(root):
            raise ValueError("Invalid training features")
        if np.any((root < 0) | (root > 11)) or np.any((bass < 0) | (bass > 11)):
            raise ValueError("Non-tonal targets differ from declared diagnostic")
        tracks.append(
            {
                "composition": composition,
                "features": features,
                "root": root,
                "labels": (bass - root) % 12,
                "path": str(path),
                "sha256": record["prepared_sha256"],
            }
        )
    if sorted(t["composition"] for t in tracks) != list(range(2, 14)):
        raise ValueError("Expected exactly twelve unique training compositions")
    return tracks


def feature_values(track: dict, arm: str) -> np.ndarray:
    return np.concatenate(
        (
            transform(track["features"], track["root"], arm),
            np.eye(12, dtype=np.float64)[track["root"]],
        ),
        axis=1,
    )


def normalize_fold(tracks: list[dict], heldout: set[int], arm: str) -> tuple:
    values = np.concatenate(
        [feature_values(t, arm) for t in tracks if t["composition"] not in heldout]
    )
    return values.mean(axis=0), np.maximum(values.std(axis=0), 1e-4)


def bass_metrics(truth: np.ndarray, predicted: np.ndarray) -> dict:
    confusion = np.zeros((12, 12), dtype=np.int64)
    np.add.at(confusion, (truth, predicted), 1)
    support = confusion.sum(axis=1)
    recalls = [int(confusion[i, i]) / int(support[i]) if support[i] else None for i in range(12)]
    inversion, position = truth != 0, truth == 0
    detected = predicted != 0
    present = [value for value in recalls if value is not None]
    present_inversions = [value for value in recalls[1:] if value is not None]
    return {
        "frames": len(truth),
        "reference_support": support.tolist(),
        "prediction_support": confusion.sum(axis=0).tolist(),
        "confusion": confusion.tolist(),
        "per_interval_recall": recalls,
        "exact_interval_accuracy": float(np.mean(truth == predicted)) if len(truth) else None,
        "present_class_macro_recall": float(np.mean(present)) if present else None,
        "inverted_frames": int(inversion.sum()),
        "root_position_frames": int(position.sum()),
        "inverted_frame_exact_accuracy": float(np.mean(truth[inversion] == predicted[inversion]))
        if inversion.any()
        else None,
        "inversion_only_macro_recall": float(np.mean(present_inversions))
        if present_inversions
        else None,
        "root_position_exact_accuracy": float(np.mean(predicted[position] == 0))
        if position.any()
        else None,
        "inversion_detection_precision": float(np.mean(inversion[detected]))
        if detected.any()
        else None,
        "inversion_detection_recall": float(np.mean(detected[inversion]))
        if inversion.any()
        else None,
        "false_inversion_rate_on_root_position": float(np.mean(detected[position]))
        if position.any()
        else None,
    }


def fit_linear(x: torch.Tensor, y: torch.Tensor, config: dict, resources: Resources) -> tuple:
    model = nn.Linear(38, 12, dtype=torch.float64)
    nn.init.zeros_(model.weight)
    nn.init.zeros_(model.bias)
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

    def objective():
        resources.check()
        optimizer.zero_grad()
        value = nn.functional.cross_entropy(model(x), y)
        value = (
            value
            + config["l2_weights_and_biases"]
            * (model.weight.square().sum() + model.bias.square().sum())
            / 2
        )
        if not torch.isfinite(value):
            raise ValueError("Nonfinite objective; abort the declared diagnostic")
        value.backward()
        if any(p.grad is None or not torch.isfinite(p.grad).all() for p in model.parameters()):
            raise ValueError("Nonfinite objective gradient; abort the declared diagnostic")
        history.append(float(value.detach()))
        return value

    optimizer.step(objective)
    final = float(objective().detach())
    gradient = max(float(p.grad.abs().max()) for p in model.parameters())
    return model, {
        "iterations": optimizer.state[model.weight]["n_iter"],
        "objective_evaluations": len(history),
        "objective_history": history,
        "final_objective": final,
        "gradient_infinity_norm": gradient,
        "converged": gradient <= config["convergence_gradient_infinity_max"],
    }


def run(config_path: Path) -> dict:
    config = json.loads(config_path.read_text())
    manifest = Path(config["manifest"])
    if digest(manifest) != config["manifest_sha256"]:
        raise ValueError("Frozen manifest changed")
    if config["folds"] != [[2, 6, 10], [3, 7, 11], [4, 8, 12], [5, 9, 13]]:
        raise ValueError("Declared composition folds changed")
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    torch.use_deterministic_algorithms(True)
    resources = Resources(config["minimum_available_ram_bytes"])
    resources.check()
    output = Path(config["output"])
    output.mkdir(parents=True, exist_ok=False)
    paths = [
        config_path,
        Path(config["protocol"]),
        Path(__file__),
        Path("experiments/root_relative_probe.py"),
        Path("tests/test_relative_bass_probe.py"),
    ]
    source_hashes = {str(path.resolve().relative_to(Path.cwd())): digest(path) for path in paths}
    archive = output / "source-snapshot.zip"
    with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED) as saved:
        for path in paths:
            name = str(path.resolve().relative_to(Path.cwd()))
            if digest(path) != source_hashes[name]:
                raise ValueError("Source changed before preflight")
            saved.writestr(name.replace("\\", "/"), path.read_bytes())
    preflight = {
        "study": config["study_id"],
        "frozen_at_utc": datetime.now(UTC).isoformat(),
        "source_sha256": source_hashes,
        "source_archive_sha256": digest(archive),
        "manifest_sha256": digest(manifest),
        "stage": "before training-array access",
        "python": platform.python_version(),
        "numpy": np.__version__,
        "torch": torch.__version__,
        "threads_environment": {
            k: os.environ.get(k)
            for k in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS")
        },
        "resources": resources.report(),
    }
    save_new(output / "source-preflight.json", preflight)
    tracks = load_training(manifest)
    save_new(
        output / "input-preflight.json",
        {
            "study": config["study_id"],
            "stage": "before optimization",
            "prepared_splits_read": ["train"],
            "source_preflight_sha256": digest(output / "source-preflight.json"),
            "inputs": [{k: t[k] for k in ("composition", "path", "sha256")} for t in tracks],
            "support": bass_metrics(
                np.concatenate([t["labels"] for t in tracks]),
                np.zeros(sum(len(t["labels"]) for t in tracks), dtype=int),
            )["reference_support"],
        },
    )
    checkpoints = Path(config["checkpoint_dir"])
    checkpoints.mkdir(parents=True, exist_ok=False)
    report = {
        "study": config["study_id"],
        "status": "running",
        "folds": [],
        "arms": {},
        "input_preflight_sha256": digest(output / "input-preflight.json"),
    }
    try:
        for arm in ("absolute", "root_relative"):
            all_truth, all_predictions, per_composition = [], [], {}
            for fold, held in enumerate(config["folds"]):
                resources.check()
                mean, std = normalize_fold(tracks, set(held), arm)
                training = [t for t in tracks if t["composition"] not in held]
                x = torch.from_numpy(
                    np.concatenate([(feature_values(t, arm) - mean) / std for t in training])
                )
                y = torch.from_numpy(np.concatenate([t["labels"] for t in training]))
                model, fit = fit_linear(x, y, config, resources)
                train_support = np.bincount(y.numpy(), minlength=12)
                with torch.no_grad():
                    fit["training_fit"] = bass_metrics(y.numpy(), model(x).argmax(1).numpy())
                truth, predictions = [], []
                for track in tracks:
                    if track["composition"] not in held:
                        continue
                    values = torch.from_numpy((feature_values(track, arm) - mean) / std)
                    with torch.no_grad():
                        estimate = model(values).argmax(1).numpy()
                    per_composition[str(track["composition"])] = bass_metrics(
                        track["labels"], estimate
                    )
                    truth.append(track["labels"])
                    predictions.append(estimate)
                truth, predictions = np.concatenate(truth), np.concatenate(predictions)
                held_support = np.bincount(truth, minlength=12)
                checkpoint = checkpoints / f"{arm}-fold-{fold}.npz"
                np.savez(
                    checkpoint,
                    weight=model.weight.detach().numpy(),
                    bias=model.bias.detach().numpy(),
                    mean=mean,
                    std=std,
                )
                fit.update(
                    arm=arm,
                    fold=fold,
                    heldout=held,
                    training_compositions=[t["composition"] for t in training],
                    normalization_frames=len(y),
                    normalization_mean=mean.tolist(),
                    normalization_std=std.tolist(),
                    heldout_metrics=bass_metrics(truth, predictions),
                    unseen_training_intervals_with_heldout_support=np.flatnonzero(
                        (train_support == 0) & (held_support > 0)
                    ).tolist(),
                    checkpoint=str(checkpoint),
                    checkpoint_sha256=digest(checkpoint),
                )
                report["folds"].append(fit)
                all_truth.append(truth)
                all_predictions.append(predictions)
                print(
                    json.dumps(
                        {
                            "arm": arm,
                            "fold": fold,
                            "converged": fit["converged"],
                            "gradient_infinity_norm": fit["gradient_infinity_norm"],
                        }
                    ),
                    flush=True,
                )
            pooled_truth = np.concatenate(all_truth)
            report["arms"][arm] = {
                "pooled_oof": bass_metrics(pooled_truth, np.concatenate(all_predictions)),
                "compositions": per_composition,
            }
        truth = np.concatenate([t["labels"] for t in tracks])
        report["always_root_position"] = bass_metrics(truth, np.zeros_like(truth))
        control = report["arms"]["absolute"]["pooled_oof"]
        treatment = report["arms"]["root_relative"]["pooled_oof"]
        keys = [
            "inverted_frame_exact_accuracy",
            "inversion_only_macro_recall",
            "root_position_exact_accuracy",
        ]
        gains = {
            k: treatment[k] - control[k]
            if treatment[k] is not None and control[k] is not None
            else None
            for k in keys
        }
        thresholds = [
            config["minimum_inverted_exact_gain"],
            config["minimum_inversion_macro_gain"],
            -config["maximum_root_position_loss"],
        ]
        gates = {
            key: gains[key] >= threshold if gains[key] is not None else None
            for key, threshold in zip(keys, thresholds, strict=True)
        }
        converged = all(f["converged"] for f in report["folds"])
        decision = (
            "inconclusive"
            if not converged or None in gates.values()
            else (
                "supports_separate_predicted_root_investigation"
                if all(gates.values())
                else "no_signal_under_declared_tradeoff"
            )
        )
        report.update(
            status="completed",
            all_folds_converged=converged,
            gains=gains,
            gates=gates,
            decision=decision,
            interpretation=(
                "Oracle-root train-composition diagnostic; no deployment accuracy or promotion."
            ),
        )
    except Exception as error:
        report.update(status="failed", error=f"{type(error).__name__}: {error}")
        raise
    finally:
        report["resources"] = resources.report()
        report["source_unchanged"] = all(
            digest(Path(p)) == value for p, value in source_hashes.items()
        )
        report["training_inputs_unchanged"] = all(
            digest(Path(t["path"])) == t["sha256"] for t in tracks
        )
        if not report["source_unchanged"] or not report["training_inputs_unchanged"]:
            report.update(status="integrity_failed", decision="inconclusive")
        save_new(output / "report.json", report)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", type=Path)
    run(parser.parse_args().config)
