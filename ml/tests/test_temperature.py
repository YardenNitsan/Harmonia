import numpy as np

from harmonia_ml.evaluation import calibration


def test_temperature_softens_overconfident_roots_and_preserves_argmax() -> None:
    logits = np.array([[5.0, 0.0]] * 10)
    labels = np.array([0] * 7 + [1] * 3)
    temperature = calibration.fit_temperature(logits, labels)
    assert temperature > 1
    before = calibration.temperature_metrics(logits, labels, 1.0)
    after = calibration.temperature_metrics(logits, labels, temperature)
    assert after["nll"] < before["nll"]
    assert after["ece"] < 0.01
    assert after["accuracy"] == before["accuracy"] == 0.7
