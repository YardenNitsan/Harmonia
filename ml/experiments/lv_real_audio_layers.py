"""Trace the retained s0 real-validation failure without changing export acceptance.

Run from ml/ with PYTHONPATH=.; CPU only, two Torch/ORT threads, 8 GiB headroom.
No locked-test reads, model changes, or replacement of prior acceptance evidence.
"""

import hashlib
import json
from copy import deepcopy
from importlib.metadata import distribution
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch
from lv_chordia.chordnet_ismir_naive import ChordNet
from lv_chordia.extractors.cqt import CQTV2
from lv_chordia.mir import DataEntry, io
from onnxruntime.capi.onnxruntime_pybind11_state import Fail, NotImplemented

from harmonia_ml.export.lv_chordia import (
    HEADS,
    LOGIT_ATOL,
    LOGIT_RTOL,
    ExportInstanceNorm,
    RawCQTModel,
    require_headroom,
)


def error(actual, expected):
    difference = actual.astype(np.float64) - expected.astype(np.float64)
    return {
        "max_abs": float(np.abs(difference).max()),
        "rms": float(np.sqrt(np.mean(difference**2))),
    }


def main():
    require_headroom()
    torch.set_num_threads(2)
    selection = json.loads(Path("experiments/results/E006-lv-chordia/selection.json").read_text())
    manifest = json.loads(Path("data/prepared/guitarset-v1/manifest.json").read_text())
    track = "00_Funk2-108-Eb_solo"
    record = next(r for r in manifest["records"] if r["track_id"] == track)
    assert track in selection["track_ids"] and record["split"] == "validation"
    audio = Path("data/downloads/extracted/audio") / f"{track}_mic.wav"
    assert hashlib.sha256(audio.read_bytes()).hexdigest() == record["audio_sha256"]
    entry = DataEntry()
    entry.prop.set("sr", 22050)
    entry.prop.set("hop_length", 512)
    entry.append_file(str(audio.resolve()), io.MusicIO, "music")
    entry.append_extractor(CQTV2, "cqt")
    values = entry.cqt[None].astype(np.float32)
    package = distribution("lv-chordia")
    weight = next(f for f in package.files if f.name.endswith("_s0.best.sdict"))
    checkpoint = Path(package.locate_file(weight))
    assert (
        hashlib.sha256(checkpoint.read_bytes()).hexdigest()
        == selection["weights_sha256"][weight.name]
    )
    network = ChordNet(None)
    network.use_gpu = False
    network.load_state_dict(torch.load(checkpoint, map_location="cpu", weights_only=True)["net"])
    reference = RawCQTModel(network).cpu().eval()
    export_copy = deepcopy(reference)
    for name, layer in export_copy.network.audio_feature_block.named_children():
        if isinstance(layer, torch.nn.InstanceNorm2d):
            setattr(export_copy.network.audio_feature_block, name, ExportInstanceNorm(layer))

    refs, copies, isolated = {}, {}, {}
    handles = []

    def capture(name, destination, native=False):
        def hook(module, inputs, output):
            destination[name] = output.detach().numpy().copy()
            if native and name.startswith("norm"):
                precise = ExportInstanceNorm(module)(inputs[0]).detach().numpy()
                isolated[name] = error(precise, destination[name])

        return hook

    for model, outputs, native in ((reference, refs, True), (export_copy, copies, False)):
        for name, layer in model.network.audio_feature_block.named_children():
            if name.startswith(("conv", "norm")):
                handles.append(layer.register_forward_hook(capture(name, outputs, native)))
    with torch.inference_mode():
        expected = reference(torch.from_numpy(values))
        copied = export_copy(torch.from_numpy(values))
    for handle in handles:
        handle.remove()

    artifact = Path("artifacts/lv-chordia-cpu-ensemble-4096/s0.onnx")
    graph = onnx.load(artifact)
    nodes = [
        n
        for n in graph.graph.node
        if n.op_type == "Conv" or ("/norm" in n.name and n.name.endswith("/Cast_1"))
    ]
    for node in nodes:
        graph.graph.output.append(
            onnx.helper.make_tensor_value_info(node.output[0], onnx.TensorProto.FLOAT, None)
        )
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
    require_headroom()
    session = ort.InferenceSession(
        graph.SerializeToString(), options, providers=["CPUExecutionProvider"]
    )
    results = session.run(list(HEADS) + [n.output[0] for n in nodes], {"cqt": values})
    report = {
        "purpose": "Layer localization; original acceptance reference and tolerances unchanged",
        "track_id": track,
        "audio_sha256": record["audio_sha256"],
        "frames": values.shape[1],
        "onnx_sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
        "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "layers": [],
        "heads": {},
    }
    for node, actual in zip(nodes, results[len(HEADS) :], strict=True):
        name = node.name.split("/")[-2]
        row = {
            "name": name,
            "ort_vs_native": error(actual, refs[name]),
            "torch_export_copy_vs_native": error(copies[name], refs[name]),
            "ort_vs_torch_export_copy": error(actual, copies[name]),
        }
        if name in isolated:
            row["same_input_precise_vs_native_norm"] = isolated[name]
        report["layers"].append(row)
    for name, actual, native, copy in zip(
        HEADS, results[: len(HEADS)], expected, copied, strict=True
    ):
        expected_array = native.numpy()
        report["heads"][name] = {
            "ort_vs_native": error(actual, expected_array),
            "torch_export_copy_vs_native": error(copy.numpy(), expected_array),
            "ort_vs_torch_export_copy": error(actual, copy.numpy()),
            "ort_logit_violations": int(
                (~np.isclose(actual, expected_array, atol=LOGIT_ATOL, rtol=LOGIT_RTOL)).sum()
            ),
            "torch_export_copy_logit_violations": int(
                (~np.isclose(copy.numpy(), expected_array, atol=LOGIT_ATOL, rtol=LOGIT_RTOL)).sum()
            ),
        }
    del refs, copies, results, session, export_copy
    report["first_convolution_probes"] = []
    for mode in ("separate_bias", "double_convolution", "double_patch_matmul"):
        require_headroom()
        variant = onnx.load(artifact)
        first = next(n for n in variant.graph.node if n.op_type == "Conv")
        inputs, outputs = list(first.input), list(first.output)
        position = list(variant.graph.node).index(first)
        if mode == "separate_bias":
            first.input.pop()
            first.output[0] = outputs[0] + "_unbiased"
            bias = next(v for v in variant.graph.initializer if v.name == inputs[2])
            shaped_bias = inputs[2] + "_spatial"
            variant.graph.initializer.append(
                onnx.numpy_helper.from_array(
                    onnx.numpy_helper.to_array(bias).reshape(1, -1, 1, 1), shaped_bias
                )
            )
            variant.graph.node.insert(
                position + 1,
                onnx.helper.make_node("Add", [first.output[0], shaped_bias], outputs),
            )
        elif mode == "double_convolution":
            first.input[0] = inputs[0] + "_double"
            first.output[0] = outputs[0] + "_double"
            for initializer in variant.graph.initializer:
                if initializer.name in inputs[1:]:
                    initializer.CopyFrom(
                        onnx.numpy_helper.from_array(
                            onnx.numpy_helper.to_array(initializer).astype(np.float64),
                            initializer.name,
                        )
                    )
            variant.graph.node.insert(
                position,
                onnx.helper.make_node(
                    "Cast", [inputs[0]], [inputs[0] + "_double"], to=onnx.TensorProto.DOUBLE
                ),
            )
            variant.graph.node.insert(
                position + 2,
                onnx.helper.make_node(
                    "Cast", [outputs[0] + "_double"], outputs, to=onnx.TensorProto.FLOAT
                ),
            )
        else:
            prefix = "diagnostic_first_conv/"

            def constant(name, value, *, prefix=prefix, variant=variant):
                key = prefix + name
                variant.graph.initializer.append(onnx.numpy_helper.from_array(value, key))
                return key

            weights = next(v for v in variant.graph.initializer if v.name == inputs[1])
            bias = next(v for v in variant.graph.initializer if v.name == inputs[2])
            weight_values = onnx.numpy_helper.to_array(weights)
            assert weight_values.shape == (16, 1, 3, 3)
            nodes = [
                onnx.helper.make_node(
                    "Cast", [inputs[0]], [prefix + "double"], to=onnx.TensorProto.DOUBLE
                ),
                onnx.helper.make_node(
                    "Pad",
                    [
                        prefix + "double",
                        constant("pads", np.array([0, 0, 1, 1, 0, 0, 1, 1], np.int64)),
                    ],
                    [prefix + "padded"],
                ),
            ]
            axes = constant("axes", np.array([2, 3], np.int64))
            patches = []
            for y in range(3):
                for x in range(3):
                    name = f"patch_{y}_{x}"
                    patch = prefix + name
                    patches.append(patch)
                    starts = constant(name + "_starts", np.array([y, x], np.int64))
                    ends = constant(
                        name + "_ends",
                        np.array(
                            [y - 2 if y < 2 else 2**63 - 1, x - 2 if x < 2 else 2**63 - 1], np.int64
                        ),
                    )
                    nodes.append(
                        onnx.helper.make_node(
                            "Slice", [prefix + "padded", starts, ends, axes], [patch]
                        )
                    )
            nodes.extend(
                [
                    onnx.helper.make_node("Concat", patches, [prefix + "patches"], axis=1),
                    onnx.helper.make_node(
                        "Transpose", [prefix + "patches"], [prefix + "rows"], perm=[0, 2, 3, 1]
                    ),
                    onnx.helper.make_node(
                        "MatMul",
                        [
                            prefix + "rows",
                            constant("weights", weight_values.reshape(16, 9).T.astype(np.float64)),
                        ],
                        [prefix + "unbiased"],
                    ),
                    onnx.helper.make_node(
                        "Add",
                        [
                            prefix + "unbiased",
                            constant("bias", onnx.numpy_helper.to_array(bias).astype(np.float64)),
                        ],
                        [prefix + "biased"],
                    ),
                    onnx.helper.make_node(
                        "Transpose", [prefix + "biased"], [prefix + "channels"], perm=[0, 3, 1, 2]
                    ),
                    onnx.helper.make_node(
                        "Cast", [prefix + "channels"], outputs, to=onnx.TensorProto.FLOAT
                    ),
                ]
            )
            del variant.graph.node[position]
            for offset, node in enumerate(nodes):
                variant.graph.node.insert(position + offset, node)
        probe = {"mode": mode}
        try:
            variant_session = ort.InferenceSession(
                variant.SerializeToString(), options, providers=["CPUExecutionProvider"]
            )
            actual_heads = variant_session.run(list(HEADS), {"cqt": values})
            probe["heads"] = {}
            for name, actual, native in zip(HEADS, actual_heads, expected, strict=True):
                probe["heads"][name] = {
                    **error(actual, native.numpy()),
                    "logit_violations": int(
                        (
                            ~np.isclose(actual, native.numpy(), atol=LOGIT_ATOL, rtol=LOGIT_RTOL)
                        ).sum()
                    ),
                }
            del variant_session
        except (NotImplemented, Fail) as exc:
            probe["runtime_error"] = str(exc)
        report["first_convolution_probes"].append(probe)
    path = Path("artifacts/lv-chordia-diagnostic/real-audio-layers.json")
    path.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()
