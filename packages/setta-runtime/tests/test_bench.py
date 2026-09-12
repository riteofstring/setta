from __future__ import annotations

import io
import json
import os
import tempfile
import unittest
import urllib.request
from email.message import Message
from pathlib import Path
from types import SimpleNamespace
from typing import Self, cast
from unittest import mock

from setta.apps.bench import APP_ID, BenchAdapter
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


class _Runtime:
    def app(self, app_id: str) -> RuntimeApp:
        if app_id != APP_ID:
            raise AssertionError("unexpected app")
        return RuntimeApp(APP_ID, Path("/native/bench"), Path("/web"))


class _Supervisor:
    def __init__(self) -> None:
        self.command: list[str | Path] | None = None
        self.expected: ExpectedReadiness | None = None
        self.stopped: list[object] = []

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

    def stop(self, managed: object) -> None:
        self.stopped.append(managed)

    def wait_foreground(self, _managed: object) -> int:
        return 0


class BenchAdapterTests(unittest.TestCase):
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
        self.browser_urls: list[str] = []
        self.context = CommandContext(
            runtime=cast(PackagedRuntime, _Runtime()),
            sessions=self.sessions,
            supervisor=cast(NativeServerSupervisor, self.supervisor),
            stdin=io.StringIO(),
            stdout=self.stdout,
            stderr=self.stderr,
            launcher_python=Path("/launcher/python"),
            browser_open=lambda url: self.browser_urls.append(url) is None,
        )

    def test_open_launches_the_bench_server_with_exact_generic_contract(self) -> None:
        project = self.root / "project"
        self.assertEqual(
            BenchAdapter().dispatch(
                (
                    "open",
                    "--project-root",
                    str(project),
                    "--create",
                    "--no-open",
                ),
                self.context,
            ),
            0,
        )
        canonical = str(project.resolve(strict=False))
        self.assertEqual(
            self.supervisor.command,
            [
                Path("/native/bench"),
                "serve",
                "--project-root",
                canonical,
                "--create=true",
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
        document = json.loads(self.stdout.getvalue())
        self.assertEqual(document["appId"], APP_ID)
        self.assertEqual(document["projectPath"], canonical)
        self.assertEqual(self.browser_urls, [])

    def test_open_requires_a_project_root_and_rejects_unknown_arguments(self) -> None:
        with self.assertRaisesRegex(InvalidInputError, "requires --project-root"):
            BenchAdapter().dispatch(("open",), self.context)
        with self.assertRaisesRegex(InvalidInputError, "Unexpected Bench"):
            BenchAdapter().dispatch(
                ("open", "--project-root", "project", "--mystery"), self.context
            )

    def test_identity_probe_requires_the_exact_bench_document(self) -> None:
        session = LiveSession(
            app_id=APP_ID,
            project_path="/canonical/project",
            url="http://127.0.0.1:43123",
            owner_pid=1,
            instance_nonce="nonce",
        )
        document = {
            "schemaVersion": "bench-session/v1",
            "appId": APP_ID,
            "projectPath": session.project_path,
            "instanceNonce": session.instance_nonce,
        }
        opener = _IdentityOpener(_IdentityResponse(document))
        with mock.patch(
            "setta.apps.bench.urllib.request.build_opener", return_value=opener
        ):
            self.assertTrue(BenchAdapter._validate_live_session(session))
        self.assertEqual(
            opener.request.full_url if opener.request else None,
            "http://127.0.0.1:43123/api/v1/runtime/session",
        )
        document["instanceNonce"] = "different"
        with mock.patch(
            "setta.apps.bench.urllib.request.build_opener",
            return_value=_IdentityOpener(_IdentityResponse(document)),
        ):
            self.assertFalse(BenchAdapter._validate_live_session(session))

    def test_help_exposes_only_open(self) -> None:
        self.assertEqual(BenchAdapter().dispatch(("--help",), self.context), 0)
        self.assertEqual(self.stdout.getvalue(), "Usage: setta bench open ...\n")


if __name__ == "__main__":
    unittest.main()
