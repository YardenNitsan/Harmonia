import pytest

from experiments.broad_recognition import normalize, selected


def test_importing_research_helpers_does_not_change_checkpoint_policy(monkeypatch):
    import importlib
    import os

    from experiments import broad_recognition, original_btc

    monkeypatch.delenv("TORCH_FORCE_WEIGHTS_ONLY_LOAD", raising=False)
    importlib.reload(broad_recognition)
    importlib.reload(original_btc)
    assert "TORCH_FORCE_WEIGHTS_ONLY_LOAD" not in os.environ


def test_selection_never_selects_locked_test_and_balances_development():
    records = []
    for performer in range(6):
        for style in ("BN", "Funk", "Jazz", "Rock", "SS"):
            for family, split in enumerate(("train", "validation", "test"), 1):
                for mode in ("comp", "solo"):
                    for take in range(2):
                        records.append(
                            {
                                "performer_id": str(performer),
                                "style": style,
                                "split": split,
                                "version": mode,
                                "track_id": f"{performer}_{style}{family}_{mode}_{take}",
                            }
                        )
    rows = selected(records)
    assert len(rows) == 150
    train = [r for r in rows if r["split"] == "train"]
    assert len(train) == 30
    assert sum(r["version"] == "comp" for r in train) == 15
    assert all(r["split"] != "test" for r in rows)


def test_model_coverage_preserves_unknown_and_does_not_hide_gaps():
    result = normalize(
        [{"start": 0, "end": 1, "label": "X"}, {"start": 1, "end": 2.02, "label": "C:maj"}], 2.0
    )
    assert result[0]["label"] == "X"
    assert result[-1]["end"] == 2.0
    with pytest.raises(ValueError, match="Noncontiguous"):
        normalize(
            [{"start": 0, "end": 1, "label": "N"}, {"start": 1.2, "end": 2, "label": "C:maj"}], 2.0
        )
    with pytest.raises(ValueError, match="coverage"):
        normalize([{"start": 0, "end": 1, "label": "N"}], 2.0)
