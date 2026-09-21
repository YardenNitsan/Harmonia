"""R003 local research: pinned published ChordNet inference, strict checkpoint load."""

from __future__ import annotations

import argparse
import importlib
import json
import os
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from types import ModuleType, SimpleNamespace

for name in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS", "NUMBA_NUM_THREADS"):
    os.environ[name] = "2"
os.environ["CUDA_VISIBLE_DEVICES"] = ""
os.environ["TORCH_FORCE_WEIGHTS_ONLY_LOAD"] = "1"

import numpy as np  # noqa: E402

from experiments.stabilization.compare import (  # noqa: E402
    ROOT,
    digest,
    frame_score,
    matrix,
    reduced,
    sample,
    timeline_score,
    write,
)
from harmonia_ml.inference.whole_song import require_headroom  # noqa: E402

VENDOR = ROOT.parent / ".superpowers/diagnostics/chordnet-r003"
OUT = ROOT / "experiments/results/R003-chordnet-audit"
OLD = ROOT / "experiments/stabilization/results"
PROTOCOL = ROOT.parent / "docs/recognition-chordnet-protocol.md"
CONFIG = SimpleNamespace(
    mp3={"song_hz": 22050},
    feature={"hop_length": 2048, "n_bins": 144, "bins_per_octave": 24},
    model={"num_chords": 170, "seq_len": 108},
)


def upstream():
    # Load original inference modules while bypassing __init__ imports of unused
    # plotting and YAML packages. No upstream function/class implementation changes.
    for name in (
        "src",
        "src.utils",
        "src.models",
        "src.models.common",
        "src.evaluation",
        "src.evaluation.utils",
    ):
        module = ModuleType(name)
        module.__path__ = [str(VENDOR / name.replace(".", "/"))]
        sys.modules[name] = module
    utils = sys.modules["src.utils"]
    exports = {
        "checkpoint_utils": (
            "extract_model_state_dict",
            "extract_normalization_stats",
            "load_checkpoint",
        ),
        "logger": ("info", "warning", "error"),
        "chords": ("_parse_chord_string", "idx2voca_chord"),
        "config_utils": ("get_config_value",),
    }
    for module_name, names in exports.items():
        module = importlib.import_module(f"src.utils.{module_name}")
        for name in names:
            setattr(utils, name, getattr(module, name))
    return (
        importlib.import_module("src.models.common.checkpoint_loading")._infer_chordnet,
        importlib.import_module("src.models.chord_net").ChordNet,
        importlib.import_module("src.evaluation.utils.common").extract_song_features,
        importlib.import_module("src.evaluation.utils.inference").predict_sliding_windows,
        utils,
    )


def model_load():
    import torch

    infer_arch, cls, features, predict, utils = upstream()
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    path = VENDOR / "checkpoints/2e1d_model_best.pth"
    if path.stat().st_size != 27523646:
        raise ValueError("Checkpoint size changed")
    checkpoint = torch.load(path, weights_only=True, map_location="cpu")
    state = utils.extract_model_state_dict(checkpoint)
    params = infer_arch(state, CONFIG)
    model = cls(**params).cpu().eval()
    model.load_state_dict(state, strict=True)
    mean, std = utils.extract_normalization_stats(checkpoint)
    if not np.isfinite([mean, std]).all() or std <= 0:
        raise ValueError("Invalid normalization")
    vocab = utils.idx2voca_chord()
    return model, features, predict, vocab, mean, std, params


def research_gate(a, b):
    names = ("root", "triad", "seventh")
    return all(b[k]["accuracy"] >= a[k]["accuracy"] for k in names[:2]) and sum(
        b[k]["accuracy"] for k in names
    ) > sum(a[k]["accuracy"] for k in names)


