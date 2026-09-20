"""Constructed SELU kernel diagnostic; no datasets, weights or model acceptance.

Fixed arms: native ONNX Selu versus a double exp-minus-one, float32 coefficient
decomposition. Compare both to unchanged Torch float32 SELU on four fixed inputs.
This investigates the expm1 versus exp(x)-1 backend distinction; no graph search.
"""

import hashlib
import json
import os
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from onnx import TensorProto, helper, numpy_helper


def activation_graph(decomposed: bool):
    alpha = np.float32(1.6732632423543772)
    scale = np.float32(1.0507009873554805)
    if not decomposed:
        nodes = [helper.make_node("Selu", ["x"], ["y"], alpha=float(alpha), gamma=float(scale))]
        constants = []
    else:
        constants = [
            numpy_helper.from_array(np.array(value, dtype=dtype), name)
            for name, value, dtype in (
                ("zero", 0, np.float32),
                ("one64", 1, np.float64),
                ("scale", scale, np.float32),
                ("negative_coefficient", np.float32(alpha * scale), np.float32),
            )
        ]
        nodes = [
            helper.make_node("Cast", ["x"], ["double"], to=TensorProto.DOUBLE),
            helper.make_node("Exp", ["double"], ["exponential"]),
            helper.make_node("Sub", ["exponential", "one64"], ["difference"]),
            helper.make_node("Cast", ["difference"], ["expm1_approx"], to=TensorProto.FLOAT),
            helper.make_node("Mul", ["expm1_approx", "negative_coefficient"], ["negative"]),
            helper.make_node("Mul", ["x", "scale"], ["positive"]),
            helper.make_node("GreaterOrEqual", ["x", "zero"], ["nonnegative"]),
            helper.make_node("Where", ["nonnegative", "positive", "negative"], ["y"]),
        ]
    return helper.make_model(
        helper.make_graph(
            nodes,
            "constructed-selu-diagnostic",
            [helper.make_tensor_value_info("x", TensorProto.FLOAT, ["values"])],
            [helper.make_tensor_value_info("y", TensorProto.FLOAT, ["values"])],
            constants,
        ),
        opset_imports=[helper.make_opsetid("", 17)],
        ir_version=10,
    )


def run():
    path = Path("artifacts/lv-chordia-diagnostic/selu-kernel.json")
    if path.exists():
        raise FileExistsError("Preserve the completed constructed diagnostic")
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
    sessions = {
        name: ort.InferenceSession(
            activation_graph(decomposed).SerializeToString(),
            options,
            providers=["CPUExecutionProvider"],
        )
        for name, decomposed in (("native_onnx", False), ("double_difference", True))
    }
    fixtures = {
        "near_zero": np.linspace(-1e-4, 1e-4, 10001, dtype=np.float32),
        "normal_seed_7319": np.random.default_rng(7319).normal(0, 1, 10000).astype(np.float32),
        "tails": np.linspace(-80, 80, 10001, dtype=np.float32),
        "zero_and_subnormal": np.array([0, -0.0, -1e-8, -1e-16, -1e-30, 1e-30], np.float32),
    }
    report = {
        "scope": "Constructed isolated activation only; no model, audio or acceptance claim",
        "source_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "torch": torch.__version__,
        "onnxruntime": ort.__version__,
        "numpy": np.__version__,
        "thread_environment": {
            key: os.environ.get(key)
            for key in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS")
        },
        "sources": [
            "https://raw.githubusercontent.com/pytorch/pytorch/v2.11.0/aten/src/ATen/native/cpu/Elu.h",
            "https://raw.githubusercontent.com/microsoft/onnxruntime/v1.30.0/onnxruntime/core/providers/cpu/activation/activations.h",
        ],
        "fixtures": {},
    }
    for name, values in fixtures.items():
        expected = torch.nn.functional.selu(torch.from_numpy(values)).numpy()
        results = {}
        for arm, session in sessions.items():
            actual = session.run(None, {"x": values})[0]
            difference = actual.astype(np.float64) - expected.astype(np.float64)
            results[arm] = {
                "finite": bool(np.isfinite(actual).all()),
                "max_absolute_error": float(np.abs(difference).max()),
                "rms_error": float(np.sqrt(np.mean(difference**2))),
                "nonidentical_values": int((actual != expected).sum()),
                "zeroed_nonzero_reference": int(((actual == 0) & (expected != 0)).sum()),
            }
        report["fixtures"][name] = {
            "values": len(values),
            "input_sha256": hashlib.sha256(values.tobytes()).hexdigest(),
            "arms": results,
        }
    with path.open("x", encoding="utf-8") as stream:
        json.dump(report, stream, indent=2, allow_nan=False)
        stream.write("\n")
    print(json.dumps(report["fixtures"], indent=2))


if __name__ == "__main__":
    run()
