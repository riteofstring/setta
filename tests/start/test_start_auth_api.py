import json
import os
import socket
import tempfile
import unittest
from pathlib import Path

from click.testing import CliRunner

from setta.sessions import SessionRegistry
from setta.start import api, auth
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

        self.registry = SessionRegistry()

    def _restore_sessions_root(self) -> None:
        C.RUN_SESSIONS_FOLDER = self.original_sessions_root

    def test_auth_json_emits_payload(self) -> None:
        session = self.registry.create_session(
            workspace_path=self.workspace,
            host="127.0.0.1",
            port=61234,
            pid=os.getpid(),
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
            handle.stop()
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

    def _project_config_id(self) -> str:
        payload = json.loads((self.setta_root / "project.json").read_text())
        default_id = payload.get("defaultProjectConfigId")
        if default_id:
            return default_id
        configs = payload.get("projectConfigs", {})
        return next(iter(configs.keys()))

    def test_setta_api_route_key_and_raw_path(self) -> None:
        auth_path = self._write_auth_json()
        project_config_id = self._project_config_id()
        payload = json.dumps({"projectConfigId": project_config_id})
        runner = CliRunner()

        result = runner.invoke(
            api,
            [
                "GET_LATEST_PROJECT_STATE",
                "--auth-json",
                str(auth_path),
                "--json",
                payload,
                "--json-output",
            ],
        )

        self.assertEqual(result.exit_code, 0, result.output)
        data = json.loads(result.output)
        self.assertIn("projectState", data)

        result = runner.invoke(
            api,
            [
                "/getLatestProjectState",
                "--auth-json",
                str(auth_path),
                "--json",
                payload,
                "--json-output",
            ],
        )

        self.assertEqual(result.exit_code, 0, result.output)
        data = json.loads(result.output)
        self.assertIn("projectState", data)

    def test_setta_api_error_contract(self) -> None:
        auth_path = self._write_auth_json()
        runner = CliRunner()

        result = runner.invoke(
            api,
            [
                "GET_LATEST_PROJECT_STATE",
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
        self.assertIn("url", payload)


if __name__ == "__main__":
    unittest.main()
