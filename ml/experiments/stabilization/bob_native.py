"""One exact-PCM listening-case inference; no reference labels or training."""

from __future__ import annotations

import os
import tempfile
import time
from pathlib import Path

import numpy as np
import soundfile as sf

from experiments.stabilization.compare import OUT, REPO, digest, resources, verify, write


def main():
    verify()
    source = REPO / ".superpowers/stabilization/bob-original.f32"
    write(
        OUT / "bob-preflight.json",
        {
            "source_pcm_sha256": digest(source),
            "source_pcm_bytes": source.stat().st_size,
            "script_sha256": digest(__file__),
            "sample_rate": 22050,
            "channels": 1,
            "dtype": "float32 little-endian",
            "original_audio_sha256": (
                "1df50037c17822f83f5162dda09b86663fa030a448bf9f758f837a44827d409b"
            ),
            "created_epoch": time.time(),
            "resources": resources(),
            "protocol": (
                "One native LV1.1.0 submission ensemble run; exact decoded PCM; "
                "no labelled score, tuning or retraining"
            ),
        },
    )
    start = time.perf_counter()
    import torch

    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    from lv_chordia import chord_recognition
    from lv_chordia.extractors.cqt import CQTV2
    from lv_chordia.extractors.xhmm_ismir import XHMMDecoder
    from lv_chordia.mir.nn.train import NetworkInterface

    setup = time.perf_counter() - start
    timings = {}

    def measure(cls, method, label):
        original = getattr(cls, method)

        def wrapped(*args, **kwargs):
            started = time.perf_counter()
            result = original(*args, **kwargs)
            timings[label] = timings.get(label, 0) + time.perf_counter() - started
            return result

        setattr(cls, method, wrapped)

    measure(CQTV2, "extract", "decode_and_cqt_seconds")
    measure(NetworkInterface, "inference", "network_seconds")
    measure(XHMMDecoder, "decode_to_chordlab", "hmm_seconds")
    pcm = np.fromfile(source, dtype="<f4")
    fd, temporary = tempfile.mkstemp(suffix=".wav", prefix="harmonia-bob-lv-")
    os.close(fd)
    try:
        sf.write(temporary, pcm, 22050, subtype="FLOAT")
        decoded, sr = sf.read(temporary, dtype="float32")
        if sr != 22050 or not np.array_equal(decoded, pcm):
            raise ValueError("Float-WAV adapter changed PCM")
        start = time.perf_counter()
        labels = chord_recognition(str(Path(temporary).resolve()), "submission")
        elapsed = time.perf_counter() - start
        durations = [s["end_time"] - s["start_time"] for s in labels]
        write(
            OUT / "bob-lv-native.json",
            {
                "source_pcm_sha256": digest(source),
                "labels": labels,
                "import_seconds": setup,
                "pipeline_seconds": elapsed,
                "timings": timings,
                "segment_count": len(labels),
                "median_segment_seconds": float(np.median(durations)),
                "sub_200ms_fraction": sum(d < 0.2 for d in durations) / len(durations),
                "slash_fraction": sum("/" in s["chord"] for s in labels) / len(labels),
                "resources": resources(),
                "labelled_accuracy": None,
            },
        )
        print(len(labels), elapsed, timings, flush=True)
    finally:
        Path(temporary).unlink()
    verify()


if __name__ == "__main__":
    main()
