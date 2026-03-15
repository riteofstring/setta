import asyncio
from contextlib import AsyncExitStack, asynccontextmanager
from dataclasses import dataclass
from typing import Any

import anyio
import httpx
import mcp.types as mcp_types
import pytest
from mcp.shared.message import SessionMessage
from mcp.types import Tool, ToolAnnotations

import setta.mcp.client as client_mod
from setta.auth.cookies import auth_cookie_name
from setta.mcp.client import BridgeConfig, MissingMCPEnvVarError, MultiMCPClient
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.mcp.tool_metadata import SettaToolAnnotations, SettaToolType
from setta.sessions.registry import SessionMetadata
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


@dataclass
class _BridgeStreams:
    stdio_input_send: Any
    stdio_read: Any
    stdio_write: Any
    stdio_output_read: Any
    backend_input_send: Any
    backend_read: Any
    backend_write: Any
    backend_output_read: Any


def _create_bridge_streams() -> _BridgeStreams:
    stdio_input_send, stdio_read = anyio.create_memory_object_stream(1)
    stdio_write, stdio_output_read = anyio.create_memory_object_stream(1)
    backend_input_send, backend_read = anyio.create_memory_object_stream(1)
    backend_write, backend_output_read = anyio.create_memory_object_stream(1)
    return _BridgeStreams(
        stdio_input_send=stdio_input_send,
        stdio_read=stdio_read,
        stdio_write=stdio_write,
        stdio_output_read=stdio_output_read,
        backend_input_send=backend_input_send,
        backend_read=backend_read,
        backend_write=backend_write,
        backend_output_read=backend_output_read,
    )


def _build_session_message(method: str, message_id: int) -> SessionMessage:
    return SessionMessage(
        mcp_types.JSONRPCRequest(
            jsonrpc="2.0",
            id=message_id,
            method=method,
        )
    )


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
        assert client.init_tool_definitions[
            f"{SETTA_MCP_SERVER_ID}__read_file_range"
        ] == {
            "type": "function",
            "function": {
                "name": f"{SETTA_MCP_SERVER_ID}__read_file_range",
                "description": "Read file contents",
                "parameters": {},
            },
        }
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


