"""E010: bounded predicted-root quality cascade; never a product promotion."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import time
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import torch
from torch import nn

from experiments.root_relative_probe import (
    Resources,
    digest,
    load_training_tracks,
    save_new,
    transform,
)
from harmonia_ml.models.structured import StructuredChordModel

HEADS = ("root", "triad", "seventh", "bass", "extensions", "boundary")
CLASSES = ["none", "major", "minor", "diminished", "augmented", "sus2", "sus4", "power"]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def unchanged(path: str, expected: str) -> bool:
    try:
        return digest(Path(path)) == expected
    except OSError:
        return False


def valid_features(features: np.ndarray) -> None:
    require(
        features.ndim == 2
        and features.shape[1] == 26
        and 0 < len(features) <= 100000
        and np.isfinite(features).all(),
        "Invalid feature matrix",
    )


def cascade_predictions(features: np.ndarray, baseline: dict, quality: dict) -> dict:
    valid_features(features)
    roots = baseline["root"]
    require(
        roots.shape == (len(features),)
        and roots.dtype.kind in "iu"
        and np.all((roots >= 0) & (roots <= 12)),
        "Invalid predicted roots",
    )
    for key, shape in (("weight", (4, 26)), ("bias", (4,)), ("mean", (26,)), ("std", (26,))):
        require(
            quality[key].shape == shape and np.isfinite(quality[key]).all(),
            "Invalid quality coefficients",
        )
    require(np.all(quality["std"] >= 1e-4), "Invalid quality normalization")
    result = {head: values.copy() for head, values in baseline.items()}
    tonal = roots < 12
    if tonal.any():
        relative = transform(features[tonal].astype(np.float64), roots[tonal], "root_relative")
        values = (relative - quality["mean"]) / quality["std"]
        logits = values @ quality["weight"].T + quality["bias"]
        require(np.isfinite(logits).all(), "Nonfinite quality inference")
        result["triad"][tonal] = logits.argmax(axis=1) + 1
    return result


def quality_metrics(truth: np.ndarray, prediction: np.ndarray) -> dict:
    require(
        truth.shape == prediction.shape
        and truth.ndim == 1
        and truth.dtype.kind in "iu"
        and prediction.dtype.kind in "iu"
        and np.all((truth >= 0) & (truth < 8))
        and np.all((prediction >= 0) & (prediction < 8)),
        "Invalid quality labels",
    )
    confusion = np.zeros((8, 8), dtype=np.int64)
    np.add.at(confusion, (truth, prediction), 1)
    support, predicted_support = confusion.sum(1), confusion.sum(0)
    true_positive = confusion.diagonal()
    recall = [float(true_positive[i] / support[i]) if support[i] else None for i in range(8)]
    precision = [
        float(true_positive[i] / predicted_support[i]) if predicted_support[i] else 0.0
        for i in range(8)
    ]
    f1 = [
        2 * precision[i] * recall[i] / max(precision[i] + recall[i], 1e-12)
        if recall[i] is not None
        else None
        for i in range(8)
    ]
    present = np.flatnonzero(support).tolist()
    return {
        "frames": len(truth),
        "accuracy": float(np.mean(truth == prediction)) if len(truth) else None,
        "macro_recall_present_classes": float(np.mean([recall[i] for i in present]))
        if present
        else None,
        "present_classes": present,
        "classes": CLASSES,
        "support": support.tolist(),
        "prediction_support": predicted_support.tolist(),
        "recall": recall,
        "precision": precision,
        "f1": f1,
        "confusion": confusion.tolist(),
    }


def arm_metrics(truth: dict, prediction: dict, mask: np.ndarray) -> dict:
    exact = np.ones(len(mask), dtype=bool)
    for head in ("root", "triad", "seventh", "bass"):
        exact &= truth[head] == prediction[head]
    exact &= (truth["extensions"] == prediction["extensions"]).all(1)
    root_correct = truth["root"] == prediction["root"]
    inversion = (
        mask & (truth["root"] < 12) & (truth["bass"] < 12) & (truth["root"] != truth["bass"])
    )
    result = {
        "frames": int(mask.sum()),
        "quality": quality_metrics(truth["triad"][mask], prediction["triad"][mask]),
        "root_accuracy": float(root_correct[mask].mean()) if mask.any() else None,
        "reduced_structural_exact": float(exact[mask].mean()) if mask.any() else None,
        "inversion_frames": int(inversion.sum()),
        "inversion_reduced_exact": float(exact[inversion].mean()) if inversion.any() else None,
    }
    for name, condition in (("correct_root", root_correct), ("wrong_root", ~root_correct)):
        selected = mask & condition
        result[name] = {
            "frames": int(selected.sum()),
            "quality": quality_metrics(truth["triad"][selected], prediction["triad"][selected]),
        }
    return result


def paired_metrics(truth: dict, baseline: dict, candidate: dict, mask: np.ndarray) -> dict:
    require(mask.dtype == np.bool_ and mask.ndim == 1 and mask.any(), "Invalid validity mask")
    for values in (truth, baseline, candidate):
        for head in ("root", "triad", "seventh", "bass", "extensions"):
            shape = (len(mask), 4) if head == "extensions" else (len(mask),)
            require(values[head].shape == shape, "Invalid head dimensions")
    for head in HEADS:
        if head != "triad":
            require(
                baseline[head].dtype == candidate[head].dtype
                and baseline[head].tobytes() == candidate[head].tobytes(),
                f"Unchanged head invariant failed: {head}",
            )
    gate = baseline["root"] == 12
    require(np.array_equal(baseline["triad"][gate], candidate["triad"][gate]), "N gate changed")
    changed = mask & (baseline["triad"] != candidate["triad"])
    corrected = changed & (candidate["triad"] == truth["triad"])
    damaged = changed & (baseline["triad"] == truth["triad"])
    return {
        "baseline": arm_metrics(truth, baseline, mask),
        "candidate": arm_metrics(truth, candidate, mask),
        "changes": {
            "changed": int(changed.sum()),
            "corrected": int(corrected.sum()),
            "damaged": int(damaged.sum()),
        },
        "predicted_n_frames": int((gate & mask).sum()),
        "unchanged_heads_verified": True,
    }


def relative_normalization(features: np.ndarray, roots: np.ndarray) -> tuple:
    valid_features(features)
    require(
        roots.shape == (len(features),)
        and roots.dtype.kind in "iu"
        and np.all((roots >= 0) & (roots < 12)),
        "Invalid training roots",
    )
    relative = transform(features.astype(np.float64), roots, "root_relative")
    mean, std = relative.mean(0), np.maximum(relative.std(0), 1e-4)
    return (relative - mean) / std, mean, std


def require_convergence(gradient: float, maximum: float) -> None:
    require(np.isfinite(gradient) and 0 <= gradient <= maximum, "Quality fit did not converge")


def select_records(manifest: dict, split: str) -> list[dict]:
    require(split in ("train", "validation"), "Forbidden split")
    expected = list(range(2, 14) if split == "train" else range(14, 19))
    selected, identities = [], []
    for record in manifest["records"]:
        if record["split"] != split:
            continue
        composition = int(record["composition_id"].removeprefix("Schubert_D911-"))
        track = f"Schubert_D911-{composition:02}_HU33"
        require(
            composition in expected
            and record["composition_id"] == f"Schubert_D911-{composition:02}"
            and record["track_id"] == track
            and record["prepared_file"] == f"{track}.npz",
            "Unexpected source identity",
        )
        identities.append(composition)
        selected.append(record)
    require(sorted(identities) == expected, "Missing or duplicate source compositions")
    return sorted(selected, key=lambda row: row["track_id"])


def fit_quality(tracks: list[dict], config: dict, resources: Resources) -> tuple[dict, dict]:
    started = time.perf_counter()
    x, mean, std = relative_normalization(
        np.concatenate([t["features"] for t in tracks]), np.concatenate([t["root"] for t in tracks])
    )
    labels = np.concatenate([t["labels"] for t in tracks])
    require(
        labels.shape == (len(x),)
        and labels.dtype.kind in "iu"
        and np.all((labels >= 0) & (labels < 4)),
        "Invalid fit vocabulary",
    )
    values, target = torch.from_numpy(x), torch.from_numpy(labels)
    model = nn.Linear(26, 4, dtype=torch.float64)
    nn.init.zeros_(model.weight)
    nn.init.zeros_(model.bias)
    optimizer = torch.optim.LBFGS(
        model.parameters(),
        lr=1,
        max_iter=config["max_iterations"],
        max_eval=125,
        history_size=100,
        line_search_fn="strong_wolfe",
        tolerance_grad=1e-7,
        tolerance_change=1e-12,
    )
    history = []

    def objective():
        resources.check()
        optimizer.zero_grad()
        loss = nn.functional.cross_entropy(model(values), target)
        loss = loss + config["l2"] * model.weight.square().sum() / 2
        require(bool(torch.isfinite(loss)), "Nonfinite objective")
        loss.backward()
        history.append(float(loss.detach()))
        return loss

    optimizer.step(objective)
    final = float(objective().detach())
    gradient = max(float(parameter.grad.abs().max()) for parameter in model.parameters())
    quality = {
        "mean": mean,
        "std": std,
        "weight": model.weight.detach().numpy().copy(),
        "bias": model.bias.detach().numpy().copy(),
    }
    prediction = model(values).argmax(1).detach().numpy() + 1
    return quality, {
        "frames": len(x),
        "seconds": time.perf_counter() - started,
        "objective_history": history,
        "objective_evaluations": len(history),
        "iterations": optimizer.state[model.weight]["n_iter"],
        "final_objective": final,
        "gradient_infinity_norm": gradient,
        "converged": bool(
            np.isfinite(gradient) and gradient <= config["convergence_gradient_infinity_max"]
        ),
        "training_fit": quality_metrics(labels + 1, prediction),
    }


def load_baseline(checkpoint_path: Path, expected_hash: str) -> tuple:
    require(digest(checkpoint_path) == expected_hash, "Frozen E009 checkpoint changed")
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    require(
        checkpoint["experiment_id"] == "E009-hu33-context-tcn"
        and checkpoint["model_config"]
        == {"input_features": 26, "hidden_channels": 64, "blocks": 6, "dropout": 0.15}
        and checkpoint["feature_indices"] == list(range(26)),
        "Unexpected E009 architecture/features",
    )
    for name in ("normalization_mean", "normalization_std"):
        values = checkpoint[name]
        require(
            values.shape == (26,) and values.dtype == np.float32 and np.isfinite(values).all(),
            "Invalid E009 normalization",
        )
    require(np.all(checkpoint["normalization_std"] > 0), "Invalid E009 standard deviation")
    model = StructuredChordModel(**checkpoint["model_config"])
    model.load_state_dict(checkpoint["model_state"], strict=True)
    model.eval()
    return model, checkpoint


def baseline_predictions(model: nn.Module, checkpoint: dict, features: np.ndarray) -> dict:
    valid_features(features)
    values = (features.astype(np.float32) - checkpoint["normalization_mean"]) / checkpoint[
        "normalization_std"
    ]
    with torch.inference_mode():
        outputs = model(torch.from_numpy(values).unsqueeze(0))
    require(
        all(bool(torch.isfinite(value).all()) for value in outputs.values()),
        "Nonfinite E009 output",
    )
    result = {
        head: outputs[head].argmax(-1).squeeze(0).numpy()
        for head in ("root", "triad", "seventh", "bass")
    }
    result["extensions"] = (torch.sigmoid(outputs["extensions"]).squeeze(0).numpy() >= 0.5).astype(
        np.int64
    )
    result["boundary"] = torch.sigmoid(outputs["boundary"]).squeeze(0).numpy()
    return result


def run(config_path: Path) -> dict:
    config = json.loads(config_path.read_text())
    require(
        config["study_id"] == "E010-predicted-root-quality-cascade"
        and config["l2"] == 1e-4
        and config["max_iterations"] == 100
        and config["convergence_gradient_infinity_max"] == 1e-5
        and config["minimum_macro_gain"] == 0.05
        and config["maximum_exact_loss"] == 0.01
        and config["minimum_available_ram_bytes"] == 8 * 1024**3,
        "Scientific configuration changed",
    )
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    torch.use_deterministic_algorithms(True)
    resources = Resources(config["minimum_available_ram_bytes"])
    resources.check()
    manifest_path, checkpoint_path = Path(config["manifest"]), Path(config["checkpoint"])
    require(digest(manifest_path) == config["manifest_sha256"], "Frozen manifest changed")
    require(digest(checkpoint_path) == config["checkpoint_sha256"], "Frozen E009 changed")
    manifest = json.loads(manifest_path.read_text())
    train_records, validation_records = (
        select_records(manifest, "train"),
        select_records(manifest, "validation"),
    )
    inputs = {}
    for record in train_records + validation_records:
        path = manifest_path.parent / record["prepared_file"]
        require(
            path.resolve().parent == manifest_path.parent.resolve(), "Prepared path escaped dataset"
        )
        require(digest(path) == record["prepared_sha256"], "Prepared source hash changed")
        inputs[str(path)] = record["prepared_sha256"]
    source_paths = [
        config_path,
        Path(config["protocol"]),
        Path(__file__),
        Path("tests/test_predicted_root_cascade.py"),
        Path("experiments/root_relative_probe.py"),
        Path("harmonia_ml/models/structured.py"),
    ]
    frozen = {str(path): digest(path) for path in source_paths}
    frozen.update(inputs)
    frozen[str(manifest_path)], frozen[str(checkpoint_path)] = (
        config["manifest_sha256"],
        config["checkpoint_sha256"],
    )
    output, checkpoint_dir = Path(config["output"]), Path(config["checkpoint_dir"])
    require(not output.exists() and not checkpoint_dir.exists(), "E010 output already exists")
    output.mkdir(parents=True)
    checkpoint_dir.mkdir(parents=True)
    preflight = {
        "study_id": config["study_id"],
        "declared_utc": datetime.now(UTC).isoformat(),
        "config": config,
        "frozen_files": frozen,
        "prepared_splits_hashed": ["train", "validation"],
        "prepared_test_accessed": False,
        "python": platform.python_version(),
        "torch": torch.__version__,
        "numpy": np.__version__,
        "device": "cpu",
        "platform": platform.platform(),
        "processor": platform.processor(),
        "torch_threads": torch.get_num_threads(),
        "interop_threads": torch.get_num_interop_threads(),
        "deterministic_algorithms": torch.are_deterministic_algorithms_enabled(),
        "resources": resources.report(),
        "environment_threads": {
            key: os.environ.get(key)
            for key in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS")
        },
    }
    save_new(output / "preflight.json", preflight)
    report = {
        "study_id": config["study_id"],
        "status": "running",
        "preflight_sha256": digest(output / "preflight.json"),
        "validation_arrays_opened": False,
        "prepared_test_accessed": False,
        "tracks": {},
        "interpretation": (
            "Research diagnostic only; no model promotion or calibrated whole-chord confidence"
        ),
    }
    try:
        resources.check()
        tracks = load_training_tracks(manifest_path)
        quality, fit = fit_quality(tracks, config, resources)
        report["fit"] = fit
        quality_path = checkpoint_dir / "quality.npz"
        np.savez(quality_path, **quality)
        report["quality_checkpoint"] = {"path": str(quality_path), "sha256": digest(quality_path)}
        if not fit["converged"]:
            report.update(status="inconclusive_optimization", useful_research_signal=False)
            return report
        require_convergence(
            fit["gradient_infinity_norm"], config["convergence_gradient_infinity_max"]
        )
        resources.check()
        model, checkpoint = load_baseline(checkpoint_path, config["checkpoint_sha256"])
        pooled_truth, pooled_baseline, pooled_candidate, pooled_masks = [], [], [], []
        report["validation_arrays_opened"] = True
        for record in validation_records:
            resources.check()
            with np.load(
                manifest_path.parent / record["prepared_file"], allow_pickle=False
            ) as source:
                features, mask = source["features"].astype(np.float32), source["mask"]
                truth = {
                    head: source[head]
                    for head in ("root", "triad", "seventh", "bass", "extensions")
                }
            started = time.perf_counter()
            baseline = baseline_predictions(model, checkpoint, features)
            baseline_seconds = time.perf_counter() - started
            resources.check()
            started = time.perf_counter()
            candidate = cascade_predictions(features, baseline, quality)
            candidate_seconds = time.perf_counter() - started
            resources.check()
            result = paired_metrics(truth, baseline, candidate, mask)
            prediction_path = checkpoint_dir / f"{record['track_id']}.npz"
            np.savez(
                prediction_path,
                **{f"baseline_{key}": value for key, value in baseline.items()},
                candidate_triad=candidate["triad"],
                mask=mask,
            )
            result.update(
                baseline_inference_seconds=baseline_seconds,
                quality_inference_seconds=candidate_seconds,
                raw_frames=len(features),
                scored_frames=int(mask.sum()),
                boundary_scores_sha256=hashlib.sha256(baseline["boundary"].tobytes()).hexdigest(),
                predictions_path=str(prediction_path),
                predictions_sha256=digest(prediction_path),
            )
            report["tracks"][record["track_id"]] = result
            pooled_truth.append(truth)
            pooled_baseline.append(baseline)
            pooled_candidate.append(candidate)
            pooled_masks.append(mask)
            print(
                json.dumps({"track": record["track_id"], "status": "paired_inference_complete"}),
                flush=True,
            )

        def combine(rows):
            return {head: np.concatenate([row[head] for row in rows]) for head in rows[0]}

        pooled = paired_metrics(
            combine(pooled_truth),
            combine(pooled_baseline),
            combine(pooled_candidate),
            np.concatenate(pooled_masks),
        )
        gain = (
            pooled["candidate"]["quality"]["macro_recall_present_classes"]
            - pooled["baseline"]["quality"]["macro_recall_present_classes"]
        )
        exact_change = (
            pooled["candidate"]["reduced_structural_exact"]
            - pooled["baseline"]["reduced_structural_exact"]
        )
        report.update(
            status="completed",
            pooled=pooled,
            macro_recall_gain=gain,
            reduced_exact_change=exact_change,
            useful_research_signal=gain >= config["minimum_macro_gain"]
            and exact_change >= -config["maximum_exact_loss"],
        )
    except Exception as error:
        report.update(
            status="failed", error=f"{type(error).__name__}: {error}", useful_research_signal=False
        )
        raise
    finally:
        report["resources"] = resources.report()
        report["resources"]["sampling"] = (
            "preflight, before loading, each objective call, before/after each inference"
        )
        report["frozen_files_unchanged"] = {
            path: unchanged(path, expected) for path, expected in frozen.items()
        }
        if not all(report["frozen_files_unchanged"].values()):
            report.update(status="failed_integrity", useful_research_signal=False)
        save_new(output / "report.json", report)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("config", type=Path)
    run(parser.parse_args().config)
