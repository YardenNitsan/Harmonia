"""D001: bounded, train-composition-only oracle-root diagnostic; never a product model."""

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
import psutil
import torch
from torch import nn


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save_new(path: Path, value: dict) -> None:
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")


def load_training_tracks(manifest_path: Path) -> list[dict]:
    records = json.loads(manifest_path.read_text())["records"]
    tracks = []
    for record in records:
        if record["split"] != "train":
            continue
        composition = int(record["composition_id"].removeprefix("Schubert_D911-"))
        expected = f"Schubert_D911-{composition:02}_HU33.npz"
        if composition not in range(2, 14) or record["prepared_file"] != expected:
            raise ValueError("Unexpected training source identity")
        path = manifest_path.parent / expected
        if digest(path) != record["prepared_sha256"]:
            raise ValueError("Prepared training hash changed")
        with np.load(path, allow_pickle=False) as source:
            mask = source["mask"]
            if mask.dtype != np.bool_:
                raise ValueError("Expected explicit validity mask")
            features = source["features"][mask].astype(np.float64)
            roots = source["root"][mask].astype(np.int64)
            labels = source["triad"][mask].astype(np.int64) - 1
        if not np.isfinite(features).all() or features.shape[1] != 26:
            raise ValueError("Invalid features")
        if np.any((roots < 0) | (roots > 11)) or np.any((labels < 0) | (labels > 3)):
            raise ValueError("Training vocabulary differs from frozen four-quality protocol")
        tracks.append(
            {
                "composition": composition,
                "features": features,
                "root": roots,
                "labels": labels,
                "path": str(path),
                "sha256": record["prepared_sha256"],
            }
        )
    if sorted(t["composition"] for t in tracks) != list(range(2, 14)):
        raise ValueError("Expected exactly the twelve unique training compositions")
    return tracks


def transform(features: np.ndarray, roots: np.ndarray, arm: str) -> np.ndarray:
    result = features.copy()
    if arm == "root_relative":
        indices = (np.arange(12)[None, :] + roots[:, None]) % 12
        result[:, :12] = np.take_along_axis(features[:, :12], indices, axis=1)
        result[:, 12:24] = np.take_along_axis(features[:, 12:24], indices, axis=1)
    elif arm != "absolute":
        raise ValueError("Unknown diagnostic arm")
    return result


def fold_normalization(tracks: list[dict], heldout: set[int], arm: str) -> tuple:
    train = np.concatenate(
        [
            transform(t["features"], t["root"], arm)
            for t in tracks
            if t["composition"] not in heldout
        ]
    )
    return train.mean(axis=0), np.maximum(train.std(axis=0), 1e-4)


def metrics(truth: np.ndarray, predicted: np.ndarray) -> dict:
    confusion = np.zeros((4, 4), dtype=np.int64)
    np.add.at(confusion, (truth, predicted), 1)
    support = confusion.sum(axis=1)
    recalls = np.divide(confusion.diagonal(), support, out=np.zeros(4), where=support > 0)
    precision = np.divide(
        confusion.diagonal(),
        confusion.sum(axis=0),
        out=np.zeros(4),
        where=confusion.sum(axis=0) > 0,
    )
    return {
        "frames": len(truth),
        "accuracy": float(np.mean(truth == predicted)),
        "macro_recall_present_classes": float(recalls[support > 0].mean()),
        "classes": ["major", "minor", "diminished", "augmented"],
        "support": support.tolist(),
        "recall": recalls.tolist(),
        "precision": precision.tolist(),
        "confusion": confusion.tolist(),
    }


class Resources:
    def __init__(self, minimum: int) -> None:
        self.minimum = minimum
        self.started = time.perf_counter()
        self.samples = 0
        self.peak_rss = 0
        self.minimum_available = 2**63

    def check(self) -> None:
        available = psutil.virtual_memory().available
        self.minimum_available = min(self.minimum_available, available)
        self.peak_rss = max(self.peak_rss, psutil.Process().memory_info().rss)
        self.samples += 1
        if available < self.minimum:
            raise MemoryError("System memory headroom fell below frozen 8 GiB minimum")

    def report(self) -> dict:
        return {
            "elapsed_seconds": time.perf_counter() - self.started,
            "samples": self.samples,
            "sampled_peak_process_rss_bytes": self.peak_rss,
            "minimum_sampled_available_system_bytes": self.minimum_available,
            "sampling": "preflight, fold boundaries and every objective evaluation",
            "cpu_threads": 2,
            "workers": 0,
            "gpu_used": False,
        }


