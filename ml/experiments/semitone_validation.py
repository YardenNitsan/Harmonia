"""Once-only real validation of frozen R006 tuning; no baseline reruns."""

from __future__ import annotations

import json
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

from experiments.semitone_tuning import tuned_infer
from experiments.stabilization.compare import (
    digest,
    frame_score,
    matrix,
    reduced,
    resources,
    sample,
    timeline_score,
    write,
)

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
BROAD = ROOT / "experiments/results/R005-broad-existing-models"
OUT = ROOT / "experiments/results/R006-semitone-validation"


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def metrics(score):
    return [score[h]["accuracy"] for h in ("root", "triad", "seventh", "bass")] + [
        score["reduced_structural_exact"]
    ]


def main():
    if not read(ROOT / "experiments/results/R006-semitone-tuning/report.json")["accepted"]:
        raise ValueError("Training gate failed")
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for row in read(BROAD / "freeze.json")["tracks"]:
        if row["split"] != "validation":
            continue
        rows.append(
            {
                "id": row["track_id"],
                "domain": "guitarset",
                "audio": REPO
                / ".superpowers/diagnostics/broad-r005/pcm"
                / (row["track_id"] + ".npy"),
                "prepared": REPO / row["paths"]["prepared"],
                "baseline": BROAD / "lv" / (row["track_id"] + ".json"),
            }
        )
    for cid in range(14, 19):
        stem = f"Schubert_D911-{cid:02}_HU33"
        rows.append(
            {
                "id": stem,
                "domain": "hu33",
                "composition": cid,
                "audio": ROOT
                / f"data/downloads/winterreise-hu33-v2.1/01_RawData/audio_wav/{stem}.wav",
                "prepared": ROOT / f"data/prepared/winterreise-hu33-v1/{stem}.npz",
                "baseline": ROOT / f"experiments/stabilization/results/refinement-{cid:02}.json",
            }
        )
    files = [
        Path(__file__),
        ROOT / "experiments/semitone_tuning.py",
        REPO / "docs/semitone-tuning-validation.md",
    ]
    files += [row[k] for row in rows for k in ("audio", "prepared", "baseline")]
    write(OUT / "freeze.json", {"sources": {str(p.relative_to(REPO)): digest(p) for p in files}})
    refs = read(ROOT / "experiments/results/B001-boundary-refinement/report.json")
    pooled = {
        (domain, arm): [[], []]
        for domain in ("guitarset", "hu33")
        for arm in ("original", "candidate")
    }
    tracks = []
    for row in rows:
        resources()
        if row["domain"] == "guitarset":
            pcm = np.load(row["audio"], allow_pickle=False)
        else:
            pcm, sr = sf.read(row["audio"], dtype="float32")
            if sr != 22050 or pcm.ndim != 1:
                raise ValueError("Unexpected PCM")
        original = read(row["baseline"])
        tuning = float(librosa.estimate_tuning(y=pcm, sr=22050, bins_per_octave=12))
        candidate = tuned_infer(pcm, tuning) if abs(tuning) > 1 / 6 else original
        if candidate is not original and row["domain"] == "guitarset":
            candidate["segments"] = [
                {**s, "start": round(s["start"], 2), "end": round(s["end"], 2)}
                for s in candidate["segments"]
            ]
            candidate["segments"][-1]["end"] = len(pcm) / 22050
        with np.load(row["prepared"], allow_pickle=False) as data:
            truth, times = matrix(data), data["times"]
            mask = data["mask"] if "mask" in data else np.ones(len(times), dtype=bool)
        record = {
            "id": row["id"],
            "domain": row["domain"],
            "tuning_semitones": tuning,
            "applied": candidate is not original,
            "arms": {},
        }
        for arm, result in (("original", original), ("candidate", candidate)):
            segments = [{**s, "target": reduced(s["label"])} for s in result["segments"]]
            prediction = sample(segments, times)
            entry = {"frames": frame_score(truth[mask], prediction[mask]), "segments": segments}
            if row["domain"] == "hu33":
                reference = next(
                    t["reference"] for t in refs["tracks"] if t["composition"] == row["composition"]
                )
                entry["timeline"] = timeline_score(reference, segments)
            record["arms"][arm] = entry
            a, b = pooled[(row["domain"], arm)]
            a.append(truth[mask])
            b.append(prediction[mask])
        write(OUT / (row["id"] + ".json"), record)
        tracks.append(record)
        print(row["id"], tuning, record["applied"], flush=True)
    scores = {}
    for (domain, arm), (truth, prediction) in pooled.items():
        scores.setdefault(domain, {})[arm] = frame_score(
            np.concatenate(truth), np.concatenate(prediction)
        )
    deltas = {
        d: (np.array(metrics(s["candidate"])) - metrics(s["original"])).tolist()
        for d, s in scores.items()
    }
    boundaries = {}
    for arm in ("original", "candidate"):
        values = [
            t["arms"][arm]["timeline"]["boundaries"]["0.05"]
            for t in tracks
            if t["domain"] == "hu33"
        ]
        tp, fp, fn = [
            sum(v[k] for v in values)
            for k in ("true_positives", "false_positives", "false_negatives")
        ]
        boundaries[arm] = {
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "f1": 2 * tp / (2 * tp + fp + fn),
            "short_missed": sum(v["missed_short_adjacent"] for v in values),
        }
    accepted = (
        all(min(v) >= -0.005 for v in deltas.values())
        and any(v[0] >= 0.01 and v[4] >= 0.005 for v in deltas.values())
        and boundaries["candidate"]["f1"] >= boundaries["original"]["f1"] - 0.02
        and boundaries["candidate"]["short_missed"] <= boundaries["original"]["short_missed"]
    )
    write(
        OUT / "report.json",
        {
            "scores": scores,
            "deltas": deltas,
            "boundaries": boundaries,
            "accepted": accepted,
            "activated": sum(t["applied"] for t in tracks),
            "production_promotion": False,
        },
    )


if __name__ == "__main__":
    main()
