"""Pinned original BTC-ISMIR19 research adapter; no fitting or label-file access.

Artifacts are local ignored research inputs, never downloaded by this module.
The model architecture and ten-second CQT recipe follow upstream test.py.
Timestamps use original sample positions instead of its rounded 10/108 shortcut.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import os
import sys
import time
from pathlib import Path
from types import ModuleType

for _name in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS", "NUMBA_NUM_THREADS"):
    os.environ[_name] = "2"
os.environ["CUDA_VISIBLE_DEVICES"] = ""
os.environ["TORCH_FORCE_WEIGHTS_ONLY_LOAD"] = "1"

import numpy as np  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT.parent / ".superpowers/diagnostics/btc-original-r005"
REVISION = "2682317be668032e6e4b269ded36adaa2ad57df0"
SAMPLE_RATE, HOP, BLOCK_SAMPLES, MODEL_FRAMES = 22050, 2048, 220500, 108
WEIGHTS = {
    25: ("btc_model.pt", "71c2c5db17e8c43b8a9a9da5db36ef2d667158c07a214eba16344c154c00bf54"),
    170: (
        "btc_model_large_voca.pt",
        "1673d23f8f9a55ae7f9e8b80a51da616debb22675b8d8b67ea6ce0ef37b0ab51",
    ),
}
CONFIG = {
    "feature_size": 144,
    "timestep": 108,
    "num_chords": 170,
    "input_dropout": 0.2,
    "layer_dropout": 0.2,
    "attention_dropout": 0.2,
    "relu_dropout": 0.2,
    "num_layers": 8,
    "num_heads": 4,
    "hidden_size": 128,
    "total_key_depth": 128,
    "total_value_depth": 128,
    "filter_size": 128,
    "loss": "ce",
    "probs_out": False,
}
ROOT_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
QUALITIES = (
    "min",
    "maj",
    "dim",
    "aug",
    "min6",
    "maj6",
    "min7",
    "minmaj7",
    "maj7",
    "7",
    "dim7",
    "hdim7",
    "sus2",
    "sus4",
)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def _module(name, path, substitutions=()):
    module = ModuleType(name)
    module.__file__ = str(path)
    source = path.read_text(encoding="utf8")
    for original, replacement in substitutions:
        if original not in source:
            raise ValueError("Pinned source compatibility target changed")
        source = source.replace(original, replacement)
    sys.modules[name] = module
    exec(compile(source, str(path), "exec"), module.__dict__)
    return module


def load_original_architecture():
    """Apply only the recorded NumPy alias and unused CLI-import compatibility edits."""
    package_name = "_harmonia_btc_ismir_utils"
    package = ModuleType(package_name)
    package.__path__ = [str(VENDOR / "utils")]
    sys.modules[package_name] = package
    _module(
        package_name + ".transformer_modules",
        VENDOR / "utils/transformer_modules.py",
        ((".astype(np.float)", ".astype(float)"),),
    )
    return _module(
        "_harmonia_btc_ismir_model",
        VENDOR / "btc_model.py",
        (
            (
                "from utils.hparams import HParams",
                "# Unused upstream CLI-only YAML import omitted.",
            ),
            (
                "from utils.transformer_modules import",
                f"from {package_name}.transformer_modules import",
            ),
        ),
    ).BTC_model


def vocabulary(classes):
    if classes == 25:
        return [f"{root}:{quality}" for root in ROOT_NAMES for quality in ("maj", "min")] + ["N"]
    if classes == 170:
        return [f"{root}:{quality}" for root in ROOT_NAMES for quality in QUALITIES] + ["X", "N"]
    raise ValueError("Only the original published 25/170 vocabularies are supported")


def block_ranges(samples):
    if samples < 1:
        raise ValueError("Empty PCM")
    return [
        (start, min(samples, start + BLOCK_SAMPLES)) for start in range(0, samples, BLOCK_SAMPLES)
    ]


def extract_features(pcm):
    import librosa

    if pcm.ndim != 1 or pcm.dtype != np.float32 or not np.isfinite(pcm).all():
        raise ValueError("Expected finite float32 mono 22.05 kHz PCM")
    if not 0 < len(pcm) <= SAMPLE_RATE * 1200:
        raise ValueError("PCM duration outside bounded research adapter")
    features, times = [], []
    for first, last in block_ranges(len(pcm)):
        cqt = librosa.cqt(
            pcm[first:last], sr=SAMPLE_RATE, n_bins=144, bins_per_octave=24, hop_length=HOP
        )
        features.append(np.log(np.abs(cqt) + 1e-6).T.astype(np.float32))
        times.append(first / SAMPLE_RATE + np.arange(cqt.shape[1]) * HOP / SAMPLE_RATE)
    return np.concatenate(features), np.concatenate(times)


def label_segments(predictions, times, duration, labels):
    if len(predictions) != len(times) or len(times) == 0 or np.any(np.diff(times) <= 0):
        raise ValueError("Invalid frame timeline")
    valid = times < duration
    predictions, times = np.asarray(predictions)[valid], np.asarray(times)[valid]
    cuts = np.r_[0, np.flatnonzero(predictions[1:] != predictions[:-1]) + 1, len(predictions)]
    endpoints = np.r_[times, duration]
    return [
        {
            "start": float(endpoints[a]),
            "end": float(endpoints[b]),
            "label": labels[int(predictions[a])],
        }
        for a, b in zip(cuts[:-1], cuts[1:], strict=True)
    ]


class OriginalBTC:
    def __init__(self, classes=170):
        import torch

        from harmonia_ml.inference.whole_song import require_headroom

        require_headroom()
        if classes not in WEIGHTS:
            raise ValueError("Unsupported checkpoint vocabulary")
        artifact_file, expected = WEIGHTS[classes]
        path = VENDOR / "test" / artifact_file
        if digest(path) != expected:
            raise ValueError("Pinned original BTC checkpoint hash mismatch")
        saved = json.loads((VENDOR / "artifact-hashes.json").read_text(encoding="utf-8-sig"))
        sources = {Path(row["path"]).resolve(): row["sha256"] for row in saved}
        for source in ("btc_model.py", "utils/transformer_modules.py", "run_config.yaml"):
            file = (VENDOR / source).resolve()
            if digest(file) != sources[file]:
                raise ValueError("Original BTC source hash mismatch")
        torch.set_num_threads(2)
        if torch.get_num_interop_threads() != 1:
            torch.set_num_interop_threads(1)
        allowed = [
            (np._core.multiarray.scalar, "numpy.core.multiarray.scalar"),
            np.dtype,
            type(np.dtype("float64")),
        ]
        with torch.serialization.safe_globals(allowed):
            checkpoint = torch.load(path, weights_only=True, map_location="cpu")
        self.model = load_original_architecture()({**CONFIG, "num_chords": classes}).cpu().eval()
        self.model.load_state_dict(checkpoint["model"], strict=True)
        self.mean, self.std = float(checkpoint["mean"]), float(checkpoint["std"])
        if not np.isfinite([self.mean, self.std]).all() or self.std <= 0:
            raise ValueError("Invalid checkpoint normalization")
        self.labels = vocabulary(classes)
        self.identity = {
            "revision": REVISION,
            "checkpoint_sha256": expected,
            "classes": classes,
            "config": {**CONFIG, "num_chords": classes},
            "normalization": [self.mean, self.std],
            "strict_state_keys": len(checkpoint["model"]),
        }

    def infer_features(self, features):
        import torch

        if features.ndim != 2 or features.shape[1] != 144 or not np.isfinite(features).all():
            raise ValueError("Invalid BTC feature matrix")
        normalized = (features - self.mean) / self.std
        padding = (-len(normalized)) % MODEL_FRAMES
        padded = np.pad(normalized, ((0, padding), (0, 0)))
        predictions, probabilities = [], []
        with torch.no_grad():
            for start in range(0, len(padded), MODEL_FRAMES):
                tensor = torch.tensor(padded[start : start + MODEL_FRAMES], dtype=torch.float32)[
                    None
                ]
                hidden, _ = self.model.self_attn_layers(tensor)
                first, _ = self.model.output_layer(hidden)
                logits = self.model.output_layer.output_projection(hidden)
                predictions.append(first[0].cpu().numpy())
                probabilities.append(torch.softmax(logits, dim=-1)[0].cpu().numpy())
        pred, probs = (
            np.concatenate(predictions)[: len(features)],
            np.concatenate(probabilities)[: len(features)],
        )
        if not np.isfinite(probs).all():
            raise ValueError("Nonfinite original BTC output")
        return pred, probs

    def recognize(self, pcm):
        start = time.perf_counter()
        features, times = extract_features(pcm)
        feature_seconds = time.perf_counter() - start
        start = time.perf_counter()
        predictions, probabilities = self.infer_features(features)
        inference_seconds = time.perf_counter() - start
        duration = len(pcm) / SAMPLE_RATE
        return {
            "segments": label_segments(predictions, times, duration, self.labels),
            "duration": duration,
            "identity": self.identity,
            "timings": {"feature_seconds": feature_seconds, "model_seconds": inference_seconds},
            "features": features,
            "times": times,
            "predictions": predictions,
            "probabilities": probabilities,
        }


def preflight(output):
    if output.exists():
        raise FileExistsError(output)
    rows = []
    for classes in (170,):
        start = time.perf_counter()
        recognizer = OriginalBTC(classes)
        model_setup = time.perf_counter() - start
        # Procedural signal establishes numerical/runtime compatibility only.
        times = np.arange(round(12.5 * SAMPLE_RATE), dtype=np.float32) / SAMPLE_RATE
        pcm = (0.1 * np.sin(2 * np.pi * 220 * times)).astype(np.float32)
        result = recognizer.recognize(pcm)
        assert result["segments"][0]["start"] == 0
        assert result["segments"][-1]["end"] == len(pcm) / SAMPLE_RATE
        assert np.allclose(result["probabilities"].sum(1), 1, atol=1e-6)
        rows.append(
            {
                "identity": result["identity"],
                "model_setup_seconds": model_setup,
                "timings": result["timings"],
                "probability_shape": list(result["probabilities"].shape),
                "parameters": sum(p.numel() for p in recognizer.model.parameters()),
                "first_frame_of_second_audio_block": float(result["times"][108]),
            }
        )
    report = {
        "interpretation": "Procedural compatibility only; no real-song accuracy",
        "runtime": {
            name: importlib.metadata.version(name) for name in ("torch", "numpy", "librosa")
        },
        "adapter_sha256": digest(__file__),
        "models": rows,
    }
    with output.open("x", encoding="utf8") as stream:
        json.dump(report, stream, indent=2)
    print(json.dumps(report))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preflight", type=Path, required=True)
    preflight(parser.parse_args().preflight)
