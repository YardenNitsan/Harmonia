import importlib

import numpy as np
import pytest

from harmonia_ml.data.winterreise import parse_annotations


def prepare_module():
    try:
        return importlib.import_module("harmonia_ml.data.prepare_winterreise")
    except ModuleNotFoundError:
        pytest.fail("Masked Winterreise preparation is not implemented")


def test_unknown_gaps_conflicts_and_unrepresentable_labels_are_never_n_targets():
    csv = (
        "start;end;shorthand;extended;majmin;majmin_inv\n"
        "1;2;C:maj;C:(3,5);C:maj;C:maj\n"
        "2;3;A:(3,5,b7,b9);A:(3,5,b9);A:maj;A:maj\n"
        "3;4;D:(b9);D:(b9);D:maj;D:maj\n"
        "4;5;N;N;N;N\n"
        "5;6;G:min/A#;G:(b3,5)/A#;G:min;G:min/A#\n"
    )
    rows = parse_annotations(csv, duration=7)
    times = np.array([0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5])
    targets, boundary_times, excluded = prepare_module().masked_targets(rows, times)
    assert targets["mask"].tolist() == [False, True, False, False, True, True, False]
    assert targets["root"][targets["mask"]].tolist() == [0, 12, 7]
    assert targets["bass"][5] == 10
    assert boundary_times.tolist() == [5.0]
    assert excluded == {"source_conflict_or_parse_error": 1, "unrepresentable": 1}


def test_reduced_target_preserves_diminished_triad_and_explicit_seventh():
    csv = (
        "start;end;shorthand;extended;majmin;majmin_inv\n"
        "0;1;C:hdim7;C:(b3,b5,b7);C:min;C:min\n"
        "1;2;D:dim7;D:(b3,b5,bb7);D:min;D:min\n"
    )
    targets, _, _ = prepare_module().masked_targets(
        parse_annotations(csv, duration=2), np.array([0.5, 1.5])
    )
    assert targets["mask"].tolist() == [True, True]
    assert targets["triad"].tolist() == [3, 3]
    assert targets["seventh"].tolist() == [1, 3]
