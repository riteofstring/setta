import json

from click.testing import CliRunner

import setta.mcp.tools  # noqa: F401
import setta.project_state.base_project_manager  # noqa: F401
from setta.mcp.tool_setup import SETTA_INIT_MCP_TOOLS, SETTA_MCP_TOOLS
from setta.start import tools


def test_tools_output_matches_registry() -> None:
    runner = CliRunner()
    result = runner.invoke(tools, [])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert isinstance(payload, list)

    tool_names = sorted(tool["name"] for tool in payload)
    expected = sorted({fn.__name__ for fn in SETTA_INIT_MCP_TOOLS + SETTA_MCP_TOOLS})
    assert tool_names == expected


def test_tools_omit_hidden_fields() -> None:
    runner = CliRunner()
    result = runner.invoke(tools, [])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    entry = next(
        (tool for tool in payload if tool.get("name") == "create_top_level_section"),
        None,
    )
    assert entry is not None
    schema = entry["inputSchema"]
    properties = schema.get("properties", {})
    assert "implOverrides" not in properties
    assert "topLevelSections" not in properties
    assert "viewportBounds" not in properties
