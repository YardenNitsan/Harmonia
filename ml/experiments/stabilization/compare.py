"""Validation-only retained-model comparison; never trains or opens test arrays."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import importlib.metadata
import json
import os
import time
from pathlib import Path

for _name in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS"):
    os.environ[_name] = "2"
os.environ["CUDA_VISIBLE_DEVICES"] = ""

import numpy as np  # noqa: E402
import psutil  # noqa: E402

from experiments.boundary_comparison import (  # noqa: E402
    match_boundaries,
    overlap_scores,
    project,
    reduced,
)

ROOT = Path(__file__).resolve().parents[2]
REPO = ROOT.parent
OUT = ROOT / "experiments/stabilization/results"
HEADS = ("root", "triad", "seventh", "bass")


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write(path, obj):
    with Path(path).open("x", encoding="utf-8") as stream:
        json.dump(obj, stream, indent=2, allow_nan=False)


def resources():
    free = psutil.virtual_memory().available
    if free < 8 * 1024**3:
        raise RuntimeError("Less than 8 GiB available RAM")
    mem = psutil.Process().memory_info()
    return {
        "rss_bytes": mem.rss,
        "peak_working_set_bytes": getattr(mem, "peak_wset", None),
        "available_bytes": free,
    }


def inputs():
    request = json.loads(
        (ROOT / "experiments/results/B001-boundary-refinement/browser-request.json").read_text()
    )
    if [t["composition"] for t in request["tracks"]] != list(range(14, 19)):
        raise ValueError("Only frozen validation compositions 14–18 permitted")
    for row in request["tracks"]:
        for key in ("audio", "annotation", "prepared"):
            if digest(row[key]) != row[key + "_sha256"]:
                raise ValueError(f"Changed input {key}")
    return request["tracks"]


def freeze():
    OUT.mkdir(parents=True, exist_ok=True)
    tracks = inputs()
    manifest = ROOT / "data/prepared/winterreise-hu33-v1/manifest.json"
    if digest(manifest) != "a54ce6ed104a42b8216f5045e4bc0be0d4912e61c8678c920ddf896dc63faf4d":
        raise ValueError("Manifest changed")
    package = ROOT / ".venv/Lib/site-packages/lv_chordia"
    files = [
        Path(__file__),
        REPO / "docs/stabilization-model-comparison.md",
        manifest,
        ROOT / "experiments/boundary_comparison.py",
    ]
    files += list(package.rglob("*.py"))
    files += list((ROOT / ".venv/share/lv-chordia/cache_data").glob("*.sdict"))
    for row in tracks:
        files.extend(Path(row[k]) for k in ("audio", "annotation", "prepared"))
        files.append(
            ROOT
            / "checkpoints/E010-predicted-root-quality-cascade"
            / (Path(row["audio"]).stem + ".npz")
        )
    write(
        OUT / "preflight.json",
        {
            "files": {str(p): digest(p) for p in files},
            "lv_version": importlib.metadata.version("lv-chordia"),
            "resources": resources(),
            "created_epoch": time.time(),
        },
    )


def verify():
    frozen = json.loads((OUT / "preflight.json").read_text())
    for filename, expected in frozen["files"].items():
        if digest(filename) != expected:
            raise ValueError(f"Frozen file changed: {filename}")
    if frozen["lv_version"] != "1.1.0":
        raise ValueError("LV version changed")


def infer_lv():
    verify()
    import torch

    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    if torch.cuda.device_count():
        raise RuntimeError("CPU-only runtime required")
    from lv_chordia import chord_recognition
    from lv_chordia.extractors.cqt import CQTV2
    from lv_chordia.extractors.xhmm_ismir import XHMMDecoder
    from lv_chordia.mir.nn.train import NetworkInterface

    timings = {}

    def measure(cls, method, name):
        original = getattr(cls, method)

        def wrapped(*args, **kwargs):
            start = time.perf_counter()
            result = original(*args, **kwargs)
            timings[name] = timings.get(name, 0) + time.perf_counter() - start
            return result

        setattr(cls, method, wrapped)

    measure(CQTV2, "extract", "decode_and_cqt_seconds")
    measure(NetworkInterface, "inference", "five_network_inference_seconds")
    measure(XHMMDecoder, "decode_to_chordlab", "hmm_seconds")
    for row in inputs():
        path = OUT / f"lv-{row['composition']}.json"
        if path.exists():
            raise FileExistsError(path)
        before = resources()
        timings.clear()
        start = time.perf_counter()
        labels = chord_recognition(str(Path(row["audio"]).resolve()), "submission")
        elapsed = time.perf_counter() - start
        write(
            path,
            {
                "composition": row["composition"],
                "labels": labels,
                "timings": dict(timings),
                "total_seconds": elapsed,
                "before": before,
                "after": resources(),
            },
        )
        print(row["composition"], elapsed, timings, flush=True)
    verify()


def classification(reference, estimate, classes):
    output = {}
    for value in classes:
        support = int((reference == value).sum())
        predictions = int((estimate == value).sum())
        tp = int(((reference == value) & (estimate == value)).sum())
        output[str(value)] = {
            "support": support,
            "predicted": predictions,
            "precision": tp / predictions if predictions else None,
            "recall": tp / support if support else None,
            "f1": 2 * tp / (support + predictions) if support + predictions else None,
        }
    return {"accuracy": float((reference == estimate).mean()), "classes": output}


def frame_score(reference, estimate):
    inversion = (reference[:, 0] != reference[:, 3]) & (reference[:, 0] < 12)
    pred_inv = (estimate[:, 0] != estimate[:, 3]) & (estimate[:, 0] < 12)
    return {
        **{
            head: classification(reference[:, i], estimate[:, i], range(size))
            for i, (head, size) in enumerate(zip(HEADS, (13, 8, 4, 13), strict=True))
        },
        "reduced_structural_exact": float((reference == estimate).all(1).mean()),
        "scored_frames": len(reference),
        "extensions": {
            str(degree): classification(reference[:, i + 4], estimate[:, i + 4], (0, 1))
            for i, degree in enumerate((6, 9, 11, 13))
        },
        "inversion_presence": classification(inversion, pred_inv, (False, True)),
        "inversion_frames": int(inversion.sum()),
        "inversion_bass_exact": float((reference[inversion, 3] == estimate[inversion, 3]).mean())
        if inversion.any()
        else None,
    }


def matrix(data, prefix=""):
    return np.column_stack(
        [data[prefix + h] for h in HEADS] + [data[prefix + "extensions"]]
    ).astype(int)


def sample(segments, times):
    values = np.full((len(times), 8), -1, dtype=int)
    for segment in segments:
        values[(times >= segment["start"]) & (times < segment["end"])] = segment["target"]
    return values


def timeline_score(reference, segments):
    result = overlap_scores(reference["intervals"], segments)
    cuts = [s["start"] for s in segments[1:]]
    included = [
        cut
        for cut in cuts
        if any(r["start"] <= cut < r["end"] for r in reference["intervals"])
        and all(abs(cut - e) > 0.1 for e in reference["unknown_edge_times"])
    ]
    result["boundaries"] = {
        str(t): match_boundaries(
            reference["boundaries"],
            included,
            reference["short_adjacent"],
            t,
            result["scored_seconds"],
        )
        for t in (0.02, 0.05, 0.1)
    }
    result["segment_count"] = len(segments)
    return result


def score(dsp_path=None):
    verify()
    retained = json.loads(
        (ROOT / "experiments/results/B001-boundary-refinement/report.json").read_text()
    )
    if dsp_path:
        opener = gzip.open if str(dsp_path).endswith(".gz") else open
        with opener(dsp_path, "rt", encoding="utf-8") as stream:
            dsp = json.load(stream)
    else:
        dsp = None
    results, pooled = [], {}
    for row, old in zip(inputs(), retained["tracks"], strict=True):
        cid = row["composition"]
        with np.load(row["prepared"], allow_pickle=False) as data:
            times, mask, truth = data["times"], data["mask"], matrix(data)
        filename = Path(row["audio"]).stem + ".npz"
        with np.load(
            ROOT / "checkpoints/E010-predicted-root-quality-cascade" / filename, allow_pickle=False
        ) as pred:
            e010 = matrix(pred, "baseline_")
            e010[:, 1] = pred["candidate_triad"]
            if not np.array_equal(mask, pred["mask"]):
                raise ValueError("Retained mask mismatch")
        changes = np.r_[0, np.flatnonzero((e010[1:] != e010[:-1]).any(1)) + 1, len(times)]
        edges = np.r_[0, (times[1:] + times[:-1]) / 2, row["duration"]]
        timelines = {
            "e010": [
                {"start": float(edges[a]), "end": float(edges[b]), "target": e010[a].tolist()}
                for a, b in zip(changes[:-1], changes[1:], strict=True)
            ]
        }
        labels = json.loads((OUT / f"lv-{cid}.json").read_text())["labels"]
        timelines["lv_native"] = [
            {"start": s["start_time"], "end": s["end_time"], "target": reduced(s["chord"])}
            for s in labels
        ]
        if dsp is not None:
            track = next(t for t in dsp["tracks"] if t["composition"] == cid)
            timelines["current_dsp"] = [
                {"start": s["start"], "end": s["end"], "target": project(s["chord"])}
                for s in track["segments"]
            ]
        entry = {"composition": cid, "arms": {}}
        for arm, segments in timelines.items():
            estimate = e010 if arm == "e010" else sample(segments, times)
            entry["arms"][arm] = {
                "frames": frame_score(truth[mask], estimate[mask]),
                "timeline": timeline_score(old["reference"], segments),
            }
            pooled.setdefault(arm, [[], []])[0].append(truth[mask])
            pooled[arm][1].append(estimate[mask])
        results.append(entry)
    output = {
        "tracks": results,
        "pooled": {
            arm: frame_score(np.concatenate(ref), np.concatenate(pred))
            for arm, (ref, pred) in pooled.items()
        },
    }
    write(OUT / ("comparison-with-dsp.json" if dsp_path else "comparison.json"), output)
    print(
        json.dumps(
            {
                arm: {k: value[k] for k in ("reduced_structural_exact", "inversion_bass_exact")}
                for arm, value in output["pooled"].items()
            }
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("freeze", "lv", "score"))
    parser.add_argument("--dsp", type=Path)
    args = parser.parse_args()
    {"freeze": freeze, "lv": infer_lv, "score": lambda: score(args.dsp)}[args.action]()
