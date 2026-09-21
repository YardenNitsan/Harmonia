"""Sample/time invariants for the research BTC adapter; no weights or corpus access."""

import numpy as np
import pytest

from experiments.original_btc import (
    BLOCK_SAMPLES,
    HOP,
    SAMPLE_RATE,
    block_ranges,
    extract_features,
    label_segments,
    vocabulary,
)


def test_block_ranges_cover_short_exact_and_partial_recordings():
    assert block_ranges(100) == [(0, 100)]
    assert block_ranges(BLOCK_SAMPLES) == [(0, BLOCK_SAMPLES)]
    assert block_ranges(BLOCK_SAMPLES + 10) == [
        (0, BLOCK_SAMPLES),
        (BLOCK_SAMPLES, BLOCK_SAMPLES + 10),
    ]
    with pytest.raises(ValueError, match="Empty PCM"):
        block_ranges(0)


def test_cqt_recipe_preserves_block_origins_without_timing_drift(monkeypatch):
    import librosa

    calls = []

    def cqt(pcm, **kwargs):
        calls.append((len(pcm), kwargs))
        return np.ones((144, len(pcm) // HOP + 1), dtype=np.complex64)

    monkeypatch.setattr(librosa, "cqt", cqt)
    features, times = extract_features(np.zeros(BLOCK_SAMPLES + SAMPLE_RATE, dtype=np.float32))
    assert features.shape == (119, 144)
    assert times[107] == pytest.approx(107 * HOP / SAMPLE_RATE)
    assert times[108] == 10.0
    assert times[109] == pytest.approx(10 + HOP / SAMPLE_RATE)
    assert [n for n, _ in calls] == [BLOCK_SAMPLES, SAMPLE_RATE]
    assert calls[0][1] == {
        "sr": SAMPLE_RATE,
        "n_bins": 144,
        "bins_per_octave": 24,
        "hop_length": HOP,
    }


def test_segments_clamp_endpoint_and_preserve_short_transitions():
    result = label_segments(
        np.array([0, 1, 0, 1]), np.array([0, 0.1, 0.2, 0.3]), 0.3, ["C:maj", "G:7"]
    )
    assert result == [
        {"start": 0.0, "end": 0.1, "label": "C:maj"},
        {"start": 0.1, "end": 0.2, "label": "G:7"},
        {"start": 0.2, "end": 0.3, "label": "C:maj"},
    ]


def test_original_vocabularies_have_explicit_unknown_and_no_chord_states():
    assert vocabulary(170)[168:] == ["X", "N"]
    assert vocabulary(170)[:3] == ["C:min", "C:maj", "C:dim"]
    assert vocabulary(25)[:3] == ["C:maj", "C:min", "C#:maj"]
    assert vocabulary(25)[24] == "N"
