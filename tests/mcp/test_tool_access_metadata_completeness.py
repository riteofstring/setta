from setta.mcp.tool_metadata import SettaToolType, get_tool_access
from setta.mcp.tool_registry import build_setta_tool_manager, ensure_setta_mcp_tools_loaded
from setta.mcp.tool_setup import SETTA_MCP_TOOLS


def test_discoverable_setta_tools_have_explicit_access_metadata() -> None:
    """Prevent silent tool filtering regressions when adding new Setta MCP tools.

    The agent runner filters discoverable tools based on the tool's `accessType`.
    If a Setta tool is added without explicit access metadata, it defaults to
    `structural` and can silently disappear from scoped chats.
    """

    ensure_setta_mcp_tools_loaded()
    tool_manager = build_setta_tool_manager()
    tools_by_name = {tool.name: tool for tool in tool_manager.list_tools()}

    missing_access: list[str] = []
    missing_targets: list[str] = []
    allow_no_targets = {"getInstalledPythonPackages", "get_agent_profile", "list_agent_profiles"}

    for fn in SETTA_MCP_TOOLS:
        tool_name = fn.__name__
        tool = tools_by_name.get(tool_name)
        if tool is None:
            missing_access.append(f"{tool_name} (not registered)")
            continue

        annotations = tool.annotations
        if annotations is None:
            missing_access.append(f"{tool_name} (missing annotations)")
            continue

        tool_type = getattr(annotations, "settaToolType", None)
        if tool_type not in (SettaToolType.discoverable, SettaToolType.discoverable.value):
            continue

        if get_tool_access(fn) is None:
            missing_access.append(tool_name)
            continue

        access_type = getattr(annotations, "accessType", None)
        id_paths = getattr(annotations, "idPathsByType", None) or {}
        result_filter = getattr(annotations, "resultFilter", None)
        default_singleton = getattr(annotations, "defaultTargetSingletonSection", None)
        if (
            access_type in ("read", "write")
            and not id_paths
            and result_filter is None
            and default_singleton is None
            and tool_name not in allow_no_targets
        ):
            missing_targets.append(tool_name)

    assert missing_access == []
    assert missing_targets == []

