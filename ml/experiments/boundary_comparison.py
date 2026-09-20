"""B001 exact-interval evaluator and bounded isolated-browser orchestration."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import time
import zipfile
from collections import Counter
from contextlib import suppress
from dataclasses import astuple
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import psutil
import soundfile as sf

from harmonia_ml.data.labels import encode_harte
from harmonia_ml.data.prepare_winterreise import representable
from harmonia_ml.data.winterreise import parse_annotations

MANIFEST_HASH = "a54ce6ed104a42b8216f5045e4bc0be0d4912e61c8678c920ddf896dc63faf4d"
HEADROOM = 8 * 1024**3


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save_new(path: Path, value: dict) -> None:
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, indent=2, allow_nan=False)
        stream.write("\n")


def reduced(label: str) -> list[int]:
    root, triad, seventh, bass, extensions = astuple(encode_harte(label))
    return [root, triad, seventh, bass, *extensions]


def project(chord: dict) -> list[int]:
    if chord["kind"] == "unknown":
        return [-1] * 8
    if chord["kind"] == "none":
        return [12, 0, 0, 12, 0, 0, 0, 0]
    triad = {
        "major": 1,
        "minor": 2,
        "diminished": 3,
        "augmented": 4,
        "sus2": 5,
        "sus4": 6,
        "power": 7,
    }[chord["triad"]]
    # Match strict explicit-degree targets for equivalent half-diminished/augmented forms.
    if triad == 2 and chord["fifth"] == -1:
        triad = 3
    if triad == 1 and chord["fifth"] == 1:
        triad = 4
    seventh = {None: 0, "minor": 1, "major": 2, "diminished": 3}[chord["seventh"]]
    degrees = set(chord["extensions"]) | set(chord["addedTones"])
    degrees |= {entry["degree"] for entry in chord["alterations"]}
    return [
        chord["root"],
        triad,
        seventh,
        chord["bass"] if chord["bass"] is not None else chord["root"],
        *[int(degree in degrees) for degree in (6, 9, 11, 13)],
    ]


def reference_intervals(rows: list[dict], precise: list[float]) -> dict:
    eligible = [
        r["conflict"] is False
        and not r["parse_errors"]
        and representable(r["normalized"]["extended"])
        for r in rows
    ]
    targets = [
        reduced(r["normalized"]["extended"]) if ok else None
        for r, ok in zip(rows, eligible, strict=True)
    ]
    known_edges, boundaries, short, intervals, unknown_edges = [], [], [], [], []
    for i, row in enumerate(rows):
        if not eligible[i]:
            continue
        left = i > 0 and eligible[i - 1] and abs(rows[i - 1]["end"] - row["start"]) < 1e-8
        right = (
            i + 1 < len(rows) and eligible[i + 1] and abs(row["end"] - rows[i + 1]["start"]) < 1e-8
        )
        intervals.append({"start": row["start"], "end": row["end"], "target": targets[i]})
        if not left:
            unknown_edges.append(row["start"])
        if not right:
            unknown_edges.append(row["end"])
        if left:
            known_edges.append(row["start"])
            if targets[i - 1] != targets[i]:
                boundaries.append(row["start"])
                short.append(
                    min(row["end"] - row["start"], rows[i - 1]["end"] - rows[i - 1]["start"]) < 0.25
                )
    if len(precise) != len(known_edges) or not np.allclose(
        precise, known_edges, rtol=0, atol=1e-10
    ):
        raise ValueError("Precise prepared boundaries differ from valid source annotations")
    # Existing preparation masks unknown-edge neighborhoods globally, including any
    # adjacent short valid row. Subtract those continuous regions from every interval.
    for edge in unknown_edges:
        masked = []
        for interval in intervals:
            start, end = interval["start"], interval["end"]
            if end <= edge - 0.1 or start >= edge + 0.1:
                masked.append(interval)
            else:
                if start < edge - 0.1:
                    masked.append({**interval, "end": edge - 0.1})
                if end > edge + 0.1:
                    masked.append({**interval, "start": edge + 0.1})
        intervals = masked
    # Return retained NPZ values, never quantized source/frame approximations.
    differing = [value for value in precise if any(abs(value - b) < 1e-10 for b in boundaries)]
    retained = [
        i
        for i, value in enumerate(differing)
        if all(abs(value - edge) > 0.1 for edge in unknown_edges)
    ]
    kept = [differing[i] for i in retained]
    kept_short = [short[i] for i in retained]
    excluded = Counter()
    for row, ok in zip(rows, eligible, strict=True):
        if not ok:
            excluded[
                "conflict_or_parse"
                if row["conflict"] is not False or row["parse_errors"]
                else "unrepresentable"
            ] += 1
    return {
        "intervals": intervals,
        "boundaries": kept,
        "short_adjacent": kept_short,
        "source_rows": len(rows),
        "valid_source_rows": sum(eligible),
        "excluded_source_rows": dict(excluded),
        "precise_prepared_boundary_count": len(precise),
        "redundant_boundary_count": len(precise) - len(differing),
        "excluded_unknown_margin_boundaries": len(differing) - len(kept),
        "unknown_edge_times": unknown_edges,
        "unknown_edge_neighborhoods": [[edge - 0.1, edge + 0.1] for edge in unknown_edges],
        "raw_row_edges_not_precise_valid_boundaries": max(0, len(rows) - 1 - len(precise)),
    }


def overlap_scores(reference: list[dict], predicted: list[dict]) -> dict:
    scored = root_correct = exact_correct = 0.0
    supports = {head: Counter() for head in ("root", "quality", "bass", "inversion")}
    index = 0
    for ref in reference:
        duration = ref["end"] - ref["start"]
        scored += duration
        truth = ref["target"]
        for head, value in (
            ("root", truth[0]),
            ("quality", truth[1]),
            ("bass", truth[3]),
            ("inversion", truth[0] != truth[3]),
        ):
            supports[head][str(value)] += duration
        while index < len(predicted) and predicted[index]["end"] <= ref["start"]:
            index += 1
        cursor = index
        while cursor < len(predicted) and predicted[cursor]["start"] < ref["end"]:
            pred = predicted[cursor]
            weight = max(0, min(ref["end"], pred["end"]) - max(ref["start"], pred["start"]))
            root_correct += weight * (truth[0] == pred["target"][0])
            exact_correct += weight * (truth == pred["target"])
            cursor += 1
    return {
        "scored_seconds": scored,
        "root_correct_seconds": root_correct,
        "reduced_correct_seconds": exact_correct,
        "root_agreement": root_correct / scored if scored else None,
        "reduced_structural_agreement": exact_correct / scored if scored else None,
        "reference_support_seconds": {k: dict(v) for k, v in supports.items()},
    }


def match_boundaries(
    reference: list[float],
    predicted: list[float],
    short: list[bool],
    tolerance: float,
    seconds: float,
) -> dict:
    i = j = 0
    matched, errors = set(), []
    while i < len(reference) and j < len(predicted):
        if predicted[j] < reference[i] - tolerance:
            j += 1
        elif predicted[j] > reference[i] + tolerance:
            i += 1
        else:
            matched.add(i)
            errors.append(abs(reference[i] - predicted[j]))
            i += 1
            j += 1
    tp, refs, preds = len(errors), len(reference), len(predicted)
    return {
        "true_positives": tp,
        "false_positives": preds - tp,
        "false_negatives": refs - tp,
        "reference_count": refs,
        "prediction_count": preds,
        "precision": tp / preds if preds else None,
        "recall": tp / refs if refs else None,
        "f1": 2 * tp / (refs + preds) if refs + preds else None,
        "missed_transition_rate": (refs - tp) / refs if refs else None,
        "unmatched_predictions_per_scored_minute": (preds - tp) * 60 / seconds if seconds else None,
        "matched_absolute_errors": errors,
        "timing_median_seconds": float(np.median(errors)) if errors else None,
        "timing_p95_seconds": float(np.quantile(errors, 0.95)) if errors else None,
        "short_adjacent_reference_count": sum(short),
        "missed_short_adjacent": sum(value and n not in matched for n, value in enumerate(short)),
        "missed_reference_times": [value for n, value in enumerate(reference) if n not in matched],
    }


def evaluate_track(reference: dict, browser: dict, arm: str) -> dict:
    segments = browser[arm]
    previous = 0.0
    for segment in segments:
        if not (
            np.isfinite(segment["end"])
            and abs(segment["start"] - previous) < 1e-9
            and segment["end"] > previous
        ):
            raise ValueError("Noncontiguous browser segmentation")
        previous = segment["end"]
    if abs(previous - browser["duration"]) > 1e-9:
        raise ValueError("Browser segments do not cover the recording")
    predicted = [
        {"start": s["start"], "end": s["end"], "target": project(s["chord"])} for s in segments
    ]
    score = overlap_scores(reference["intervals"], predicted)
    cuts = [s["start"] for s in segments[1:]]
    included = [
        cut
        for cut in cuts
        if any(r["start"] <= cut < r["end"] for r in reference["intervals"])
        and all(abs(cut - edge) > 0.1 for edge in reference["unknown_edge_times"])
    ]
    durations = [s["end"] - s["start"] for s in segments]
    return {
        **score,
        "predicted_boundaries_total": len(cuts),
        "predicted_boundaries_scored": len(included),
        "predicted_boundaries_excluded_in_gaps": len(cuts) - len(included),
        "boundaries": {
            str(t): match_boundaries(
                reference["boundaries"],
                included,
                reference["short_adjacent"],
                t,
                score["scored_seconds"],
            )
            for t in (0.02, 0.05, 0.1)
        },
        "segment_durations_seconds": durations,
        "duration_distribution": {
            "count": len(durations),
            "min": min(durations),
            "median": float(np.median(durations)),
            "p95": float(np.quantile(durations, 0.95)),
            "max": max(durations),
            "under_0_25_seconds": sum(d < 0.25 for d in durations),
        },
    }


def pool(results: list[dict]) -> dict:
    seconds = sum(r["scored_seconds"] for r in results)
    support = {head: Counter() for head in ("root", "quality", "bass", "inversion")}
    for result in results:
        for head in support:
            support[head].update(result["reference_support_seconds"][head])
    durations = [d for result in results for d in result["segment_durations_seconds"]]
    output = {
        "scored_seconds": seconds,
        "root_agreement": sum(r["root_correct_seconds"] for r in results) / seconds,
        "reduced_structural_agreement": sum(r["reduced_correct_seconds"] for r in results)
        / seconds,
        "reference_support_seconds": {k: dict(v) for k, v in support.items()},
        "boundaries": {},
        "predicted_boundaries_total": sum(r["predicted_boundaries_total"] for r in results),
        "predicted_boundaries_scored": sum(r["predicted_boundaries_scored"] for r in results),
        "predicted_boundaries_excluded_in_gaps": sum(
            r["predicted_boundaries_excluded_in_gaps"] for r in results
        ),
        "duration_distribution": {
            "count": len(durations),
            "min": min(durations),
            "median": float(np.median(durations)),
            "p95": float(np.quantile(durations, 0.95)),
            "max": max(durations),
            "under_0_25_seconds": sum(d < 0.25 for d in durations),
        },
    }
    for tolerance in ("0.02", "0.05", "0.1"):
        rows = [r["boundaries"][tolerance] for r in results]
        tp, fp, fn = (
            sum(r[key] for r in rows)
            for key in ("true_positives", "false_positives", "false_negatives")
        )
        errors = [e for r in rows for e in r["matched_absolute_errors"]]
        output["boundaries"][tolerance] = {
            "true_positives": tp,
            "false_positives": fp,
            "false_negatives": fn,
            "precision": tp / (tp + fp) if tp + fp else None,
            "recall": tp / (tp + fn) if tp + fn else None,
            "f1": 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else None,
            "unmatched_predictions_per_scored_minute": fp * 60 / seconds,
            "missed_transition_rate": fn / (tp + fn) if tp + fn else None,
            "timing_median_seconds": float(np.median(errors)) if errors else None,
            "timing_p95_seconds": float(np.quantile(errors, 0.95)) if errors else None,
            "short_adjacent_reference_count": sum(
                r["short_adjacent_reference_count"] for r in rows
            ),
            "missed_short_adjacent": sum(r["missed_short_adjacent"] for r in rows),
        }
    return output


def inputs(root: Path) -> tuple[Path, list[dict]]:
    manifest_path = root / "ml/data/prepared/winterreise-hu33-v1/manifest.json"
    if digest(manifest_path) != MANIFEST_HASH:
        raise ValueError("Frozen HU33 manifest changed")
    manifest = json.loads(manifest_path.read_text())
    integrity = json.loads((root / "docs/data/hu33-review-integrity.json").read_text())
    if (
        integrity["status"] != "passed"
        or integrity["acquisition_sha256"] != manifest["source"]["acquisition_manifest_sha256"]
    ):
        raise ValueError("Existing source-integrity evidence does not match")
    source = root / "ml/data/downloads/winterreise-hu33-v2.1"
    if digest(source / "manifest.json") != manifest["source"]["acquisition_manifest_sha256"]:
        raise ValueError("Acquisition manifest changed")
    acquisition = json.loads((source / "manifest.json").read_text())
    sources = {r["id"]: r for r in acquisition["tracks"] if r["split"] == "validation"}
    records = [r for r in manifest["records"] if r["split"] == "validation"]
    tracks = []
    for record in records:
        composition = int(record["composition_id"].split("-")[-1])
        name = f"Schubert_D911-{composition:02}_HU33"
        src = sources[name]
        if (
            composition not in range(14, 19)
            or record["track_id"] != name
            or src["audio_path"] != f"01_RawData/audio_wav/{name}.wav"
            or src["annotation_path"] != f"02_Annotations/ann_audio_chord/{name}.csv"
        ):
            raise ValueError("Validation source identity changed")
        track = {
            "composition": composition,
            "audio": str(source / src["audio_path"]),
            "annotation": str(source / src["annotation_path"]),
            "prepared": str(manifest_path.parent / record["prepared_file"]),
            "audio_sha256": record["audio_sha256"],
            "annotation_sha256": record["annotation_sha256"],
            "prepared_sha256": record["prepared_sha256"],
        }
        for key in ("audio", "annotation", "prepared"):
            if digest(Path(track[key])) != track[key + "_sha256"]:
                raise ValueError("Selected validation data hash changed")
        info = sf.info(track["audio"])
        if info.channels != 1 or info.samplerate != 22050:
            raise ValueError("Expected existing native 22050-Hz mono sources")
        track["duration"] = info.duration
        track["source_frames"] = info.frames
        tracks.append(track)
    if sorted(t["composition"] for t in tracks) != list(range(14, 19)):
        raise ValueError("Expected exactly five validation compositions")
    return manifest_path, tracks


def run() -> None:
    full_started = time.perf_counter()
    root = Path(__file__).resolve().parents[2]
    output = root / "ml/experiments/results/B001-boundary-refinement"
    if output.exists():
        raise FileExistsError("B001 output already exists; never overwrite completed evidence")
    if psutil.virtual_memory().available < HEADROOM:
        raise MemoryError("Insufficient 8 GiB system headroom")
    manifest, tracks = inputs(root)
    bundle_dir = root / ".superpowers/B001/browser"
    subprocess.run(
        ["node", "scripts/boundary-comparison.mjs", "bundle", str(bundle_dir)], cwd=root, check=True
    )
    paths = [
        *[
            root / "packages/audio" / name
            for name in (
                "features.ts",
                "fft.ts",
                "pipeline.ts",
                "recognizer.ts",
                "rhythm.ts",
                "versions.ts",
                "segmentation.ts",
                "segmentation.test.ts",
            )
        ],
        root / "packages/domain/chord.ts",
        root / "packages/domain/types.ts",
        root / "scripts/boundary-comparison.mjs",
        root / "scripts/boundary-comparison-worker.ts",
        Path(__file__),
        root / "ml/tests/test_boundary_comparison.py",
        root / "apps/desktop/src-tauri/tauri.conf.json",
        root / "docs/experiments/B001-boundary-refinement-protocol.md",
        root / "docs/data/hu33-review-integrity.json",
        root / "ml/harmonia_ml/data/labels.py",
        root / "ml/harmonia_ml/data/prepare_winterreise.py",
        root / "ml/harmonia_ml/data/winterreise.py",
        root / "package-lock.json",
        bundle_dir / "worker.js",
    ]
    hashes = {str(path.relative_to(root)): digest(path) for path in paths}
    output.mkdir(parents=True, exist_ok=False)
    preflight = {
        "study": "B001",
        "frozen_at_utc": datetime.now(UTC).isoformat(),
        "source_sha256": hashes,
        "manifest_sha256": digest(manifest),
        "tracks": tracks,
        "workers": 1,
        "gpu": False,
        "minimum_available_ram_bytes": HEADROOM,
        "reference_policy": (
            "Strict eligible raw annotations; exact continuous 0.1s unknown-edge exclusion; "
            "precise NPZ cuts filtered by differing reduced targets; short guard uses "
            "original raw annotation duration."
        ),
        "reduced_prediction_policy": (
            "root/triad/seventh/absolute bass/6,9,11,13 flags; minor-flat5 maps diminished "
            "and major-sharp5 augmented; flags combine extensions/additions/alteration "
            "degrees. Other omissions/alteration spelling are outside reduced metric."
        ),
        "matching": (
            "Chronological greedy one-to-one within inclusive tolerance; both empty F1 null; "
            "undefined precision/recall null."
        ),
        "timing_scope": (
            "baseline analyzeFeatures includes rhythm/key/analysis assembly; "
            "candidate refineSegmentation only; no relative speedup claim"
        ),
    }
    archive = output / "source-snapshot.zip"
    with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED) as saved:
        for name, expected in hashes.items():
            content = (root / name).read_bytes()
            if hashlib.sha256(content).hexdigest() != expected:
                raise ValueError("Source changed while freezing snapshot")
            saved.writestr(name.replace("\\", "/"), content)
    preflight["source_archive_sha256"] = digest(archive)
    save_new(output / "preflight.json", preflight)
    request = {
        "tracks": tracks,
        "bundle": str(bundle_dir / "worker.js"),
        "bundle_sha256": digest(bundle_dir / "worker.js"),
    }
    save_new(output / "browser-request.json", request)
    started = time.perf_counter()
    process = subprocess.Popen(
        [
            "node",
            "scripts/boundary-comparison.mjs",
            "run",
            str(output / "browser-request.json"),
            str(output / "browser.json"),
        ],
        cwd=root,
    )
    peak = 0
    minimum = psutil.virtual_memory().available
    samples = 0
    aborted = False
    while process.poll() is None:
        available = psutil.virtual_memory().available
        minimum = min(minimum, available)
        total = 0
        for member in [psutil.Process(), *psutil.Process().children(recursive=True)]:
            with suppress(psutil.NoSuchProcess):
                total += member.memory_info().rss
        peak = max(peak, total)
        samples += 1
        if available < HEADROOM:
            aborted = True
            for child in psutil.Process(process.pid).children(recursive=True):
                child.kill()
            process.kill()
            break
        time.sleep(0.1)
    process.wait()
    resources = {
        "sampled_peak_process_tree_rss_bytes": peak,
        "minimum_sampled_available_system_bytes": minimum,
        "samples": samples,
        "sampling_seconds": 0.1,
        "browser_elapsed_seconds": time.perf_counter() - started,
        "one_analysis_worker": True,
        "gpu_disabled": True,
        "aborted_for_headroom": aborted,
        "rss_caveat": (
            "Sum of process RSS may count shared pages repeatedly; sampled not continuous peak."
        ),
    }
    save_new(output / "resources.json", resources)
    if process.returncode or aborted:
        raise RuntimeError("Browser adapter failed; no quality metrics or acceptance")
    browser = json.loads((output / "browser.json").read_text())
    if browser["status"] != "completed" or any(
        not t["decode_contract_parity"] for t in browser["tracks"]
    ):
        raise ValueError("Decode adapter parity or browser run failed")
    results = []
    for track, prediction in zip(tracks, browser["tracks"], strict=True):
        if psutil.virtual_memory().available < HEADROOM:
            raise MemoryError("Insufficient headroom during exact-interval evaluation")
        if track["composition"] != prediction["composition"]:
            raise ValueError("Prediction identity mismatch")
        rows = parse_annotations(
            Path(track["annotation"]).read_text(encoding="utf-8-sig"), duration=track["duration"]
        )
        with np.load(track["prepared"], allow_pickle=False) as prepared:
            precise = prepared["boundary_times"].tolist()
        reference = reference_intervals(rows, precise)
        results.append(
            {
                "composition": track["composition"],
                "reference": reference,
                "baseline": evaluate_track(reference, prediction, "baseline"),
                "candidate": evaluate_track(reference, prediction, "candidate"),
                "provenance_operation_counts": {
                    "proposed": prediction["provenance"]["candidate_count"],
                    "inserted": len(prediction["provenance"]["inserted"]),
                    "removed": len(prediction["provenance"]["removed"]),
                    "timing_moves": len(prediction["provenance"]["timing_moves"]),
                },
            }
        )
    pooled = {arm: pool([r[arm] for r in results]) for arm in ("baseline", "candidate")}
    baseline, candidate = pooled["baseline"], pooled["candidate"]
    gain = candidate["boundaries"]["0.05"]["f1"] - baseline["boundaries"]["0.05"]["f1"]
    gates = {
        "boundary_f1_gain_at_least_0_02": gain >= 0.02,
        "root_loss_at_most_0_01": candidate["root_agreement"] >= baseline["root_agreement"] - 0.01,
        "reduced_loss_at_most_0_01": candidate["reduced_structural_agreement"]
        >= baseline["reduced_structural_agreement"] - 0.01,
        "short_adjacent_misses_do_not_increase": candidate["boundaries"]["0.05"][
            "missed_short_adjacent"
        ]
        <= baseline["boundaries"]["0.05"]["missed_short_adjacent"],
    }
    if any(digest(root / path) != value for path, value in hashes.items()):
        raise ValueError("Frozen scientific source changed during execution")
    for track in tracks:
        for key in ("audio", "annotation", "prepared"):
            if digest(Path(track[key])) != track[key + "_sha256"]:
                raise ValueError("Frozen validation bytes changed during execution")
    report = {
        "study": "B001",
        "status": "completed",
        "preflight_sha256": digest(output / "preflight.json"),
        "browser_sha256": digest(output / "browser.json"),
        "source_and_data_unchanged": True,
        "full_elapsed_seconds_including_bundle_and_evaluation": time.perf_counter() - full_started,
        "tracks": results,
        "pooled": pooled,
        "boundary_f1_gain_0_05": gain,
        "gates": gates,
        "acceptance": "passes_bounded_comparison_parent_review_required"
        if all(gates.values())
        else "retain_baseline",
        "limitations": [
            "Five historical voice/piano validation compositions; no broad/full-mix release claim.",
            "Reduced labels omit canonical alterations/omissions; flags ignore alteration sign.",
            "Exact interval scores differ from historical frame-sampled model reports.",
            "Timing scopes differ; baseline includes rhythm/key assembly; no relative speed claim.",
            "No test access, model promotion or production pipeline changes.",
        ],
    }
    save_new(output / "report.json", report)
    print(
        json.dumps(
            {"pooled": pooled, "gain": gain, "gates": gates, "acceptance": report["acceptance"]},
            indent=2,
        )
    )


if __name__ == "__main__":
    argparse.ArgumentParser(description=__doc__).parse_args()
    os.environ.setdefault("OMP_NUM_THREADS", "2")
    run()