def main(stage):
    OUT.mkdir(parents=True, exist_ok=True)
    if stage == "validation":
        result = json.loads((OUT / "training.json").read_text())
        if not result["research_gate"]:
            raise ValueError("Training gate failed; validation forbidden")
        frozen = json.loads((OUT / "training-freeze.json").read_text())
        for path, expected in frozen["sources"].items():
            if digest(path) != expected:
                raise ValueError(f"Changed source: {path}")
    ids = (2, 3) if stage == "training" else (14, 15, 16, 17, 18)
    sources = [
        Path(__file__),
        PROTOCOL,
        ROOT / "experiments/stabilization/compare.py",
        ROOT / "experiments/boundary_comparison.py",
        *VENDOR.rglob("*.py"),
        VENDOR / "checkpoints/2e1d_model_best.pth",
        VENDOR / "config/ChordMini.yaml",
    ]
    inputs = []
    for cid in ids:
        inputs.extend(
            [
                OLD / f"refinement-{cid:02}.json",
                ROOT / f"data/prepared/winterreise-hu33-v1/Schubert_D911-{cid:02}_HU33.npz",
                ROOT
                / "data/downloads/winterreise-hu33-v2.1/01_RawData/audio_wav"
                / f"Schubert_D911-{cid:02}_HU33.wav",
            ]
        )
    write(
        OUT / f"{stage}-freeze.json",
        {
            "utc": datetime.now(UTC).isoformat(),
            "compositions": ids,
            "sources": {str(p): digest(p) for p in sources},
            "inputs": {str(p): digest(p) for p in inputs},
            "configuration": vars(CONFIG),
        },
    )
    require_headroom()
    model, extract, predict, vocab, mean, std, params = model_load()
    write(
        OUT / f"{stage}-model.json",
        {
            "architecture": params,
            "normalization": [mean, std],
            "vocabulary": vocab,
            "strict_load": True,
        },
    )
    refs = None
    if stage == "validation":
        refs = json.loads(
            (ROOT / "experiments/results/B001-boundary-refinement/report.json").read_text()
        )
    pooled = {name: [[], []] for name in ("original", "chordnet")}
    tracks = []
    for cid in ids:
        require_headroom()
        baseline = json.loads((OLD / f"refinement-{cid:02}.json").read_text())
        cache = VENDOR / f"{cid:02}-features-predictions.npz"
        if cache.exists():
            raise FileExistsError("Completed candidate inference cannot be repeated")
        wav = (
            ROOT
            / "data/downloads/winterreise-hu33-v2.1/01_RawData/audio_wav"
            / f"Schubert_D911-{cid:02}_HU33.wav"
        )
        start = time.perf_counter()
        features, hop = extract(str(wav), CONFIG)
        feature_seconds = time.perf_counter() - start
        start = time.perf_counter()
        predictions = predict(
            model=model,
            feature_matrix=features,
            mean=mean,
            std=std,
            seq_len=108,
            batch_size=16,
            model_type="ChordNet",
            n_classes=170,
            vote_aggregation="logit",
            use_overlap=True,
            overlap_ratio=0.5,
            smooth_logits=False,
            smooth_predictions=True,
            kernel_size=9,
            use_gaussian=True,
        )
        model_seconds = time.perf_counter() - start
        with cache.open("xb") as stream:
            np.savez_compressed(stream, features=features, predictions=predictions)
        labels = np.array([vocab[int(i)] for i in predictions])
        # Bare major roots are official output shorthand. Normalize only syntax.
        labels = np.array(
            [s + ":maj" if s not in ("N", "X") and ":" not in s else s for s in labels]
        )
        edges = np.r_[0, np.flatnonzero(labels[1:] != labels[:-1]) + 1, len(labels)]
        timeline = [
            {
                "start": float(a * hop),
                "end": min(float(b * hop), baseline["duration"]),
                "label": str(labels[a]),
                "target": reduced(str(labels[a])),
            }
            for a, b in zip(edges[:-1], edges[1:], strict=True)
            if a * hop < baseline["duration"]
        ]
        timeline[-1]["end"] = baseline["duration"]
        write(
            OUT / f"{cid:02}-candidate.json",
            {
                "segments": timeline,
                "feature_seconds": feature_seconds,
                "inference_seconds": model_seconds,
            },
        )
        with np.load(
            ROOT / f"data/prepared/winterreise-hu33-v1/Schubert_D911-{cid:02}_HU33.npz",
            allow_pickle=False,
        ) as data:
            truth, mask, times = matrix(data), data["mask"], data["times"]
        timelines = {
            "chordnet": timeline,
            "original": [{**s, "target": reduced(s["label"])} for s in baseline["segments"]],
        }
        row = {"composition": cid, "arms": {}}
        for name, timeline in timelines.items():
            values = sample(timeline, times)
            row["arms"][name] = {
                "frames": frame_score(truth[mask], values[mask]),
                "segment_count": len(timeline),
            }
            if refs:
                ref = next(t["reference"] for t in refs["tracks"] if t["composition"] == cid)
                row["arms"][name]["timeline"] = timeline_score(ref, timeline)
            pooled[name][0].append(truth[mask])
            pooled[name][1].append(values[mask])
        tracks.append(row)
        print(
            stage,
            cid,
            {
                k: [v["frames"][h]["accuracy"] for h in ("root", "triad", "seventh")]
                for k, v in row["arms"].items()
            },
            flush=True,
        )
    scores = {
        name: frame_score(np.concatenate(a), np.concatenate(b)) for name, (a, b) in pooled.items()
    }
    passed = research_gate(scores["original"], scores["chordnet"])
    write(
        OUT / f"{stage}.json",
        {
            "research_gate": bool(passed),
            "tracks": tracks,
            "pooled": scores,
            "production_approved": False,
        },
    )
    print("Research gate", bool(passed), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage", choices=("training", "validation", "preflight"))
    args = parser.parse_args()
    if args.stage == "preflight":
        model, _, _, vocab, mean, std, params = model_load()
        print(
            json.dumps(
                {
                    "architecture": params,
                    "normalization": [mean, std],
                    "vocabulary_size": len(vocab),
                    "strict_load": True,
                    "parameters": sum(p.numel() for p in model.parameters()),
                }
            )
        )
    else:
        main(args.stage)
