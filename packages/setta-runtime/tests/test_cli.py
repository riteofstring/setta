from __future__ import annotations

import io
import json
import os
import tempfile
import unittest
from collections.abc import Sequence
from pathlib import Path
from typing import cast
from unittest import mock

from setta.cli import installed_apps, run
from setta.registry import AppDescriptor, AppRegistry, CommandContext
from setta.runtime import PackagedRuntime
from setta.sessions import LiveSessionStore
from setta.supervisor import NativeServerSupervisor


class _Runtime:
    def check(self) -> dict[str, object]:
        return {"assetCount": 1, "status": "ok"}


class _FixtureApp:
    def __init__(self) -> None:
        self.arguments: tuple[str, ...] | None = None

    @property
    def descriptor(self) -> AppDescriptor:
        return AppDescriptor("fixture-app", "Fixture App", "A registry fixture.")

    def dispatch(self, arguments: Sequence[str], context: CommandContext) -> int:
        self.arguments = tuple(arguments)
        context.stdout.write("fixture dispatched\n")
        return 7

    def doctor(self, context: CommandContext) -> dict[str, object]:
        del context
        return {"id": "fixture-app", "status": "ok", "checks": []}


class RootCliTests(unittest.TestCase):
    def setUp(self) -> None:
        self.stdout = io.StringIO()
        self.stderr = io.StringIO()
        self.context = CommandContext(
            runtime=cast(PackagedRuntime, _Runtime()),
            sessions=cast(LiveSessionStore, object()),
            supervisor=cast(NativeServerSupervisor, object()),
            stdin=io.StringIO(),
            stdout=self.stdout,
            stderr=self.stderr,
            launcher_python=Path("/launcher-python"),
            browser_open=lambda _url: True,
        )
        self.app = _FixtureApp()
        self.registry = AppRegistry((self.app,))

    def _run(self, *arguments: str) -> int:
        return run(
            arguments, registry=self.registry, context_factory=lambda: self.context
        )

    def test_apps_json_is_generated_from_the_registry(self) -> None:
        self.assertEqual(self._run("apps", "--json"), 0)
        self.assertEqual(
            json.loads(self.stdout.getvalue()),
            {
                "apps": [
                    {
                        "id": "fixture-app",
                        "name": "Fixture App",
                        "summary": "A registry fixture.",
                    }
                ],
                "schemaVersion": "setta-apps/v1",
            },
        )

    def test_installed_registry_exposes_all_independent_apps(self) -> None:
        self.assertEqual(
            tuple(item.app_id for item in installed_apps().descriptors()),
            ("experiment-lens", "python-canvas", "realtime", "review"),
        )

    def test_root_dispatches_a_fixture_app_without_domain_branching(self) -> None:
        self.assertEqual(self._run("fixture-app", "owned-command"), 7)
        self.assertEqual(self.app.arguments, ("owned-command",))
        self.assertEqual(self.stdout.getvalue(), "fixture dispatched\n")

    def test_unknown_root_command_returns_one_typed_json_error(self) -> None:
        self.assertEqual(self._run("unknown-app"), 2)
        self.assertEqual(
            json.loads(self.stderr.getvalue())["error"]["code"], "invalid_command"
        )

    @unittest.skipIf(os.name == "nt", "POSIX venv launchers are symlinks")
    def test_standard_context_preserves_a_virtual_environment_launcher_symlink(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            base_interpreter = root / "base-python"
            base_interpreter.write_text("base interpreter", encoding="utf-8")
            launcher = root / "venv" / "bin" / "python"
            launcher.parent.mkdir(parents=True)
            launcher.symlink_to(base_interpreter)
            with mock.patch("setta.registry.sys.executable", str(launcher)):
                context = CommandContext.standard(
                    runtime=cast(PackagedRuntime, object()),
                    sessions=cast(LiveSessionStore, object()),
                    supervisor=cast(NativeServerSupervisor, object()),
                )
            self.assertEqual(
                context.launcher_python,
                Path(os.path.abspath(launcher)),
            )
            self.assertTrue(context.launcher_python.is_symlink())
            self.assertNotEqual(context.launcher_python, base_interpreter.resolve())
