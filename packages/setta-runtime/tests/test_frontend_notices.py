from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts import frontend_notices


class FrontendNoticeTests(unittest.TestCase):
    def test_browser_inventory_excludes_separately_distributed_host_tools(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            browser = root / "browser"
            language_server = root / "language-server"
            browser.mkdir()
            language_server.mkdir()
            (browser / "package.json").write_text(
                json.dumps({"name": "browser-ui", "version": "1.0.0"}),
                encoding="utf-8",
            )
            (language_server / "package.json").write_text(
                json.dumps({"name": "basedpyright", "version": "1.39.9"}),
                encoding="utf-8",
            )
            for optional_dependencies in (
                {},
                {"fsevents": {"path": str(root / "uninstalled-native-watcher")}},
            ):
                with self.subTest(optional_dependencies=optional_dependencies):
                    dependencies = {
                        "browser-ui": {"path": str(browser)},
                        "basedpyright": {
                            "path": str(language_server),
                            "optionalDependencies": optional_dependencies,
                        },
                    }
                    completed = subprocess.CompletedProcess(
                        [], 0, json.dumps([{"dependencies": dependencies}])
                    )
                    with (
                        mock.patch.object(
                            frontend_notices.shutil, "which", return_value="pnpm"
                        ),
                        mock.patch.object(
                            frontend_notices.subprocess, "run", return_value=completed
                        ),
                    ):
                        packages = frontend_notices.production_packages()
                    self.assertEqual(packages, {"browser-ui@1.0.0": browser})
