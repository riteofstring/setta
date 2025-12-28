import unittest

from setta.llm.config import _ensure_setta_mcp_server_url
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.types.llm_config import AllLLMConfigs, MCPServerConfig
from setta.utils.constants import C


class LLMConfigMcpUrlTests(unittest.TestCase):
    def setUp(self) -> None:
        self.original_host = C.HOST
        self.original_port = C.PORT
        self.addCleanup(self._restore_constants)

    def _restore_constants(self) -> None:
        C.HOST = self.original_host
        C.PORT = self.original_port

    def _build_config(self) -> AllLLMConfigs:
        return AllLLMConfigs(
            mcpServers={
                SETTA_MCP_SERVER_ID: MCPServerConfig(
                    transport="sse", url="http://example/mcp"
                )
            }
        )

    def test_ensure_setta_mcp_server_url_formats_host(self) -> None:
        cases = [
            ("0.0.0.0", "127.0.0.1"),
            ("::", "[::1]"),
            ("2001:db8::1", "[2001:db8::1]"),
        ]
        for host, expected in cases:
            with self.subTest(host=host):
                C.HOST = host
                C.PORT = 61234
                config = self._build_config()
                updated = _ensure_setta_mcp_server_url(config)
                self.assertEqual(
                    updated.mcpServers[SETTA_MCP_SERVER_ID].url,
                    f"http://{expected}:61234/mcp",
                )


if __name__ == "__main__":
    unittest.main()
