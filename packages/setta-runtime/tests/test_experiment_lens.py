from __future__ import annotations

import io
import json
import os
import subprocess
import tempfile
import unittest
import urllib.error
import urllib.request
from email.message import Message
from pathlib import Path
from types import SimpleNamespace
from typing import Self, cast
from unittest import mock

from setta.apps.experiment_lens import APP_ID, ExperimentLensAdapter
from setta.errors import InvalidInputError, RuntimeExecutionError
from setta.registry import CommandContext
from setta.runtime import PackagedRuntime, RuntimeApp
from setta.sessions import LiveSession, LiveSessionStore
from setta.supervisor import (
    ExpectedReadiness,
    NativeServerSupervisor,
    ServerReadiness,
)


class _Response:
    def __init__(self, document: object) -> None:
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


class _Opener:
    def __init__(self, document: object, timeout: float) -> None:
        self.response = _Response(document)
        self.timeout = timeout
        self.request: urllib.request.Request | None = None

    def open(self, request: urllib.request.Request, timeout: float) -> _Response:
        self.request = request
        if timeout != self.timeout:
            raise AssertionError("unexpected timeout")
        return self.response


class _Runtime:
    def app(self, app_id: str) -> RuntimeApp:
        if app_id != APP_ID:
            raise AssertionError("unexpected app")
        return RuntimeApp(APP_ID, Path("/native/experiment-lens"), Path("/web"))


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


