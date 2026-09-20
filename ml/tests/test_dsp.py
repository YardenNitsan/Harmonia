import numpy as np

from harmonia_ml.models.dsp import template_predictions


def test_dsp_template_recognizes_unambiguous_c_major_chroma() -> None:
    features = np.zeros((2, 26), dtype=np.float32)
    features[:, [0, 4, 7]] = 1 / 3
    features[:, 12] = 1.0

    prediction = template_predictions(features)

    assert prediction["root"].tolist() == [0, 0]
    assert prediction["triad"].tolist() == [1, 1]
    assert prediction["bass"].tolist() == [0, 0]