def run(config_path: Path) -> dict:
    config = json.loads(config_path.read_text())
    if digest(Path(config["manifest"])) != config["manifest_sha256"]:
        raise ValueError("Frozen prepared manifest hash changed")
    if config["folds"] != [[2, 6, 10], [3, 7, 11], [4, 8, 12], [5, 9, 13]]:
        raise ValueError("Composition folds differ from the frozen diagnostic")
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    torch.use_deterministic_algorithms(True)
    resources = Resources(config["minimum_available_ram_bytes"])
    resources.check()
    output = Path(config["output"])
    output.mkdir(parents=True, exist_ok=False)
    tracks = load_training_tracks(Path(config["manifest"]))
    preflight = {
        "study_id": config["study_id"],
        "declared_at_utc": datetime.now(UTC).isoformat(),
        "config_sha256": digest(config_path),
        "protocol_sha256": digest(Path(config["protocol"])),
        "source_sha256": digest(Path(__file__)),
        "test_source_sha256": digest(Path("tests/test_root_relative_probe.py")),
        "manifest_sha256": digest(Path(config["manifest"])),
        "training_inputs": [{k: t[k] for k in ("composition", "path", "sha256")} for t in tracks],
        "prepared_splits_read": ["train"],
        "python": platform.python_version(),
        "torch": torch.__version__,
        "numpy": np.__version__,
        "environment_threads": {
            k: os.environ.get(k)
            for k in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS")
        },
        "resources": resources.report(),
    }
    save_new(output / "preflight.json", preflight)
    checkpoint_dir = Path(config["checkpoint_dir"])
    checkpoint_dir.mkdir(parents=True, exist_ok=False)
    report = {
        "study_id": config["study_id"],
        "status": "running",
        "preflight_sha256": digest(output / "preflight.json"),
        "folds": [],
        "arms": {},
    }
    try:
        for arm in ("absolute", "root_relative"):
            all_truth, all_predictions, composition_metrics = [], [], {}
            for fold, held in enumerate(config["folds"]):
                resources.check()
                heldout = set(held)
                mean, std = fold_normalization(tracks, heldout, arm)
                training = [t for t in tracks if t["composition"] not in heldout]
                x = torch.from_numpy(
                    np.concatenate(
                        [(transform(t["features"], t["root"], arm) - mean) / std for t in training]
                    )
                )
                y = torch.from_numpy(np.concatenate([t["labels"] for t in training]))
                model = nn.Linear(26, 4, dtype=torch.float64)
                nn.init.zeros_(model.weight)
                nn.init.zeros_(model.bias)
                optimizer = torch.optim.LBFGS(
                    model.parameters(),
                    lr=1,
                    max_iter=config["max_iterations"],
                    max_eval=125,
                    tolerance_grad=1e-7,
                    tolerance_change=1e-12,
                    history_size=100,
                    line_search_fn="strong_wolfe",
                )
                calls, history = 0, []

                def objective(optimizer=optimizer, model=model, x=x, y=y, history=history):
                    nonlocal calls
                    resources.check()
                    optimizer.zero_grad()
                    loss = nn.functional.cross_entropy(model(x), y)
                    loss = loss + config["l2"] * model.weight.square().sum() / 2
                    loss.backward()
                    calls += 1
                    history.append(float(loss.detach()))
                    return loss

                optimizer.step(objective)
                final_loss = float(objective().detach())
                gradient = max(float(p.grad.abs().max()) for p in model.parameters())
                converged = gradient <= config["convergence_gradient_infinity_max"]
                train_predictions = model(x).argmax(1).detach().numpy()
                checkpoint = checkpoint_dir / f"{arm}-fold-{fold}.npz"
                np.savez(
                    checkpoint,
                    weight=model.weight.detach().numpy(),
                    bias=model.bias.detach().numpy(),
                    mean=mean,
                    std=std,
                )
                state = optimizer.state[model.weight]
                report["folds"].append(
                    {
                        "arm": arm,
                        "fold": fold,
                        "heldout": held,
                        "train_compositions": [t["composition"] for t in training],
                        "normalization_frame_count": len(y),
                        "mean": mean.tolist(),
                        "std": std.tolist(),
                        "iterations": state["n_iter"],
                        "objective_evaluations": calls,
                        "objective_history": history,
                        "final_objective": final_loss,
                        "gradient_infinity_norm": gradient,
                        "converged": converged,
                        "training_fit": metrics(y.numpy(), train_predictions),
                        "checkpoint": str(checkpoint),
                        "checkpoint_sha256": digest(checkpoint),
                    }
                )
                for track in tracks:
                    if track["composition"] not in heldout:
                        continue
                    values = (transform(track["features"], track["root"], arm) - mean) / std
                    predictions = model(torch.from_numpy(values)).argmax(1).detach().numpy()
                    composition_metrics[str(track["composition"])] = metrics(
                        track["labels"], predictions
                    )
                    all_truth.append(track["labels"])
                    all_predictions.append(predictions)
                print(
                    json.dumps(
                        {
                            "arm": arm,
                            "fold": fold,
                            "converged": converged,
                            "gradient_infinity_norm": gradient,
                        }
                    ),
                    flush=True,
                )
            report["arms"][arm] = {
                "pooled_oof": metrics(np.concatenate(all_truth), np.concatenate(all_predictions)),
                "compositions": composition_metrics,
            }
        gain = (
            report["arms"]["root_relative"]["pooled_oof"]["macro_recall_present_classes"]
            - report["arms"]["absolute"]["pooled_oof"]["macro_recall_present_classes"]
        )
        all_converged = all(fold["converged"] for fold in report["folds"])
        report.update(
            status="completed",
            all_folds_converged=all_converged,
            macro_recall_gain=gain,
            useful_diagnostic_signal=all_converged and gain >= config["minimum_gain"],
            interpretation="inconclusive optimization"
            if not all_converged
            else "oracle-root linear accessibility diagnostic only; not deployment accuracy",
        )
    except Exception as error:
        report.update(status="failed", error=f"{type(error).__name__}: {error}")
        raise
    finally:
        report["resources"] = resources.report()
        report["source_unchanged"] = digest(Path(__file__)) == preflight["source_sha256"]
        report["config_unchanged"] = digest(config_path) == preflight["config_sha256"]
        report["protocol_unchanged"] = (
            digest(Path(config["protocol"])) == preflight["protocol_sha256"]
        )
        save_new(output / "report.json", report)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("config", type=Path)
    run(parser.parse_args().config)