class ExperimentLensAdapterTests(unittest.TestCase):
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

    def test_open_launches_the_server_with_the_generic_contract(self) -> None:
        project = self.root / "project"
        self.assertEqual(
            ExperimentLensAdapter().dispatch(
                ("open", "--project-root", str(project), "--no-open"),
                self.context,
            ),
            0,
        )
        canonical = str(project.resolve(strict=False))
        expected = self.supervisor.expected
        self.assertIsNotNone(expected)
        self.assertEqual(
            self.supervisor.command,
            [
                Path("/native/experiment-lens"),
                "serve",
                "--project-root",
                canonical,
                "--web-root",
                Path("/web"),
                "--session-nonce",
                expected.instance_nonce if expected else "",
                "--supervised-stdin=true",
                "--port",
                "0",
            ],
        )
        self.assertEqual(
            json.loads(self.stdout.getvalue()),
            {
                "appId": APP_ID,
                "projectPath": canonical,
                "schemaVersion": "setta-open/v1",
                "url": "http://127.0.0.1:43123",
            },
        )

    def test_offline_export_canonicalizes_and_forwards_options(self) -> None:
        project = self.root / "project" / ".." / "project"
        with mock.patch(
            "setta.apps.experiment_lens.subprocess.run",
            return_value=subprocess.CompletedProcess([], 7),
        ) as run:
            result = ExperimentLensAdapter().dispatch(
                (
                    "export",
                    "--project-root",
                    str(project),
                    "--output",
                    "selection.json",
                    "--pretty",
                ),
                self.context,
            )
        self.assertEqual(result, 7)
        self.assertEqual(
            run.call_args.args[0],
            [
                "/native/experiment-lens",
                "export",
                "--project-root",
                str(project.resolve(strict=False)),
                "--output",
                "selection.json",
                "--pretty",
            ],
        )

    def test_live_apply_uses_the_running_session(self) -> None:
        project = self.root / "project"
        mutation = b'{"projectId":"project","expectedRevision":0,"operations":[]}'
        source = self.root / "mutation.json"
        source.write_bytes(mutation)
        session = self.live_session(project)
        opener = _Opener({"version": 1, "snapshot": {"revision": 1}}, 120)
        with (
            mock.patch.object(self.sessions, "resolve", return_value=session),
            mock.patch(
                "setta.apps.experiment_lens.urllib.request.build_opener",
                return_value=opener,
            ),
            mock.patch("setta.apps.experiment_lens.subprocess.run") as run,
        ):
            self.assertEqual(
                ExperimentLensAdapter().dispatch(
                    (
                        "apply",
                        "--project-root",
                        str(project),
                        "--file",
                        str(source),
                    ),
                    self.context,
                ),
                0,
            )
        run.assert_not_called()
        request = opener.request
        self.assertIsNotNone(request)
        self.assertEqual(
            request.full_url if request else None,
            session.url + "/api/v1/experiment-lens/apply",
        )
        self.assertEqual(request.get_method() if request else None, "POST")
        self.assertEqual(request.get_header("Origin") if request else None, session.url)
        self.assertEqual(request.data if request else None, mutation)

    def test_live_snapshot_preserves_the_server_error_message(self) -> None:
        project = self.root / "project"
        session = self.live_session(project)
        response = io.BytesIO(
            b'{"code":"revision_conflict","message":"Reload before retrying."}'
        )
        failure = urllib.error.HTTPError(
            session.url + "/api/v1/experiment-lens",
            409,
            "Conflict",
            Message(),
            response,
        )
        opener = mock.Mock()
        opener.open.side_effect = failure
        with (
            mock.patch.object(self.sessions, "resolve", return_value=session),
            mock.patch(
                "setta.apps.experiment_lens.urllib.request.build_opener",
                return_value=opener,
            ),
            self.assertRaisesRegex(RuntimeExecutionError, "Reload before retrying"),
        ):
            ExperimentLensAdapter().dispatch(
                ("snapshot", "--project-root", str(project)), self.context
            )
        self.assertTrue(response.closed)

    def test_live_snapshot_retains_a_bounded_response_limit(self) -> None:
        project = self.root / "project"
        session = self.live_session(project)
        opener = _Opener({"content": "x" * 64}, 120)
        with (
            mock.patch.object(self.sessions, "resolve", return_value=session),
            mock.patch(
                "setta.apps.experiment_lens.urllib.request.build_opener",
                return_value=opener,
            ),
            mock.patch("setta.apps.experiment_lens._MAXIMUM_RESPONSE_BYTES", 32),
            self.assertRaisesRegex(RuntimeExecutionError, "exceeds the byte limit"),
        ):
            ExperimentLensAdapter().dispatch(
                ("snapshot", "--project-root", str(project)), self.context
            )

    def test_live_snapshot_can_exceed_the_mutation_input_limit(self) -> None:
        project = self.root / "project"
        session = self.live_session(project)
        content = "x" * (4 * 1024 * 1024 + 1)
        opener = _Opener({"content": content}, 120)
        with (
            mock.patch.object(self.sessions, "resolve", return_value=session),
            mock.patch(
                "setta.apps.experiment_lens.urllib.request.build_opener",
                return_value=opener,
            ),
        ):
            self.assertEqual(
                ExperimentLensAdapter().dispatch(
                    ("snapshot", "--project-root", str(project)), self.context
                ),
                0,
            )
        self.assertEqual(json.loads(self.stdout.getvalue()), {"content": content})

    def test_identity_probe_requires_the_exact_document(self) -> None:
        session = LiveSession(
            app_id=APP_ID,
            project_path="/canonical/project",
            url="http://127.0.0.1:43123",
            owner_pid=1,
            instance_nonce="nonce",
        )
        document = {
            "schemaVersion": "experiment-lens-session/v1",
            "appId": APP_ID,
            "projectPath": session.project_path,
            "instanceNonce": session.instance_nonce,
        }
        opener = _Opener(document, 2)
        with mock.patch(
            "setta.apps.experiment_lens.urllib.request.build_opener",
            return_value=opener,
        ):
            self.assertTrue(ExperimentLensAdapter._validate_live_session(session))
        self.assertEqual(
            opener.request.full_url if opener.request else None,
            session.url + "/api/v2/runtime/session",
        )
        document["appId"] = "review"
        with mock.patch(
            "setta.apps.experiment_lens.urllib.request.build_opener",
            return_value=_Opener(document, 2),
        ):
            self.assertFalse(ExperimentLensAdapter._validate_live_session(session))

    def test_live_apply_rejects_a_symlink_input(self) -> None:
        project = self.root / "project"
        target = self.root / "target.json"
        target.write_text("{}", encoding="utf-8")
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
            ExperimentLensAdapter().dispatch(
                (
                    "apply",
                    "--project-root",
                    str(project),
                    "--file",
                    str(source),
                ),
                self.context,
            )

    def test_help_exposes_only_the_experiment_lens_command_surface(self) -> None:
        self.assertEqual(ExperimentLensAdapter().dispatch(("--help",), self.context), 0)
        self.assertEqual(
            self.stdout.getvalue(),
            "Usage: setta experiment-lens {open|schema|snapshot|apply|export} ...\n",
        )


if __name__ == "__main__":
    unittest.main()
