import numpy as np

from harmonia_ml.inference.boundary_timing import align_boundaries


def test_nearby_supported_attack_moves_boundary_without_changing_labels():
    rows = [(0.0, 1.0, "C:maj"), (1.0, 2.0, "G:maj")]
    observed = np.zeros((20, 2))
    result = align_boundaries(rows, [0.9], observed, ["C:maj", "G:maj"], 0.1)
    assert result == [(0.0, 0.9, "C:maj"), (0.9, 2.0, "G:maj")]
    assert rows[0][1] == 1.0


def test_strong_evidence_absent_attack_and_short_changes_are_preserved():
    rows = [(0.0, 1.0, "C:maj"), (1.0, 2.0, "G:maj")]
    observed = np.zeros((20, 2))
    observed[9, 1] = -3
    assert align_boundaries(rows, [0.9], observed, ["C:maj", "G:maj"], 0.1) == rows
    assert align_boundaries(rows, [], observed, ["C:maj", "G:maj"], 0.1) == rows
    short = [(0.0, 1.0, "C:maj"), (1.0, 1.1, "G:maj"), (1.1, 2.0, "C:maj")]
    assert align_boundaries(short, [0.9, 1.2], observed, ["C:maj", "G:maj"], 0.1) == short


def test_no_chord_and_offbeat_boundaries_do_not_get_forced_to_a_grid():
    rows = [(0.0, 0.37, "N"), (0.37, 0.89, "C:maj"), (0.89, 2.0, "G:maj")]
    observed = np.zeros((20, 3))
    assert align_boundaries(rows, [0.5, 1.25], observed, ["N", "C:maj", "G:maj"], 0.1) == rows
