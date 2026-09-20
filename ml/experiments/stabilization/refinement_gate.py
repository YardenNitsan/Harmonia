"""One bounded native integration/region comparison, no fit or locked test."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

for name in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS", "NUMBA_NUM_THREADS"):
    os.environ[name] = "2"
os.environ["CUDA_VISIBLE_DEVICES"] = ""

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

from experiments.stabilization.compare import (  # noqa: E402
    OUT,
    ROOT,
    digest,
    frame_score,
    matrix,
    reduced,
    sample,
    timeline_score,
    write,
)
from harmonia_ml.inference.whole_song import infer  # noqa: E402


def main(stage, resume=False):
    if stage == "validation":
        control = json.loads((OUT / "refinement-training.json").read_text())
        if not control["accepted"]:
            raise ValueError("Training controls did not pass")
        frozen = json.loads((OUT / "refinement-training-preflight.json").read_text())
        for path, value in frozen["sources"].items():
            if digest(path) != value:
                if resume and Path(path).resolve() == Path(__file__).resolve():
                    continue
                raise ValueError("Frozen control source changed")
    manifest = ROOT / "data/prepared/winterreise-hu33-v1/manifest.json"
    if digest(manifest) != "a54ce6ed104a42b8216f5045e4bc0be0d4912e61c8678c920ddf896dc63faf4d":
        raise ValueError("Manifest changed")
    compositions = (2, 3) if stage == "training" else tuple(range(14, 19))
    files = [
        Path(__file__),
        Path(__file__).with_name("refinement-protocol.md"),
        ROOT / "harmonia_ml/inference/whole_song.py",
        ROOT / "harmonia_ml/inference/regions.py",
        ROOT / "tests/test_whole_song_inference.py",
    ]
    write(
        OUT / f"refinement-{stage}{'-resume1' if resume else ''}-preflight.json",
        {
            "compositions": compositions,
            "sources": {str(p): digest(p) for p in files},
            "manifest_sha256": digest(manifest),
            "continuation_reason": (
                "Correct final-clamped-end formatting parity check; reuse completed 14/15."
                if resume
                else None
            ),
        },
    )
    base = ROOT / "data/downloads/winterreise-hu33-v2.1/01_RawData/audio_wav"
    refs = json.loads(
        (ROOT / "experiments/results/B001-boundary-refinement/report.json").read_text()
    )
    entries, pooled = [], {"original": [[], []], "candidate": [[], []]}
    for composition in compositions:
        filename = f"Schubert_D911-{composition:02}_HU33"
        wav = base / (filename + ".wav")
        pcm, sr = sf.read(wav, dtype="float32")
        if sr != 22050 or pcm.ndim != 1:
            raise ValueError("Unexpected source decode contract")
        evidence = {}
        output = OUT / f"refinement-{composition:02}.json"
        if resume and output.exists():
            result = json.loads(output.read_text())
            if result["refinement"]["collapsedTransientRegions"] != 0:
                raise ValueError("Continuation only supports unchanged retained timelines")
            timeline = [(s["start"], s["end"], s["label"]) for s in result["segments"]]
            evidence.update(original=timeline, candidate=timeline, collapsed=0)
        else:
            result = infer(pcm, refine=True, evidence=evidence.update)
            write(output, result)
            np.savez_compressed(
                OUT / f"refinement-{composition:02}-heads.npz",
                **{f"head{i}": p for i, p in enumerate(evidence["probabilities"])},
            )
        prepared = ROOT / "data/prepared/winterreise-hu33-v1" / (filename + ".npz")
        with np.load(prepared, allow_pickle=False) as data:
            truth, mask, times = matrix(data), data["mask"], data["times"]
        entry = {
            "composition": composition,
            "collapsed": evidence["collapsed"],
            "source_sha256": digest(wav),
            "prepared_sha256": digest(prepared),
            "arms": {},
        }
        for arm in pooled:
            segments = [
                {"start": a, "end": b, "target": reduced(label)} for a, b, label in evidence[arm]
            ]
            predictions = sample(segments, times)
            entry["arms"][arm] = {"frames": frame_score(truth[mask], predictions[mask])}
            pooled[arm][0].append(truth[mask])
            pooled[arm][1].append(predictions[mask])
            if stage == "validation":
                reference = next(
                    t["reference"] for t in refs["tracks"] if t["composition"] == composition
                )
                entry["arms"][arm]["timeline"] = timeline_score(reference, segments)
        if stage == "validation":
            original = json.loads((OUT / f"lv-{composition}.json").read_text())["labels"]
            expected = [
                (s["start_time"], min(s["end_time"], len(pcm) / sr), s["chord"]) for s in original
            ]
            formatted = [
                (round(a, 2), len(pcm) / sr if b == len(pcm) / sr else round(b, 2), label)
                for a, b, label in evidence["original"]
            ]
            if expected != formatted:
                raise ValueError("Direct-PCM native adapter disagrees with original API")
        entries.append(entry)
        print(stage, composition, "collapsed", evidence["collapsed"], flush=True)
    scores = {
        arm: frame_score(np.concatenate(ref), np.concatenate(pred))
        for arm, (ref, pred) in pooled.items()
    }
    original, candidate = scores["original"], scores["candidate"]
    accepted = (
        candidate["reduced_structural_exact"] >= original["reduced_structural_exact"]
        and candidate["bass"]["accuracy"] >= original["bass"]["accuracy"]
        and candidate["inversion_bass_exact"] >= original["inversion_bass_exact"]
    )
    if stage == "validation":

        def boundary(arm):
            b = [t["arms"][arm]["timeline"]["boundaries"]["0.05"] for t in entries]
            tp, fp, fn = [
                sum(row[key] for row in b)
                for key in ("true_positives", "false_positives", "false_negatives")
            ]
            return 2 * tp / (2 * tp + fp + fn), sum(t["missed_short_adjacent"] for t in b)

        before, after = boundary("original"), boundary("candidate")
        accepted = accepted and after[0] >= before[0] and after[1] <= before[1]
    write(
        OUT / f"refinement-{stage}.json",
        {"accepted": accepted, "tracks": entries, "pooled": scores},
    )
    print("Accepted", accepted, flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("stage", choices=("training", "validation"))
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    main(args.stage, args.resume)
