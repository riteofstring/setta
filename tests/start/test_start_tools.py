import json
import unittest

from click.testing import CliRunner

import setta.mcp.tools  # noqa: F401
import setta.project_state.base_project_manager  # noqa: F401
from setta.mcp.tool_setup import SETTA_INIT_MCP_TOOLS, SETTA_MCP_TOOLS
from setta.start import tools


class ToolsCommandTests(unittest.TestCase):
    def test_tools_output_matches_registry(self) -> None:
        runner = CliRunner()
        result = runner.invoke(tools, [])

        self.assertEqual(result.exit_code, 0, result.output)
        payload = json.loads(result.output)
        self.assertIsInstance(payload, list)

        tool_names = sorted(tool["name"] for tool in payload)
        expected = sorted(
            {fn.__name__ for fn in SETTA_INIT_MCP_TOOLS + SETTA_MCP_TOOLS}
        )
        self.assertEqual(tool_names, expected)

    def test_tools_omit_hidden_fields(self) -> None:
        runner = CliRunner()
        result = runner.invoke(tools, [])

        self.assertEqual(result.exit_code, 0, result.output)
        payload = json.loads(result.output)
        entry = next(
            (tool for tool in payload if tool.get("name") == "create_top_level_section"),
            None,
        )
        self.assertIsNotNone(entry)
        schema = entry["inputSchema"]
        properties = schema.get("properties", {})
        self.assertNotIn("implOverrides", properties)
        self.assertNotIn("topLevelSections", properties)
        self.assertNotIn("viewportBounds", properties)


if __name__ == "__main__":
    unittest.main()
