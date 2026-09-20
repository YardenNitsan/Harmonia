"""Descriptive fixed-bin reliability; no calibration fit or new model inference."""

from __future__ import annotations

import json

import numpy as np

from experiments.stabilization.compare import OUT, ROOT, digest, project, reduced, write


def reliability(confidence, correct):
    confidence, correct = np.concatenate(confidence), np.concatenate(correct)
    if not np.isfinite(confidence).all() or ((confidence < 0) | (confidence > 1)).any():
        raise ValueError("Reliability requires bounded finite scores")
    bins, ece = [], 0.0
    assignments = np.minimum((confidence * 10).astype(int), 9)
    for index in range(10):
        mask = assignments == index
        count = int(mask.sum())
        mean = float(confidence[mask].mean()) if count else None
        accuracy = float(correct[mask].mean()) if count else None
        if count:
            ece += count / len(correct) * abs(mean - accuracy)
        bins.append(
            {
                "lower": index / 10,
                "upper": (index + 1) / 10,
                "count": count,
                "mean_score": mean,
                "joint_root_triad_accuracy": accuracy,
            }
        )
    return {
        "frames": len(correct),
        "ece_10_fixed_bins": ece,
        "binary_selected_event_brier": float(np.mean((confidence - correct) ** 2)),
        "mean_score": float(confidence.mean()),
        "joint_root_triad_accuracy": float(correct.mean()),
        "bins": bins,
    }


def main():
    files = [OUT / f"refinement-{i}-heads.npz" for i in range(14, 19)]
    write(
        OUT / "reliability-preflight.json",
        {
            "runner_sha256": digest(__file__),
            "protocol": (
                "10 equal bins [0,.1)...[.9,1], same five valid frame masks; "
                "binary Brier of correct joint root+triad event; no calibration fitting"
            ),
            "head_sha256": {str(p): digest(p) for p in files},
        },
    )
    dsp = json.loads((OUT / "dsp-adapter.json").read_text())
    aggregate = {
        arm: [[], []]
        for arm in ("lv_emitted_region_support", "lv_frame_support", "dsp_region_similarity")
    }
    for cid in range(14, 19):
        with np.load(
            ROOT / f"data/prepared/winterreise-hu33-v1/Schubert_D911-{cid}_HU33.npz"
        ) as data:
            times, mask = data["times"], data["mask"]
            truth = np.column_stack((data["root"], data["triad"]))
        prediction = json.loads((OUT / f"refinement-{cid}.json").read_text())
        with np.load(OUT / f"refinement-{cid}-heads.npz") as data:
            posterior = data["head0"]
        chosen = np.zeros(len(times), dtype=int)
        projected = np.full((len(times), 2), -1)
        support = np.zeros(len(times))
        triad_ids = {0: 0, 1: 1, 2: 2, 3: 5, 4: 6, 5: 4, 6: 3}
        for segment in prediction["segments"]:
            selected = (times >= segment["start"]) & (times < segment["end"])
            root, triad = reduced(segment["label"])[:2]
            projected[selected] = [root, triad]
            chosen[selected] = (triad_ids[triad] - 1) * 12 + root + 1 if triad else 0
            support[selected] = segment["score"]
        correct = (truth == projected).all(1)[mask].astype(float)
        aggregate["lv_emitted_region_support"][0].append(support[mask])
        aggregate["lv_emitted_region_support"][1].append(correct)
        frame = np.minimum((times * 22050 / 512).astype(int), len(posterior) - 1)
        aggregate["lv_frame_support"][0].append(posterior[frame, chosen][mask])
        aggregate["lv_frame_support"][1].append(correct)
        projected[:] = -1
        support[:] = 0
        for segment in next(t["segments"] for t in dsp["tracks"] if t["composition"] == cid):
            selected = (times >= segment["start"]) & (times < segment["end"])
            projected[selected] = project(segment["chord"])[:2]
            support[selected] = segment["score"]
        aggregate["dsp_region_similarity"][0].append(support[mask])
        aggregate["dsp_region_similarity"][1].append(
            (truth == projected).all(1)[mask].astype(float)
        )
    report = {arm: reliability(*values) for arm, values in aggregate.items()}
    report["e010"] = {
        "status": "unavailable",
        "reason": (
            "Retained arrays contain decisions and boundary scores, not quality posterior; "
            "no inference rerun or fitting."
        ),
    }
    report["interpretation"] = (
        "Diagnostic confidence mismatch only. No score is a calibrated whole-chord probability. "
        "LV selected-triad support concerns joint root/triad, not suffix or bass correctness."
    )
    write(OUT / "reliability.json", report)
    print(
        {
            a: (r["ece_10_fixed_bins"], r["binary_selected_event_brier"])
            for a, r in report.items()
            if isinstance(r, dict) and "ece_10_fixed_bins" in r
        }
    )


if __name__ == "__main__":
    main()
