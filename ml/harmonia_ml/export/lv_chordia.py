"""Full-sequence CPU export study of the audited installed LV-Chordia distribution.

No audio/dataset access, training, HMM replacement, or production integration.
The procedural CQT-shaped inputs establish numerical parity, not chord accuracy.
"""

from __future__ import annotations

import argparse
import base64
import gc
import hashlib
import json
import time
from collections import Counter
from importlib.metadata import distribution, version
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import psutil
import torch
from torch import nn

HEADS = ("triad", "bass", "seventh", "ninth", "eleventh", "thirteenth")
HEAD_SIZES = (73, 13, 4, 4, 3, 3)
MAX_RESEARCH_FRAMES = 8192
LOGIT_ATOL = 5e-5
LOGIT_RTOL = 5e-4
PROBABILITY_ATOL = 1e-5


def validate_cqt(values: np.ndarray) -> np.ndarray:
    if (
        not isinstance(values, np.ndarray)
        or values.dtype != np.float32
        or values.ndim != 3
        or values.shape[0] != 1
        or not 1 <= values.shape[1] <= MAX_RESEARCH_FRAMES
        or values.shape[2] != 288
        or not np.isfinite(values).all()
        or (values < 0).any()
    ):
        raise ValueError("Expected finite nonnegative float32 CQT [1, 1..8192 frames, 288]")
    return np.ascontiguousarray(values)


def cqt_fixture(frames: int) -> np.ndarray:
    if not isinstance(frames, int) or not 1 <= frames <= MAX_RESEARCH_FRAMES:
        raise ValueError("Research fixtures require 1..8192 frames")
    values = np.random.default_rng(7319 + frames).lognormal(-2, 0.8, (1, frames, 288))
    envelope = 0.2 + np.linspace(0, 1, frames)[None, :, None]
    return (values * envelope).astype(np.float32)


def require_headroom() -> None:
    if psutil.virtual_memory().available < 8 * 1024**3:
        raise MemoryError("Export study requires at least 8 GiB available RAM; no OOM retry")


class RawCQTModel(nn.Module):
    def __init__(self, network: nn.Module) -> None:
        super().__init__()
        self.network = network

    def forward(self, cqt: torch.Tensor) -> tuple[torch.Tensor, ...]:
        # Match ChordNet.inference's crop, without its per-head softmax.
        return self.network(cqt[:, :, 18:270].contiguous())


def export_network(index: int, path: Path) -> tuple[RawCQTModel, ort.InferenceSession, dict]:
    if index not in range(5):
        raise ValueError("LV-Chordia has network indices 0..4")
    require_headroom()
    torch.set_num_threads(2)
    package = distribution("lv-chordia")
    if package.version != "1.1.0":
        raise ValueError("This audited exporter requires LV-Chordia 1.1.0")
    name = f"joint_chord_net_ismir_naive_v1.0_reweight(0.0,10.0)_s{index}.best.sdict"
    entry = next(item for item in package.files or [] if item.name == name)
    checkpoint = Path(package.locate_file(entry))
    payload = checkpoint.read_bytes()
    digest = hashlib.sha256(payload).digest()
    if (
        entry.hash is None
        or entry.hash.mode != "sha256"
        or base64.urlsafe_b64encode(digest).decode().rstrip("=") != entry.hash.value
    ):
        raise ValueError("Installed checkpoint differs from the audited distribution RECORD")

    from lv_chordia.chordnet_ismir_naive import ChordNet

    network = ChordNet(None)
    network.use_gpu = False
    network.load_state_dict(torch.load(checkpoint, map_location="cpu", weights_only=True)["net"])
    model = RawCQTModel(network).cpu().eval()
    path.parent.mkdir(parents=True, exist_ok=True)
    license_entry = next(item for item in package.files or [] if str(item).endswith("/LICENSE"))
    (path.parent / "LV-Chordia-LICENSE.txt").write_bytes(
        Path(package.locate_file(license_entry)).read_bytes()
    )
    started = time.perf_counter()
    with torch.inference_mode():
        torch.onnx.export(
            model,
            torch.from_numpy(cqt_fixture(17)),
            str(path),
            input_names=["cqt"],
            output_names=list(HEADS),
            opset_version=17,
            dynamo=False,
            dynamic_axes={"cqt": {1: "frames"}, **{head: {0: "frames"} for head in HEADS}},
        )
    graph = onnx.load(path)
    onnx.checker.check_model(graph)
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    session = ort.InferenceSession(str(path), options, providers=["CPUExecutionProvider"])
    metadata = {
        "index": index,
        "checkpoint_name": name,
        "checkpoint_sha256": digest.hex(),
        "checkpoint_bytes": len(payload),
        "onnx_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "onnx_bytes": path.stat().st_size,
        "operators": dict(sorted(Counter(node.op_type for node in graph.graph.node).items())),
        "export_check_and_session_creation_seconds": time.perf_counter() - started,
        "providers": session.get_providers(),
    }
    return model, session, metadata


