import pytest

from setta.llm.config import _ensure_setta_mcp_server_url
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.types.llm_config import AllLLMConfigs, MCPServerConfig
from setta.utils.constants import C


@pytest.fixture
def _restore_constants():
    original_host = C.HOST
    original_port = C.PORT
    try:
        yield
    finally:
        C.HOST = original_host
        C.PORT = original_port


def _build_config() -> AllLLMConfigs:
    return AllLLMConfigs(
        mcpServers={
            SETTA_MCP_SERVER_ID: MCPServerConfig(
                transport="sse", url="http://example/mcp"
            )
        }
    )


class TestLLMConfigMcpUrl:
    def test_ensure_setta_mcp_server_url_formats_host(
        self,
        _restore_constants,
    ) -> None:
        cases = [
            ("0.0.0.0", "127.0.0.1"),
            ("::", "[::1]"),
            ("2001:db8::1", "[2001:db8::1]"),
        ]
        for host, expected in cases:
            C.HOST = host
            C.PORT = 61234
            config = _build_config()
            updated = _ensure_setta_mcp_server_url(config)
            assert (
                updated.mcpServers[SETTA_MCP_SERVER_ID].url
                == f"http://{expected}:61234/mcp"
            ), host
