import numpy as np

from harmonia_ml.features.extract import FeatureConfig, extract_features


def test_feature_extraction_is_deterministic_and_has_explicit_contract() -> None:
    sample_rate = 22_050
    time = np.arange(sample_rate, dtype=np.float32) / sample_rate
    audio = np.sin(2 * np.pi * 440 * time).astype(np.float32)
    config = FeatureConfig(sample_rate=sample_rate, n_fft=2048, hop_length=512)

    first = extract_features(audio, sample_rate, config)
    second = extract_features(audio, sample_rate, config)

    assert first.values.shape[1] == 26
    assert first.names[:3] == ("chroma_0", "chroma_1", "chroma_2")
    assert first.names[-2:] == ("log_rms", "spectral_flux")
    np.testing.assert_array_equal(first.times, second.times)
    np.testing.assert_array_equal(first.values, second.values)


def test_feature_extraction_resamples_through_the_same_entrypoint() -> None:
    source_rate = 44_100
    time = np.arange(source_rate, dtype=np.float32) / source_rate
    audio = np.sin(2 * np.pi * 220 * time).astype(np.float32)
    config = FeatureConfig(sample_rate=22_050, n_fft=2048, hop_length=512)

    features = extract_features(audio, source_rate, config)

    assert 38 <= len(features.times) <= 43
    assert np.isfinite(features.values).all()
