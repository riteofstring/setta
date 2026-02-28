from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from setta.routers.status import router as status_router
from setta.types.mcp_runtime_status import MCPServerRuntimeStatus
from setta.types.routes import Route
from tests.utils.setta_paths import temporary_setta_paths


class _FakeMCPClient:
    def __init__(self, statuses: list[MCPServerRuntimeStatus]) -> None:
        self._statuses = statuses

    def get_server_runtime_statuses(self) -> list[MCPServerRuntimeStatus]:
        return [status.model_copy(deep=True) for status in self._statuses]


class _FakeExternalRunner:
    def __init__(self, statuses: list[MCPServerRuntimeStatus]) -> None:
        self.disabled = False
        self._statuses = statuses
        self.calls: list[tuple[str | None, str | None]] = []

    def get_mcp_server_runtime_statuses(
        self,
        *,
        chat_id,
        engine_config_id,
    ) -> list[MCPServerRuntimeStatus]:
        normalized_chat = str(chat_id) if chat_id is not None else None
        normalized_engine = str(engine_config_id) if engine_config_id is not None else None
        self.calls.append((normalized_chat, normalized_engine))
        return [status.model_copy(deep=True) for status in self._statuses]


def test_mcp_runtime_status_route_returns_server_and_external_statuses() -> None:
    app = FastAPI()
    now = datetime.now(UTC)
    expected_now = now.isoformat().replace("+00:00", "Z")
    mcp_status = MCPServerRuntimeStatus(
        serverId="setta",
        source="setta_mcp",
        transport="sse",
        endpoint="http://127.0.0.1:8000/mcp",
        state="connected",
        lastAttemptAt=now,
        lastConnectedAt=now,
        toolCount=12,
    )
    external_status = MCPServerRuntimeStatus(
        serverId="filesystem",
        source="external_runtime",
        transport="stdio",
        endpoint="npx @modelcontextprotocol/server-filesystem",
        state="unknown",
    )
    external_runner = _FakeExternalRunner([external_status])
    app.state.setta = SimpleNamespace(
        deployment_mode=False,
        mcp_client=_FakeMCPClient([mcp_status]),
        external_agent_runner=external_runner,
    )
    app.include_router(status_router, prefix=Route.PREFIX.value)

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.GET_MCP_SERVER_RUNTIME_STATUS.value}",
            json={"chatId": "chat-1", "engineConfigId": "engine-1"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload.get("llmConfigPath"), str)
    assert isinstance(payload.get("activeSettaFilesLocation"), str)
    assert payload["servers"] == [
        {
            "serverId": "setta",
            "source": "setta_mcp",
            "transport": "sse",
            "endpoint": "http://127.0.0.1:8000/mcp",
            "state": "connected",
            "lastAttemptAt": expected_now,
            "lastConnectedAt": expected_now,
            "lastFailureAt": None,
            "consecutiveFailures": 0,
            "lastError": None,
            "missingEnvVar": None,
            "toolCount": 12,
        }
    ]
    assert payload["externalServers"] == [
        {
            "serverId": "filesystem",
            "source": "external_runtime",
            "transport": "stdio",
            "endpoint": "npx @modelcontextprotocol/server-filesystem",
            "state": "unknown",
            "lastAttemptAt": None,
            "lastConnectedAt": None,
            "lastFailureAt": None,
            "consecutiveFailures": 0,
            "lastError": None,
            "missingEnvVar": None,
            "toolCount": 0,
        }
    ]
    assert external_runner.calls == [("chat-1", "engine-1")]


def test_mcp_runtime_status_route_blocked_in_deployment_mode() -> None:
    app = FastAPI()
    app.state.setta = SimpleNamespace(deployment_mode=True)
    app.include_router(status_router, prefix=Route.PREFIX.value)

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.GET_MCP_SERVER_RUNTIME_STATUS.value}",
            json={},
        )

    assert response.status_code == 403


def test_mcp_runtime_status_route_skips_external_runner_when_disabled() -> None:
    app = FastAPI()
    mcp_status = MCPServerRuntimeStatus(
        serverId="setta",
        source="setta_mcp",
        transport="sse",
        endpoint="http://127.0.0.1:8000/mcp",
        state="connected",
        toolCount=1,
    )
    external_status = MCPServerRuntimeStatus(
        serverId="filesystem",
        source="external_runtime",
        transport="stdio",
        endpoint="npx @modelcontextprotocol/server-filesystem",
        state="error",
        lastError="boom",
    )
    external_runner = _FakeExternalRunner([external_status])
    external_runner.disabled = True
    app.state.setta = SimpleNamespace(
        deployment_mode=False,
        mcp_client=_FakeMCPClient([mcp_status]),
        external_agent_runner=external_runner,
    )
    app.include_router(status_router, prefix=Route.PREFIX.value)

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.GET_MCP_SERVER_RUNTIME_STATUS.value}",
            json={"chatId": "chat-1", "engineConfigId": "engine-1"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["servers"]) == 1
    assert payload["externalServers"] == []
    assert external_runner.calls == []


def test_mcp_runtime_status_route_reports_custom_setta_files_location_when_explicit_root(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    setta_files_root = workspace_root / "setta_files_dev"
    setta_files_root.mkdir()

    app = FastAPI()
    app.state.setta = SimpleNamespace(
        deployment_mode=False,
        mcp_client=_FakeMCPClient([]),
        external_agent_runner=_FakeExternalRunner([]),
    )
    app.include_router(status_router, prefix=Route.PREFIX.value)

    with temporary_setta_paths(
        workspace_root=workspace_root,
        setta_files_root=setta_files_root,
    ):
        with TestClient(app) as client:
            response = client.post(
                f"{Route.PREFIX.value}{Route.GET_MCP_SERVER_RUNTIME_STATUS.value}",
                json={},
            )

    assert response.status_code == 200
    payload = response.json()
    assert payload["activeSettaFilesLocation"] == "custom"
    assert payload["llmConfigPath"] == str(setta_files_root / "llm_config.json")
