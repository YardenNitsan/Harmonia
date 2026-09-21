"""R004 fixed upstream two-stage decoder on retained heads only."""

from __future__ import annotations

import argparse
import json
import os
from datetime import UTC, datetime
from pathlib import Path

for name in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS", "NUMBA_NUM_THREADS"):
    os.environ[name] = "2"
os.environ["CUDA_VISIBLE_DEVICES"] = ""

import lv_chordia  # noqa: E402
import numpy as np  # noqa: E402
from lv_chordia.extractors.xhmm_ismir import XHMMDecoder  # noqa: E402

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

OUT = ROOT / "experiments/results/R004-layered-audit"
OLD = ROOT / "experiments/stabilization/results"


def main(stage):
    OUT.mkdir(parents=True, exist_ok=True)
    if stage == "validation":
        if not json.loads((OUT / "training.json").read_text())["accepted"]:
            raise ValueError("Failed training gate; validation forbidden")
        frozen = json.loads((OUT / "training-freeze.json").read_text())
        for path, expected in frozen["sources"].items():
            if digest(path) != expected:
                raise ValueError(f"Changed source: {path}")
    ids = (2, 3) if stage == "training" else (14, 15, 16, 17, 18)
    package = Path(lv_chordia.__file__).parent
    dictionary = package / "data/submission_chord_list.txt"
    sources = [
        Path(__file__),
        ROOT.parent / "docs/recognition-layered-protocol.md",
        dictionary,
        ROOT / "experiments/recognition_vocabulary_audit.py",
        ROOT / "experiments/stabilization/compare.py",
        ROOT / "experiments/boundary_comparison.py",
        package / "extractors/xhmm_ismir.py",
    ]
    inputs = []
    for cid in ids:
        inputs.extend(
            [
                OLD / f"refinement-{cid:02}.json",
                OLD / f"refinement-{cid:02}-heads.npz",
                ROOT / f"data/prepared/winterreise-hu33-v1/Schubert_D911-{cid:02}_HU33.npz",
            ]
        )
    write(
        OUT / f"{stage}-freeze.json",
        {
            "utc": datetime.now(UTC).isoformat(),
            "compositions": ids,
            "sources": {str(p): digest(p) for p in sources},
            "inputs": {str(p): digest(p) for p in inputs},
        },
    )
    refs = None
    if stage == "validation":
        refs = json.loads(
            (ROOT / "experiments/results/B001-boundary-refinement/report.json").read_text()
        )
    pooled, tracks = {name: [[], []] for name in ("original", "layered")}, []
    for cid in ids:
        original = json.loads((OLD / f"refinement-{cid:02}.json").read_text())
        with np.load(OLD / f"refinement-{cid:02}-heads.npz", allow_pickle=False) as data:
            heads = [data[f"head{i}"] for i in range(6)]
        decoder = XHMMDecoder(template_file=str(dictionary))
        labels = decoder.layer_decode(heads, np.ones(len(heads[0]), dtype=np.int8))
        timelines = {
            "original": [{**s, "target": reduced(s["label"])} for s in original["segments"]],
            "layered": segments(labels, original["duration"]),
        }
        write(OUT / f"{cid:02}-candidate.json", {"segments": timelines["layered"]})
        with np.load(
            ROOT / f"data/prepared/winterreise-hu33-v1/Schubert_D911-{cid:02}_HU33.npz",
            allow_pickle=False,
        ) as data:
            truth, mask, times = matrix(data), data["mask"], data["times"]
        row = {"composition": cid, "arms": {}}
        for name, timeline in timelines.items():
            predictions = sample(timeline, times)
            row["arms"][name] = {
                "frames": frame_score(truth[mask], predictions[mask]),
                "segment_count": len(timeline),
            }
            pooled[name][0].append(truth[mask])
            pooled[name][1].append(predictions[mask])
            if refs:
                ref = next(t["reference"] for t in refs["tracks"] if t["composition"] == cid)
                row["arms"][name]["timeline"] = timeline_score(ref, timeline)
        tracks.append(row)
    scores = {
        name: frame_score(np.concatenate(a), np.concatenate(b)) for name, (a, b) in pooled.items()
    }
    accepted = pass_frames(scores["original"], scores["layered"])
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
        accepted &= boundaries["layered"]["f1"] >= boundaries["original"]["f1"]
        accepted &= boundaries["layered"]["missed_short"] <= boundaries["original"]["missed_short"]
    write(
        OUT / f"{stage}.json",
        {
            "accepted": bool(accepted),
            "tracks": tracks,
            "pooled": scores,
            "boundary_gate": boundaries,
        },
    )
    print(
        json.dumps(
            {
                "accepted": bool(accepted),
                "scores": {
                    k: {
                        "root": v["root"]["accuracy"],
                        "triad": v["triad"]["accuracy"],
                        "bass": v["bass"]["accuracy"],
                        "exact": v["reduced_structural_exact"],
                        "inversion_bass": v["inversion_bass_exact"],
                    }
                    for k, v in scores.items()
                },
            }
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage", choices=("training", "validation"))
    main(parser.parse_args().stage)
