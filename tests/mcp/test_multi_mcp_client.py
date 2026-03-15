from typing import Any

import anyio
import pytest
from mcp.types import Tool, ToolAnnotations

from setta.mcp.client import MissingMCPEnvVarError, MultiMCPClient
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.mcp.tool_metadata import SettaToolAnnotations, SettaToolType
from setta.types.llm_config import MCPServerConfig
from setta.types.mcp_runtime_status import MCPServerRuntimeState
from setta.utils.constants import C


def _build_tool(
    *,
    name: str,
    description: str = "",
    annotations: ToolAnnotations | None = None,
) -> Tool:
    return Tool(
        name=name,
        description=description,
        inputSchema={},
        annotations=annotations,
    )


class _ClosedSession:
    def __init__(self, on_call: Any | None = None) -> None:
        self.on_call = on_call

    async def call_tool(
        self, _tool_name: str, _tool_args: dict, *, meta: dict | None = None
    ) -> Any:
        del meta
        if self.on_call is not None:
            self.on_call()
        raise anyio.ClosedResourceError


class _RecordingSession:
    def __init__(self, result: Any) -> None:
        self.result = result
        self.calls: list[tuple[str, dict, dict | None]] = []

    async def call_tool(
        self, tool_name: str, tool_args: dict, *, meta: dict | None = None
    ) -> Any:
        self.calls.append((tool_name, tool_args, meta))
        return self.result


class TestMultiMCPClientToolCache:
    def test_namespaces_tools_and_routes(self) -> None:
        client = MultiMCPClient({})
        init_annotations = ToolAnnotations.model_validate(
            SettaToolAnnotations(settaToolType=SettaToolType.init).model_dump()
        )
        init_tool = _build_tool(
            name="read_file_range",
            description="Read file contents",
            annotations=init_annotations,
        )
        no_annotation_tool = _build_tool(
            name="list_projects",
            description="List projects",
        )

        client._update_tool_cache_for_server(
            SETTA_MCP_SERVER_ID, [init_tool, no_annotation_tool]
        )

        assert (
            f"{SETTA_MCP_SERVER_ID}__read_file_range"
            in client.init_tool_definitions
        )
        assert (
            f"{SETTA_MCP_SERVER_ID}__list_projects"
            in client.discoverable_tool_definitions
        )
        assert client.routing[f"{SETTA_MCP_SERVER_ID}__read_file_range"] == (
            SETTA_MCP_SERVER_ID,
            "read_file_range",
        )
        assert (
            client.tool_annotations_by_name[
                f"{SETTA_MCP_SERVER_ID}__list_projects"
            ]
            is None
        )

    def test_filters_tools_by_server(self) -> None:
        client = MultiMCPClient({})
        setta_tool = _build_tool(name="read_file_range")
        github_tool = _build_tool(name="search_repo")

        client._update_tool_cache_for_server(SETTA_MCP_SERVER_ID, [setta_tool])
        client._update_tool_cache_for_server("github", [github_tool])

        filtered = client.discoverable_tool_definitions_for_servers({"github"})

        assert "github__search_repo" in filtered
        assert f"{SETTA_MCP_SERVER_ID}__read_file_range" not in filtered

    def test_skips_search_tool(self) -> None:
        client = MultiMCPClient({})
        init_annotations = ToolAnnotations.model_validate(
            SettaToolAnnotations(settaToolType=SettaToolType.init).model_dump()
        )
        search_tool = _build_tool(
            name=C.SEARCH_MCP_TOOLS_NAME,
            annotations=init_annotations,
        )

        client._update_tool_cache_for_server(SETTA_MCP_SERVER_ID, [search_tool])

        assert (
            f"{SETTA_MCP_SERVER_ID}__search_mcp_tools"
            not in client.discoverable_tool_definitions
        )
        assert (
            f"{SETTA_MCP_SERVER_ID}__search_mcp_tools"
            in client.init_tool_definitions
        )


