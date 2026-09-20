"""One retained-recording diagnostic of SELU arithmetic, not model promotion."""

import hashlib
import json
import os
import time
from importlib.metadata import distribution
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import psutil
import torch
from onnx import TensorProto, helper, numpy_helper

from harmonia_ml.export.lv_chordia import (
    HEADS,
    LOGIT_ATOL,
    LOGIT_RTOL,
    PROBABILITY_ATOL,
    RawCQTModel,
    require_headroom,
)


def precise_selu(source: onnx.ModelProto) -> onnx.ModelProto:
    graph = onnx.ModelProto()
    graph.CopyFrom(source)
    replacement = []
    count = 0
    for index, node in enumerate(graph.graph.node):
        if node.op_type != "Selu":
            replacement.append(node)
            continue
        attrs = {a.name: helper.get_attribute_value(a) for a in node.attribute}
        alpha = np.float32(attrs.get("alpha", 1.6732632423543772))
        scale = np.float32(attrs.get("gamma", 1.0507009873554805))
        if alpha != np.float32(1.6732632423543772) or scale != np.float32(1.0507009873554805):
            raise ValueError("Unverified SELU coefficients")
        prefix = f"precise_selu_{index}/"
        for name, value, dtype in (
            ("zero", 0, np.float32),
            ("one64", 1, np.float64),
            ("scale", scale, np.float32),
            ("negative_coefficient", np.float32(alpha * scale), np.float32),
        ):
            graph.graph.initializer.append(
                numpy_helper.from_array(np.array(value, dtype=dtype), prefix + name)
            )
        replacement.extend(
            [
                helper.make_node(
                    "Cast", [node.input[0]], [prefix + "double"], to=TensorProto.DOUBLE
                ),
                helper.make_node("Exp", [prefix + "double"], [prefix + "exp"]),
                helper.make_node("Sub", [prefix + "exp", prefix + "one64"], [prefix + "diff"]),
                helper.make_node(
                    "Cast", [prefix + "diff"], [prefix + "expm1"], to=TensorProto.FLOAT
                ),
                helper.make_node(
                    "Mul",
                    [prefix + "expm1", prefix + "negative_coefficient"],
                    [prefix + "negative"],
                ),
                helper.make_node("Mul", [node.input[0], prefix + "scale"], [prefix + "positive"]),
                helper.make_node(
                    "GreaterOrEqual", [node.input[0], prefix + "zero"], [prefix + "nonnegative"]
                ),
                helper.make_node(
                    "Where",
                    [prefix + "nonnegative", prefix + "positive", prefix + "negative"],
                    list(node.output),
                ),
            ]
        )
        count += 1
    if not count:
        raise ValueError("No SELU nodes in source graph")
    graph.graph.ClearField("node")
    graph.graph.node.extend(replacement)
    onnx.checker.check_model(graph)
    return graph


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def run():
    from lv_chordia.chordnet_ismir_naive import ChordNet
    from lv_chordia.extractors.cqt import CQTV2
    from lv_chordia.mir import DataEntry, io

    require_headroom()
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    output = Path("artifacts/lv-chordia-diagnostic/selu-arithmetic")
    if output.exists():
        raise FileExistsError("Preserve completed/partial diagnostic; no rerun")
    selection_path = Path("experiments/results/E006-lv-chordia/selection.json")
    manifest_path = Path("data/prepared/guitarset-v1/manifest.json")
    selection = json.loads(selection_path.read_text())
    manifest = json.loads(manifest_path.read_text())
    track = "00_Funk2-108-Eb_solo"
    record = next(r for r in manifest["records"] if r["track_id"] == track)
    if track not in selection["track_ids"] or record["split"] != "validation":
        raise ValueError("Unexpected selection/split")
    audio = Path("data/downloads/extracted/audio") / f"{track}_mic.wav"
    if digest(audio) != record["audio_sha256"]:
        raise ValueError("Audio identity mismatch")
    package = distribution("lv-chordia")
    if package.version != "1.1.0":
        raise ValueError("Unaudited LV package")
    weight = next(f for f in package.files if f.name.endswith("_s0.best.sdict"))
    checkpoint = Path(package.locate_file(weight))
    if digest(checkpoint) != selection["weights_sha256"][weight.name]:
        raise ValueError("Weight identity mismatch")
    artifact = Path("artifacts/lv-chordia-cpu-ensemble-4096/s0.onnx")
    export_report = artifact.parent / "report.json"
    if digest(artifact) != json.loads(export_report.read_text())["networks"][0]["onnx_sha256"]:
        raise ValueError("Graph identity mismatch")
    source = onnx.load(artifact)
    if sum(n.op_type == "Selu" for n in source.graph.node) != 10:
        raise ValueError("Expected ten SELU nodes")
    paths = [
        Path(__file__),
        Path("tests/test_lv_precise_selu.py"),
        Path("experiments/LV-selu-arithmetic-protocol.md"),
        Path("harmonia_ml/export/lv_chordia.py"),
        Path("artifacts/lv-chordia-diagnostic/selu-kernel.json"),
        selection_path,
        manifest_path,
        audio,
        checkpoint,
        artifact,
        export_report,
    ]
    frozen = {str(p.resolve()): digest(p) for p in paths}
    output.mkdir()
    preflight = {
        "purpose": "Single retained-recording SELU diagnostic; no production approval",
        "frozen_files": frozen,
        "track_id": track,
        "torch": torch.__version__,
        "onnxruntime": ort.__version__,
        "onnx": onnx.__version__,
        "numpy": np.__version__,
        "threads": 2,
        "gpu": False,
        "test_accessed": False,
        "thread_environment": {
            k: os.environ.get(k)
            for k in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS")
        },
        "tolerances": {
            "logit_atol": LOGIT_ATOL,
            "rtol": LOGIT_RTOL,
            "probability_atol": PROBABILITY_ATOL,
        },
    }
    with (output / "preflight.json").open("x") as stream:
        json.dump(preflight, stream, indent=2)
    report = {
        "passed": False,
        "preflight_sha256": digest(output / "preflight.json"),
        "heads": {},
        "minimum_sampled_available_ram": psutil.virtual_memory().available,
    }
    started = time.perf_counter()

    def resources():
        require_headroom()
        report["minimum_sampled_available_ram"] = min(
            report["minimum_sampled_available_ram"], psutil.virtual_memory().available
        )

    try:
        resources()
        entry = DataEntry()
        entry.prop.set("sr", 22050)
        entry.prop.set("hop_length", 512)
        entry.append_file(str(audio.resolve()), io.MusicIO, "music")
        entry.append_extractor(CQTV2, "cqt")
        values = entry.cqt[None].astype(np.float32)
        if values.shape != (1, 1531, 288) or not np.isfinite(values).all():
            raise ValueError("Unexpected input tensor")
        network = ChordNet(None)
        network.use_gpu = False
        network.load_state_dict(
            torch.load(checkpoint, map_location="cpu", weights_only=True)["net"]
        )
        reference = RawCQTModel(network).cpu().eval()
        resources()
        with torch.inference_mode():
            expected = [v.numpy() for v in reference(torch.from_numpy(values))]
        references = output / "reference.npz"
        np.savez_compressed(references, cqt=values, **dict(zip(HEADS, expected, strict=True)))
        report["reference_sha256"] = digest(references)
        graph = precise_selu(source)
        model = output / "s0.onnx"
        onnx.save(graph, model)
        report["onnx_sha256"] = digest(model)
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        options.inter_op_num_threads = 1
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
        resources()
        session = ort.InferenceSession(str(model), options, providers=["CPUExecutionProvider"])
        begin = time.perf_counter()
        actual = session.run(list(HEADS), {"cqt": values})
        report["onnx_inference_seconds"] = time.perf_counter() - begin
        for head, observed, wanted in zip(HEADS, actual, expected, strict=True):
            if (
                observed.shape != wanted.shape
                or not np.isfinite(observed).all()
                or not np.isfinite(wanted).all()
            ):
                raise ValueError(f"Invalid output {head}")
            p = torch.softmax(torch.from_numpy(observed), -1).numpy()
            q = torch.softmax(torch.from_numpy(wanted), -1).numpy()
            report["heads"][head] = {
                "max_absolute_logit_error": float(
                    np.abs(observed.astype(np.float64) - wanted).max()
                ),
                "logit_violations": int(
                    (~np.isclose(observed, wanted, atol=LOGIT_ATOL, rtol=LOGIT_RTOL)).sum()
                ),
                "probability_violations": int(
                    (~np.isclose(p, q, atol=PROBABILITY_ATOL, rtol=LOGIT_RTOL)).sum()
                ),
                "argmax_disagreements": int((p.argmax(-1) != q.argmax(-1)).sum()),
            }
        resources()
        report["frozen_files_unchanged"] = {p: digest(p) == sha for p, sha in frozen.items()}
        report["passed"] = all(report["frozen_files_unchanged"].values()) and all(
            v["logit_violations"] == v["probability_violations"] == 0
            for v in report["heads"].values()
        )
    except Exception as error:
        report["passed"] = False
        report["error"] = f"{type(error).__name__}: {error}"
        raise
    finally:
        report["elapsed_seconds"] = time.perf_counter() - started
        report["process_lifetime_peak_rss_bytes"] = getattr(
            psutil.Process().memory_info(), "peak_wset", None
        )
        with (output / "report.json").open("x") as stream:
            json.dump(report, stream, indent=2, allow_nan=False)
        print(json.dumps(report, indent=2))
    if not report["passed"]:
        raise SystemExit("Original logit/probability acceptance fails; retain diagnostic")


if __name__ == "__main__":
    run()
