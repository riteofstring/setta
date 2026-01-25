import asyncio
import json
import os
import socket
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import requests
from click.testing import CliRunner
from mcp import ClientSession
from mcp.client.sse import sse_client

from setta.sessions import SessionRegistry
from setta.start import api, auth, tools
from setta.types.routes import Route
from setta.utils.constants import C
from tests.utils.manager_fixture import _seed_minimal_setta_files


class AuthCommandTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)

        self.original_sessions_root = C.RUN_SESSIONS_FOLDER
        self.addCleanup(self._restore_sessions_root)
        self.sessions_root = (
            Path(self.temp_dir.name) / "setta_files" / "run" / "sessions"
        )
        C.RUN_SESSIONS_FOLDER = self.sessions_root

        self.workspace = Path(self.temp_dir.name) / "workspace"
        self.workspace.mkdir()

        self.process = subprocess.Popen(
            [
                sys.executable,
                "-c",
                "import time; time.sleep(300)",
                "setta.server:app",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.addCleanup(self.process.wait)
        self.addCleanup(self._terminate_process)

        self.registry = SessionRegistry()

    def _terminate_process(self) -> None:
        if self.process.poll() is None:
            self.process.terminate()

    def _restore_sessions_root(self) -> None:
        C.RUN_SESSIONS_FOLDER = self.original_sessions_root

    def test_auth_json_emits_payload(self) -> None:
        session = self.registry.create_session(
            workspace_path=self.workspace,
            host="127.0.0.1",
            port=61234,
            pid=self.process.pid,
        )
        runner = CliRunner()

        result = runner.invoke(auth, ["--json", "--session", session.id])

        self.assertEqual(result.exit_code, 0, result.output)
        payload = json.loads(result.output)

        self.assertEqual(payload["baseUrl"], "http://127.0.0.1:61234")
        self.assertEqual(payload["apiBaseUrl"], "http://127.0.0.1:61234/api")
        self.assertEqual(payload["cookieName"], C.AUTH_COOKIE_NAME)
        self.assertTrue(payload["cookie"].startswith(f"{C.AUTH_COOKIE_NAME}="))
        self.assertTrue(payload["cookieHeader"].startswith("Cookie: "))
        self.assertEqual(payload["session"]["id"], session.id)
        self.assertEqual(
            payload["bootstrapUrlPlain"],
            "http://127.0.0.1:61234/__setta__/bootstrap",
        )
        self.assertTrue(
            payload["bootstrapUrlFragment"].startswith(
                "http://127.0.0.1:61234/__setta__/bootstrap#token="
            )
        )
        self.assertEqual(payload["source"], "bootstrap")


class ApiCommandIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.temp_dir = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp_dir.name)
        cls.setta_root = cls.root / "setta_files"
        _seed_minimal_setta_files(cls.setta_root)

        cls.original_constants = {
            "SETTA_FILES_FOLDER": C.SETTA_FILES_FOLDER,
            "CODE_FOLDER": C.CODE_FOLDER,
            "ARTIFACTS_FOLDER": C.ARTIFACTS_FOLDER,
            "DB_BACKUP_FOLDER": C.DB_BACKUP_FOLDER,
            "RUN_FOLDER": C.RUN_FOLDER,
            "RUN_SESSIONS_FOLDER": C.RUN_SESSIONS_FOLDER,
            "RUN_LOGS_FOLDER": C.RUN_LOGS_FOLDER,
            "SHARE_DEPLOYMENTS_FOLDER": C.SHARE_DEPLOYMENTS_FOLDER,
        }
        cls._apply_fixture_constants()

        cls.original_cwd = Path.cwd()
        os.chdir(cls.root)

        try:
            import importlib
            import setta.backend_launcher as backend_launcher
            import setta.server as server
            import setta.utils.constants as constants

            cls.original_is_dev_mode = constants.IS_DEV_MODE
            cls.original_server_is_dev_mode = server.IS_DEV_MODE
            cls.original_backend_launcher_is_dev_mode = backend_launcher.IS_DEV_MODE
            constants.IS_DEV_MODE = "1"
            server.IS_DEV_MODE = "1"
            backend_launcher.IS_DEV_MODE = "1"
            importlib.reload(server)

            port = cls._select_free_port()
            cls.handle = backend_launcher.start_backend(
                host="127.0.0.1",
                port=port,
                wait_for_ready=True,
                open_browser=False,
                ws_protocol="none",
            )
        except Exception as exc:  # pragma: no cover - environment dependent
            cls._cleanup_class_resources()
            raise unittest.SkipTest(f"Setta backend unavailable: {exc}") from exc

    @classmethod
    def tearDownClass(cls) -> None:
        cls._cleanup_class_resources()

    @classmethod
    def _cleanup_class_resources(cls) -> None:
        handle = getattr(cls, "handle", None)
        if handle is not None:
            handle.stop(join_timeout=30.0)
        if hasattr(cls, "original_cwd"):
            os.chdir(cls.original_cwd)
        cls._restore_fixture_constants()
        if hasattr(cls, "original_is_dev_mode"):
            import setta.utils.constants as constants

            constants.IS_DEV_MODE = cls.original_is_dev_mode
        if hasattr(cls, "original_server_is_dev_mode"):
            import setta.server as server

            server.IS_DEV_MODE = cls.original_server_is_dev_mode
        if hasattr(cls, "original_backend_launcher_is_dev_mode"):
            import setta.backend_launcher as backend_launcher

            backend_launcher.IS_DEV_MODE = cls.original_backend_launcher_is_dev_mode
        temp_dir = getattr(cls, "temp_dir", None)
        if temp_dir is not None:
            temp_dir.cleanup()

    @classmethod
    def _apply_fixture_constants(cls) -> None:
        C.SETTA_FILES_FOLDER = cls.setta_root
        C.CODE_FOLDER = cls.setta_root / "code"
        C.ARTIFACTS_FOLDER = cls.setta_root / "artifacts"
        C.DB_BACKUP_FOLDER = cls.setta_root / "backups"
        C.RUN_FOLDER = cls.setta_root / "run"
        C.RUN_SESSIONS_FOLDER = C.RUN_FOLDER / "sessions"
        C.RUN_LOGS_FOLDER = C.RUN_FOLDER / "logs"
        C.SHARE_DEPLOYMENTS_FOLDER = cls.setta_root / "share_deployments"

    @classmethod
    def _restore_fixture_constants(cls) -> None:
        if not hasattr(cls, "original_constants"):
            return
        C.SETTA_FILES_FOLDER = cls.original_constants["SETTA_FILES_FOLDER"]
        C.CODE_FOLDER = cls.original_constants["CODE_FOLDER"]
        C.ARTIFACTS_FOLDER = cls.original_constants["ARTIFACTS_FOLDER"]
        C.DB_BACKUP_FOLDER = cls.original_constants["DB_BACKUP_FOLDER"]
        C.RUN_FOLDER = cls.original_constants["RUN_FOLDER"]
        C.RUN_SESSIONS_FOLDER = cls.original_constants["RUN_SESSIONS_FOLDER"]
        C.RUN_LOGS_FOLDER = cls.original_constants["RUN_LOGS_FOLDER"]
        C.SHARE_DEPLOYMENTS_FOLDER = cls.original_constants[
            "SHARE_DEPLOYMENTS_FOLDER"
        ]

    @staticmethod
    def _select_free_port() -> int:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(("127.0.0.1", 0))
            return sock.getsockname()[1]

    def _write_auth_json(self) -> Path:
        runner = CliRunner()
        result = runner.invoke(auth, ["--json", "--latest"])
        self.assertEqual(result.exit_code, 0, result.output)
        auth_path = self.root / "auth.json"
        auth_path.write_text(result.output, encoding="utf-8")
        return auth_path

    def test_setta_api_tool_call(self) -> None:
        auth_path = self._write_auth_json()
        runner = CliRunner()

        result = runner.invoke(
            api,
            [
                "getProjectConfigNamesAndIds",
                "--auth-json",
                str(auth_path),
                "--json-output",
            ],
        )

        self.assertEqual(result.exit_code, 0, result.output)
        data = json.loads(result.output)
        self.assertFalse(data.get("isError", True))
        content = data.get("content")
        self.assertIsInstance(content, list)
        self.assertTrue(content)

    def test_setta_api_error_contract(self) -> None:
        auth_path = self._write_auth_json()
        runner = CliRunner()

        result = runner.invoke(
            api,
            [
                "unknown_tool_name",
                "--auth-json",
                str(auth_path),
                "--json-output",
            ],
        )

        self.assertNotEqual(result.exit_code, 0)
        payload = json.loads(result.output)
        self.assertEqual(payload["error"], "HTTPError")
        self.assertEqual(payload["status"], 404)
        self.assertEqual(payload["tool"], "unknown_tool_name")

    def test_setta_api_validation_error_contract(self) -> None:
        auth_path = self._write_auth_json()
        runner = CliRunner()

        result = runner.invoke(
            api,
            [
                "get_latest_project_state_summary",
                "--auth-json",
                str(auth_path),
                "--json",
                "{}",
                "--json-output",
            ],
        )

        self.assertNotEqual(result.exit_code, 0)
        payload = json.loads(result.output)
        self.assertEqual(payload["error"], "HTTPError")
        self.assertEqual(payload["status"], 422)
        self.assertEqual(payload["tool"], "get_latest_project_state_summary")

    def test_setta_tools_matches_mcp_list(self) -> None:
        auth_payload = json.loads(self._write_auth_json().read_text())
        cookie = auth_payload["cookie"]
        base_url = auth_payload["baseUrl"]
        mcp_url = f"{base_url}/mcp"

        async def _fetch_mcp_tool_names() -> list[str]:
            async with sse_client(mcp_url, headers={"Cookie": cookie}) as streams:
                read_stream, write_stream = streams
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    response = await session.list_tools()
                await read_stream.aclose()
                await write_stream.aclose()
                return sorted(tool.name for tool in response.tools)

        mcp_names = asyncio.run(_fetch_mcp_tool_names())
        runner = CliRunner()
        result = runner.invoke(tools, [])
        self.assertEqual(result.exit_code, 0, result.output)
        payload = json.loads(result.stdout)
        cli_names = sorted(tool["name"] for tool in payload)
        self.assertEqual(cli_names, mcp_names)

    def test_tools_call_endpoint_contract(self) -> None:
        auth_payload = json.loads(self._write_auth_json().read_text())
        cookie = auth_payload["cookie"]
        base_url = auth_payload["baseUrl"]
        url = f"{base_url}{Route.TOOLS_CALL.value}"
        headers = {"Cookie": cookie}

        response = requests.post(
            url,
            headers=headers,
            json={"tool": "unknown_tool_name", "arguments": {}},
            timeout=5,
        )
        self.assertEqual(response.status_code, 404)
        self.assertIn("Unknown tool", response.json().get("detail", ""))

        response = requests.post(
            url,
            headers=headers,
            json={"tool": "getProjectConfigNamesAndIds", "arguments": "nope"},
            timeout=5,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("arguments", response.json().get("detail", ""))

        response = requests.post(
            url,
            headers=headers,
            json={"tool": "getProjectConfigNamesAndIds", "arguments": []},
            timeout=5,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("arguments", response.json().get("detail", ""))

    def test_tools_call_endpoint_tool_error_contract(self) -> None:
        auth_payload = json.loads(self._write_auth_json().read_text())
        cookie = auth_payload["cookie"]
        base_url = auth_payload["baseUrl"]
        url = f"{base_url}{Route.TOOLS_CALL.value}"
        headers = {"Cookie": cookie}

        response = requests.post(
            url,
            headers=headers,
            json={"tool": "getTerminalOutput", "arguments": {"sectionId": "missing"}},
            timeout=5,
        )
        self.assertEqual(response.status_code, 500)
        detail = response.json().get("detail")
        self.assertIsInstance(detail, dict)
        self.assertEqual(detail.get("error"), "ToolError")

    def test_setta_api_payload_stdin(self) -> None:
        auth_path = self._write_auth_json()
        runner = CliRunner()

        result = runner.invoke(
            api,
            [
                "getProjectConfigNamesAndIds",
                "--auth-json",
                str(auth_path),
                "--stdin",
                "--json-output",
            ],
            input="{}",
        )

        self.assertEqual(result.exit_code, 0, result.output)
        data = json.loads(result.output)
        self.assertFalse(data.get("isError", True))
        self.assertIsInstance(data.get("content"), list)

    def test_setta_api_payload_file(self) -> None:
        auth_path = self._write_auth_json()
        payload_path = self.root / "payload.json"
        payload_path.write_text("{}", encoding="utf-8")
        runner = CliRunner()

        result = runner.invoke(
            api,
            [
                "getProjectConfigNamesAndIds",
                "--auth-json",
                str(auth_path),
                "--file",
                str(payload_path),
                "--json-output",
            ],
        )

        self.assertEqual(result.exit_code, 0, result.output)
        data = json.loads(result.output)
        self.assertFalse(data.get("isError", True))
        self.assertIsInstance(data.get("content"), list)

    def test_setta_api_auth_stdin(self) -> None:
        auth_payload = self._write_auth_json().read_text(encoding="utf-8")
        runner = CliRunner()

        result = runner.invoke(
            api,
            [
                "getProjectConfigNamesAndIds",
                "--auth-stdin",
                "--json",
                "{}",
                "--json-output",
            ],
            input=auth_payload,
        )

        self.assertEqual(result.exit_code, 0, result.output)
        data = json.loads(result.output)
        self.assertFalse(data.get("isError", True))
        self.assertIsInstance(data.get("content"), list)

    def test_setta_api_cookie_header(self) -> None:
        auth_payload = json.loads(self._write_auth_json().read_text())
        cookie_header = auth_payload["cookieHeader"]
        runner = CliRunner()

        result = runner.invoke(
            api,
            [
                "getProjectConfigNamesAndIds",
                "--cookie-header",
                cookie_header,
                "--json-output",
            ],
        )

        self.assertEqual(result.exit_code, 0, result.output)
        data = json.loads(result.output)
        self.assertFalse(data.get("isError", True))
        self.assertIsInstance(data.get("content"), list)

    def test_setta_api_cookie_value(self) -> None:
        auth_payload = json.loads(self._write_auth_json().read_text())
        cookie = auth_payload["cookie"]
        runner = CliRunner()

        result = runner.invoke(
            api,
            [
                "getProjectConfigNamesAndIds",
                "--cookie",
                cookie,
                "--json-output",
            ],
        )

        self.assertEqual(result.exit_code, 0, result.output)
        data = json.loads(result.output)
        self.assertFalse(data.get("isError", True))
        self.assertIsInstance(data.get("content"), list)


class ApiCommandInputTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)

        self.original_sessions_root = C.RUN_SESSIONS_FOLDER
        self.addCleanup(self._restore_sessions_root)
        self.sessions_root = (
            Path(self.temp_dir.name) / "setta_files" / "run" / "sessions"
        )
        C.RUN_SESSIONS_FOLDER = self.sessions_root

        self.original_cwd = Path.cwd()
        self.addCleanup(self._restore_cwd)
        self.workspace = Path(self.temp_dir.name) / "workspace"
        self.workspace.mkdir()
        os.chdir(self.workspace)

    def _restore_sessions_root(self) -> None:
        C.RUN_SESSIONS_FOLDER = self.original_sessions_root

    def _restore_cwd(self) -> None:
        os.chdir(self.original_cwd)

    def test_api_rejects_namespaced_tool(self) -> None:
        runner = CliRunner()
        result = runner.invoke(api, ["setta__foo", "--json-output"])
        self.assertNotEqual(result.exit_code, 0)
        payload = json.loads(result.output)
        self.assertEqual(payload["error"], "InputError")
        self.assertIn("bare MCP tool name", payload["message"])

    def test_api_rejects_path_tool(self) -> None:
        runner = CliRunner()
        result = runner.invoke(api, ["/getLatestProjectState", "--json-output"])
        self.assertNotEqual(result.exit_code, 0)
        payload = json.loads(result.output)
        self.assertEqual(payload["error"], "InputError")
        self.assertIn("bare MCP tool name", payload["message"])

    def test_api_rejects_non_object_arguments(self) -> None:
        runner = CliRunner()
        result = runner.invoke(
            api,
            ["getProjectConfigNamesAndIds", "--json", "[]", "--json-output"],
        )
        self.assertNotEqual(result.exit_code, 0)
        payload = json.loads(result.output)
        self.assertEqual(payload["error"], "InputError")
        self.assertEqual(payload["tool"], "getProjectConfigNamesAndIds")
        self.assertIn("JSON object", payload["message"])

    def test_api_auto_auth_missing_sessions(self) -> None:
        runner = CliRunner()
        result = runner.invoke(
            api,
            ["getProjectConfigNamesAndIds", "--json-output"],
        )
        self.assertNotEqual(result.exit_code, 0)
        payload = json.loads(result.output)
        self.assertEqual(payload["error"], "InputError")
        self.assertIn("No matching Setta sessions found", payload["message"])


if __name__ == "__main__":
    unittest.main()
