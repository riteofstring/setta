from setta.mcp.tool_registry import build_setta_tool_manager, ensure_setta_mcp_tools_loaded


def test_delete_sections_tool_is_marked_destructive() -> None:
    ensure_setta_mcp_tools_loaded()
    tool_manager = build_setta_tool_manager()
    tools_by_name = {tool.name: tool for tool in tool_manager.list_tools()}
    delete_sections_tool = tools_by_name.get("delete_sections")
    assert delete_sections_tool is not None
    annotations = delete_sections_tool.annotations
    assert annotations is not None
    assert getattr(annotations, "approvalLevel", None) == "destructive"
