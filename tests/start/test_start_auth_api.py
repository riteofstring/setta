import asyncio
import json
import socket
import subprocess
import sys
import tempfile
from contextlib import ExitStack
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
import requests
from click.testing import CliRunner
from mcp import ClientSession
from mcp.client.sse import sse_client

from setta.auth.cookies import auth_cookie_name
from setta.sessions import SessionRegistry
from setta.start import api, auth, tools
from setta.types.routes import Route
from setta.utils.constants import C
from setta.mcp.agentic_context_headers import (
    AGENTIC_CONTEXT_ALLOW_UNSCOPED_HEADER,
    AGENTIC_CONTEXT_PROJECT_CONFIG_ID_HEADER,
)
from tests.utils.manager_fixture import (
    DEFAULT_SAMPLE_PROJECT_CONFIG_ID,
    DEFAULT_SAMPLE_PROJECT_NAME,
    _seed_minimal_setta_files,
)
from tests.utils.setta_paths import temporary_setta_paths


TOOLS_CALL_TIMEOUT_SECONDS = 15


def _select_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _can_bind_localhost() -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(("127.0.0.1", 0))
        return True
    except OSError:
        return False


def _write_auth_json(root: Path) -> Path:
    runner = CliRunner()
    result = runner.invoke(auth, ["--json", "--latest"])
    assert result.exit_code == 0, result.output
    auth_path = root / "auth.json"
    auth_path.write_text(result.output, encoding="utf-8")
    return auth_path


def _write_go_project_registry_files(setta_root: Path) -> None:
    view_mode_id = "view-mode-default"
    project_id = str(DEFAULT_SAMPLE_PROJECT_CONFIG_ID)
    main_payload = {
        "schemaVersion": 1,
        "defaultProjectId": project_id,
        "projects": {
            project_id: {
                "id": project_id,
                "name": DEFAULT_SAMPLE_PROJECT_NAME,
                "allowJsonSourceKeyEdits": True,
                "viewModes": {
                    view_mode_id: {
                        "id": view_mode_id,
                        "name": "View Mode",
                    }
                },
                "activeViewModeId": view_mode_id,
                "isEditingViewMode": True,
                "projectChatWindowing": {
                    "instancesById": {},
                    "order": [],
                    "nextInstanceNumber": 1,
                },
            }
        },
    }
    settings_payload = {"schemaVersion": 1}
    (setta_root / "project.json").write_text(
        json.dumps(main_payload, indent=2) + "\n",
        encoding="utf-8",
    )
    (setta_root / "setta-settings-project.json").write_text(
        json.dumps(settings_payload, indent=2) + "\n",
        encoding="utf-8",
    )


