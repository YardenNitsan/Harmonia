"""Frozen retained-head vocabulary comparison; never loads audio or model weights."""

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

from experiments.stabilization.compare import (  # noqa: E402
    OUT as RETAINED,
)
from experiments.stabilization.compare import (  # noqa: E402
    ROOT,
    classification,
    digest,
    frame_score,
    matrix,
    reduced,
    sample,
    timeline_score,
    write,
)

OUT = ROOT / "experiments/results/R001-vocabulary-audit"
PROTOCOL = ROOT.parent / "docs/recognition-vocabulary-audit-protocol.md"
PACKAGE = Path(lv_chordia.__file__).parent
HOP = 512 / 22050


def segments(labels, duration):
    labels = np.asarray(labels)
    edges = np.r_[0, np.flatnonzero(labels[1:] != labels[:-1]) + 1, len(labels)]
    return [
        {
            "start": float(a * HOP),
            "end": min(float(b * HOP), duration),
            "label": str(labels[a]),
            "target": reduced(str(labels[a])),
        }
        for a, b in zip(edges[:-1], edges[1:], strict=True)
    ]


def pass_frames(before, after):
    return (
        after["reduced_structural_exact"] > before["reduced_structural_exact"]
        and all(
            after[key]["accuracy"] >= before[key]["accuracy"] for key in ("root", "triad", "bass")
        )
        and after["inversion_bass_exact"] >= before["inversion_bass_exact"]
    )


