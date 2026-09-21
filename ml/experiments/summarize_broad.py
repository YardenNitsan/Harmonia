"""Descriptive R005 aggregates from retained outputs only; no inference or selection."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "experiments/results/R005-broad-existing-models"


def main():
    report = json.loads((OUT / "report.json").read_text())
    results = {}
    for split in ("train", "validation"):
        for mode in ("all", "comp", "solo"):
            tracks = [
                t
                for t in report["tracks"]
                if t["split"] == split and (mode == "all" or t["version"] == mode)
            ]
            group = {}
            for arm in ("lv", "btc"):
                durations, latencies, counts, no_chord, total = [], [], [], 0.0, 0.0
                for track in tracks:
                    raw = json.loads((OUT / arm / (track["track_id"] + ".json")).read_text())
                    for segment in raw["segments"]:
                        duration = segment["end"] - segment["start"]
                        durations.append(duration)
                        no_chord += duration if segment["label"] == "N" else 0
                        total += duration
                    counts.append(len(raw["segments"]))
                    if not raw["timings"].get("retained_E006", False):
                        latencies.append(raw["wall_seconds"])
                boundaries = {}
                for tolerance in ("0.05", "0.1"):
                    metrics = [t["arms"][arm]["boundaries"][tolerance] for t in tracks]
                    tp = sum(m["true_positives"] for m in metrics)
                    fp = sum(m["false_positives"] for m in metrics)
                    fn = sum(m["false_negatives"] for m in metrics)
                    boundaries[tolerance] = {
                        "tp": tp,
                        "fp": fp,
                        "fn": fn,
                        "precision": tp / (tp + fp) if tp + fp else None,
                        "recall": tp / (tp + fn) if tp + fn else None,
                        "f1": 2 * tp / (2 * tp + fp + fn),
                    }
                group[arm] = {
                    "tracks": len(tracks),
                    "audio_seconds": total,
                    "segment_count": sum(counts),
                    "median_segment_seconds": float(np.median(durations)),
                    "mean_segment_seconds": float(np.mean(durations)),
                    "fraction_regions_under_300ms": float(np.mean(np.array(durations) < 0.3)),
                    "no_chord_duration_fraction": no_chord / total,
                    "latency_measured_tracks": len(latencies),
                    "latency_median_seconds": float(np.median(latencies)),
                    "latency_total_seconds": float(np.sum(latencies)),
                    "track_mean_root": float(
                        np.mean([t["arms"][arm]["frames"]["root"]["accuracy"] for t in tracks])
                    ),
                    "track_mean_reduced_exact": float(
                        np.mean(
                            [t["arms"][arm]["frames"]["reduced_structural_exact"] for t in tracks]
                        )
                    ),
                    "source_grid_boundaries": boundaries,
                }
            results[split + "/" + mode] = group
    with (OUT / "summary.json").open("x", encoding="utf-8") as stream:
        json.dump(results, stream, indent=2, allow_nan=False)


if __name__ == "__main__":
    main()
