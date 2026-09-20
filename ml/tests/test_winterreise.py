import importlib
import io
import json
import zipfile
from urllib.error import URLError

import numpy as np
import pytest
import soundfile as sf


def adapter():
    try:
        return importlib.import_module("harmonia_ml.data.winterreise")
    except ModuleNotFoundError:
        pytest.fail("Winterreise adapter is not implemented")


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("A:7/C#", "A:7/3"),
        ("D:7/C", "D:7/b7"),
        ("G:min/A#", "G:min/#2"),
        ("G#:(b3,b5,bb7)/B", "G#:(b3,b5,bb7)/b3"),
        ("C:dim7/Bbb", "C:dim7/bb7"),
        ("Bb:maj/D", "Bb:maj/3"),
        ("C:maj", "C:maj"),
        ("N", "N"),
    ],
)
def test_absolute_bass_preserves_spelled_relative_degree(source, expected):
    # Catches treating pitch letters as degrees or collapsing enharmonic spelling.
    assert adapter().normalize_label(source) == expected


def test_conflict_is_semantic_and_source_columns_are_preserved():
    csv = (
        "start;end;shorthand;extended;majmin;majmin_inv\n"
        "0;1;A:7/C#;A:(3,5,b7)/C#;A:maj;A:maj/C#\n"
        "1;2;A:(3,5,b7,b9);A:(3,5,b9);A:maj;A:maj\n"
    )
    rows = adapter().parse_annotations(csv, duration=2.1)
    assert rows[0]["conflict"] is False
    assert rows[0]["normalized"]["shorthand"] == "A:7/3"
    assert rows[1]["conflict"] is True
    assert rows[1]["source"]["extended"] == "A:(3,5,b9)"
    assert rows[0]["source"]["start"] == "0"


@pytest.mark.parametrize("intervals", ["1;0", "-1;1", "nan;1", "0;3", "0;1\n0.5;1.5"])
def test_bad_annotation_timing_fails_closed(intervals):
    csv = "start;end;shorthand;extended;majmin;majmin_inv\n" + "\n".join(
        line + ";C:maj;C:(3,5);C:maj;C:maj" for line in intervals.splitlines()
    )
    with pytest.raises(ValueError):
        adapter().parse_annotations(csv, duration=2)


def test_split_excludes_repeat_and_keeps_inspected_pilot_out_of_test():
    split = adapter().composition_split()
    assert split["train"] == list(range(2, 14))
    assert split["validation"] == list(range(14, 19))
    assert split["test"] == list(range(19, 25))
    assert not (set(split["train"]) & set(split["test"]))


class Response(io.BytesIO):
    def __init__(self, data, status, headers):
        super().__init__(data)
        self.status = status
        self.headers = headers


def archive_opener(payload, *, status=206, wrong_range=False):
    def open_range(request, timeout):
        start, end = map(int, request.get_header("Range")[6:].split("-"))
        return Response(
            payload[start : end + 1],
            status,
            {
                "Content-Range": "bad" if wrong_range else f"bytes {start}-{end}/{len(payload)}",
                "ETag": '"fixture-v1"',
            },
        )

    return open_range


def test_range_reader_extracts_real_zip_and_rejects_unapproved_members():
    module = adapter()
    buffer = io.BytesIO()
    allowed = "03_ExtraMaterial/license_HU33.txt"
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(allowed, b"rights")
        archive.writestr("01_RawData/audio_wav/Schubert_D911-02_SC06.wav", b"forbidden")
    payload = buffer.getvalue()
    reader = module.RangeReader("https://example.invalid/a", len(payload), archive_opener(payload))
    with zipfile.ZipFile(reader) as archive:
        assert module.read_member(archive, allowed) == b"rights"
        with pytest.raises(ValueError, match="allowlist"):
            module.read_member(archive, "01_RawData/audio_wav/Schubert_D911-02_SC06.wav")