def run(stage):
    OUT.mkdir(parents=True, exist_ok=True)
    if (OUT / f"{stage}.json").exists():
        raise FileExistsError("Completed experiment cannot be rerun")
    if stage == "validation":
        train = json.loads((OUT / "training.json").read_text())
        if not train["accepted"]:
            raise ValueError("Training gate failed; validation forbidden")
        frozen = json.loads((OUT / "training-freeze.json").read_text())
        for path, expected in frozen["sources"].items():
            if digest(path) != expected:
                raise ValueError(f"Frozen source changed: {path}")
    ids = (2, 3) if stage == "training" else (14, 15, 16, 17, 18)
    manifest = ROOT / "data/prepared/winterreise-hu33-v1/manifest.json"
    if digest(manifest) != "a54ce6ed104a42b8216f5045e4bc0be0d4912e61c8678c920ddf896dc63faf4d":
        raise ValueError("Prepared manifest changed")
    dictionaries = {
        name: PACKAGE / f"data/{name}_chord_list.txt" for name in ("submission", "full")
    }
    sources = [
        Path(__file__),
        PROTOCOL,
        manifest,
        PACKAGE / "extractors/xhmm_ismir.py",
        PACKAGE / "complex_chord.py",
        ROOT / "experiments/stabilization/compare.py",
        ROOT / "experiments/boundary_comparison.py",
        *dictionaries.values(),
    ]
    inputs = []
    for cid in ids:
        inputs.extend(
            [
                RETAINED / f"refinement-{cid:02}-heads.npz",
                RETAINED / f"refinement-{cid:02}.json",
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
            "model_inference": False,
            "audio_access": False,
            "penalty": 30,
        },
    )
    decoders = {name: XHMMDecoder(template_file=str(path)) for name, path in dictionaries.items()}
    refs = None
    if stage == "validation":
        refs = json.loads(
            (ROOT / "experiments/results/B001-boundary-refinement/report.json").read_text()
        )
    tracks, pooled = [], {name: [[], []] for name in dictionaries}
    raw_truth, raw_pred = [], []
    for cid in ids:
        original = json.loads((RETAINED / f"refinement-{cid:02}.json").read_text())
        with np.load(RETAINED / f"refinement-{cid:02}-heads.npz", allow_pickle=False) as data:
            heads = [data[f"head{i}"] for i in range(6)]
        if [p.shape[1] for p in heads] != [73, 13, 4, 4, 3, 3]:
            raise ValueError("Unexpected six-head vocabulary")
        with np.load(
            ROOT / f"data/prepared/winterreise-hu33-v1/Schubert_D911-{cid:02}_HU33.npz",
            allow_pickle=False,
        ) as data:
            truth, mask, times = matrix(data), data["mask"], data["times"]
        row = {"composition": cid, "arms": {}, "coverage": {}}
        for name, decoder in decoders.items():
            if name == "submission":
                timeline = [{**s, "target": reduced(s["label"])} for s in original["segments"]]
            else:
                labels = decoder.decode(heads, np.ones(len(heads[0]), dtype=np.int8))
                timeline = segments(labels, original["duration"])
            prediction = sample(timeline, times)
            row["arms"][name] = {
                "frames": frame_score(truth[mask], prediction[mask]),
                "segment_count": len(timeline),
            }
            if refs is not None:
                ref = next(t["reference"] for t in refs["tracks"] if t["composition"] == cid)
                row["arms"][name]["timeline"] = timeline_score(ref, timeline)
            pooled[name][0].append(truth[mask])
            pooled[name][1].append(prediction[mask])
            names, _ = decoder.get_chord_tag_obs([p[:1] for p in heads])
            vocabulary = {tuple(reduced(label)) for label in names}
            covered = np.array([tuple(target) in vocabulary for target in truth[mask]])
            inversion = truth[mask, 0] != truth[mask, 3]
            row["coverage"][name] = {
                "states": len(names),
                "reduced_projection_coverage": float(covered.mean()),
                "inversion_frames": int(inversion.sum()),
                "inversion_reduced_coverage": float(covered[inversion].mean()),
            }
            if name == "full":
                write(OUT / f"{stage}-{cid:02}-candidate.json", {"segments": timeline})
        indices = np.minimum(np.floor(times / HOP).astype(int), len(heads[0]) - 1)
        triad_ids = heads[0].argmax(1)[indices]
        raw = np.column_stack(
            [
                np.where(triad_ids == 0, 12, (triad_ids - 1) % 12),
                np.array([0, 1, 2, 6, 5, 3, 4])[(triad_ids + 11) // 12],
                np.array([0, 2, 1, 3])[heads[2].argmax(1)[indices]],
                (heads[1].argmax(1)[indices] + 11) % 13,
            ]
        )
        # Bass head zero is N; pitched values 1..12 map to C..B.
        bass = heads[1].argmax(1)[indices]
        raw[:, 3] = np.where(bass == 0, 12, bass - 1)
        raw_truth.append(truth[mask, :4])
        raw_pred.append(raw[mask])
        row["raw_head_argmax_counts"] = [
            np.bincount(p.argmax(1), minlength=p.shape[1]).tolist() for p in heads
        ]
        tracks.append(row)
        print(stage, cid, "candidate vocabulary decoded", flush=True)
    scores = {
        name: frame_score(np.concatenate(a), np.concatenate(b)) for name, (a, b) in pooled.items()
    }
    accepted = pass_frames(scores["submission"], scores["full"])
    boundary = {}
    if stage == "validation":
        for name in dictionaries:
            rows = [r["arms"][name]["timeline"]["boundaries"]["0.05"] for r in tracks]
            tp, fp, fn = [
                sum(r[key] for r in rows)
                for key in ("true_positives", "false_positives", "false_negatives")
            ]
            boundary[name] = {
                "f1": 2 * tp / (2 * tp + fp + fn),
                "missed_short": sum(r["missed_short_adjacent"] for r in rows),
            }
        accepted &= boundary["full"]["f1"] >= boundary["submission"]["f1"]
        accepted &= boundary["full"]["missed_short"] <= boundary["submission"]["missed_short"]
    a, b = np.concatenate(raw_truth), np.concatenate(raw_pred)
    report = {
        "accepted": bool(accepted),
        "stage": stage,
        "tracks": tracks,
        "pooled": scores,
        "boundary_gate": boundary,
        "raw_independent_heads": {
            name: classification(a[:, i], b[:, i], range(size))
            for i, (name, size) in enumerate(
                zip(("root", "triad", "seventh", "bass"), (13, 8, 4, 13), strict=True)
            )
        },
    }
    write(OUT / f"{stage}.json", report)
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
    run(parser.parse_args().stage)
