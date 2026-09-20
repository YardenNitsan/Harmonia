import numpy as np

from harmonia_ml.inference.regions import refine_regions


def evidence():
    heads = [np.ones((100, 2)), np.ones((100, 13))]
    heads += [np.full((100, 4), 0.1) for _ in range(4)]
    for head in heads[2:]:
        head[:, 0] = 0.9
        head[30:35, 0] = 0.49
        head[30:35, 1] = 0.51
    return heads


def encode(label):
    return np.array([1, 0, 0, int(label == "C9"), 0, 0])


def test_ninth_uses_beat_aggregate_and_preserves_strong_extension():
    heads = evidence()
    rows = [(0, 0.3, "C"), (0.3, 0.35, "C9"), (0.35, 1, "C")]
    assert refine_regions(rows, heads, [0, 0.5, 1], 0.01, encode) == ([(0, 1, "C")], 1)
    heads[3][30:35, 1] = 0.85
    assert refine_regions(rows, heads, [0, 0.5, 1], 0.01, encode) == (rows, 0)


def test_region_evidence_alone_cannot_override_disagreeing_beat_evidence():
    heads = evidence()
    heads[3][:50, 0] = 0.1
    heads[3][:50, 1] = 0.8
    heads[3][30:35, 0] = 0.49
    heads[3][30:35, 1] = 0.51
    rows = [(0, 0.3, "C"), (0.3, 0.35, "C9"), (0.35, 1, "C")]
    assert refine_regions(rows, heads, [0, 0.5, 1], 0.01, encode) == (rows, 0)


def test_crossing_beat_decoration_and_absent_beat_evidence_survive():
    rows = [(0, 0.3, "C"), (0.3, 0.35, "C9"), (0.35, 1, "C")]
    for beats in ([], [0], [0, 0.32, 0.64, 0.96]):
        assert refine_regions(rows, evidence(), beats, 0.01, encode) == (rows, 0)


def test_short_no_chord_interval_remains_explicit():
    rows = [(0, 0.3, "C"), (0.3, 0.35, "N"), (0.35, 1, "C")]

    def encoded(label):
        return np.array([0, -1, -1, -1, -1, -1]) if label == "N" else encode(label)

    assert refine_regions(rows, evidence(), [0, 0.5, 1], 0.01, encoded) == (rows, 0)