@pytest.mark.parametrize("options", [{"status": 200}, {"wrong_range": True}])
def test_range_reader_rejects_full_response_or_wrong_bounds(options):
    module = adapter()
    reader = module.RangeReader(
        "https://example.invalid/a", 6, archive_opener(b"abcdef", **options)
    )
    with pytest.raises(ValueError):
        reader.read(3)


def test_network_error_is_not_silently_replaced_with_empty_data():
    module = adapter()

    def unavailable(*args, **kwargs):
        raise URLError("offline")

    reader = module.RangeReader("https://example.invalid/a", 6, unavailable)
    with pytest.raises(URLError):
        reader.read(3)


def test_full_hu33_allowlist_excludes_repeat_and_all_other_performances():
    module = adapter()
    names = module.allowed_members(tuple(range(2, 25)))
    assert "01_RawData/audio_wav/Schubert_D911-24_HU33.wav" in names
    assert not any("SC06" in name or "D911-01_" in name for name in names)
    with pytest.raises(ValueError):
        module.allowed_members((1, 2))


def test_corrupted_member_fails_crc_validation():
    module = adapter()
    buffer = io.BytesIO()
    name = "03_ExtraMaterial/license_HU33.txt"
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_STORED) as archive:
        archive.writestr(name, b"rights")
    payload = buffer.getvalue().replace(b"rights", b"wrong!")
    reader = module.RangeReader("https://example.invalid/a", len(payload), archive_opener(payload))
    with zipfile.ZipFile(reader) as archive, pytest.raises(zipfile.BadZipFile, match="CRC"):
        module.read_member(archive, name)


def test_audio_inspection_requires_finite_mono_22050_and_reports_samples():
    module = adapter()
    wav = io.BytesIO()
    sf.write(wav, np.zeros(22050), 22050, format="WAV")
    info = module.inspect_audio(wav.getvalue())
    assert info["frames"] == 22050
    assert info["duration_seconds"] == 1
    assert info["sample_rate"] == 22050
    assert info["channels"] == 1
    for samples, rate in [(np.zeros((100, 2)), 22050), (np.zeros(100), 44100)]:
        wav = io.BytesIO()
        sf.write(wav, samples, rate, format="WAV")
        with pytest.raises(ValueError):
            module.inspect_audio(wav.getvalue())


def test_pilot_writes_provenance_split_hashes_and_preserved_annotations(tmp_path):
    module = adapter()
    buffer, wav = io.BytesIO(), io.BytesIO()
    sf.write(wav, np.zeros(22050), 22050, format="WAV")
    csv = "start;end;shorthand;extended;majmin;majmin_inv\n0;1;C:maj;C:(3,5);C:maj;C:maj\n"
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in module.ALLOWLIST:
            content = (
                wav.getvalue()
                if name.endswith(".wav")
                else csv.encode()
                if name.endswith(".csv")
                else b"https://creativecommons.org/publicdomain/mark/1.0/"
                if name == module.LICENSE_MEMBER
                else b"SWD fixture attribution"
            )
            archive.writestr(name, content)
    payload = buffer.getvalue()
    reader = module.RangeReader("https://example.invalid/a", len(payload), archive_opener(payload))
    result = module.acquire_pilot(tmp_path / "pilot", reader=reader)
    manifest = json.loads((tmp_path / "pilot" / "manifest.json").read_text())
    assert len(manifest["tracks"]) == 2
    assert manifest["tracks"][1]["split"] == "validation"
    assert manifest["split"]["test"] == [19, 20, 21, 22, 23, 24]
    assert manifest["whole_archive_md5_verified"] is False
    assert result["tracks"][0]["annotation_coverage_seconds"] == 1
    for file in manifest["files"]:
        assert len(file["sha256"]) == 64
        assert (tmp_path / "pilot" / file["path"]).is_file()
    with pytest.raises(FileExistsError):
        module.acquire_pilot(tmp_path / "pilot", reader=reader)
