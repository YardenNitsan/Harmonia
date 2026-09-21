"""Startup dependency checks use fake files, never installs or model execution."""

import hashlib
import importlib.metadata
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from check_recognition_environment import check_environment


class RecognitionEnvironmentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        lock = self.root / "ml/requirements-lock-win-py313.txt"
        lock.parent.mkdir()
        lock.write_text("# preserved snapshot\nexample==1.2.3\n")
        self.weight = self.root / "share/lv-chordia/cache_data/test.sdict"
        self.weight.parent.mkdir(parents=True)
        self.weight.write_bytes(b"fixture, not a model")
        manifest = (
            self.root / "ml/experiments/stabilization/results/runtime-manifest.json"
        )
        manifest.parent.mkdir(parents=True)
        manifest.write_text(
            json.dumps(
                {
                    "weights": {
                        "test.sdict": hashlib.sha256(
                            self.weight.read_bytes()
                        ).hexdigest()
                    }
                }
            )
        )

    @patch("importlib.metadata.version", return_value="1.2.3")
    def test_matching_versions_and_weights(self, _version):
        self.assertEqual(check_environment(self.root, self.root), 0)

    @patch("importlib.metadata.version", return_value="2.0.0")
    def test_changed_dependency_is_not_ready(self, _version):
        self.assertEqual(check_environment(self.root, self.root), 1)

    @patch(
        "importlib.metadata.version",
        side_effect=importlib.metadata.PackageNotFoundError,
    )
    def test_missing_dependency_is_not_ready(self, _version):
        self.assertEqual(check_environment(self.root, self.root), 1)

    @patch("importlib.metadata.version", return_value="1.2.3")
    def test_missing_weight_is_not_ready(self, _version):
        self.weight.unlink()
        self.assertEqual(check_environment(self.root, self.root), 1)

    @patch("importlib.metadata.version", return_value="1.2.3")
    def test_corrupt_weight_is_not_ready(self, _version):
        self.weight.write_bytes(b"damaged")
        self.assertEqual(check_environment(self.root, self.root), 1)

    @patch("sys.version_info", (3, 14, 0))
    def test_wrong_python_is_not_ready(self):
        self.assertEqual(check_environment(self.root, self.root), 1)


if __name__ == "__main__":
    unittest.main()
