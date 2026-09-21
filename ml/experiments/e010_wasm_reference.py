"""New lossless E010 parity references and isolated browser watchdog; never model selection."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import time
from contextlib import suppress
from pathlib import Path

import numpy as np
import onnxruntime as ort
import psutil
import torch

from experiments.predicted_root_cascade import require, select_records, unchanged
from experiments.root_relative_probe import Resources, digest, save_new
from harmonia_ml.export.predicted_root import OUTPUTS, compare_retained


def pack_tensors(values: dict) -> tuple[bytes, dict]:
    require(0 < len(values) <= 32, "Invalid tensor inventory")
    total, metadata = 0, {}
    for name, value in values.items():
        require(
            str(value.dtype) in ("float32", "float64", "int64", "uint8")
            and 0 < value.ndim <= 3
            and all(0 < n <= 60000 for n in value.shape)
            and value.size <= 60000 * 26
            and np.isfinite(value).all(),
            "Invalid binary tensor",
        )
        total = (total + 7) // 8 * 8
        metadata[name] = {
            "dtype": str(value.dtype),
            "dims": list(value.shape),
            "offset": total,
            "bytes": value.nbytes,
        }
        total += value.nbytes
        require(total <= 8 * 1024**2, "Reference binary exceeds cap")
    payload = bytearray(total)
    for name, value in values.items():
        begin = metadata[name]["offset"]
        payload[begin : begin + value.nbytes] = value.astype(
            value.dtype.newbyteorder("<"), copy=False
        ).tobytes()
    return bytes(payload), metadata


def paths(config_path: Path) -> tuple:
    config = json.loads(config_path.read_text())
    require(
        config["minimum_available_ram_bytes"] == 8 * 1024**3
        and config["per_binary_bytes"] == 8 * 1024**2
        and config["total_binary_bytes"] == 32 * 1024**2
        and config["watchdog_seconds"] == 120,
        "Protocol bounds changed",
    )
    return config, Path(config["output"]), Path(config["reference_dir"]), Path.cwd().parent


def prepare(config_path: Path) -> dict:
    config, output, reference_dir, root = paths(config_path)
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    resources = Resources(config["minimum_available_ram_bytes"])
    resources.check()
    frozen = {}
    for name in ("manifest", "model", "retained_report"):
        path = Path(config[name]).resolve()
        require(digest(path) == config[f"{name}_sha256"], f"Frozen {name} changed")
        frozen[str(path)] = config[f"{name}_sha256"]
    records = select_records(json.loads(Path(config["manifest"]).read_text()), "validation")
    retained_report = json.loads(Path(config["retained_report"]).read_text())
    for record in records:
        source = Path(config["manifest"]).parent / record["prepared_file"]
        old = retained_report["tracks"][record["track_id"]]
        for path, expected in (
            (source, record["prepared_sha256"]),
            (Path(old["predictions_path"]), old["predictions_sha256"]),
        ):
            require(digest(path) == expected, "Validation input hash changed")
            frozen[str(path.resolve())] = expected
    source_paths = [
        config_path,
        Path(config["protocol"]),
        Path(__file__),
        Path("tests/test_e010_wasm_reference.py"),
        Path("harmonia_ml/export/predicted_root.py"),
        Path("experiments/predicted_root_cascade.py"),
        Path("experiments/root_relative_probe.py"),
        root / "package-lock.json",
        root / "apps/desktop/src-tauri/tauri.conf.json",
        root / "node_modules/onnxruntime-web/package.json",
    ]
    source_paths += [
        root / "scripts" / f"e010-wasm-{name}.mjs"
        for name in ("checks", "checks.test", "worker", "probe")
    ]
    source_paths += [
        root / "node_modules/onnxruntime-web/dist" / name
        for name in (
            "ort.wasm.min.mjs",
            "ort-wasm-simd-threaded.mjs",
            "ort-wasm-simd-threaded.wasm",
        )
    ]
    for path in source_paths:
        frozen[str(path.resolve())] = digest(path)
    require(
        not output.exists() and not reference_dir.exists(),
        "WASM evidence/reference directory already exists",
    )
    output.mkdir(parents=True)
    reference_dir.mkdir(parents=True)
    save_new(
        output / "preflight.json",
        {
            "config": config,
            "frozen_files": frozen,
            "environment_threads": {
                name: os.environ.get(name)
                for name in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS")
            },
            "onnxruntime": ort.__version__,
            "resources": resources.report(),
        },
    )
    report = {
        "status": "running",
        "cases": [],
        "training_arrays_opened": False,
        "test_accessed": False,
        "preflight_sha256": digest(output / "preflight.json"),
    }
    try:
        options = ort.SessionOptions()
        options.intra_op_num_threads, options.inter_op_num_threads = 2, 1
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        session = ort.InferenceSession(config["model"], options, providers=["CPUExecutionProvider"])
        total = 0
        for record in records:
            resources.check()
            with np.load(
                Path(config["manifest"]).parent / record["prepared_file"], allow_pickle=False
            ) as source:
                values, mask = source["features"][None], source["mask"]
            require(
                values.dtype == np.float32
                and values.shape[0] == 1
                and values.shape[2] == 26
                and 0 < values.shape[1] <= 60000
                and np.isfinite(values).all(),
                "Invalid input features",
            )
            old = retained_report["tracks"][record["track_id"]]
            with np.load(old["predictions_path"], allow_pickle=False) as source:
                retained = {name: source[name] for name in source.files}
            require(np.array_equal(mask, retained["mask"]), "Retained mask changed")
            start = time.perf_counter()
            actual = dict(zip(OUTPUTS, session.run(None, {"features": values}), strict=True))
            seconds = time.perf_counter() - start
            parity = compare_retained(actual, retained)
            require(parity["passed"], "New CPU reference differs from retained decisions")
            require(
                actual["quality_logits"].dtype == np.float64
                and actual["triad_decision"].dtype == np.int64,
                "Cascade precision changed",
            )
            tensors = {"features": values, **actual, "mask": mask.astype(np.uint8)}
            for name in (
                "root",
                "baseline_triad",
                "seventh",
                "bass",
                "extensions",
                "boundary",
                "triad_decision",
            ):
                key = (
                    "candidate_triad"
                    if name == "triad_decision"
                    else "baseline_triad"
                    if name == "baseline_triad"
                    else f"baseline_{name}"
                )
                tensors[f"retained_{name}"] = retained[key]
            payload, descriptors = pack_tensors(tensors)
            total += len(payload)
            require(total <= config["total_binary_bytes"], "Total reference cap exceeded")
            path = reference_dir / f"{record['track_id']}.bin"
            with path.open("xb") as stream:
                stream.write(payload)
            report["cases"].append(
                {
                    "id": record["track_id"],
                    "path": str(path.resolve()),
                    "sha256": digest(path),
                    "bytes": len(payload),
                    "frames": values.shape[1],
                    "scored_frames": int(mask.sum()),
                    "tensors": descriptors,
                    "cpu_seconds": seconds,
                    "retained_parity": parity,
                }
            )
            resources.check()
        request = {
            "study_id": config["study_id"],
            "cases": report["cases"],
            "frozen_files": frozen,
            "model": {
                "path": str(Path(config["model"]).resolve()),
                "sha256": config["model_sha256"],
                "bytes": Path(config["model"]).stat().st_size,
            },
        }
        save_new(reference_dir / "request.json", request)
        report.update(
            status="prepared",
            total_binary_bytes=total,
            request_sha256=digest(reference_dir / "request.json"),
        )
    except Exception as error:
        report.update(status="failed", error=f"{type(error).__name__}: {error}")
        raise
    finally:
        report["resources"] = resources.report()
        report["frozen_files_unchanged"] = {
            path: unchanged(path, expected) for path, expected in frozen.items()
        }
        if not all(report["frozen_files_unchanged"].values()):
            report["status"] = "failed_integrity"
        save_new(output / "reference-report.json", report)
    return report


def browser(config_path: Path) -> dict:
    config, output, reference_dir, root = paths(config_path)
    reference = json.loads((output / "reference-report.json").read_text())
    require(reference["status"] == "prepared", "No accepted frozen references")
    require(
        digest(reference_dir / "request.json") == reference["request_sha256"],
        "Reference manifest changed",
    )
    require(
        not (output / "browser-report.json").exists() and not (output / "campaign.json").exists(),
        "Browser campaign already exists",
    )
    resources = Resources(config["minimum_available_ram_bytes"])
    resources.check()
    report = {
        "status": "running",
        "sampled_peak_browser_tree_rss_bytes": 0,
        "owned_processes_remaining": [],
    }
    owned = []
    start = time.perf_counter()
    with (output / "browser.log").open("xb") as log:
        child = subprocess.Popen(
            [
                "node",
                str(root / "scripts/e010-wasm-probe.mjs"),
                str((reference_dir / "request.json").resolve()),
                str(output.resolve()),
            ],
            cwd=root,
            stdout=log,
            stderr=log,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        try:
            process = psutil.Process(child.pid)
            owned.append(process)
            while child.poll() is None:
                resources.check()
                require(
                    time.perf_counter() - start <= config["watchdog_seconds"],
                    "Browser campaign watchdog expired",
                )
                current = [process, *process.children(recursive=True)]
                owned.extend(p for p in current if p not in owned)
                rss = 0
                for p in current:
                    with suppress(psutil.NoSuchProcess):
                        rss += p.memory_info().rss
                report["sampled_peak_browser_tree_rss_bytes"] = max(
                    report["sampled_peak_browser_tree_rss_bytes"], rss
                )
                time.sleep(0.2)
            report["exit_code"] = child.returncode
            result = json.loads((output / "browser-report.json").read_text())
            report["status"] = result["status"]
        except Exception as error:
            report.update(status="failed", error=f"{type(error).__name__}: {error}")
        finally:
            for process in reversed(owned):
                try:
                    if process.is_running():
                        process.kill()
                except psutil.NoSuchProcess:
                    pass
            psutil.wait_procs(owned, timeout=3)
            child.wait(timeout=3)
            report["owned_processes_remaining"] = [p.pid for p in owned if p.is_running()]
    if report["owned_processes_remaining"]:
        report["status"] = "failed_cleanup"
    report["resources"] = resources.report()
    request = json.loads((reference_dir / "request.json").read_text())
    report["frozen_files_unchanged"] = {
        path: unchanged(path, expected) for path, expected in request["frozen_files"].items()
    }
    report["reference_files_unchanged"] = {
        r["id"]: unchanged(r["path"], r["sha256"]) for r in request["cases"]
    }
    if not all(report["frozen_files_unchanged"].values()) or not all(
        report["reference_files_unchanged"].values()
    ):
        report["status"] = "failed_integrity"
    save_new(output / "campaign.json", report)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("phase", choices=("prepare", "browser"))
    parser.add_argument("config", type=Path)
    args = parser.parse_args()
    result = prepare(args.config) if args.phase == "prepare" else browser(args.config)
    print(json.dumps({"phase": args.phase, "status": result["status"]}), flush=True)
    if result["status"] not in ("prepared", "passed_wasm_parity_only"):
        raise SystemExit(1)
