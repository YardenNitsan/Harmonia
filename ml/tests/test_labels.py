import numpy as np

from harmonia_ml.data.labels import ChordTarget, encode_harte, targets_at_times


def test_harte_encoder_keeps_structure_and_absolute_bass() -> None:
    target = encode_harte("C#:min7(9)/b3")

    assert target == ChordTarget(root=1, triad=2, seventh=1, bass=4, extensions=(0, 1, 0, 0))


def test_harte_encoder_distinguishes_no_chord() -> None:
    assert encode_harte("N") == ChordTarget(
        root=12, triad=0, seventh=0, bass=12, extensions=(0, 0, 0, 0)
    )


def test_harte_encoder_does_not_turn_explicit_power_chord_into_major() -> None:
    target = encode_harte("G#:(1,5)/1")

    assert target.triad == 7
    assert target.seventh == 0


def test_frame_targets_mark_boundaries_without_moving_chord_labels() -> None:
    intervals = [(0.0, 1.0, "C:maj"), (1.0, 2.0, "G:7/3")]
    times = np.array([0.95, 1.0, 1.05])

    targets = targets_at_times(intervals, times, boundary_tolerance=0.051)

    assert targets["root"].tolist() == [0, 7, 7]
    assert targets["bass"].tolist() == [0, 11, 11]
    assert targets["boundary"].tolist() == [1.0, 1.0, 1.0]
