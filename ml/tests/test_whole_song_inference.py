from __future__ import annotations

import io

import numpy as np
import pytest

from harmonia_ml.inference.whole_song import (
    MAX_SAMPLES,
    bounded_segments,
    read_pcm,
    verify_weights,
)


def test_weak_transient_seventh_collapses_but_strong_seventh_survives():
    from harmonia_ml.inference.regions import refine_regions

    probabilities = [np.ones((100, 2)), np.ones((100, 13))]
    probabilities += [np.full((100, 12, 4), 0.1) for _ in range(4)]
    probabilities[2][:, 0, 0] = 0.8
    probabilities[2][40:45, 0, 0] = 0.48
    probabilities[2][40:45, 0, 1] = 0.52
    rows = [(0.0, 0.4, "C"), (0.4, 0.45, "C7"), (0.45, 1.0, "C")]

    def encode(name):
        return np.array([1, 0, int(name == "C7"), 0, 0, 0])

    result, count = refine_regions(rows, probabilities, [0.0, 0.5, 1.0], 0.01, encode)
    assert result == [(0.0, 1.0, "C")]
    assert count == 1
    probabilities[2][40:45, 0, 1] = 0.9
    result, count = refine_regions(rows, probabilities, [0.0, 0.5, 1.0], 0.01, encode)
    assert result == rows
    assert count == 0


def test_persistent_and_offbeat_harmonic_change_survives_refinement():
    from harmonia_ml.inference.regions import refine_regions

    probabilities = [np.ones((100, 3)), np.ones((100, 13))]
    probabilities += [np.full((100, 12, 4), 0.1) for _ in range(4)]
    rows = [(0.0, 0.31, "C"), (0.31, 0.37, "D"), (0.37, 1.0, "C")]

    def encode(name):
        return np.array([1 if name == "C" else 3, 0, 0, 0, 0, 0])

    assert refine_regions(rows, probabilities, [0.0, 0.5, 1.0], 0.01, encode) == (rows, 0)


def test_weak_bass_transient_is_separate_from_harmonic_root():
    from harmonia_ml.inference.regions import refine_regions

    probabilities = [np.ones((100, 2)), np.full((100, 13), 0.01)]
    probabilities += [np.full((100, 12, 4), 0.1) for _ in range(4)]
    probabilities[1][:, 1] = 0.8
    probabilities[1][40:50, 1] = 0.49
    probabilities[1][40:50, 5] = 0.51
    rows = [(0.0, 0.4, "C"), (0.4, 0.5, "C/E"), (0.5, 1.0, "C")]

    def encode(name):
        return np.array([1, 4 if "/" in name else 0, 0, 0, 0, 0])

    assert refine_regions(rows, probabilities, [0.0, 0.5, 1.0], 0.01, encode)[1] == 1
    probabilities[1][40:50, 5] = 0.95
    assert refine_regions(rows, probabilities, [0.0, 0.5, 1.0], 0.01, encode) == (rows, 0)


def test_beat_relative_persistence_preserves_longer_decoration():
    from harmonia_ml.inference.regions import refine_regions

    probabilities = [np.ones((100, 2)), np.ones((100, 13))]
    probabilities += [np.full((100, 12, 4), 0.5) for _ in range(4)]
    rows = [(0.0, 0.3, "C"), (0.3, 0.6, "C7"), (0.6, 1.0, "C")]

    def encode(name):
        return np.array([1, 0, int(name == "C7"), 0, 0, 0])

    assert refine_regions(rows, probabilities, [0.0, 0.5, 1.0], 0.01, encode) == (rows, 0)


def test_component_evidence_accepts_original_global_and_root_conditioned_heads():
    from harmonia_ml.inference.regions import component_values

    chord = np.array([1, 0, 1, 0, 0, 0])
    global_head = np.array([[0.1, 0.9], [0.2, 0.8]])
    conditional = np.repeat(global_head[:, None, :], 12, axis=1)
    for head in (global_head, conditional):
        assert np.array_equal(component_values(head, 2, chord, 0, 2), [0.9, 0.8])


def test_pcm_roundtrip_preserves_every_float():
    original = np.array([-1, 0, 0.125, 1], dtype="<f4")
    assert np.array_equal(read_pcm(io.BytesIO(original.tobytes()), 4), original)


@pytest.mark.parametrize("size", [0, -1, MAX_SAMPLES + 1])
def test_pcm_count_rejected_before_read(size):
    class NeverRead:
        def read(self, _):
            raise AssertionError("Invalid length must not read stdin")

    with pytest.raises(ValueError, match="sample"):
        read_pcm(NeverRead(), size)


@pytest.mark.parametrize("payload", [b"\0" * 3, b"\0" * 5])
def test_pcm_rejects_truncated_and_extra_bytes(payload):
    with pytest.raises(ValueError, match="length"):
        read_pcm(io.BytesIO(payload), 1)


def test_pcm_rejects_nonfinite():
    with pytest.raises(ValueError, match="finite"):
        read_pcm(io.BytesIO(np.array([np.nan], dtype="<f4").tobytes()), 1)


def test_weight_identity_fails_closed(tmp_path):
    (tmp_path / "model.sdict").write_bytes(b"untrusted")
    with pytest.raises(ValueError, match="hash"):
        verify_weights(tmp_path, {"model.sdict": "0" * 64})


def test_boundaries_clamp_tail_without_erasing_short_supported_chord():
    segments = bounded_segments([(0, 0.8, "C:maj"), (0.8, 0.9, "G:7"), (0.9, 1.02, "N")], 1)
    assert segments == [(0, 0.8, "C:maj"), (0.8, 0.9, "G:7"), (0.9, 1, "N")]


@pytest.mark.parametrize(
    "segments", [[(0, 0.4, "C:maj"), (0.5, 1, "G:maj")], [(0, float("nan"), "N")], [(0, 0, "N")]]
)
def test_invalid_native_timeline_rejected(segments):
    with pytest.raises(ValueError, match="timeline"):
        bounded_segments(segments, 1)
