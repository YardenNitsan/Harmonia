import numpy as np
import onnxruntime as ort
import pytest
import torch
from onnx import TensorProto, helper

from experiments.lv_precise_selu import precise_selu


def graph(alpha=1.6732632423543772):
    return helper.make_model(
        helper.make_graph(
            [helper.make_node("Selu", ["x"], ["y"], alpha=alpha, gamma=1.0507009873554805)],
            "fixture",
            [helper.make_tensor_value_info("x", TensorProto.FLOAT, ["n"])],
            [helper.make_tensor_value_info("y", TensorProto.FLOAT, ["n"])],
        ),
        opset_imports=[helper.make_opsetid("", 17)],
        ir_version=10,
    )


def test_rewrite_preserves_source_and_near_zero_precision():
    source = graph()
    original = source.SerializeToString()
    converted = precise_selu(source)
    assert source.SerializeToString() == original
    assert not any(node.op_type == "Selu" for node in converted.graph.node)
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
    session = ort.InferenceSession(converted.SerializeToString(), options)
    x = np.linspace(-1e-4, 1e-4, 10001, dtype=np.float32)
    expected = torch.nn.functional.selu(torch.from_numpy(x)).numpy()
    actual = session.run(None, {"x": x})[0]
    assert actual.dtype == np.float32
    np.testing.assert_allclose(actual, expected, atol=1e-12, rtol=0)


def test_rewrite_refuses_unverified_coefficients():
    with pytest.raises(ValueError, match="coefficients"):
        precise_selu(graph(alpha=2))


def test_rewrite_requires_selu_nodes():
    source = graph()
    source.graph.node[0].op_type = "Identity"
    source.graph.node[0].ClearField("attribute")
    with pytest.raises(ValueError, match="No SELU"):
        precise_selu(source)
