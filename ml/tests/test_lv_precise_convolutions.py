import numpy as np
import onnxruntime as ort
import pytest
import torch
from onnx import TensorProto, helper, numpy_helper

from experiments.lv_precise_convolutions import precise_convolutions


@pytest.mark.parametrize("padding", [(1, 1), (1, 0), (0, 0)])
def test_multichannel_patch_order_and_padding_match_double_reference(padding):
    rng = np.random.default_rng(23)
    x = rng.normal(size=(1, 3, 8, 9)).astype(np.float32)
    weight = rng.normal(size=(4, 3, 3, 3)).astype(np.float32)
    bias = rng.normal(size=4).astype(np.float32)
    graph = helper.make_graph(
        [
            helper.make_node(
                "Conv", ["x", "w", "b"], ["y"], pads=[*padding, *padding], kernel_shape=[3, 3]
            )
        ],
        "fixture",
        [helper.make_tensor_value_info("x", TensorProto.FLOAT, [1, 3, 8, 9])],
        [
            helper.make_tensor_value_info(
                "y", TensorProto.FLOAT, [1, 4, 6 + 2 * padding[0], 7 + 2 * padding[1]]
            )
        ],
        [numpy_helper.from_array(weight, "w"), numpy_helper.from_array(bias, "b")],
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)], ir_version=10)
    source = model.SerializeToString()
    converted = precise_convolutions(model)
    assert model.SerializeToString() == source
    assert not any(node.op_type == "Conv" for node in converted.graph.node)
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(
        converted.SerializeToString(), options, providers=["CPUExecutionProvider"]
    )
    expected = (
        torch.nn.functional.conv2d(
            torch.from_numpy(x).double(),
            torch.from_numpy(weight).double(),
            torch.from_numpy(bias).double(),
            padding=padding,
        )
        .float()
        .numpy()
    )
    np.testing.assert_array_equal(session.run(None, {"x": x})[0], expected)