def compare_network(
    model: RawCQTModel, session: ort.InferenceSession, values: np.ndarray, repeats: int = 3
) -> dict:
    require_headroom()
    values = validate_cqt(values)
    if not 1 <= repeats <= 10:
        raise ValueError("Use 1..10 bounded timing repetitions")
    tensor = torch.from_numpy(values)
    with torch.inference_mode():
        expected = model(tensor)
        # Also check our raw-head boundary against the actual installed inference method.
        installed = model.network.inference(tensor[0])
    actual = session.run(list(HEADS), {"cqt": values})
    errors, probability_errors, disagreements = {}, {}, {}
    for head, size, reference, result, original in zip(
        HEADS, HEAD_SIZES, expected, actual, installed, strict=True
    ):
        if result.shape != (values.shape[1], size) or not np.isfinite(result).all():
            raise ValueError(f"Invalid exported {head} shape/values: {result.shape}")
        errors[head] = float(np.max(np.abs(result - reference.numpy())))
        np.testing.assert_allclose(result, reference.numpy(), atol=LOGIT_ATOL, rtol=LOGIT_RTOL)
        probabilities = torch.softmax(torch.from_numpy(result), dim=-1).numpy()
        probability_errors[head] = float(np.max(np.abs(probabilities - original)))
        np.testing.assert_allclose(probabilities, original, atol=PROBABILITY_ATOL, rtol=LOGIT_RTOL)
        disagreements[head] = int((probabilities.argmax(-1) != original.argmax(-1)).sum())
    timings: dict[str, list[float]] = {"pytorch_cpu": [], "onnx_cpu": []}
    with torch.inference_mode():
        for _ in range(repeats):
            started = time.perf_counter()
            model(tensor)
            timings["pytorch_cpu"].append(time.perf_counter() - started)
            started = time.perf_counter()
            session.run(list(HEADS), {"cqt": values})
            timings["onnx_cpu"].append(time.perf_counter() - started)
    memory = psutil.Process().memory_info()
    seconds = values.shape[1] * 512 / 22050
    return {
        "frames": values.shape[1],
        "hop_span_seconds": seconds,
        "fixture_sha256": hashlib.sha256(values.tobytes()).hexdigest(),
        "allclose": True,
        "max_absolute_logit_error": errors,
        "max_absolute_probability_error": probability_errors,
        "argmax_disagreements": disagreements,
        "median_inference_seconds": {key: float(np.median(v)) for key, v in timings.items()},
        "inference_real_time_factor": {
            key: float(np.median(v) / seconds) for key, v in timings.items()
        },
        "process_rss_bytes": memory.rss,
        "process_lifetime_peak_rss_bytes": getattr(memory, "peak_wset", None),
        "available_ram_bytes_after": psutil.virtual_memory().available,
    }


def export_study(output: Path, all_networks: bool, lengths: list[int]) -> dict:
    for frames in lengths:
        if not 1 <= frames <= MAX_RESEARCH_FRAMES:
            raise ValueError("Study lengths must remain within 1..8192 frames")
    if not lengths:
        raise ValueError("At least one full-sequence fixture is required")
    report = {
        "status": "numerical_export_research_only",
        "purpose": "Procedural CQT-shaped parity, not accuracy or an end-to-end benchmark",
        "versions": {name: version(name) for name in ("lv-chordia", "torch", "onnx", "onnxruntime", "numpy", "librosa")},
        "device": "CPU only",
        "threads": {"pytorch": 2, "onnx_intra_op": 2, "onnx_inter_op": 1},
        "input": {"name": "cqt", "shape": [1, "frames", 288], "dtype": "float32", "embedded_crop": "18:270"},
        "outputs": dict(zip(HEADS, HEAD_SIZES, strict=True)),
        "tolerances": {"logit_atol": LOGIT_ATOL, "rtol": LOGIT_RTOL, "probability_atol": PROBABILITY_ATOL},
        "fixture": "numpy default_rng(7319+frames), lognormal(-2,0.8), linear envelope 0.2..1.2",
        "sequence_policy": "Entire supplied sequence; instance normalization and bidirectional LSTM prohibit arbitrary chunks",
        "networks": [],
    }
    for index in range(5 if all_networks else 1):
        # Network 0 must pass every requested length before any later export begins.
        model, session, metadata = export_network(index, output / f"s{index}.onnx")
        metadata["parity"] = []
        for frames in lengths:
            metadata["parity"].append(compare_network(model, session, cqt_fixture(frames)))
            print(f"network {index}, {frames} full-sequence frames: parity passed", flush=True)
        report["networks"].append(metadata)
        (output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        del model, session
        gc.collect()
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("artifacts/lv-chordia"))
    parser.add_argument("--all-networks", action="store_true")
    parser.add_argument("--lengths", type=int, nargs="+", default=[1, 17, 128, 1024, 2048, 4096])
    args = parser.parse_args()
    export_study(args.output, args.all_networks, args.lengths)


if __name__ == "__main__":
    main()