@pytest.fixture
def auth_env(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    setta_root = workspace / "setta_files"
    setta_root.mkdir(parents=True, exist_ok=True)
    stack = ExitStack()
    stack.enter_context(
        temporary_setta_paths(
            workspace_root=workspace,
            setta_files_location="local",
        )
    )
    sessions_root = C.RUNTIME_SESSIONS_FOLDER

    process = subprocess.Popen(
        [
            sys.executable,
            "-c",
            "import time; time.sleep(300)",
            "setta.server:app",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    registry = SessionRegistry()

    env = SimpleNamespace(
        workspace=workspace,
        process=process,
        registry=registry,
        sessions_root=sessions_root,
        stack=stack,
    )
    try:
        yield env
    finally:
        if process.poll() is None:
            process.terminate()
        process.wait()
        stack.close()


@pytest.fixture
def api_integration_env(
    _reset_setta_paths_env,
    _force_polling_watchdog_observer_on_darwin,
):
    if not _can_bind_localhost():
        pytest.skip("Socket binds are not permitted in this test environment.")

    temp_dir = tempfile.TemporaryDirectory()
    root = Path(temp_dir.name)
    setta_root = root / "setta_files"
    _seed_minimal_setta_files(setta_root)
    _write_go_project_registry_files(setta_root)

    stack = ExitStack()
    stack.enter_context(
        temporary_setta_paths(
            workspace_root=root,
            setta_files_location="local",
        )
    )

    handle = None
    constants_module = None
    backend_launcher_module = None
    original_is_dev_mode = None
    original_backend_launcher_is_dev_mode = None

    try:
        import setta.backend_launcher as backend_launcher
        import setta.utils.constants as constants

        constants_module = constants
        backend_launcher_module = backend_launcher

        original_is_dev_mode = constants.IS_DEV_MODE
        original_backend_launcher_is_dev_mode = backend_launcher.IS_DEV_MODE
        constants.IS_DEV_MODE = "1"
        backend_launcher.IS_DEV_MODE = "1"

        port = _select_free_port()
        handle = backend_launcher.start_backend(
            host="127.0.0.1",
            port=port,
            wait_for_ready=True,
            open_browser=False,
            ws_protocol="none",
        )

        env = SimpleNamespace(
            root=root,
            setta_root=setta_root,
            handle=handle,
            stack=stack,
            original_is_dev_mode=original_is_dev_mode,
            original_backend_launcher_is_dev_mode=original_backend_launcher_is_dev_mode,
        )
        yield env
    finally:
        if handle is not None:
            handle.stop(join_timeout=30.0)
        stack.close()
        if constants_module is not None and original_is_dev_mode is not None:
            constants_module.IS_DEV_MODE = original_is_dev_mode
        if (
            backend_launcher_module is not None
            and original_backend_launcher_is_dev_mode is not None
        ):
            backend_launcher_module.IS_DEV_MODE = original_backend_launcher_is_dev_mode
        temp_dir.cleanup()


@pytest.fixture
def api_input_env(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    setta_root = workspace / "setta_files"
    setta_root.mkdir(parents=True, exist_ok=True)
    stack = ExitStack()
    stack.enter_context(
        temporary_setta_paths(
            workspace_root=workspace,
            setta_files_location="local",
        )
    )
    sessions_root = C.RUNTIME_SESSIONS_FOLDER

    env = SimpleNamespace(
        sessions_root=sessions_root,
        workspace=workspace,
        stack=stack,
    )
    try:
        yield env
    finally:
        stack.close()


def test_auth_json_emits_payload(auth_env) -> None:
    session = auth_env.registry.create_session(
        workspace_path=auth_env.workspace,
        host="127.0.0.1",
        port=61234,
        pid=auth_env.process.pid,
    )
    runner = CliRunner()

    result = runner.invoke(auth, ["--json", "--session", session.id])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    cookie_name = auth_cookie_name(session.id)

    assert payload["baseUrl"] == "http://127.0.0.1:61234"
    assert payload["apiBaseUrl"] == "http://127.0.0.1:61234/api"
    assert payload["cookieName"] == cookie_name
    assert payload["cookie"].startswith(f"{cookie_name}=")
    assert payload["cookieHeader"].startswith("Cookie: ")
    assert payload["session"]["id"] == session.id
    assert payload["bootstrapUrlPlain"] == "http://127.0.0.1:61234/__setta__/bootstrap"
    assert payload["bootstrapUrlFragment"].startswith(
        "http://127.0.0.1:61234/__setta__/bootstrap#token="
    )
    assert payload["source"] == "bootstrap"


def test_auth_latest_defaults_to_ide_session_mode(auth_env) -> None:
    # Auth output should keep IDE as the default session mode even if launcher is newer.
    now = datetime(2025, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    ide_session = auth_env.registry.create_session(
        workspace_path=auth_env.workspace,
        host="127.0.0.1",
        port=61234,
        pid=auth_env.process.pid,
        started_at=now,
        server_mode="ide",
    )
    auth_env.registry.create_session(
        workspace_path=auth_env.workspace,
        host="127.0.0.1",
        port=61235,
        pid=auth_env.process.pid,
        started_at=now + timedelta(minutes=1),
        server_mode="launcher",
    )
    runner = CliRunner()

    result = runner.invoke(auth, ["--json", "--latest"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["session"]["id"] == ide_session.id
    assert payload["session"]["serverMode"] == "ide"
    assert payload["baseUrl"] == "http://127.0.0.1:61234"


def test_api_auto_auth_latest_defaults_to_ide_session_mode(
    auth_env,
    monkeypatch,
) -> None:
    # API auto-auth should derive URL/cookie from IDE mode by default.
    now = datetime(2025, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    ide_session = auth_env.registry.create_session(
        workspace_path=auth_env.workspace,
        host="127.0.0.1",
        port=61234,
        pid=auth_env.process.pid,
        started_at=now,
        server_mode="ide",
    )
    auth_env.registry.create_session(
        workspace_path=auth_env.workspace,
        host="127.0.0.1",
        port=61235,
        pid=auth_env.process.pid,
        started_at=now + timedelta(minutes=1),
        server_mode="launcher",
    )
    captured: dict[str, object] = {}

    class _FakeResponse:
        status_code = 200
        content = b'{"ok":true}'
        text = '{"ok":true}'

        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, bool]:
            return {"ok": True}

    def _fake_post(url: str, **kwargs):
        captured["url"] = url
        captured["headers"] = kwargs.get("headers")
        return _FakeResponse()

    monkeypatch.setattr("setta.start.requests.post", _fake_post)
    runner = CliRunner()

    result = runner.invoke(api, ["getProjectConfigNamesAndIds", "--json-output"])

    assert result.exit_code == 0, result.output
    assert json.loads(result.output) == {"ok": True}
    assert captured["url"] == f"http://127.0.0.1:61234{Route.TOOLS_CALL.value}"
    headers = captured["headers"]
    assert isinstance(headers, dict)
    assert headers["Cookie"].startswith(f"{auth_cookie_name(ide_session.id)}=")


def test_setta_api_tool_call(api_integration_env) -> None:
    auth_path = _write_auth_json(api_integration_env.root)
    runner = CliRunner()

    result = runner.invoke(
        api,
        [
            "getProjectConfigNamesAndIds",
            "--auth-json",
            str(auth_path),
            "--agentic-project-config-id",
            str(DEFAULT_SAMPLE_PROJECT_CONFIG_ID),
            "--json-output",
        ],
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data.get("isError", False) is False
    assert isinstance(data.get("content"), list)


def test_setta_api_tool_call_rejects_unknown(api_integration_env) -> None:
    auth_path = _write_auth_json(api_integration_env.root)
    runner = CliRunner()

    result = runner.invoke(
        api,
        [
            "unknownTool",
            "--auth-json",
            str(auth_path),
            "--json-output",
        ],
    )

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["error"] == "UnknownTool"
    assert payload["tool"] == "unknownTool"


def test_setta_api_tool_call_rejects_unknown_when_missing_auth(
    api_integration_env,
) -> None:
    runner = CliRunner()

    result = runner.invoke(api, ["unknownTool", "--json-output"])

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["error"] == "InputError"
    assert payload["tool"] == "unknownTool"
    assert "Provide auth" in payload["message"]


def test_setta_api_tool_call_rejects_bad_auth_payload(api_integration_env) -> None:
    auth_path = api_integration_env.root / "auth.json"
    auth_path.write_text("{}", encoding="utf-8")
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

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["error"] == "InputError"
    assert payload["tool"] == "getProjectConfigNamesAndIds"


def test_setta_api_tool_call_rejects_bad_auth_json(api_integration_env) -> None:
    auth_path = api_integration_env.root / "auth.json"
    auth_path.write_text("invalid", encoding="utf-8")
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

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["error"] == "InputError"
    assert payload["tool"] == "getProjectConfigNamesAndIds"


def test_setta_api_tool_call_rejects_bad_auth_json_payload(
    api_integration_env,
) -> None:
    auth_path = api_integration_env.root / "auth.json"
    auth_path.write_text("[]", encoding="utf-8")
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

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["error"] == "InputError"
    assert payload["tool"] == "getProjectConfigNamesAndIds"


def test_setta_api_rejects_non_object_arguments(api_integration_env) -> None:
    auth_path = _write_auth_json(api_integration_env.root)
    runner = CliRunner()

    result = runner.invoke(
        api,
        [
            "getProjectConfigNamesAndIds",
            "--auth-json",
            str(auth_path),
            "--json",
            "[]",
            "--json-output",
        ],
    )

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["error"] == "InputError"
    assert payload["tool"] == "getProjectConfigNamesAndIds"
    assert "JSON object" in payload["message"]


def test_setta_api_rejects_invalid_json_payload(api_integration_env) -> None:
    auth_path = _write_auth_json(api_integration_env.root)
    runner = CliRunner()

    result = runner.invoke(
        api,
        [
            "getProjectConfigNamesAndIds",
            "--auth-json",
            str(auth_path),
            "--json",
            "[]",
            "--json-output",
        ],
    )

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["error"] == "InputError"
    assert payload["tool"] == "getProjectConfigNamesAndIds"
    assert "JSON object" in payload["message"]


def test_setta_api_rejects_invalid_json(api_integration_env) -> None:
    auth_path = _write_auth_json(api_integration_env.root)
    runner = CliRunner()

    result = runner.invoke(
        api,
        [
            "getProjectConfigNamesAndIds",
            "--auth-json",
            str(auth_path),
            "--json",
            "invalid",
            "--json-output",
        ],
    )

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["error"] == "InputError"
    assert payload["tool"] == "getProjectConfigNamesAndIds"


def test_setta_api_rejects_invalid_auth_json_payload(api_integration_env) -> None:
    auth_path = api_integration_env.root / "auth.json"
    auth_path.write_text("[]", encoding="utf-8")
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

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["error"] == "InputError"
    assert payload["tool"] == "getProjectConfigNamesAndIds"


def test_setta_api_rejects_invalid_json_from_stdin(api_integration_env) -> None:
    auth_path = _write_auth_json(api_integration_env.root)
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
        input="invalid",
    )

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["error"] == "InputError"
    assert payload["tool"] == "getProjectConfigNamesAndIds"


def test_setta_api_rejects_invalid_auth_json(api_integration_env) -> None:
    auth_path = api_integration_env.root / "auth.json"
    auth_path.write_text("invalid", encoding="utf-8")
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

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["error"] == "InputError"
    assert payload["tool"] == "getProjectConfigNamesAndIds"


def test_setta_api_rejects_invalid_auth_json_from_stdin(api_integration_env) -> None:
    auth_path = api_integration_env.root / "auth.json"
    auth_path.write_text("invalid", encoding="utf-8")
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

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["error"] == "InputError"
    assert payload["tool"] == "getProjectConfigNamesAndIds"


def test_setta_api_rejects_invalid_auth_payload(api_integration_env) -> None:
    auth_path = api_integration_env.root / "auth.json"
    auth_path.write_text("{}", encoding="utf-8")
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

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["error"] == "InputError"
    assert payload["tool"] == "getProjectConfigNamesAndIds"


def test_setta_api_rejects_bad_auth_payload(api_integration_env) -> None:
    auth_path = api_integration_env.root / "auth.json"
    auth_path.write_text("{}", encoding="utf-8")
    runner = CliRunner()

    result = runner.invoke(
        api,
        [
            "getProjectConfigNamesAndIds",
            "--auth-json",
            str(auth_path),
            "--json",
            "{}",
            "--json-output",
        ],
    )

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["error"] == "InputError"
    assert payload["tool"] == "getProjectConfigNamesAndIds"


def test_setta_api_rejects_invalid_auth_json_payload_from_stdin(
    api_integration_env,
) -> None:
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
        input="invalid",
    )

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["error"] == "InputError"
    assert payload["tool"] == "getProjectConfigNamesAndIds"


def test_setta_api_rejects_invalid_auth_json_payload_from_stdin_not_object(
    api_integration_env,
) -> None:
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
        input="[]",
    )

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["error"] == "InputError"
    assert payload["tool"] == "getProjectConfigNamesAndIds"


def test_setta_api_rejects_invalid_json_from_file(api_integration_env) -> None:
    auth_path = _write_auth_json(api_integration_env.root)
    payload_path = api_integration_env.root / "payload.json"
    payload_path.write_text("invalid", encoding="utf-8")
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

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["error"] == "InputError"
    assert payload["tool"] == "getProjectConfigNamesAndIds"


def test_setta_api_rejects_invalid_json_payload_from_file(api_integration_env) -> None:
    auth_path = _write_auth_json(api_integration_env.root)
    payload_path = api_integration_env.root / "payload.json"
    payload_path.write_text("[]", encoding="utf-8")
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

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["error"] == "InputError"
    assert payload["tool"] == "getProjectConfigNamesAndIds"


def test_setta_api_rejects_invalid_tool_name(api_integration_env) -> None:
    auth_path = _write_auth_json(api_integration_env.root)
    runner = CliRunner()

    result = runner.invoke(
        api,
        [
            "getLatestProjectState",
            "--auth-json",
            str(auth_path),
            "--json-output",
        ],
    )

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["error"] == "InputError"
    assert payload["tool"] == "getLatestProjectState"
    assert "bare MCP tool name" in payload["message"]


def test_setta_api_rejects_invalid_tool_from_auth_json(api_integration_env) -> None:
    auth_path = api_integration_env.root / "auth.json"
    auth_path.write_text(
        json.dumps({"tool": "foo", "cookieHeader": "Cookie: foo=bar"}),
        encoding="utf-8",
    )
    runner = CliRunner()

    result = runner.invoke(
        api,
        [
            "getLatestProjectState",
            "--auth-json",
            str(auth_path),
            "--json-output",
        ],
    )

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["error"] == "InputError"
    assert payload["tool"] == "getLatestProjectState"
    assert "bare MCP tool name" in payload["message"]


def test_setta_api_tool_call_rejects_http_error(api_integration_env) -> None:
    auth_path = _write_auth_json(api_integration_env.root)
    runner = CliRunner()

    result = runner.invoke(
        api,
        [
            "get_latest_project_state_summary",
            "--auth-json",
            str(auth_path),
            "--agentic-project-config-id",
            str(DEFAULT_SAMPLE_PROJECT_CONFIG_ID),
            "--json",
            "{}",
            "--json-output",
        ],
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["isError"] is True
    structured = payload["structuredContent"]
    assert structured["code"] == "scope_violation"
    assert structured["reason"] == "missing_section_id"
    assert "requires a sectionId" in structured["message"]


def test_setta_tools_matches_mcp_list(api_integration_env) -> None:
    auth_payload = json.loads(_write_auth_json(api_integration_env.root).read_text())
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
    result = subprocess.run(
        [sys.executable, "-m", "setta", "tools"],
        cwd=Path(__file__).resolve().parents[2],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr or result.stdout
    payload = json.loads(result.stdout)
    cli_names = sorted(tool["name"] for tool in payload)
    assert cli_names == mcp_names


def test_tools_call_endpoint_contract(api_integration_env) -> None:
    auth_payload = json.loads(_write_auth_json(api_integration_env.root).read_text())
    cookie = auth_payload["cookie"]
    base_url = auth_payload["baseUrl"]
    url = f"{base_url}{Route.TOOLS_CALL.value}"
    headers = {"Cookie": cookie}

    response = requests.post(
        url,
        headers=headers,
        json={"tool": "unknown_tool_name", "arguments": {}},
        timeout=TOOLS_CALL_TIMEOUT_SECONDS,
    )
    assert response.status_code == 404
    payload = response.json()["error"]
    assert payload["code"] == "tool_not_found"
    assert "unknown tool" in payload["message"].lower()

    response = requests.post(
        url,
        headers=headers,
        json={"tool": "getProjectConfigNamesAndIds", "arguments": "nope"},
        timeout=TOOLS_CALL_TIMEOUT_SECONDS,
    )
    assert response.status_code == 400
    payload = response.json()["error"]
    assert payload["code"] == "invalid_json"
    assert payload["message"] == "Invalid JSON payload."

    response = requests.post(
        url,
        headers=headers,
        json={"tool": "getProjectConfigNamesAndIds", "arguments": []},
        timeout=TOOLS_CALL_TIMEOUT_SECONDS,
    )
    assert response.status_code == 400
    payload = response.json()["error"]
    assert payload["code"] == "invalid_json"
    assert payload["message"] == "Invalid JSON payload."


def test_tools_call_endpoint_tool_error_contract(api_integration_env) -> None:
    auth_payload = json.loads(_write_auth_json(api_integration_env.root).read_text())
    cookie = auth_payload["cookie"]
    base_url = auth_payload["baseUrl"]
    url = f"{base_url}{Route.TOOLS_CALL.value}"
    headers = {
        "Cookie": cookie,
        AGENTIC_CONTEXT_PROJECT_CONFIG_ID_HEADER: str(DEFAULT_SAMPLE_PROJECT_CONFIG_ID),
        AGENTIC_CONTEXT_ALLOW_UNSCOPED_HEADER: "true",
    }

    response = requests.post(
        url,
        headers=headers,
        json={"tool": "read_file_range", "arguments": {"path": "missing-file.txt"}},
        timeout=TOOLS_CALL_TIMEOUT_SECONDS,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["isError"] is True
    structured = payload["structuredContent"]
    assert structured["code"] == "scope_violation"
    assert structured["reason"] == "empty_scope"


def test_setta_api_payload_stdin(api_integration_env) -> None:
    auth_path = _write_auth_json(api_integration_env.root)
    runner = CliRunner()

    result = runner.invoke(
        api,
        [
            "getProjectConfigNamesAndIds",
            "--auth-json",
            str(auth_path),
            "--agentic-project-config-id",
            str(DEFAULT_SAMPLE_PROJECT_CONFIG_ID),
            "--stdin",
            "--json-output",
        ],
        input="{}",
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data.get("isError", False) is False
    assert isinstance(data.get("content"), list)


def test_setta_api_payload_file(api_integration_env) -> None:
    auth_path = _write_auth_json(api_integration_env.root)
    payload_path = api_integration_env.root / "payload.json"
    payload_path.write_text("{}", encoding="utf-8")
    runner = CliRunner()

    result = runner.invoke(
        api,
        [
            "getProjectConfigNamesAndIds",
            "--auth-json",
            str(auth_path),
            "--agentic-project-config-id",
            str(DEFAULT_SAMPLE_PROJECT_CONFIG_ID),
            "--file",
            str(payload_path),
            "--json-output",
        ],
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data.get("isError", False) is False
    assert isinstance(data.get("content"), list)


def test_setta_api_auth_stdin(api_integration_env) -> None:
    auth_payload = _write_auth_json(api_integration_env.root).read_text(
        encoding="utf-8"
    )
    runner = CliRunner()

    result = runner.invoke(
        api,
        [
            "getProjectConfigNamesAndIds",
            "--auth-stdin",
            "--agentic-project-config-id",
            str(DEFAULT_SAMPLE_PROJECT_CONFIG_ID),
            "--json",
            "{}",
            "--json-output",
        ],
        input=auth_payload,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data.get("isError", False) is False
    assert isinstance(data.get("content"), list)


def test_setta_api_cookie_header(api_integration_env) -> None:
    auth_payload = json.loads(_write_auth_json(api_integration_env.root).read_text())
    cookie_header = auth_payload["cookieHeader"]
    runner = CliRunner()

    result = runner.invoke(
        api,
        [
            "getProjectConfigNamesAndIds",
            "--cookie-header",
            cookie_header,
            "--agentic-project-config-id",
            str(DEFAULT_SAMPLE_PROJECT_CONFIG_ID),
            "--json-output",
        ],
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data.get("isError", False) is False
    assert isinstance(data.get("content"), list)


def test_setta_api_cookie_value(api_integration_env) -> None:
    auth_payload = json.loads(_write_auth_json(api_integration_env.root).read_text())
    cookie = auth_payload["cookie"]
    runner = CliRunner()

    result = runner.invoke(
        api,
        [
            "getProjectConfigNamesAndIds",
            "--cookie",
            cookie,
            "--agentic-project-config-id",
            str(DEFAULT_SAMPLE_PROJECT_CONFIG_ID),
            "--json-output",
        ],
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data.get("isError", False) is False
    assert isinstance(data.get("content"), list)


def test_api_rejects_namespaced_tool(api_input_env) -> None:
    runner = CliRunner()
    result = runner.invoke(api, ["setta__foo", "--json-output"])
    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["error"] == "InputError"
    assert "bare MCP tool name" in payload["message"]


def test_api_rejects_path_tool(api_input_env) -> None:
    runner = CliRunner()
    result = runner.invoke(api, ["/getLatestProjectState", "--json-output"])
    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["error"] == "InputError"
    assert "bare MCP tool name" in payload["message"]


def test_api_rejects_non_object_arguments(api_input_env) -> None:
    runner = CliRunner()
    result = runner.invoke(
        api,
        ["getProjectConfigNamesAndIds", "--json", "[]", "--json-output"],
    )
    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["error"] == "InputError"
    assert payload["tool"] == "getProjectConfigNamesAndIds"
    assert "JSON object" in payload["message"]


def test_api_auto_auth_missing_sessions(api_input_env) -> None:
    runner = CliRunner()
    result = runner.invoke(api, ["getProjectConfigNamesAndIds", "--json-output"])
    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["error"] == "InputError"
    assert "No matching Setta sessions found" in payload["message"]
