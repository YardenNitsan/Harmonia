"""R005 fixed broad comparison; no test access, fitting or product promotion."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import time
from pathlib import Path

for _name in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS", "NUMBA_NUM_THREADS"):
    os.environ[_name] = "2"
os.environ["CUDA_VISIBLE_DEVICES"] = ""
os.environ["TORCH_FORCE_WEIGHTS_ONLY_LOAD"] = "1"

import numpy as np  # noqa: E402

from experiments.stabilization.compare import (  # noqa: E402
    frame_score,
    match_boundaries,
    matrix,
    reduced,
    resources,
    sample,
)

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
OUT = ROOT / "experiments/results/R005-broad-existing-models"
CACHE = REPO / ".superpowers/diagnostics/broad-r005"
MANIFEST = ROOT / "data/prepared/guitarset-v1/manifest.json"
OLD = ROOT / "experiments/results/E006-lv-chordia"


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as stream:
        json.dump(data, stream, indent=2, allow_nan=False)


def selected(records):
    styles = ("BN", "Funk", "Jazz", "Rock", "SS")
    result = []
    for i, performer in enumerate(sorted({r["performer_id"] for r in records})):
        for j, style in enumerate(styles):
            mode = ("comp", "solo")[(i + j) % 2]
            result.append(
                min(
                    (
                        r
                        for r in records
                        if r["split"] == "train"
                        and r["performer_id"] == performer
                        and r["style"] == style
                        and r["version"] == mode
                    ),
                    key=lambda r: r["track_id"],
                )
            )
    result += sorted(
        (r for r in records if r["split"] == "validation"), key=lambda r: r["track_id"]
    )
    if len(result) != 150 or len({r["track_id"] for r in result}) != 150:
        raise ValueError("Unexpected frozen selection")
    return result


def freeze():
    rows = []
    for record in selected(read(MANIFEST)["records"]):
        track = record["track_id"]
        paths = {
            "audio": ROOT / f"data/downloads/extracted/audio/{track}_mic.wav",
            "annotation": ROOT / f"data/downloads/extracted/annotations/{track}.jams",
            "prepared": MANIFEST.parent / record["prepared_file"],
        }
        hashes = {k: digest(p) for k, p in paths.items()}
        for k in ("audio", "annotation"):
            if hashes[k] != record[k + "_sha256"]:
                raise ValueError("Source changed")
        row = {
            **record,
            "paths": {k: str(p.relative_to(REPO)) for k, p in paths.items()},
            "hashes": hashes,
        }
        old = OLD / (track + ".json")
        if old.exists():
            row["retained_lv_sha256"] = digest(old)
        rows.append(row)
    sources = [
        Path(__file__),
        ROOT / "experiments/original_btc.py",
        ROOT / "harmonia_ml/inference/whole_song.py",
        ROOT / "experiments/stabilization/compare.py",
        ROOT / "harmonia_ml/data/labels.py",
        REPO / "docs/broad-recognition-protocol.md",
        MANIFEST,
    ]
    write(
        OUT / "freeze.json",
        {
            "created_epoch": time.time(),
            "tracks": rows,
            "sources": {str(p.relative_to(REPO)): digest(p) for p in sources},
        },
    )


def verify():
    frozen = read(OUT / "freeze.json")
    for path, expected in frozen["sources"].items():
        if digest(REPO / path) != expected:
            raise ValueError(f"Frozen source changed: {path}")
    return frozen


def decode(row):
    import librosa
    import soundfile as sf

    path = CACHE / "pcm" / (row["track_id"] + ".npy")
    meta_path = path.with_suffix(".json")
    if path.exists():
        meta = read(meta_path)
        if meta["source_sha256"] != row["hashes"]["audio"] or digest(path) != meta["file_sha256"]:
            raise ValueError("Changed PCM cache")
        return np.load(path, allow_pickle=False), meta
    started = time.perf_counter()
    source = REPO / row["paths"]["audio"]
    if digest(source) != row["hashes"]["audio"]:
        raise ValueError("Audio changed")
    audio, sr = sf.read(source, dtype="float32", always_2d=True)
    pcm = audio.mean(axis=1)
    if sr != 22050:
        pcm = librosa.resample(pcm, orig_sr=sr, target_sr=22050, res_type="soxr_hq")
    pcm = np.asarray(pcm, dtype=np.float32)
    if not np.isfinite(pcm).all() or not len(pcm):
        raise ValueError("Invalid PCM")
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb") as stream:
        np.save(stream, pcm, allow_pickle=False)
    meta = {
        "source_sha256": row["hashes"]["audio"],
        "file_sha256": digest(path),
        "pcm_sha256": hashlib.sha256(pcm.tobytes()).hexdigest(),
        "duration": len(pcm) / 22050,
        "decode_seconds": time.perf_counter() - started,
    }
    write(meta_path, meta)
    return pcm, meta


def normalize(rows, duration):
    result = []
    for row in rows:
        start, end = max(0.0, row["start"]), min(duration, row["end"])
        if start >= duration or end <= start:
            continue
        if result and abs(start - result[-1]["end"]) > 1e-6:
            raise ValueError("Noncontiguous model output")
        result.append({"start": start, "end": end, "label": row["label"]})
    if not result or result[0]["start"] != 0 or abs(result[-1]["end"] - duration) > 0.1:
        raise ValueError("Missing model coverage")
    result[-1]["end"] = duration
    return result


def run(arm):
    frozen = verify()
    btc = None
    if arm == "btc":
        from experiments.original_btc import OriginalBTC

        btc = OriginalBTC(170)
    for i, row in enumerate(frozen["tracks"]):
        path = OUT / arm / (row["track_id"] + ".json")
        if path.exists():
            if read(path)["input_hashes"] != row["hashes"]:
                raise ValueError("Output input identity mismatch")
            continue
        resources()
        pcm, meta = decode(row)
        started = time.perf_counter()
        if arm == "lv" and "retained_lv_sha256" in row:
            old = OLD / (row["track_id"] + ".json")
            if digest(old) != row["retained_lv_sha256"]:
                raise ValueError("Retained result changed")
            labels = read(old)
            segments = [
                {"start": r["start_time"], "end": r["end_time"], "label": r["chord"]}
                for r in labels
            ]
            timings = {"retained_E006": True}
        elif arm == "lv":
            from harmonia_ml.inference.whole_song import infer

            result = infer(pcm)
            segments = [
                {"start": round(s["start"], 2), "end": round(s["end"], 2), "label": s["label"]}
                for s in result["segments"]
            ]
            timings = result["timings"]
        else:
            result = btc.recognize(pcm)
            segments, timings = result["segments"], result["timings"]
            feature_path = CACHE / "btc" / (row["track_id"] + ".npz")
            feature_path.parent.mkdir(parents=True, exist_ok=True)
            with feature_path.open("xb") as stream:
                np.savez_compressed(
                    stream, **{k: v for k, v in result.items() if isinstance(v, np.ndarray)}
                )
        output = {
            "track_id": row["track_id"],
            "arm": arm,
            "input_hashes": row["hashes"],
            "pcm": meta,
            "timings": timings,
            "wall_seconds": time.perf_counter() - started,
            "segments": normalize(segments, meta["duration"]),
        }
        write(path, output)
        print(f"{arm} {i + 1}/150 {row['track_id']} {output['wall_seconds']:.2f}s", flush=True)


def summarize():
    frozen = verify()
    tracks, pooled = [], {}
    for row in frozen["tracks"]:
        path = REPO / row["paths"]["prepared"]
        if digest(path) != row["hashes"]["prepared"]:
            raise ValueError("Prepared labels changed")
        with np.load(path, allow_pickle=False) as data:
            truth, times, boundaries = matrix(data), data["times"], data["boundary_times"]
        track = {k: row[k] for k in ("track_id", "split", "style", "version")}
        track["arms"] = {}
        for arm in ("lv", "btc"):
            output = read(OUT / arm / (row["track_id"] + ".json"))
            segments = [
                {**s, "target": [-1] * 8 if s["label"] == "X" else reduced(s["label"])}
                for s in output["segments"]
            ]
            predicted = sample(segments, times)
            durations = np.array([s["end"] - s["start"] for s in segments])
            track["arms"][arm] = {
                "frames": frame_score(truth, predicted),
                "segment_count": len(segments),
                "median_duration": float(np.median(durations)),
                "fraction_under_300ms": float(np.mean(durations < 0.3)),
                "boundaries": {
                    str(t): match_boundaries(
                        boundaries.tolist(),
                        [s["start"] for s in segments[1:]],
                        [False] * len(boundaries),
                        t,
                        output["pcm"]["duration"],
                    )
                    for t in (0.05, 0.1)
                },
                "wall_seconds": output["wall_seconds"],
            }
            for stratum in (
                row["split"],
                row["split"] + "/" + row["version"],
                row["split"] + "/" + row["style"],
            ):
                a, b = pooled.setdefault((arm, stratum), ([], []))
                a.append(truth)
                b.append(predicted)
        tracks.append(track)
    scores = {}
    for (arm, stratum), (truth, predicted) in pooled.items():
        scores.setdefault(stratum, {})[arm] = frame_score(
            np.concatenate(truth), np.concatenate(predicted)
        )
    write(
        OUT / "report.json",
        {
            "tracks": tracks,
            "pooled": scores,
            "production_promotion": False,
            "limitations": (
                "Related guitar performances; tempo-grid boundaries; "
                "BTC lacks bass inversions. See frozen protocol."
            ),
        },
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("freeze", "decode", "lv", "btc", "score"))
    args = parser.parse_args()
    if args.action == "freeze":
        freeze()
    elif args.action == "decode":
        for row in verify()["tracks"]:
            decode(row)
    elif args.action == "score":
        summarize()
    else:
        run(args.action)


if __name__ == "__main__":
    main()
