"""Diagnostic all-convolution float64 accumulation; never relax LV acceptance."""

from __future__ import annotations

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


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def precise_convolutions(source: onnx.ModelProto) -> onnx.ModelProto:
    """Replace the audited stride-one 3x3 Conv kernels with double patch MatMul."""
    graph = onnx.ModelProto()
    graph.CopyFrom(source)
    initializers = {item.name: numpy_helper.to_array(item) for item in graph.graph.initializer}
    replacements = []
    for number, node in enumerate(graph.graph.node):
        if node.op_type != "Conv":
            replacements.append(node)
            continue
        attributes = {a.name: helper.get_attribute_value(a) for a in node.attribute}
        weights = initializers[node.input[1]]
        if (
            weights.ndim != 4
            or weights.shape[2:] != (3, 3)
            or attributes.get("group", 1) != 1
            or attributes.get("strides", [1, 1]) != [1, 1]
            or attributes.get("dilations", [1, 1]) != [1, 1]
            or attributes.get("auto_pad", b"NOTSET") != b"NOTSET"
        ):
            raise ValueError("Unsupported convolution; do not silently change its semantics")
        prefix = f"precise_conv_{number}/"

        def constant(name, value, prefix=prefix):
            key = prefix + name
            graph.graph.initializer.append(numpy_helper.from_array(value, key))
            return key

        pads = attributes.get("pads", [0, 0, 0, 0])
        if len(pads) != 4 or any(p not in (0, 1) for p in pads):
            raise ValueError("Unsupported convolution padding")
        replacements.extend(
            [
                helper.make_node(
                    "Cast", [node.input[0]], [prefix + "double"], to=TensorProto.DOUBLE
                ),
                helper.make_node(
                    "Pad",
                    [
                        prefix + "double",
                        constant("pads", np.array([0, 0, *pads[:2], 0, 0, *pads[2:]], np.int64)),
                    ],
                    [prefix + "padded"],
                ),
            ]
        )
        axes = constant("axes", np.array([2, 3], np.int64))
        patches = []
        for y in range(3):
            for x in range(3):
                name = f"patch_{y}_{x}"
                patches.append(prefix + name)
                replacements.append(
                    helper.make_node(
                        "Slice",
                        [
                            prefix + "padded",
                            constant(name + "_start", np.array([y, x], np.int64)),
                            constant(
                                name + "_end",
                                np.array(
                                    [y - 2 if y < 2 else 2**63 - 1, x - 2 if x < 2 else 2**63 - 1],
                                    np.int64,
                                ),
                            ),
                            axes,
                        ],
                        [prefix + name],
                    )
                )
        replacements.extend(
            [
                helper.make_node("Concat", patches, [prefix + "patches"], axis=1),
                helper.make_node(
                    "Transpose", [prefix + "patches"], [prefix + "rows"], perm=[0, 2, 3, 1]
                ),
                helper.make_node(
                    "MatMul",
                    [
                        prefix + "rows",
                        constant(
                            "weights",
                            weights.transpose(2, 3, 1, 0)
                            .reshape(-1, weights.shape[0])
                            .astype(np.float64),
                        ),
                    ],
                    [prefix + "product"],
                ),
            ]
        )
        result = prefix + "product"
        if len(node.input) == 3:
            replacements.append(
                helper.make_node(
                    "Add",
                    [result, constant("bias", initializers[node.input[2]].astype(np.float64))],
                    [prefix + "biased"],
                )
            )
            result = prefix + "biased"
        replacements.extend(
            [
                helper.make_node("Transpose", [result], [prefix + "nchw"], perm=[0, 3, 1, 2]),
                helper.make_node(
                    "Cast", [prefix + "nchw"], list(node.output), to=TensorProto.FLOAT
                ),
            ]
        )
    graph.graph.ClearField("node")
    graph.graph.node.extend(replacements)
    onnx.checker.check_model(graph)
    return graph


