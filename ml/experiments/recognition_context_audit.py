"""R002: one frozen overlap-context candidate using original pinned LV weights."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

for name in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS", "NUMBA_NUM_THREADS"):
    os.environ[name] = "2"
os.environ["CUDA_VISIBLE_DEVICES"] = ""
os.environ["TORCH_FORCE_WEIGHTS_ONLY_LOAD"] = "1"

import numpy as np  # noqa: E402

from experiments.recognition_vocabulary_audit import pass_frames, segments  # noqa: E402
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
from harmonia_ml.inference.whole_song import (  # noqa: E402
    WEIGHT_HASHES,
    require_headroom,
    verify_weights,
)

OUT = ROOT / "experiments/results/R002-context-audit"
OLD = ROOT / "experiments/stabilization/results"
PROTOCOL = ROOT.parent / "docs/recognition-context-protocol.md"


def windows(length):
    if length <= 0:
        raise ValueError("Empty sequence")
    if length <= 1000:
        return [(0, length)]
    starts = list(range(0, length - 1000 + 1, 500))
    if starts[-1] != length - 1000:
        starts.append(length - 1000)
    return [(start, start + 1000) for start in starts]


def aggregate(cqt, inference):
    output, counts = None, np.zeros(len(cqt), dtype=np.float32)
    for first, last in windows(len(cqt)):
        current = inference(cqt[first:last])
        if output is None:
            output = [np.zeros((len(cqt), p.shape[1]), dtype=np.float32) for p in current]
        for dest, part in zip(output, current, strict=True):
            dest[first:last] += part
        counts[first:last] += 1
    if not (counts > 0).all():
        raise AssertionError("Uncovered frames")
    return [p / counts[:, None] for p in output]


def infer_candidate(cid, wav):
    import soundfile as sf
    import torch
    from lv_chordia.chordnet_ismir_naive import ChordNet
    from lv_chordia.extractors.cqt import CQTV2
    from lv_chordia.mir import DataEntry, io
    from lv_chordia.mir.nn.train import NetworkInterface

    for path in (OUT / f"{cid:02}-cqt.npz", OUT / f"{cid:02}-heads.npz"):
        if path.exists():
            raise FileExistsError("Candidate inference already exists")
    require_headroom()
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    weight_dir = Path(sys.prefix) / "share/lv-chordia/cache_data"
    verify_weights(weight_dir)
    start = time.perf_counter()
    pcm, sr = sf.read(wav, dtype="float32")
    if sr != 22050 or pcm.ndim != 1:
        raise ValueError("Unexpected source PCM format")
    entry = DataEntry()
    entry.prop.set("sr", sr)
    entry.prop.set("hop_length", 512)
    entry.append_data(pcm, io.MusicIO, "music")
    entry.append_extractor(CQTV2, "cqt", cache_enabled=False)
    cqt = entry.cqt
    with (OUT / f"{cid:02}-cqt.npz").open("xb") as stream:
        np.savez_compressed(stream, cqt=cqt)
    feature_seconds = time.perf_counter() - start
    model_start = time.perf_counter()
    outputs = []
    for filename in WEIGHT_HASHES:
        require_headroom()
        model = ChordNet(None)
        model.use_gpu = False
        net = NetworkInterface(
            model, filename.removesuffix(".sdict"), load_checkpoint=False, load_path=str(weight_dir)
        )
        outputs.append(aggregate(cqt, net.inference))
        del net, model
    heads = [np.mean([item[h] for item in outputs], axis=0) for h in range(6)]
    if any(not np.isfinite(p).all() for p in heads):
        raise ValueError("Nonfinite candidate posteriors")
    model_seconds = time.perf_counter() - model_start
    with (OUT / f"{cid:02}-heads.npz").open("xb") as stream:
        np.savez_compressed(stream, **{f"head{i}": p for i, p in enumerate(heads)})
    return heads, {
        "cqt_and_decode_seconds": feature_seconds,
        "five_network_seconds": model_seconds,
        "windows": windows(len(cqt)),
        "frames": len(cqt),
    }


def main(stage):
    import lv_chordia
    from lv_chordia.extractors.xhmm_ismir import XHMMDecoder

    OUT.mkdir(parents=True, exist_ok=True)
    if stage == "validation":
        previous = json.loads((OUT / "training.json").read_text())
        if not previous["accepted"]:
            raise ValueError("Failed training gate; validation forbidden")
        frozen = json.loads((OUT / "training-freeze.json").read_text())
        for path, expected in frozen["sources"].items():
            if digest(path) != expected:
                raise ValueError(f"Frozen source changed: {path}")
    ids = (2, 3) if stage == "training" else (14, 15, 16, 17, 18)
    package = Path(lv_chordia.__file__).parent
    dictionary = package / "data/submission_chord_list.txt"
    sources = [
        Path(__file__),
        PROTOCOL,
        dictionary,
        ROOT / "experiments/recognition_vocabulary_audit.py",
        ROOT / "experiments/stabilization/compare.py",
        ROOT / "experiments/boundary_comparison.py",
        ROOT / "harmonia_ml/inference/whole_song.py",
        *package.rglob("*.py"),
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
    manifest = ROOT / "data/prepared/winterreise-hu33-v1/manifest.json"
    if digest(manifest) != "a54ce6ed104a42b8216f5045e4bc0be0d4912e61c8678c920ddf896dc63faf4d":
        raise ValueError("Changed manifest")
    write(
        OUT / f"{stage}-freeze.json",
        {
            "utc": datetime.now(UTC).isoformat(),
            "compositions": ids,
            "sources": {str(p): digest(p) for p in sources},
            "inputs": {str(p): digest(p) for p in inputs},
            "weight_hashes": WEIGHT_HASHES,
        },
    )
    refs = None
    if stage == "validation":
        refs = json.loads(
            (ROOT / "experiments/results/B001-boundary-refinement/report.json").read_text()
        )
    pooled = {name: [[], []] for name in ("original", "candidate")}
    tracks = []
    for cid in ids:
        baseline = json.loads((OLD / f"refinement-{cid:02}.json").read_text())
        # A fresh child isolates PyTorch interop setup per recording.
        import subprocess

        subprocess.run(
            [sys.executable, "-m", "experiments.recognition_context_audit", "infer", str(cid)],
            check=True,
        )
        with np.load(OUT / f"{cid:02}-heads.npz", allow_pickle=False) as data:
            heads = [data[f"head{i}"] for i in range(6)]
        timings = json.loads((OUT / f"{cid:02}-timings.json").read_text())
        decoder = XHMMDecoder(template_file=str(dictionary))
        start = time.perf_counter()
        labels = decoder.decode(heads, np.ones(len(heads[0]), dtype=np.int8))
        timings["hmm_seconds"] = time.perf_counter() - start
        timelines = {
            "original": [{**s, "target": reduced(s["label"])} for s in baseline["segments"]],
            "candidate": segments(labels, baseline["duration"]),
        }
        write(
            OUT / f"{cid:02}-candidate.json",
            {"segments": timelines["candidate"], "timings": timings},
        )
        with np.load(
            ROOT / f"data/prepared/winterreise-hu33-v1/Schubert_D911-{cid:02}_HU33.npz",
            allow_pickle=False,
        ) as data:
            truth, mask, times = matrix(data), data["mask"], data["times"]
        row = {"composition": cid, "timings": timings, "arms": {}}
        for name, timeline in timelines.items():
            prediction = sample(timeline, times)
            row["arms"][name] = {
                "frames": frame_score(truth[mask], prediction[mask]),
                "segment_count": len(timeline),
            }
            if refs:
                ref = next(t["reference"] for t in refs["tracks"] if t["composition"] == cid)
                row["arms"][name]["timeline"] = timeline_score(ref, timeline)
            pooled[name][0].append(truth[mask])
            pooled[name][1].append(prediction[mask])
        tracks.append(row)
        print(
            stage,
            cid,
            {k: v["frames"]["reduced_structural_exact"] for k, v in row["arms"].items()},
            flush=True,
        )
    scores = {
        name: frame_score(np.concatenate(a), np.concatenate(b)) for name, (a, b) in pooled.items()
    }
    accepted = pass_frames(scores["original"], scores["candidate"])
    boundaries = {}
    if stage == "validation":
        for name in pooled:
            rows = [r["arms"][name]["timeline"]["boundaries"]["0.05"] for r in tracks]
            tp, fp, fn = [
                sum(r[key] for r in rows)
                for key in ("true_positives", "false_positives", "false_negatives")
            ]
            boundaries[name] = {
                "f1": 2 * tp / (2 * tp + fp + fn),
                "missed_short": sum(r["missed_short_adjacent"] for r in rows),
            }
        accepted &= boundaries["candidate"]["f1"] >= boundaries["original"]["f1"]
        accepted &= (
            boundaries["candidate"]["missed_short"] <= boundaries["original"]["missed_short"]
        )
    write(
        OUT / f"{stage}.json",
        {
            "accepted": bool(accepted),
            "tracks": tracks,
            "pooled": scores,
            "boundary_gate": boundaries,
        },
    )
    print("Accepted", bool(accepted), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage", choices=("training", "validation", "infer"))
    parser.add_argument("composition", type=int, nargs="?")
    args = parser.parse_args()
    if args.stage == "infer":
        if args.composition not in (2, 3, 14, 15, 16, 17, 18):
            raise ValueError("Only frozen training/validation IDs allowed")
        stage = "training" if args.composition in (2, 3) else "validation"
        if not (OUT / f"{stage}-freeze.json").exists():
            raise ValueError("No stage freeze")
        wav = (
            ROOT
            / "data/downloads/winterreise-hu33-v2.1/01_RawData/audio_wav"
            / f"Schubert_D911-{args.composition:02}_HU33.wav"
        )
        _, timings = infer_candidate(args.composition, wav)
        write(OUT / f"{args.composition:02}-timings.json", timings)
    else:
        main(args.stage)
