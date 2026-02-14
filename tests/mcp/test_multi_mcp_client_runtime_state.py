from mcp.types import Tool

from setta.mcp.client import MultiMCPClient
from setta.types.llm_config import MCPServerConfig


def _build_server_configs() -> dict[str, MCPServerConfig]:
    return {
        "setta": MCPServerConfig(
            transport="sse",
            url="http://127.0.0.1:8000/mcp",
        ),
        "github": MCPServerConfig(
            transport="streamable_http",
            url="http://127.0.0.1:9000/mcp",
        ),
    }


def _build_tool(name: str) -> Tool:
    return Tool(
        name=name,
        description="",
        inputSchema={},
        annotations=None,
    )


def test_runtime_state_reports_connectivity_tool_counts_and_errors() -> None:
    client = MultiMCPClient(_build_server_configs())

    # Fresh clients should expose all configured servers in disconnected state.
    initial = client.get_runtime_state()
    by_id = {entry.serverId: entry for entry in initial.servers}
    assert set(by_id.keys()) == {"setta", "github"}
    assert by_id["setta"].connected is False
    assert by_id["setta"].toolCount == 0
    assert by_id["setta"].error is None
    assert initial.generatedAtMs > 0

    # Tool cache refresh should update counts + timestamps for the server.
    client._update_tool_cache_for_server("github", [_build_tool("search_repo")])
    after_refresh = client.get_runtime_state()
    refreshed_by_id = {entry.serverId: entry for entry in after_refresh.servers}
    assert refreshed_by_id["github"].toolCount == 1
    assert refreshed_by_id["github"].refreshedAtMs is not None

    # Runtime errors should be reflected in diagnostics state.
    client._set_runtime_error("github", "Connection failed")
    after_error = client.get_runtime_state()
    errored = {entry.serverId: entry for entry in after_error.servers}["github"]
    assert errored.error == "Connection failed"
    assert errored.refreshedAtMs is not None