def run() -> None:
    from lv_chordia.chordnet_ismir_naive import ChordNet
    from lv_chordia.extractors.cqt import CQTV2
    from lv_chordia.mir import DataEntry, io

    require_headroom()
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    output = Path("artifacts/lv-chordia-diagnostic/all-convolutions")
    if output.exists():
        raise FileExistsError("Preserve existing diagnostic; no automatic rerun")
    selection = json.loads(Path("experiments/results/E006-lv-chordia/selection.json").read_text())
    manifest = json.loads(Path("data/prepared/guitarset-v1/manifest.json").read_text())
    track = "00_Funk2-108-Eb_solo"
    record = next(r for r in manifest["records"] if r["track_id"] == track)
    if track not in selection["track_ids"] or record["split"] != "validation":
        raise ValueError("Only the retained failing validation recording is authorized")
    audio = Path("data/downloads/extracted/audio") / f"{track}_mic.wav"
    if digest(audio) != record["audio_sha256"]:
        raise ValueError("Source audio bytes changed")
    package = distribution("lv-chordia")
    if package.version != "1.1.0":
        raise ValueError("Unverified package version")
    weight = next(f for f in package.files if f.name.endswith("_s0.best.sdict"))
    checkpoint = Path(package.locate_file(weight))
    if digest(checkpoint) != selection["weights_sha256"][weight.name]:
        raise ValueError("Audited weights changed")
    artifact = Path("artifacts/lv-chordia-cpu-ensemble-4096/s0.onnx")
    saved_export = json.loads((artifact.parent / "report.json").read_text())["networks"][0]
    if digest(artifact) != saved_export["onnx_sha256"]:
        raise ValueError("Original exported graph changed")
    original = onnx.load(artifact)
    if sum(node.op_type == "Conv" for node in original.graph.node) != 10:
        raise ValueError("Expected the audited ten-convolution graph")
    output.mkdir()
    preflight = {
        "purpose": "One all-convolution precision diagnostic on the retained failure; no promotion",
        "track_id": track,
        "audio_sha256": digest(audio),
        "checkpoint_sha256": digest(checkpoint),
        "checkpoint_name": checkpoint.name,
        "source_onnx_sha256": digest(artifact),
        "source_sha256": digest(Path(__file__)),
        "export_helper_sha256": digest(Path("harmonia_ml/export/lv_chordia.py")),
        "test_sha256": digest(Path("tests/test_lv_precise_convolutions.py")),
        "protocol_sha256": digest(Path("experiments/LV-all-convolutions-protocol.md")),
        "tolerances": {
            "logit_atol": LOGIT_ATOL,
            "logit_rtol": LOGIT_RTOL,
            "probability_atol": PROBABILITY_ATOL,
        },
        "threads": 2,
        "thread_environment": {
            key: os.environ.get(key)
            for key in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS")
        },
        "gpu": False,
        "available_ram_bytes": psutil.virtual_memory().available,
    }
    (output / "preflight.json").write_text(json.dumps(preflight, indent=2) + "\n")
    report = {"preflight_sha256": digest(output / "preflight.json"), "passed": False, "heads": {}}
    started = time.perf_counter()
    try:
        entry = DataEntry()
        entry.prop.set("sr", 22050)
        entry.prop.set("hop_length", 512)
        entry.append_file(str(audio.resolve()), io.MusicIO, "music")
        entry.append_extractor(CQTV2, "cqt")
        values = entry.cqt[None].astype(np.float32)
        if values.shape != (1, 1531, 288):
            raise ValueError("Unexpected retained recording shape")
        network = ChordNet(None)
        network.use_gpu = False
        network.load_state_dict(
            torch.load(checkpoint, map_location="cpu", weights_only=True)["net"]
        )
        reference = RawCQTModel(network).cpu().eval()
        require_headroom()
        with torch.inference_mode():
            expected = [v.numpy() for v in reference(torch.from_numpy(values))]
        graph = precise_convolutions(original)
        model = output / "s0.onnx"
        onnx.save(graph, model)
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        options.inter_op_num_threads = 1
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
        require_headroom()
        session = ort.InferenceSession(str(model), options, providers=["CPUExecutionProvider"])
        inference_started = time.perf_counter()
        actual = session.run(list(HEADS), {"cqt": values})
        report["onnx_inference_seconds"] = time.perf_counter() - inference_started
        report["onnx_sha256"] = digest(model)
        for head, observed, wanted in zip(HEADS, actual, expected, strict=True):
            p = torch.softmax(torch.from_numpy(observed), -1).numpy()
            q = torch.softmax(torch.from_numpy(wanted), -1).numpy()
            report["heads"][head] = {
                "max_absolute_logit_error": float(np.abs(observed - wanted).max()),
                "logit_violations": int(
                    (~np.isclose(observed, wanted, atol=LOGIT_ATOL, rtol=LOGIT_RTOL)).sum()
                ),
                "probability_violations": int(
                    (~np.isclose(p, q, atol=PROBABILITY_ATOL, rtol=LOGIT_RTOL)).sum()
                ),
                "argmax_disagreements": int((p.argmax(-1) != q.argmax(-1)).sum()),
            }
        report["passed"] = all(
            v["logit_violations"] == v["probability_violations"] == 0
            for v in report["heads"].values()
        )
        require_headroom()
    except Exception as error:
        report["passed"] = False
        report["error"] = f"{type(error).__name__}: {error}"
        raise
    finally:
        report["elapsed_seconds"] = time.perf_counter() - started
        report["process_peak_rss_bytes"] = getattr(
            psutil.Process().memory_info(), "peak_wset", None
        )
        report["available_ram_bytes_after"] = psutil.virtual_memory().available
        (output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
    if not report["passed"]:
        raise SystemExit("Original numerical acceptance still fails; artifact remains diagnostic")


if __name__ == "__main__":
    run()
