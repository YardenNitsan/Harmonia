"""Stdlib-only external supervisor for the single bounded D003 study."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path


def supervise(config_path: Path) -> int:
    config = json.loads(config_path.read_text())
    output = Path(config["output"])
    if output.exists() or Path(config["checkpoint_dir"]).exists():
        raise ValueError("Refusing to repeat or overwrite an existing D003 run")
    environment = os.environ.copy()
    environment.update(
        {k: "2" for k in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS")}
    )
    environment["PYTHONPATH"] = "."
    started = time.perf_counter()
    child = subprocess.Popen(
        [
            sys.executable,
            str(Path(__file__).with_name("residual_quality_probe.py")),
            str(config_path),
        ],
        env=environment,
        stdin=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )
    timed_out = False
    try:
        code = child.wait(timeout=config["watchdog_seconds"])
    except subprocess.TimeoutExpired:
        timed_out = True
        child.kill()
        child.wait()
        code = 124
    except BaseException:
        child.kill()
        child.wait()
        raise
    output.mkdir(parents=True, exist_ok=True)
    with (output / "watchdog.json").open("x", encoding="utf-8") as stream:
        json.dump(
            {
                "limit_seconds": config["watchdog_seconds"],
                "elapsed_seconds": time.perf_counter() - started,
                "timed_out": timed_out,
                "child_exit_code": code,
            },
            stream,
            indent=2,
        )
        stream.write("\n")
    return code


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", type=Path)
    raise SystemExit(supervise(parser.parse_args().config))
