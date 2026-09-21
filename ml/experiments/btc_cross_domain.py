"""Fixed original BTC cross-domain diagnostic; no tuning, test access or promotion."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import soundfile as sf

from experiments.original_btc import OriginalBTC
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
OUT = ROOT / "experiments/results/R005-btc-cross-domain"
OLD = ROOT / "experiments/stabilization/results"


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sources = [
        Path(__file__),
        ROOT / "experiments/original_btc.py",
        REPO / "docs/btc-cross-domain-protocol.md",
    ]
    inputs = []
    for cid in range(14, 19):
        stem = f"Schubert_D911-{cid:02}_HU33"
        inputs += [
            ROOT / f"data/downloads/winterreise-hu33-v2.1/01_RawData/audio_wav/{stem}.wav",
            ROOT / f"data/prepared/winterreise-hu33-v1/{stem}.npz",
            OLD / f"refinement-{cid:02}.json",
        ]
    kq = REPO / ".superpowers/diagnostics/killer-queen"
    inputs += [kq / "source.f32", kq / "decode.json"]
    write(
        OUT / "freeze.json",
        {
            "sources": {str(p.relative_to(REPO)): digest(p) for p in sources},
            "inputs": {str(p.relative_to(REPO)): digest(p) for p in inputs},
        },
    )
    model = OriginalBTC(170)
    refs = read(ROOT / "experiments/results/B001-boundary-refinement/report.json")
    pooled = {arm: [[], []] for arm in ("lv", "btc")}
    tracks = []
    for cid in range(14, 19):
        resources()
        stem = f"Schubert_D911-{cid:02}_HU33"
        pcm, sr = sf.read(
            ROOT / f"data/downloads/winterreise-hu33-v2.1/01_RawData/audio_wav/{stem}.wav",
            dtype="float32",
        )
        old = read(OLD / f"refinement-{cid:02}.json")
        if (
            sr != 22050
            or pcm.ndim != 1
            or hashlib.sha256(pcm.tobytes()).hexdigest() != old["pcmSha256"]
        ):
            raise ValueError("Retained PCM mismatch")
        result = model.recognize(pcm)
        write(
            OUT / f"{cid}-btc.json",
            {k: v for k, v in result.items() if not isinstance(v, np.ndarray)},
        )
        with np.load(
            ROOT / f"data/prepared/winterreise-hu33-v1/{stem}.npz", allow_pickle=False
        ) as data:
            truth, times, mask = matrix(data), data["times"], data["mask"]
        reference = next(t["reference"] for t in refs["tracks"] if t["composition"] == cid)
        row = {"composition": cid, "arms": {}}
        for arm, value in (("lv", old), ("btc", result)):
            segments = [
                {**s, "target": [-1] * 8 if s["label"] == "X" else reduced(s["label"])}
                for s in value["segments"]
            ]
            predicted = sample(segments, times)
            row["arms"][arm] = {
                "frames": frame_score(truth[mask], predicted[mask]),
                "timeline": timeline_score(reference, segments),
            }
            pooled[arm][0].append(truth[mask])
            pooled[arm][1].append(predicted[mask])
        tracks.append(row)
        print(f"HU33 {cid} complete", flush=True)
    write(
        OUT / "report.json",
        {
            "tracks": tracks,
            "pooled": {
                a: frame_score(np.concatenate(x), np.concatenate(y)) for a, (x, y) in pooled.items()
            },
            "production_promotion": False,
        },
    )
    pcm = np.fromfile(kq / "source.f32", dtype="<f4")
    if hashlib.sha256(pcm.tobytes()).hexdigest() != read(kq / "decode.json")["pcmSha256"]:
        raise ValueError("Killer Queen PCM mismatch")
    result = model.recognize(pcm)
    write(
        OUT / "killer-queen-unlabelled.json",
        {k: v for k, v in result.items() if not isinstance(v, np.ndarray)},
    )


if __name__ == "__main__":
    main()
