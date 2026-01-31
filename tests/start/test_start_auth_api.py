import asyncio
import json
import os
import socket
import subprocess
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

import pytest
import requests
from click.testing import CliRunner
from mcp import ClientSession
from mcp.client.sse import sse_client

from setta.sessions import SessionRegistry
from setta.start import api, auth, tools
from setta.types.routes import Route
from setta.utils.constants import C
from tests.utils.manager_fixture import _seed_minimal_setta_files


def _select_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _apply_fixture_constants(root: Path) -> dict[str, Path]:
    originals = {
        "SETTA_FILES_FOLDER": C.SETTA_FILES_FOLDER,
        "CODE_FOLDER": C.CODE_FOLDER,
        "ARTIFACTS_FOLDER": C.ARTIFACTS_FOLDER,
        "DB_BACKUP_FOLDER": C.DB_BACKUP_FOLDER,
        "RUN_FOLDER": C.RUN_FOLDER,
        "RUN_SESSIONS_FOLDER": C.RUN_SESSIONS_FOLDER,
        "RUN_LOGS_FOLDER": C.RUN_LOGS_FOLDER,
        "SHARE_DEPLOYMENTS_FOLDER": C.SHARE_DEPLOYMENTS_FOLDER,
    }
    setta_root = root / "setta_files"
    C.SETTA_FILES_FOLDER = setta_root
    C.CODE_FOLDER = setta_root / "code"
    C.ARTIFACTS_FOLDER = setta_root / "artifacts"
    C.DB_BACKUP_FOLDER = setta_root / "backups"
    C.RUN_FOLDER = setta_root / "run"
    C.RUN_SESSIONS_FOLDER = C.RUN_FOLDER / "sessions"
    C.RUN_LOGS_FOLDER = C.RUN_FOLDER / "logs"
    C.SHARE_DEPLOYMENTS_FOLDER = setta_root / "share_deployments"
    return originals


def _restore_fixture_constants(originals: dict[str, Path]) -> None:
    C.SETTA_FILES_FOLDER = originals["SETTA_FILES_FOLDER"]
    C.CODE_FOLDER = originals["CODE_FOLDER"]
    C.ARTIFACTS_FOLDER = originals["ARTIFACTS_FOLDER"]
    C.DB_BACKUP_FOLDER = originals["DB_BACKUP_FOLDER"]
    C.RUN_FOLDER = originals["RUN_FOLDER"]
    C.RUN_SESSIONS_FOLDER = originals["RUN_SESSIONS_FOLDER"]
    C.RUN_LOGS_FOLDER = originals["RUN_LOGS_FOLDER"]
    C.SHARE_DEPLOYMENTS_FOLDER = originals["SHARE_DEPLOYMENTS_FOLDER"]


def _write_auth_json(root: Path) -> Path:
    runner = CliRunner()
    result = runner.invoke(auth, ["--json", "--latest"])
    assert result.exit_code == 0, result.output
    auth_path = root / "auth.json"
    auth_path.write_text(result.output, encoding="utf-8")
    return auth_path


@pytest.fixture
def auth_env(tmp_path):
    original_sessions_root = C.RUN_SESSIONS_FOLDER
    sessions_root = tmp_path / "setta_files" / "run" / "sessions"
    C.RUN_SESSIONS_FOLDER = sessions_root

    workspace = tmp_path / "workspace"
    workspace.mkdir()

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
        original_sessions_root=original_sessions_root,
    )
    try:
        yield env
    finally:
        if process.poll() is None:
            process.terminate()
        process.wait()
        C.RUN_SESSIONS_FOLDER = original_sessions_root


