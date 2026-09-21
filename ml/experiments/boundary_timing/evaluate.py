"""Frozen onset timing comparison using retained heads; never runs a model."""

import argparse
import json
import os
import sys
from pathlib import Path

for name in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS", "NUMBA_NUM_THREADS"):
    os.environ[name] = "2"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import librosa  # noqa: E402
import lv_chordia  # noqa: E402
import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
from lv_chordia.extractors.xhmm_ismir import XHMMDecoder  # noqa: E402

from experiments.boundary_comparison import reference_intervals  # noqa: E402
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
from harmonia_ml.data.winterreise import parse_annotations  # noqa: E402
from harmonia_ml.inference.boundary_timing import align_boundaries  # noqa: E402

OUT = ROOT / "experiments/boundary_timing/results"
RETAINED = ROOT / "experiments/stabilization/results"
HOP = 512 / 22050


def run(stage):
    OUT.mkdir(parents=True, exist_ok=True)
    modes = ["original", "peak", "backtrack"]
    if stage == "validation":
        frozen = json.loads((OUT / "training.json").read_text())
        if not frozen["selected"]:
            raise ValueError("No candidate passed training gates")
        for path, checksum in frozen["sources"].items():
            if digest(path) != checksum:
                raise ValueError("Frozen source changed")
        modes = ["original", frozen["selected"]]
    compositions = [2, 3] if stage == "training" else list(range(14, 19))
    sources = {
        str(p): digest(p)
        for p in [
            Path(__file__),
            ROOT / "harmonia_ml/inference/boundary_timing.py",
            ROOT.parent / "docs/boundary-timing-protocol.md",
        ]
    }
    manifest = ROOT / "data/prepared/winterreise-hu33-v1/manifest.json"
    assert digest(manifest) == "a54ce6ed104a42b8216f5045e4bc0be0d4912e61c8678c920ddf896dc63faf4d"
    write(
        OUT / f"{stage}-preflight.json",
        {"compositions": compositions, "sources": sources, "modes": modes},
    )
    decoder = XHMMDecoder(
        template_file=str(Path(lv_chordia.__file__).parent / "data/submission_chord_list.txt")
    )
    pools = {mode: [[], []] for mode in modes}
    tracks = []
    for composition in compositions:
        stem = f"Schubert_D911-{composition:02}_HU33"
        result = json.loads((RETAINED / f"refinement-{composition:02}.json").read_text())
        source = ROOT / f"data/downloads/winterreise-hu33-v2.1/01_RawData/audio_wav/{stem}.wav"
        pcm, sr = sf.read(source, dtype="float32")
        assert sr == 22050 and pcm.ndim == 1
        annotation = (
            ROOT / f"data/downloads/winterreise-hu33-v2.1/02_Annotations/ann_audio_chord/{stem}.csv"
        )
        prepared = ROOT / f"data/prepared/winterreise-hu33-v1/{stem}.npz"
        with np.load(prepared, allow_pickle=False) as data:
            truth, mask, times = matrix(data), data["mask"], data["times"]
            precise = data["boundary_times"].tolist()
        reference = reference_intervals(
            parse_annotations(
                annotation.read_text(encoding="utf-8-sig"), duration=result["duration"]
            ),
            precise,
        )
        with np.load(
            RETAINED / f"refinement-{composition:02}-heads.npz", allow_pickle=False
        ) as data:
            heads = [data[f"head{i}"] for i in range(6)]
        names, obs = decoder.get_chord_tag_obs(heads)
        onset = librosa.onset.onset_strength(y=pcm, sr=sr, hop_length=512)
        peaks = librosa.onset.onset_detect(onset_envelope=onset, sr=sr, hop_length=512)
        attack = {
            "peak": peaks * HOP,
            "backtrack": librosa.onset.onset_backtrack(peaks, onset) * HOP,
        }
        original = [(s["start"], s["end"], s["label"]) for s in result["segments"]]
        entry = {
            "composition": composition,
            "sources": {str(p): digest(p) for p in [source, annotation, prepared]},
            "arms": {},
        }
        for mode in modes:
            rows = (
                original
                if mode == "original"
                else align_boundaries(original, attack[mode], obs, names, HOP)
            )
            segments = [{"start": a, "end": b, "target": reduced(label)} for a, b, label in rows]
            predictions = sample(segments, times)
            pools[mode][0].append(truth[mask])
            pools[mode][1].append(predictions[mask])
            entry["arms"][mode] = {
                "timeline": timeline_score(reference, segments),
                "moved": sum(a[0] != b[0] for a, b in zip(original, rows, strict=True)),
                "rows": rows,
            }
        tracks.append(entry)
        print(stage, composition, flush=True)
    scores = {
        mode: frame_score(np.concatenate(a), np.concatenate(b)) for mode, (a, b) in pools.items()
    }
    boundaries = {}
    for mode in modes:
        rows = [t["arms"][mode]["timeline"]["boundaries"]["0.05"] for t in tracks]
        tp, fp, fn = [
            sum(r[k] for r in rows)
            for k in ["true_positives", "false_positives", "false_negatives"]
        ]
        boundaries[mode] = {
            "f1": 2 * tp / (2 * tp + fp + fn),
            "recall": tp / (tp + fn),
            "precision": tp / (tp + fp),
            "short_missed": sum(r["missed_short_adjacent"] for r in rows),
            "tp": tp,
            "fp": fp,
            "fn": fn,
        }

    def passes(mode):
        base, now = boundaries["original"], boundaries[mode]
        return (
            now["f1"] > base["f1"]
            and (stage != "validation" or now["f1"] >= base["f1"] + 0.01)
            and now["recall"] >= base["recall"]
            and now["short_missed"] <= base["short_missed"]
            and scores[mode]["root"]["accuracy"] >= scores["original"]["root"]["accuracy"] - 0.002
            and scores[mode]["reduced_structural_exact"]
            >= scores["original"]["reduced_structural_exact"] - 0.002
        )

    selected = next(
        iter(
            sorted(
                (m for m in modes[1:] if passes(m)), key=lambda m: boundaries[m]["f1"], reverse=True
            )
        ),
        None,
    )
    report = {
        "sources": sources,
        "selected": selected,
        "scores": scores,
        "boundaries": boundaries,
        "tracks": tracks,
    }
    write(OUT / f"{stage}.json", report)
    print(
        json.dumps(
            {
                "selected": selected,
                "boundaries": boundaries,
                "quality": {
                    m: {"root": s["root"]["accuracy"], "exact": s["reduced_structural_exact"]}
                    for m, s in scores.items()
                },
            }
        ),
        flush=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("stage", choices=["training", "validation"])
    run(parser.parse_args().stage)
