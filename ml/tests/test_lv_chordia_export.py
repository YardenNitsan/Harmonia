from pathlib import Path

import numpy as np
import pytest

from harmonia_ml.export.lv_chordia import cqt_fixture, validate_cqt


@pytest.mark.parametrize(
    "values",
    [
        np.ones((17, 288), dtype=np.float32),
        np.ones((2, 17, 288), dtype=np.float32),
        np.ones((1, 0, 288), dtype=np.float32),
        np.ones((1, 17, 252), dtype=np.float32),
        np.ones((1, 17, 288), dtype=np.float64),
        np.full((1, 2, 288), -0.1, dtype=np.float32),
        np.full((1, 2, 288), np.nan, dtype=np.float32),
        np.full((1, 2, 288), np.inf, dtype=np.float32),
    ],
)
def test_cqt_boundary_rejects_invalid_magnitude_inputs(values: np.ndarray) -> None:
    with pytest.raises(ValueError):
        validate_cqt(values)


def test_cqt_boundary_preserves_magnitudes_and_does_not_crop_or_normalize() -> None:
    values = np.arange(2 * 288, dtype=np.float32).reshape(1, 2, 288) / 100
    before = values.copy()
    np.testing.assert_array_equal(validate_cqt(values), before)
    np.testing.assert_array_equal(values, before)


def test_procedural_fixture_is_reproducible_and_rejects_unbounded_lengths() -> None:
    first = cqt_fixture(17)
    np.testing.assert_array_equal(first, cqt_fixture(17))
    assert first.shape == (1, 17, 288)
    assert first.dtype == np.float32
    assert np.isfinite(first).all() and (first >= 0).all()
    for invalid in (0, -1, 8193):
        with pytest.raises(ValueError):
            cqt_fixture(invalid)


def test_installed_first_network_exports_dynamic_raw_heads(tmp_path: Path) -> None:
    pytest.importorskip("lv_chordia")
    import torch

    from harmonia_ml.export.lv_chordia import HEADS, compare_network, export_network

    torch.set_num_threads(2)
    model, session, metadata = export_network(0, tmp_path / "s0.onnx")
    for frames in (1, 17, 65):
        report = compare_network(model, session, cqt_fixture(frames), repeats=1)
        assert set(report["max_absolute_logit_error"]) == set(HEADS)
        assert report["frames"] == frames
        assert report["allclose"] is True
    assert metadata["checkpoint_sha256"]
    assert metadata["operators"]["LSTM"] == 1
