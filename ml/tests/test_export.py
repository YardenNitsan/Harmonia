from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch

from harmonia_ml.models.structured import StructuredChordModel


def test_export_matches_raw_feature_inference_for_dynamic_lengths(tmp_path: Path) -> None:
    from harmonia_ml.export.onnx import export_model

    torch.manual_seed(12)
    model = StructuredChordModel(input_features=26, hidden_channels=16, blocks=1, dropout=0)
    checkpoint = {
        "model_config": model.artifact_config(),
        "model_state": model.state_dict(),
        "normalization_mean": np.full(26, 0.2, dtype=np.float32),
        "normalization_std": np.full(26, 0.5, dtype=np.float32),
        "feature_indices": list(range(26)),
        "experiment_id": "test",
        "feature_config": {"sample_rate": 22050, "n_fft": 2048, "hop_length": 512},
    }
    path = tmp_path / "model.onnx"
    export_model(checkpoint, path)
    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    model.eval()
    for length in (1, 17, 65):
        features = np.random.default_rng(length).normal(size=(1, length, 26)).astype(np.float32)
        outputs = session.run(None, {"features": features})
        with torch.no_grad():
            expected = model(torch.from_numpy((features - 0.2) / 0.5))
        for head, actual in zip(expected, outputs, strict=True):
            np.testing.assert_allclose(actual, expected[head].numpy(), atol=3e-6, rtol=3e-5)
