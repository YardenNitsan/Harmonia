import hashlib
import json
import sys
import time
from importlib.metadata import distribution
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from lv_chordia.chordnet_ismir_naive import ChordNet
from lv_chordia.extractors.cqt import CQTV2
from lv_chordia.mir import DataEntry, io

from harmonia_ml.export.lv_chordia import (
    HEADS,
    RawCQTModel,
    compare_ensemble,
    compare_network,
    require_headroom,
)

torch.set_num_threads(2)
pkg = distribution("lv-chordia")
selection = json.loads(Path("experiments/results/E006-lv-chordia/selection.json").read_text())
manifest = json.loads(Path("data/prepared/guitarset-v1/manifest.json").read_text())
records = {r["track_id"]: r for r in manifest["records"]}
assert all(records[i]["split"] == "validation" for i in selection["track_ids"])
report = {
    "purpose": (
        "Real GuitarSet validation recording export parity only; "
        "no quality selection or locked test"
    ),
    "selection": "Existing E006 fixed12 validation recordings",
    "tracks": [],
    "passed": False,
}
try:
    for track_id in selection["track_ids"]:
        require_headroom()
        path = Path("data/downloads/extracted/audio") / (track_id + "_mic.wav")
        entry = DataEntry()
        entry.prop.set("sr", 22050)
        entry.prop.set("hop_length", 512)
        entry.append_file(str(path.resolve()), io.MusicIO, "music")
        entry.append_extractor(CQTV2, "cqt")
        started = time.perf_counter()
        values = entry.cqt[None].astype(np.float32)
        feature_time = time.perf_counter() - started
        row = {
            "track_id": track_id,
            "audio_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "frames": values.shape[1],
            "feature_seconds": feature_time,
            "networks": [],
        }
        report["tracks"].append(row)
        expected, actual = [], []
        for index in range(5):
            require_headroom()
            artifact = Path("artifacts/lv-chordia-cpu-ensemble-4096") / f"s{index}.onnx"
            weight = next(x for x in pkg.files if x.name.endswith(f"_s{index}.best.sdict"))
            network = ChordNet(None)
            network.use_gpu = False
            payload = Path(pkg.locate_file(weight)).read_bytes()
            assert hashlib.sha256(payload).hexdigest() == selection["weights_sha256"][weight.name]
            network.load_state_dict(
                torch.load(pkg.locate_file(weight), map_location="cpu", weights_only=True)["net"]
            )
            reference = RawCQTModel(network).cpu().eval()
            options = ort.SessionOptions()
            options.intra_op_num_threads = 2
            options.inter_op_num_threads = 1
            session = ort.InferenceSession(
                str(artifact), options, providers=["CPUExecutionProvider"]
            )
            checked = {"index": index, "sha256": hashlib.sha256(artifact.read_bytes()).hexdigest()}
            row["networks"].append(checked)
            checked["parity"] = compare_network(reference, session, values, repeats=1)
            with torch.inference_mode():
                expected.append(list(network.inference(torch.from_numpy(values[0]))))
            actual.append(
                [
                    torch.softmax(torch.from_numpy(v), -1).numpy()
                    for v in session.run(list(HEADS), {"cqt": values})
                ]
            )
            del reference, network, session
        row["ensemble"] = compare_ensemble(expected, actual, values.shape[1])
        print(track_id, "passed", len(row["ensemble"]["hmm_segments"]), "segments", flush=True)
    report["passed"] = True
except Exception as exc:
    report["error"] = str(exc)
    print(type(exc).__name__, str(exc), flush=True)
finally:
    report["script_sha256"] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    Path("experiments/results/LV-Chordia-real-audio-parity.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
if not report["passed"]:
    sys.exit(1)
