from typing import Any

import anyio
import pytest
from mcp.types import Tool, ToolAnnotations

from setta.mcp.client import MultiMCPClient
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.mcp.tool_metadata import SettaToolAnnotations, SettaToolType
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
            accessType="write",
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
