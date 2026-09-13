from __future__ import annotations

import io
import json
import sys
import tempfile
import unittest
import urllib.request
from email.message import Message
from pathlib import Path
from types import SimpleNamespace
from typing import Self, cast
from unittest import mock

from setta.apps.python_canvas import APP_ID, PythonCanvasAdapter
from setta.registry import CommandContext
from setta.runtime import PackagedRuntime, RuntimeApp
from setta.sessions import LiveSession, LiveSessionStore
from setta.supervisor import (
    ExpectedReadiness,
    NativeServerSupervisor,
    ServerReadiness,
)


class _IdentityResponse:
    def __init__(self, document: dict[str, str]) -> None:
        self.status = 200
        self.headers = Message()
        self.headers["Content-Type"] = "application/json; charset=utf-8"
        self._payload = json.dumps(document).encode("utf-8")

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *_arguments: object) -> None:
        return None

    def read(self, _limit: int) -> bytes:
        return self._payload


class _IdentityOpener:
    def __init__(self, response: _IdentityResponse) -> None:
        self.response = response
        self.request: urllib.request.Request | None = None
        self.timeout: float | None = None

    def open(
        self, request: urllib.request.Request, timeout: float
    ) -> _IdentityResponse:
        self.request = request
        self.timeout = timeout
        return self.response


class _Runtime:
    def app(self, app_id: str) -> RuntimeApp:
        assert app_id == APP_ID
        return RuntimeApp(APP_ID, Path("/native/python-canvas"), Path("/web"))


class _Supervisor:
    def __init__(self) -> None:
        self.command: list[str | Path] | None = None

    def start(self, command: list[str | Path], expected: ExpectedReadiness) -> object:
        self.command = command
        readiness = ServerReadiness(
            url="http://127.0.0.1:43123",
            app_id=APP_ID,
            project_path=expected.project_path,
            instance_nonce=expected.instance_nonce,
        )
        return SimpleNamespace(readiness=readiness, process=SimpleNamespace(pid=999))

    def stop(self, _managed: object) -> None:
        return

    def wait_foreground(self, _managed: object) -> int:
        return 0


class PythonCanvasAdapterTests(unittest.TestCase):
    def test_identity_probe_requires_the_exact_app_path_nonce_document(self) -> None:
        session = LiveSession(
            app_id=APP_ID,
            project_path="/canonical/project",
            url="http://127.0.0.1:43123",
            owner_pid=1,
            instance_nonce="nonce",
        )
        document = {
            "schemaVersion": "python-canvas-session/v1",
            "appId": APP_ID,
            "projectPath": session.project_path,
            "instanceNonce": session.instance_nonce,
        }
        opener = _IdentityOpener(_IdentityResponse(document))
        with mock.patch(
            "setta.apps.python_canvas.urllib.request.build_opener", return_value=opener
        ):
            self.assertTrue(PythonCanvasAdapter._validate_live_session(session))
        request = opener.request
        self.assertIsNotNone(request)
        if request is None:
            self.fail("identity probe did not issue a request")
        self.assertEqual(
            request.full_url, "http://127.0.0.1:43123/api/v2/runtime/session"
        )
        self.assertEqual(request.get_header("Accept"), "application/json")
        self.assertEqual(opener.timeout, 2)
        document["instanceNonce"] = "other"
        with mock.patch(
            "setta.apps.python_canvas.urllib.request.build_opener",
            return_value=_IdentityOpener(_IdentityResponse(document)),
        ):
            self.assertFalse(PythonCanvasAdapter._validate_live_session(session))

    def test_open_uses_the_supervised_stdin_server_contract(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary = Path(temporary_directory)
            sessions = LiveSessionStore(
                temporary / "sessions", process_alive=lambda _pid: True
            )
            supervisor = _Supervisor()
            with tempfile.TemporaryFile(mode="w+t") as stdout:
                context = CommandContext(
                    runtime=cast(PackagedRuntime, _Runtime()),
                    sessions=sessions,
                    supervisor=cast(NativeServerSupervisor, supervisor),
                    stdin=sys.stdin,
                    stdout=stdout,
                    stderr=sys.stderr,
                    launcher_python=Path(sys.executable),
                    browser_open=lambda _url: True,
                )
                self.assertEqual(
                    PythonCanvasAdapter(lambda: Path("/basedpyright")).dispatch(
                        ("open", "--project", str(temporary / "project"), "--no-open"),
                        context,
                    ),
                    0,
                )
            self.assertIsNotNone(supervisor.command)
            self.assertIn("--supervised-stdin", supervisor.command or [])

    def test_subcommand_help_returns_without_starting_or_resolving_a_session(
        self,
    ) -> None:
        adapter = PythonCanvasAdapter()
        for arguments in (
            ("schema", "--help"),
            ("open", "--help"),
            ("session", "--help"),
            ("session", "inspect", "--help"),
            ("snapshot", "--help"),
            ("apply", "--help"),
            ("run", "--help"),
        ):
            with self.subTest(arguments=arguments):
                stdout = io.StringIO()
                context = CommandContext(
                    runtime=cast(PackagedRuntime, _Runtime()),
                    sessions=cast(LiveSessionStore, object()),
                    supervisor=cast(NativeServerSupervisor, object()),
                    stdin=io.StringIO(),
                    stdout=stdout,
                    stderr=io.StringIO(),
                    launcher_python=Path(sys.executable),
                    browser_open=lambda _url: True,
                )
                self.assertEqual(adapter.dispatch(arguments, context), 0)
                self.assertTrue(
                    stdout.getvalue().startswith("Usage: setta python-canvas")
                )