class TestMultiMCPClientCallTool:
    @pytest.mark.asyncio
    async def test_retries_after_closed_resource_error(self) -> None:
        client = MultiMCPClient({})
        namespaced_tool_name = f"{SETTA_MCP_SERVER_ID}__read_file_range"
        client.routing[namespaced_tool_name] = (
            SETTA_MCP_SERVER_ID,
            "read_file_range",
        )
        client.tool_annotations_by_name[namespaced_tool_name] = SettaToolAnnotations(
            settaToolType=SettaToolType.discoverable,
            accessType="read",
        )

        replacement_session = _RecordingSession({"ok": True})

        def _replace_session() -> None:
            client._sessions[SETTA_MCP_SERVER_ID] = replacement_session

        client._sessions[SETTA_MCP_SERVER_ID] = _ClosedSession(on_call=_replace_session)

        result = await client.call_tool(namespaced_tool_name, {"path": "README.md"})

        assert result == {"ok": True}
        assert replacement_session.calls == [
            ("read_file_range", {"path": "README.md"}, None)
        ]

    @pytest.mark.asyncio
    async def test_does_not_retry_non_read_only_tool(self) -> None:
        client = MultiMCPClient({})
        namespaced_tool_name = f"{SETTA_MCP_SERVER_ID}__write_file"
        client.routing[namespaced_tool_name] = (
            SETTA_MCP_SERVER_ID,
            "write_file",
        )
        client.tool_annotations_by_name[namespaced_tool_name] = SettaToolAnnotations(
            settaToolType=SettaToolType.discoverable,
            accessType="read",
            retryOnDisconnect=False,
        )
        client._sessions[SETTA_MCP_SERVER_ID] = _ClosedSession()

        async def _unexpected_reconnect(
            _server_id: str, *, previous_session: Any
        ) -> Any:
            del previous_session
            raise AssertionError("Reconnect should not be attempted for write tools")

        client._wait_for_session_reconnect = _unexpected_reconnect  # type: ignore[method-assign]

        with pytest.raises(anyio.ClosedResourceError):
            await client.call_tool(namespaced_tool_name, {"path": "README.md"})

    @pytest.mark.asyncio
    async def test_does_not_retry_invoke_linked_chat_after_disconnect(self) -> None:
        client = MultiMCPClient({})
        namespaced_tool_name = f"{SETTA_MCP_SERVER_ID}__invoke_linked_chat"
        client.routing[namespaced_tool_name] = (
            SETTA_MCP_SERVER_ID,
            "invoke_linked_chat",
        )
        client.tool_annotations_by_name[namespaced_tool_name] = SettaToolAnnotations(
            settaToolType=SettaToolType.discoverable,
            accessType="write",
        )
        client._sessions[SETTA_MCP_SERVER_ID] = _ClosedSession()

        async def _unexpected_reconnect(
            _server_id: str, *, previous_session: Any
        ) -> Any:
            del previous_session
            raise AssertionError(
                "Reconnect should not be attempted for invoke_linked_chat"
            )

        client._wait_for_session_reconnect = _unexpected_reconnect  # type: ignore[method-assign]

        with pytest.raises(anyio.ClosedResourceError):
            await client.call_tool(namespaced_tool_name, {"targetSectionId": "sec-1"})

    @pytest.mark.asyncio
    async def test_raises_when_reconnect_is_unavailable(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        client = MultiMCPClient({})
        namespaced_tool_name = f"{SETTA_MCP_SERVER_ID}__read_file_range"
        client.routing[namespaced_tool_name] = (
            SETTA_MCP_SERVER_ID,
            "read_file_range",
        )
        client.tool_annotations_by_name[namespaced_tool_name] = SettaToolAnnotations(
            settaToolType=SettaToolType.discoverable,
            accessType="read",
        )
        client._sessions[SETTA_MCP_SERVER_ID] = _ClosedSession()

        async def _no_reconnect(
            _server_id: str, *, previous_session: Any
        ) -> None:
            del previous_session
            return None

        monkeypatch.setattr(client, "_wait_for_session_reconnect", _no_reconnect)

        with pytest.raises(anyio.ClosedResourceError):
            await client.call_tool(namespaced_tool_name, {"path": "README.md"})


class TestMultiMCPClientRuntimeStatus:
    def test_initial_statuses_include_configured_servers(self) -> None:
        client = MultiMCPClient(
            {
                SETTA_MCP_SERVER_ID: MCPServerConfig(
                    transport="sse",
                    url="http://127.0.0.1:8000/mcp",
                ),
                "local_stdio": MCPServerConfig(
                    transport="stdio",
                    command="node",
                    args=["server.js"],
                ),
            }
        )

        statuses = {x.serverId: x for x in client.get_server_runtime_statuses()}
        assert set(statuses.keys()) == {SETTA_MCP_SERVER_ID, "local_stdio"}
        assert statuses[SETTA_MCP_SERVER_ID].state == MCPServerRuntimeState.unknown
        assert statuses["local_stdio"].endpoint == "node"

    def test_status_transitions_capture_failures_and_retries(self) -> None:
        client = MultiMCPClient(
            {
                "github": MCPServerConfig(
                    transport="streamable_http",
                    url="http://localhost:9000/mcp",
                )
            }
        )

        client._mark_connecting("github")
        statuses = {x.serverId: x for x in client.get_server_runtime_statuses()}
        assert statuses["github"].state == MCPServerRuntimeState.connecting
        assert statuses["github"].lastAttemptAt is not None

        client._mark_failure(
            "github",
            error=RuntimeError("connect failed"),
            missing_env_var="GITHUB_TOKEN",
        )
        statuses = {x.serverId: x for x in client.get_server_runtime_statuses()}
        assert statuses["github"].state == MCPServerRuntimeState.error
        assert statuses["github"].lastError == "connect failed"
        assert statuses["github"].missingEnvVar == "GITHUB_TOKEN"
        assert statuses["github"].consecutiveFailures == 1

        client._mark_retrying("github")
        statuses = {x.serverId: x for x in client.get_server_runtime_statuses()}
        assert statuses["github"].state == MCPServerRuntimeState.retrying

    def test_connected_resets_failure_metadata(self) -> None:
        client = MultiMCPClient(
            {
                "github": MCPServerConfig(
                    transport="streamable_http",
                    url="http://localhost:9000/mcp",
                )
            }
        )

        client._mark_failure("github", error=RuntimeError("fail"))
        client._mark_connected("github", tool_count=5)

        statuses = {x.serverId: x for x in client.get_server_runtime_statuses()}
        assert statuses["github"].state == MCPServerRuntimeState.connected
        assert statuses["github"].toolCount == 5
        assert statuses["github"].lastError is None
        assert statuses["github"].consecutiveFailures == 0

    @pytest.mark.asyncio
    async def test_stop_marks_servers_disabled(self) -> None:
        client = MultiMCPClient(
            {
                "github": MCPServerConfig(
                    transport="streamable_http",
                    url="http://localhost:9000/mcp",
                )
            }
        )

        client._mark_connected("github", tool_count=2)
        await client.stop()

        statuses = {x.serverId: x for x in client.get_server_runtime_statuses()}
        assert statuses["github"].state == MCPServerRuntimeState.disabled
        assert statuses["github"].toolCount == 0

    def test_mark_disabled_clears_failure_metadata(self) -> None:
        client = MultiMCPClient(
            {
                "github": MCPServerConfig(
                    transport="streamable_http",
                    url="http://localhost:9000/mcp",
                )
            }
        )

        client._mark_failure(
            "github",
            error=RuntimeError("connect failed"),
            missing_env_var="GITHUB_TOKEN",
        )
        client._mark_disabled("github")

        statuses = {x.serverId: x for x in client.get_server_runtime_statuses()}
        assert statuses["github"].state == MCPServerRuntimeState.disabled
        assert statuses["github"].lastError is None
        assert statuses["github"].missingEnvVar is None
        assert statuses["github"].consecutiveFailures == 0

    @pytest.mark.asyncio
    async def test_missing_env_failure_does_not_mark_retrying(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        client = MultiMCPClient(
            {
                "github": MCPServerConfig(
                    transport="streamable_http",
                    url="http://localhost:9000/mcp",
                )
            }
        )
        config = client.server_configs["github"]
        retry_marks: list[str] = []
        sleep_calls: list[float] = []
        cleanup_calls: list[str] = []

        async def _raise_missing_env(
            _server_id: str,
            _config: MCPServerConfig,
        ) -> None:
            raise MissingMCPEnvVarError("GITHUB_TOKEN")

        async def _noop_report_connection_failure(*_args: Any, **_kwargs: Any) -> None:
            return None

        async def _noop_cleanup(
            server_id: str,
            *,
            rebuild_tool_cache: bool = True,
        ) -> None:
            del rebuild_tool_cache
            cleanup_calls.append(server_id)

        async def _record_sleep(seconds: float) -> None:
            sleep_calls.append(seconds)

        monkeypatch.setattr(client, "_connect_server_once", _raise_missing_env)
        monkeypatch.setattr(
            client,
            "_report_connection_failure",
            _noop_report_connection_failure,
        )
        monkeypatch.setattr(client, "_cleanup_server", _noop_cleanup)
        monkeypatch.setattr(
            "setta.mcp.client.asyncio.sleep",
            _record_sleep,
        )

        def _record_retry(server_id: str) -> None:
            retry_marks.append(server_id)

        monkeypatch.setattr(client, "_mark_retrying", _record_retry)

        await client._connect_server_loop("github", config, retry_delay=1)

        statuses = {x.serverId: x for x in client.get_server_runtime_statuses()}
        assert statuses["github"].state == MCPServerRuntimeState.error
        assert statuses["github"].missingEnvVar == "GITHUB_TOKEN"
        assert retry_marks == []
        assert sleep_calls == []
        assert cleanup_calls == ["github"]


class TestMultiMCPClientHTTPHeaders:
    def test_build_http_headers_merges_config_and_setta_auth(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        client = MultiMCPClient(
            {
                SETTA_MCP_SERVER_ID: MCPServerConfig(
                    transport="streamable_http",
                    url="http://localhost:9000/mcp",
                    http_headers={"Authorization": "Bearer custom-token"},
                )
            }
        )
        config = client.server_configs[SETTA_MCP_SERVER_ID]
        monkeypatch.setattr(
            client,
            "_build_setta_auth_headers",
            lambda _server_id: {"Cookie": "setta_session=cookie-value"},
        )

        headers = client._build_http_headers(SETTA_MCP_SERVER_ID, config)

        assert headers == {
            "Authorization": "Bearer custom-token",
            "Cookie": "setta_session=cookie-value",
        }

    def test_build_http_headers_excludes_setta_auth_for_non_setta_server(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        client = MultiMCPClient(
            {
                "github": MCPServerConfig(
                    transport="streamable_http",
                    url="http://localhost:9001/mcp",
                    http_headers={"X-Api-Key": "github-token"},
                )
            }
        )
        config = client.server_configs["github"]
        monkeypatch.setattr(
            client,
            "_build_setta_auth_headers",
            lambda server_id: (
                {"Cookie": "should-not-apply"}
                if server_id == SETTA_MCP_SERVER_ID
                else None
            ),
        )

        headers = client._build_http_headers("github", config)

        assert headers == {"X-Api-Key": "github-token"}
