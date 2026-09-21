from types import SimpleNamespace

import numpy as np
import pytest

from experiments import semitone_tuning


def test_tuning_units_and_extractor_restoration(monkeypatch):
    from lv_chordia.extractors.cqt import CQTV2

    original = CQTV2.extract
    pcm = np.ones(2048, dtype=np.float32)
    calls = []

    def cqt(audio, **kwargs):
        assert audio is pcm
        calls.append(kwargs)
        return np.ones((288, 5), dtype=np.complex64)

    def infer(audio):
        entry = SimpleNamespace(music=audio, prop=SimpleNamespace(hop_length=512))
        result = CQTV2.extract(None, entry)
        assert result.shape == (5, 288)
        assert result.dtype == np.float32
        raise RuntimeError("simulated inference failure")

    monkeypatch.setattr(semitone_tuning.librosa, "hybrid_cqt", cqt)
    monkeypatch.setattr(semitone_tuning, "infer", infer)
    with pytest.raises(RuntimeError, match="simulated"):
        semitone_tuning.tuned_infer(pcm, -0.33)
    assert calls[0]["tuning"] == pytest.approx(-0.99)
    assert calls[0]["bins_per_octave"] == 36
    assert calls[0]["sr"] == 22050
    assert CQTV2.extract is original
