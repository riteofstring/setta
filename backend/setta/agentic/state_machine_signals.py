from setta.mcp.namespacing import (
    SETTA_MCP_SERVER_ID,
    build_namespaced_tool_name,
    normalize_mcp_tool_name,
)

REPORT_STATE_MACHINE_SIGNAL_TOOL_NAME = "report_state_machine_signal"
REPORT_STATE_MACHINE_SIGNAL_NAMESPACED_TOOL_NAME = build_namespaced_tool_name(
    SETTA_MCP_SERVER_ID,
    REPORT_STATE_MACHINE_SIGNAL_TOOL_NAME,
)


def is_report_state_machine_signal_tool(tool_name: str | None) -> bool:
    normalized = normalize_mcp_tool_name(tool_name)
    if normalized is None:
        return False
    return normalized == REPORT_STATE_MACHINE_SIGNAL_NAMESPACED_TOOL_NAME