@pytest.fixture(scope="class")
def api_integration_env(request):
    temp_dir = tempfile.TemporaryDirectory()
    root = Path(temp_dir.name)
    setta_root = root / "setta_files"
    _seed_minimal_setta_files(setta_root)

    originals = _apply_fixture_constants(root)

    original_cwd = Path.cwd()
    os.chdir(root)

    try:
        import importlib
        import setta.backend_launcher as backend_launcher
        import setta.server as server
        import setta.utils.constants as constants

        original_is_dev_mode = constants.IS_DEV_MODE
        original_server_is_dev_mode = server.IS_DEV_MODE
        original_backend_launcher_is_dev_mode = backend_launcher.IS_DEV_MODE
        constants.IS_DEV_MODE = "1"
        server.IS_DEV_MODE = "1"
        backend_launcher.IS_DEV_MODE = "1"
        importlib.reload(server)

        port = _select_free_port()
        handle = backend_launcher.start_backend(
            host="127.0.0.1",
            port=port,
            wait_for_ready=True,
            open_browser=False,
            ws_protocol="none",
        )
    except Exception as exc:  # pragma: no cover - environment dependent
        os.chdir(original_cwd)
        _restore_fixture_constants(originals)
        temp_dir.cleanup()
        pytest.skip(f"Setta backend unavailable: {exc}")

    env = SimpleNamespace(
        root=root,
        setta_root=setta_root,
        handle=handle,
        original_cwd=original_cwd,
        originals=originals,
        original_is_dev_mode=original_is_dev_mode,
        original_server_is_dev_mode=original_server_is_dev_mode,
        original_backend_launcher_is_dev_mode=original_backend_launcher_is_dev_mode,
    )

    try:
        yield env
    finally:
        if handle is not None:
            handle.stop(join_timeout=30.0)
        os.chdir(original_cwd)
        _restore_fixture_constants(originals)
        import setta.utils.constants as constants
        import setta.server as server
        import setta.backend_launcher as backend_launcher

        constants.IS_DEV_MODE = original_is_dev_mode
        server.IS_DEV_MODE = original_server_is_dev_mode
        backend_launcher.IS_DEV_MODE = original_backend_launcher_is_dev_mode
        temp_dir.cleanup()


@pytest.fixture
def api_input_env(tmp_path):
    original_sessions_root = C.RUN_SESSIONS_FOLDER
    sessions_root = tmp_path / "setta_files" / "run" / "sessions"
    C.RUN_SESSIONS_FOLDER = sessions_root

    original_cwd = Path.cwd()
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    os.chdir(workspace)

    env = SimpleNamespace(
        sessions_root=sessions_root,
        original_sessions_root=original_sessions_root,
        original_cwd=original_cwd,
        workspace=workspace,
    )
    try:
        yield env
    finally:
        os.chdir(original_cwd)
        C.RUN_SESSIONS_FOLDER = original_sessions_root


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

    assert payload["baseUrl"] == "http://127.0.0.1:61234"
    assert payload["apiBaseUrl"] == "http://127.0.0.1:61234/api"
    assert payload["cookieName"] == C.AUTH_COOKIE_NAME
    assert payload["cookie"].startswith(f"{C.AUTH_COOKIE_NAME}=")
    assert payload["cookieHeader"].startswith("Cookie: ")
    assert payload["session"]["id"] == session.id
    assert (
        payload["bootstrapUrlPlain"]
        == "http://127.0.0.1:61234/__setta__/bootstrap"
    )
    assert payload["bootstrapUrlFragment"].startswith(
        "http://127.0.0.1:61234/__setta__/bootstrap#token="
    )
    assert payload["source"] == "bootstrap"


def test_setta_api_tool_call(api_integration_env) -> None:
    auth_path = _write_auth_json(api_integration_env.root)
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

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data.get("isError") is False
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
            "--json",
            "{}",
            "--json-output",
        ],
    )

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["error"] == "HTTPError"
    assert payload["status"] == 422
    assert payload["tool"] == "get_latest_project_state_summary"


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
    runner = CliRunner()
    result = runner.invoke(tools, [])
    assert result.exit_code == 0, result.output
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
        timeout=5,
    )
    assert response.status_code == 404
    assert "Unknown tool" in response.json().get("detail", "")

    response = requests.post(
        url,
        headers=headers,
        json={"tool": "getProjectConfigNamesAndIds", "arguments": "nope"},
        timeout=5,
    )
    assert response.status_code == 400
    assert "arguments" in response.json().get("detail", "")

    response = requests.post(
        url,
        headers=headers,
        json={"tool": "getProjectConfigNamesAndIds", "arguments": []},
        timeout=5,
    )
    assert response.status_code == 400
    assert "arguments" in response.json().get("detail", "")


def test_tools_call_endpoint_tool_error_contract(api_integration_env) -> None:
    auth_payload = json.loads(_write_auth_json(api_integration_env.root).read_text())
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
    assert response.status_code == 500
    detail = response.json().get("detail")
    assert isinstance(detail, dict)
    assert detail.get("error") == "ToolError"


def test_setta_api_payload_stdin(api_integration_env) -> None:
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
        input="{}",
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data.get("isError") is False
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
            "--file",
            str(payload_path),
            "--json-output",
        ],
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data.get("isError") is False
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
            "--json",
            "{}",
            "--json-output",
        ],
        input=auth_payload,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data.get("isError") is False
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
            "--json-output",
        ],
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data.get("isError") is False
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
            "--json-output",
        ],
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data.get("isError") is False
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
