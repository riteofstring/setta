from __future__ import annotations

import io
import json
import os
import subprocess
import tempfile
import unittest
import urllib.request
from email.message import Message
from pathlib import Path
from types import SimpleNamespace
from typing import Self, cast
from unittest import mock

from setta.apps.realtime import APP_ID, RealtimeAdapter
from setta.errors import InvalidInputError
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

    def open(
        self, request: urllib.request.Request, timeout: float
    ) -> _IdentityResponse:
        self.request = request
        if timeout != 2:
            raise AssertionError("unexpected identity timeout")
        return self.response


class _CommandOpener:
    def __init__(self, document: dict[str, object]) -> None:
        self.response = _IdentityResponse(cast(dict[str, str], document))
        self.request: urllib.request.Request | None = None

    def open(
        self, request: urllib.request.Request, timeout: float
    ) -> _IdentityResponse:
        self.request = request
        if timeout != 120:
            raise AssertionError("unexpected command timeout")
        return self.response


class _Runtime:
    def app(self, app_id: str) -> RuntimeApp:
        if app_id != APP_ID:
            raise AssertionError("unexpected app")
        return RuntimeApp(APP_ID, Path("/native/realtime"), Path("/web"))


class _Supervisor:
    def __init__(self) -> None:
        self.command: list[str | Path] | None = None
        self.expected: ExpectedReadiness | None = None

    def start(self, command: list[str | Path], expected: ExpectedReadiness) -> object:
        self.command = command
        self.expected = expected
        return SimpleNamespace(
            readiness=ServerReadiness(
                url="http://127.0.0.1:43123",
                app_id=APP_ID,
                project_path=expected.project_path,
                instance_nonce=expected.instance_nonce,
            ),
            process=SimpleNamespace(pid=os.getpid()),
        )

    def stop(self, _managed: object) -> None:
        return

    def wait_foreground(self, _managed: object) -> int:
        return 0


class RealtimeAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.sessions = LiveSessionStore(
            self.root / "sessions", process_alive=lambda _pid: True
        )
        self.supervisor = _Supervisor()
        self.stdout = io.StringIO()
        self.stderr = io.StringIO()
        self.context = CommandContext(
            runtime=cast(PackagedRuntime, _Runtime()),
            sessions=self.sessions,
            supervisor=cast(NativeServerSupervisor, self.supervisor),
            stdin=io.StringIO(),
            stdout=self.stdout,
            stderr=self.stderr,
            launcher_python=Path("/launcher/python"),
            browser_open=lambda _url: True,
        )

    def live_session(self, project: Path) -> LiveSession:
        return LiveSession(
            app_id=APP_ID,
            project_path=str(project.resolve(strict=False)),
            url="http://127.0.0.1:43123",
            owner_pid=1,
            instance_nonce="nonce",
        )

    def test_open_launches_the_realtime_server_with_exact_generic_contract(
        self,
    ) -> None:
        project = self.root / "project"
        self.assertEqual(
            RealtimeAdapter().dispatch(
                ("open", "--project-root", str(project), "--create", "--no-open"),
                self.context,
            ),
            0,
        )
        canonical = str(project.resolve(strict=False))
        command = self.supervisor.command
        self.assertIsNotNone(command)
        self.assertEqual(
            command,
            [
                Path("/native/realtime"),
                "serve",
                "--project-root",
                canonical,
                "--create=true",
                "--launcher-python",
                Path("/launcher/python"),
                "--web-root",
                Path("/web"),
                "--session-nonce",
                self.supervisor.expected.instance_nonce
                if self.supervisor.expected
                else "",
                "--supervised-stdin=true",
                "--port",
                "0",
            ],
        )
        self.assertEqual(json.loads(self.stdout.getvalue())["appId"], APP_ID)

    def test_project_commands_canonicalize_and_forward_the_project_root(self) -> None:
        project = self.root / "project" / ".." / "project"
        with mock.patch(
            "setta.apps.realtime.subprocess.run",
            return_value=subprocess.CompletedProcess([], 7),
        ) as run:
            result = RealtimeAdapter().dispatch(
                (
                    "invoke",
                    "--project-root",
                    str(project),
                    "--handler",
                    "stream",
                    "--file",
                    "-",
                    "--pretty",
                ),
                self.context,
            )
        self.assertEqual(result, 7)
        self.assertEqual(
            run.call_args.args[0],
            [
                "/native/realtime",
                "invoke",
                "--project-root",
                str(project.resolve(strict=False)),
                "--handler",
                "stream",
                "--file",
                "-",
                "--pretty",
            ],
        )

    def test_identity_probe_requires_the_exact_realtime_document(self) -> None:
        session = LiveSession(
            app_id=APP_ID,
            project_path="/canonical/project",
            url="http://127.0.0.1:43123",
            owner_pid=1,
            instance_nonce="nonce",
        )
        document = {
            "schemaVersion": "realtime-session/v1",
            "appId": APP_ID,
            "projectPath": session.project_path,
            "instanceNonce": session.instance_nonce,
        }
        opener = _IdentityOpener(_IdentityResponse(document))
        with mock.patch(
            "setta.apps.realtime.urllib.request.build_opener", return_value=opener
        ):
            self.assertTrue(RealtimeAdapter._validate_live_session(session))
        self.assertEqual(
            opener.request.full_url if opener.request else None,
            "http://127.0.0.1:43123/api/v2/runtime/session",
        )
        document["appId"] = "python-canvas"
        with mock.patch(
            "setta.apps.realtime.urllib.request.build_opener",
            return_value=_IdentityOpener(_IdentityResponse(document)),
        ):
            self.assertFalse(RealtimeAdapter._validate_live_session(session))

    def test_reload_uses_the_live_coordinator_when_available(self) -> None:
        project = self.root / "project"
        session = self.live_session(project)
        opener = _CommandOpener({"handlers": ["counter"]})
        with (
            mock.patch.object(self.sessions, "resolve", return_value=session),
            mock.patch(
                "setta.apps.realtime.urllib.request.build_opener",
                return_value=opener,
            ),
            mock.patch("setta.apps.realtime.subprocess.run") as run,
        ):
            self.assertEqual(
                RealtimeAdapter().dispatch(
                    ("reload", "--project-root", str(project)), self.context
                ),
                0,
            )
        run.assert_not_called()
        self.assertEqual(
            opener.request.full_url if opener.request else None,
            "http://127.0.0.1:43123/api/v1/runtime/reload",
        )
        self.assertEqual(
            opener.request.get_method() if opener.request else None, "POST"
        )
        self.assertEqual(
            opener.request.get_header("Origin") if opener.request else None,
            session.url,
        )

    def test_live_invoke_reads_a_regular_file_with_a_bounded_acquisition(self) -> None:
        project = self.root / "project"
        source = self.root / "invoke.json"
        body = b'{"arguments":{"value":41},"content":[]}'
        source.write_bytes(body)
        opener = _CommandOpener({"outputs": {"value": 42}, "error": None})
        with (
            mock.patch.object(
                self.sessions, "resolve", return_value=self.live_session(project)
            ),
            mock.patch(
                "setta.apps.realtime.urllib.request.build_opener",
                return_value=opener,
            ),
        ):
            result = RealtimeAdapter().dispatch(
                (
                    "invoke",
                    "--project-root",
                    str(project),
                    "--handler",
                    "increment",
                    "--file",
                    str(source),
                ),
                self.context,
            )
        self.assertEqual(result, 0)
        self.assertEqual(opener.request.data if opener.request else None, body)

    def test_live_apply_rejects_a_symlink_input(self) -> None:
        project = self.root / "project"
        target = self.root / "target.json"
        target.write_bytes(b"{}")
        source = self.root / "input.json"
        try:
            source.symlink_to(target)
        except OSError as error:
            self.skipTest(f"symlinks unavailable: {error}")
        with (
            mock.patch.object(
                self.sessions, "resolve", return_value=self.live_session(project)
            ),
            self.assertRaisesRegex(InvalidInputError, "non-symlink"),
        ):
            RealtimeAdapter().dispatch(
                (
                    "apply",
                    "--project-root",
                    str(project),
                    "--file",
                    str(source),
                ),
                self.context,
            )

    def test_live_invoke_rejects_a_nonregular_or_oversized_input(self) -> None:
        project = self.root / "project"
        with (
            mock.patch.object(
                self.sessions, "resolve", return_value=self.live_session(project)
            ),
            self.assertRaisesRegex(InvalidInputError, "regular non-symlink"),
        ):
            RealtimeAdapter().dispatch(
                (
                    "invoke",
                    "--project-root",
                    str(project),
                    "--handler",
                    "increment",
                    "--file",
                    str(self.root),
                ),
                self.context,
            )
        oversized = self.root / "oversized.json"
        with oversized.open("wb") as destination:
            destination.seek(4 * 1024 * 1024)
            destination.write(b"x")
        with (
            mock.patch.object(
                self.sessions, "resolve", return_value=self.live_session(project)
            ),
            self.assertRaisesRegex(InvalidInputError, "byte limit"),
        ):
            RealtimeAdapter().dispatch(
                (
                    "invoke",
                    "--project-root",
                    str(project),
                    "--handler",
                    "increment",
                    "--file",
                    str(oversized),
                ),
                self.context,
            )

    def test_help_exposes_only_the_realtime_command_surface(self) -> None:
        self.assertEqual(RealtimeAdapter().dispatch(("--help",), self.context), 0)
        self.assertEqual(
            self.stdout.getvalue(),
            "Usage: setta realtime {open|schema|snapshot|apply|reload|invoke} ...\n",
        )


if __name__ == "__main__":
    unittest.main()
