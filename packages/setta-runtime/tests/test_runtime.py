from __future__ import annotations

import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path

from setta.errors import RuntimeAssetError
from setta.runtime import (
    MANIFEST_FORMAT,
    PackagedRuntime,
    _canonical_json_bytes,
    current_target,
)


class PackagedRuntimeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "_runtime"
        self.root.mkdir()
        native = self.root / "bin" / "server"
        native.parent.mkdir()
        native.write_bytes(b"native server")
        native.chmod(0o755)
        index = self.root / "fixture" / "web" / "index.html"
        index.parent.mkdir(parents=True)
        index.write_text("<!doctype html>", encoding="utf-8")
        self._write_manifest()

    def _write_manifest(self) -> None:
        files = [
            self.root / "bin" / "server",
            self.root / "fixture" / "web" / "index.html",
        ]
        assets = [
            {
                "executable": path.name == "server",
                "path": path.relative_to(self.root).as_posix(),
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            }
            for path in files
        ]
        document = {
            "apps": [
                {
                    "id": "fixture-app",
                    "nativeServer": "bin/server",
                    "webRoot": "fixture/web",
                }
            ],
            "assets": assets,
            "formatVersion": MANIFEST_FORMAT,
            "target": current_target().document(),
        }
        (self.root / "manifest.json").write_bytes(_canonical_json_bytes(document))

    def test_manifest_is_valid_without_hashing_itself(self) -> None:
        manifest = PackagedRuntime(self.root).manifest()
        self.assertNotIn("manifest.json", manifest.assets)
        self.assertEqual(
            PackagedRuntime(self.root).app("fixture-app").web_root.name, "web"
        )

    def test_rejects_regular_file_not_declared_in_manifest(self) -> None:
        (self.root / "fixture" / "web" / "undeclared.js").write_text(
            "x", encoding="utf-8"
        )
        with self.assertRaises(RuntimeAssetError) as raised:
            PackagedRuntime(self.root).manifest()
        self.assertEqual(raised.exception.code, "runtime_invalid")
        self.assertIn("unmanifestedAssets", raised.exception.details or {})

    def test_rejects_file_symlink_anywhere_under_runtime(self) -> None:
        link = self.root / "fixture" / "web" / "link.js"
        try:
            os.symlink(self.root / "fixture" / "web" / "index.html", link)
        except OSError as error:
            self.skipTest(f"symlinks unavailable: {error}")
        with self.assertRaises(RuntimeAssetError):
            PackagedRuntime(self.root).manifest()

    def test_rejects_directory_symlink_anywhere_under_runtime(self) -> None:
        link = self.root / "linked-web"
        try:
            os.symlink(self.root / "fixture" / "web", link, target_is_directory=True)
        except OSError as error:
            self.skipTest(f"symlinks unavailable: {error}")
        with self.assertRaises(RuntimeAssetError):
            PackagedRuntime(self.root).manifest()

    def test_rejects_noncanonical_manifest_bytes(self) -> None:
        manifest_path = self.root / "manifest.json"
        document = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest_path.write_text(json.dumps(document, indent=2), encoding="utf-8")
        with self.assertRaises(RuntimeAssetError):
            PackagedRuntime(self.root).manifest()
