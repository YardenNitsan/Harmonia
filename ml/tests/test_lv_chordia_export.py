import json
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
    assert metadata["checkpoint_name"] == (
        "joint_chord_net_ismir_naive_v1.0_reweight(0.0,10.0)_s0.best.sdict"
    )
    # Long spatial reductions exposed drift hidden by the short export fixture.
    for frames in (1, 17, 65, 2048, 8192):
        report = compare_network(model, session, cqt_fixture(frames), repeats=1)
        assert set(report["max_absolute_logit_error"]) == set(HEADS)
        assert report["frames"] == frames
        assert report["allclose"] is True
    assert metadata["checkpoint_sha256"]
    assert metadata["operators"]["LSTM"] == 1


def test_ensemble_averages_five_probability_distributions_before_decoding() -> None:
    from harmonia_ml.export.lv_chordia import HEAD_SIZES, average_probabilities

    networks = []
    for probability in (0.1, 0.2, 0.3, 0.4, 0.5):
        heads = []
        for size in HEAD_SIZES:
            values = np.full((2, size), (1 - probability) / (size - 1), dtype=np.float32)
            values[:, 0] = probability
            heads.append(values)
        networks.append(heads)
    averaged = average_probabilities(networks)
    for size, head in zip(HEAD_SIZES, averaged, strict=True):
        np.testing.assert_allclose(head[:, 0], [0.3, 0.3])
        np.testing.assert_allclose(head[:, 1:], 0.7 / (size - 1))
        np.testing.assert_allclose(head.sum(axis=-1), [1.0, 1.0], atol=1e-6)
    with pytest.raises(ValueError, match="five"):
        average_probabilities(networks[:4])


def test_full_ensemble_study_retains_installed_submission_decoder(tmp_path: Path) -> None:
    pytest.importorskip("lv_chordia")
    from harmonia_ml.export.lv_chordia import export_study

    report = export_study(tmp_path, all_networks=True, lengths=[17])
    assert len(report["networks"]) == 5
    assert report["ensemble"][0]["hmm_segments_equal"] is True
    assert report["ensemble"][0]["allclose"] is True


def test_failed_parity_is_recorded_and_stops_later_network_exports(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    pytest.importorskip("lv_chordia")
    from harmonia_ml.export import lv_chordia

    # Exact bit equality intentionally fails between the two real CPU runtimes.
    monkeypatch.setattr(lv_chordia, "LOGIT_ATOL", 0)
    monkeypatch.setattr(lv_chordia, "LOGIT_RTOL", 0)
    with pytest.raises(AssertionError):
        lv_chordia.export_study(tmp_path, all_networks=True, lengths=[17])
    report = json.loads((tmp_path / "report.json").read_text())
    assert report["acceptance"] == "failed"
    assert report["failure"]["network"] == 0
    assert report["failure"]["frames"] == 17
    assert not (tmp_path / "s1.onnx").exists()
