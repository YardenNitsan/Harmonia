"""Read-only startup check: installed versions and pinned weights, no inference."""

import hashlib
import importlib.metadata
import json
import sys
from pathlib import Path


def check_environment(root: Path, prefix: Path):
    if sys.version_info[:2] != (3, 13) or sys.maxsize <= 2**32:
        return 1
    for line in (root / "ml/requirements-lock-win-py313.txt").read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        package, expected = line.split("==", 1)
        try:
            if importlib.metadata.version(package) != expected:
                return 1
        except importlib.metadata.PackageNotFoundError:
            return 1
    manifest = json.loads(
        (
            root / "ml/experiments/stabilization/results/runtime-manifest.json"
        ).read_text()
    )
    for name, expected in manifest["weights"].items():
        path = prefix / "share/lv-chordia/cache_data" / name
        if (
            not path.is_file()
            or hashlib.sha256(path.read_bytes()).hexdigest() != expected
        ):
            return 1
    return 0


if __name__ == "__main__":
    result = check_environment(Path(__file__).resolve().parents[1], Path(sys.prefix))
    if result == 0:
        print("Recognition dependencies and five model hashes verified.")
    raise SystemExit(result)