class TestRunStdioBridge:
    @pytest.mark.asyncio
    async def test_uses_current_session_cookie_when_available(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        session_metadata = SessionMetadata(
            id="sess-1",
            workspacePath="/tmp/workspace",
            workspacePathCanonical="/tmp/workspace",
            host="127.0.0.1",
            port=8000,
            pid=123,
            secretPath="/tmp/secret",
            serverMode="ide",
        )
        streams = _create_bridge_streams()
        sse_calls: list[tuple[str, dict[str, str]]] = []
        streams.stdio_input_send.close()
        streams.backend_input_send.close()

        @asynccontextmanager
        async def _stdio_server():
            yield streams.stdio_read, streams.stdio_write

        @asynccontextmanager
        async def _sse_client(*, url: str, headers: dict[str, str]):
            sse_calls.append((url, headers))
            yield streams.backend_read, streams.backend_write

        monkeypatch.setattr(client_mod, "load_current_session_secret", lambda: (session_metadata, b"secret"))
        monkeypatch.setattr(
            client_mod.AUTH_COOKIE_MANAGER,
            "mint",
            lambda _session_id, _secret: "cookie-value",
        )
        monkeypatch.setattr(client_mod, "stdio_server", _stdio_server)
        monkeypatch.setattr(client_mod, "sse_client", _sse_client)

        await client_mod.run_stdio_bridge(
            BridgeConfig(backend_url="http://127.0.0.1:8000/mcp", verbose=False)
        )

        assert sse_calls == [
            (
                "http://127.0.0.1:8000/mcp",
                {
                    "Cookie": f"{auth_cookie_name(session_metadata.id)}=cookie-value"
                },
            )
        ]

    @pytest.mark.asyncio
    async def test_prefers_trimmed_bootstrap_token_over_session_secret(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        streams = _create_bridge_streams()
        sse_calls: list[tuple[str, dict[str, str]]] = []
        http_calls: list[tuple[str, dict[str, str]]] = []
        streams.stdio_input_send.close()
        streams.backend_input_send.close()

        @asynccontextmanager
        async def _stdio_server():
            yield streams.stdio_read, streams.stdio_write

        @asynccontextmanager
        async def _sse_client(*, url: str, headers: dict[str, str]):
            sse_calls.append((url, headers))
            yield streams.backend_read, streams.backend_write

        class _RecordingHTTPClient:
            async def post(self, url: str, json: dict[str, str]) -> httpx.Response:
                http_calls.append((url, json))
                return httpx.Response(
                    200,
                    headers={
                        "set-cookie": (
                            f"{auth_cookie_name('sess-bridge')}=bootstrap-cookie; Path=/"
                        )
                    },
                    request=httpx.Request("POST", url),
                )

        @asynccontextmanager
        async def _create_mcp_http_client():
            yield _RecordingHTTPClient()

        def _unexpected_session_lookup() -> None:
            raise AssertionError("bootstrap token flow should not read session auth")

        monkeypatch.setattr(client_mod, "load_current_session_secret", _unexpected_session_lookup)
        monkeypatch.setattr(client_mod, "create_mcp_http_client", _create_mcp_http_client)
        monkeypatch.setattr(client_mod, "stdio_server", _stdio_server)
        monkeypatch.setattr(client_mod, "sse_client", _sse_client)

        await client_mod.run_stdio_bridge(
            BridgeConfig(
                backend_url="http://127.0.0.1:8000/mcp",
                verbose=False,
                bootstrap_token="  bridge-token  ",
            )
        )

        assert http_calls == [
            (
                "http://127.0.0.1:8000"
                f"{client_mod.Route.BOOTSTRAP_CONSUME.value}",
                {"token": "bridge-token"},
            )
        ]
        assert sse_calls == [
            (
                "http://127.0.0.1:8000/mcp",
                {
                    "Cookie": (
                        f"{auth_cookie_name('sess-bridge')}=bootstrap-cookie"
                    )
                },
            )
        ]

    @pytest.mark.asyncio
    async def test_raises_when_no_bridge_auth_is_available(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(client_mod, "load_current_session_secret", lambda: None)

        with pytest.raises(ValueError, match="Missing MCP auth"):
            await client_mod.run_stdio_bridge(
                BridgeConfig(backend_url="http://127.0.0.1:8000/mcp", verbose=False)
            )

    @pytest.mark.asyncio
    async def test_forwards_messages_between_stdio_and_backend(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        session_metadata = SessionMetadata(
            id="sess-forward",
            workspacePath="/tmp/workspace",
            workspacePathCanonical="/tmp/workspace",
            host="127.0.0.1",
            port=8000,
            pid=123,
            secretPath="/tmp/secret",
            serverMode="ide",
        )
        streams = _create_bridge_streams()

        @asynccontextmanager
        async def _stdio_server():
            yield streams.stdio_read, streams.stdio_write

        @asynccontextmanager
        async def _sse_client(*, url: str, headers: dict[str, str]):
            del url, headers
            yield streams.backend_read, streams.backend_write

        monkeypatch.setattr(
            client_mod,
            "load_current_session_secret",
            lambda: (session_metadata, b"secret"),
        )
        monkeypatch.setattr(
            client_mod.AUTH_COOKIE_MANAGER,
            "mint",
            lambda _session_id, _secret: "cookie-value",
        )
        monkeypatch.setattr(client_mod, "stdio_server", _stdio_server)
        monkeypatch.setattr(client_mod, "sse_client", _sse_client)

        bridge_task = asyncio.create_task(
            client_mod.run_stdio_bridge(
                BridgeConfig(backend_url="http://127.0.0.1:8000/mcp", verbose=False)
            )
        )
        await asyncio.sleep(0)

        stdio_message = _build_session_message("stdio.method", 1)
        backend_message = _build_session_message("backend.method", 2)
        await streams.stdio_input_send.send(stdio_message)
        await streams.backend_input_send.send(backend_message)

        forwarded_to_backend = await streams.backend_output_read.receive()
        forwarded_to_stdio = await streams.stdio_output_read.receive()

        assert forwarded_to_backend is stdio_message
        assert forwarded_to_stdio is backend_message

        streams.stdio_input_send.close()
        streams.backend_input_send.close()
        await bridge_task


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
    @pytest.mark.asyncio
    async def test_open_transport_merges_config_and_setta_auth(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        session_metadata = SessionMetadata(
            id="sess-http",
            workspacePath="/tmp/workspace",
            workspacePathCanonical="/tmp/workspace",
            host="127.0.0.1",
            port=8000,
            pid=123,
            secretPath="/tmp/secret",
            serverMode="ide",
        )
        client = MultiMCPClient(
            {
                SETTA_MCP_SERVER_ID: MCPServerConfig(
                    transport="sse",
                    url="http://localhost:9000/mcp",
                    http_headers={"Authorization": "Bearer custom-token"},
                )
            }
        )
        config = client.server_configs[SETTA_MCP_SERVER_ID]
        sse_calls: list[tuple[str, dict[str, str] | None]] = []

        @asynccontextmanager
        async def _sse_client(*, url: str, headers: dict[str, str] | None):
            sse_calls.append((url, headers))
            read_send, read_stream = anyio.create_memory_object_stream(1)
            write_stream, write_receive = anyio.create_memory_object_stream(1)
            read_send.close()
            write_receive.close()
            yield read_stream, write_stream

        monkeypatch.setattr(
            client_mod,
            "load_current_session_secret",
            lambda: (session_metadata, b"secret"),
        )
        monkeypatch.setattr(
            client_mod.AUTH_COOKIE_MANAGER,
            "mint",
            lambda _session_id, _secret: "cookie-value",
        )
        monkeypatch.setattr(client_mod, "sse_client", _sse_client)

        async with AsyncExitStack() as stack:
            await client._open_transport(stack, SETTA_MCP_SERVER_ID, config)

        assert sse_calls == [
            (
                "http://localhost:9000/mcp",
                {
                    "Authorization": "Bearer custom-token",
                    "Cookie": f"{auth_cookie_name(session_metadata.id)}=cookie-value",
                },
            )
        ]

    @pytest.mark.asyncio
    async def test_open_transport_excludes_setta_auth_for_non_setta_server(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        client = MultiMCPClient(
            {
                "github": MCPServerConfig(
                    transport="sse",
                    url="http://localhost:9001/mcp",
                    http_headers={"X-Api-Key": "github-token"},
                )
            }
        )
        config = client.server_configs["github"]
        sse_calls: list[tuple[str, dict[str, str] | None]] = []

        @asynccontextmanager
        async def _sse_client(*, url: str, headers: dict[str, str] | None):
            sse_calls.append((url, headers))
            read_send, read_stream = anyio.create_memory_object_stream(1)
            write_stream, write_receive = anyio.create_memory_object_stream(1)
            read_send.close()
            write_receive.close()
            yield read_stream, write_stream

        def _unexpected_session_lookup() -> None:
            raise AssertionError("non-Setta server should not read Setta session auth")

        monkeypatch.setattr(
            client_mod,
            "load_current_session_secret",
            _unexpected_session_lookup,
        )
        monkeypatch.setattr(client_mod, "sse_client", _sse_client)

        async with AsyncExitStack() as stack:
            await client._open_transport(stack, "github", config)

        assert sse_calls == [
            (
                "http://localhost:9001/mcp",
                {"X-Api-Key": "github-token"},
            )
        ]
