import numpy as np
import pytest

from experiments.e010_wasm_reference import pack_tensors


def test_binary_references_preserve_exact_dtypes_values_and_alignment():
    values = {
        "input": np.array([1, 2, 3], dtype=np.float32),
        "quality": np.array([1 + 1e-8], dtype=np.float64),
        "decision": np.array([2], dtype=np.int64),
    }
    payload, descriptors = pack_tensors(values)
    for name, original in values.items():
        meta = descriptors[name]
        assert meta["offset"] % 8 == 0
        restored = np.frombuffer(
            payload, dtype=original.dtype, count=original.size, offset=meta["offset"]
        )
        np.testing.assert_array_equal(restored, original)
    assert descriptors["quality"]["dtype"] == "float64"


@pytest.mark.parametrize(
    "value", [np.zeros(0), np.array([np.nan]), np.array([1], dtype=np.int32), np.zeros(1100000)]
)
def test_binary_packer_rejects_empty_nonfinite_unsupported_or_oversized_input(value):
    with pytest.raises(ValueError):
        pack_tensors({"bad": value})
