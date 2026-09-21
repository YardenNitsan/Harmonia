"""Read retained native probabilities; no audio access, fitting or network calls.

Use the ML virtual environment. Outputs descriptive decoder evidence, never
accuracy metrics. Refuses to overwrite its report. HMM15 is a fixed diagnostic,
not a candidate selected or authorized for production.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from itertools import pairwise
from pathlib import Path

import lv_chordia
import numpy as np
from lv_chordia.complex_chord import Chord
from lv_chordia.extractors.xhmm_ismir import XHMMDecoder

HOP_SECONDS = 512 / 22050
HEADS = ("root_triad", "bass", "seventh", "ninth", "eleventh", "thirteenth")


def regions(labels):
    cuts = np.flatnonzero(np.r_[True, labels[1:] != labels[:-1], True])
    return [(int(a), int(b), str(labels[a])) for a, b in pairwise(cuts)]


def summary(labels):
    rows = regions(labels)
    return {
        "regions": len(rows),
        "shorter_than_250ms": sum((b - a) * HOP_SECONDS < 0.25 for a, b, _ in rows),
        "no_chord_seconds": sum((b - a) * HOP_SECONDS for a, b, c in rows if c == "N"),
        "slash_regions": sum("/" in c for _, _, c in rows),
        "seventh_or_extension_regions": sum(
            any(value > 0 for value in Chord(c).to_numpy()[2:]) for _, _, c in rows
        ),
        "unique_labels": len(set(labels)),
    }


def audit(evidence_path, original_path):
    archive = np.load(evidence_path, allow_pickle=False)
    heads = [archive[f"head_{i}"] for i in range(6)]
    if [h.shape[1] for h in heads] != [73, 13, 4, 4, 3, 3]:
        raise ValueError("Unexpected head vocabulary")
    frames = len(heads[0])
    if any(h.ndim != 2 or len(h) != frames or not np.isfinite(h).all() for h in heads):
        raise ValueError("Invalid retained probabilities")
    dictionary = Path(lv_chordia.__file__).parent / "data/submission_chord_list.txt"
    decoder = XHMMDecoder(template_file=str(dictionary))
    names, log_observations = decoder.get_chord_tag_obs(heads)
    names = np.array(names)
    evidence_best = names[log_observations.argmax(1)]
    original = json.loads(original_path.read_text(encoding="utf8"))["original"]
    baseline = np.array(["N"] * frames, dtype="U100")
    for a, b, label in original:
        baseline[round(a / HOP_SECONDS) : round(b / HOP_SECONDS)] = label
    # This assertion uses retained observations, not another network invocation.
    decoded = np.array(decoder.decode(heads, np.ones(frames, dtype=np.int8)))
    if not np.array_equal(decoded, baseline):
        raise AssertionError("Retained HMM30 timeline cannot be reproduced")
    decoder.diff_trans_penalty = 15.0
    sensitivity = np.array(decoder.decode(heads, np.ones(frames, dtype=np.int8)))
    by_head = {}
    for name, head in zip(HEADS, heads):
        by_head[name] = {
            "argmax_counts": {
                str(k): int(v) for k, v in Counter(head.argmax(1)).items()
            },
            "mean": head.mean(0).tolist(),
            "max": head.max(0).tolist(),
        }
    # Unpenalized observation runs describe available evidence, not true chords.
    disagreements = []
    baseline_ids = np.array([np.flatnonzero(names == label)[0] for label in baseline])
    for a, b, label in regions(evidence_best):
        if b - a < 2 or np.all(baseline[a:b] == label):
            continue
        winner = int(np.flatnonzero(names == label)[0])
        advantage = (
            log_observations[a:b, winner]
            - log_observations[np.arange(a, b), baseline_ids[a:b]]
        )
        disagreements.append(
            {
                "start": a * HOP_SECONDS,
                "end": b * HOP_SECONDS,
                "evidence_label": label,
                "baseline_labels": sorted(set(baseline[a:b])),
                "summed_log_advantage": float(advantage.sum()),
            }
        )
    # Encoding coverage separates absent states from unlearnable structures.
    states = {tuple(array) for array, _ in decoder.known_chord_array}
    coverage = {}
    for label in [
        "C:maj",
        "C:min",
        "C:7",
        "C:7/3",
        "C:7/b7",
        "C:min7/b3",
        "C:maj6",
        "C:11",
        "C:maj/2",
    ]:
        encoded = tuple(int(v) for v in Chord(label).to_numpy())
        coverage[label] = {
            "encoding": encoded,
            "dictionary_present": encoded in states,
        }
    return {
        "schema_version": 1,
        "interpretation": "Descriptive retained-evidence audit, not labelled accuracy",
        "frames": frames,
        "evidence_sha256": hashlib.sha256(evidence_path.read_bytes()).hexdigest(),
        "dictionary_sha256": hashlib.sha256(dictionary.read_bytes()).hexdigest(),
        "dictionary_states": len(states),
        "head_statistics": by_head,
        "dictionary_coverage": coverage,
        "hmm30_reproduces_retained": True,
        "hmm30": summary(baseline),
        "hmm15_sensitivity_only": summary(sensitivity),
        "hmm15_changed_frames": int(np.count_nonzero(sensitivity != baseline)),
        "framewise_dictionary": summary(evidence_best),
        "framewise_differs_hmm30_frames": int(
            np.count_nonzero(evidence_best != baseline)
        ),
        "suppressed_evidence_runs": disagreements,
        "hmm15_regions": [
            (a * HOP_SECONDS, b * HOP_SECONDS, c) for a, b, c in regions(sensitivity)
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("evidence", type=Path)
    parser.add_argument("original", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.output.exists():
        raise FileExistsError(args.output)
    result = audit(args.evidence, args.original)
    with args.output.open("x", encoding="utf8") as handle:
        json.dump(result, handle, indent=2)
    print(
        json.dumps(
            {
                k: v
                for k, v in result.items()
                if k
                in (
                    "frames",
                    "hmm30",
                    "hmm15_sensitivity_only",
                    "hmm15_changed_frames",
                    "framewise_dictionary",
                )
            }
        )
    )
