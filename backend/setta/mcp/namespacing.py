MCP_TOOL_NAME_SEPARATOR = "__"
SETTA_MCP_SERVER_ID = "setta"


def build_namespaced_tool_name(server_id: str, tool_name: str) -> str:
    return f"{server_id}{MCP_TOOL_NAME_SEPARATOR}{tool_name}"


def split_namespaced_tool_name(tool_name: str) -> tuple[str | None, str]:
    if MCP_TOOL_NAME_SEPARATOR not in tool_name:
        return None, tool_name
    server_id, tool_basename = tool_name.split(MCP_TOOL_NAME_SEPARATOR, 1)
    return server_id, tool_basename


def normalize_mcp_tool_name(tool_name: str | None) -> str | None:
    if not isinstance(tool_name, str):
        return None
    normalized = tool_name.strip()
    if not normalized:
        return None
    if normalized.startswith("mcp__"):
        normalized = normalized[len("mcp__") :]
    setta_single_prefix = f"{SETTA_MCP_SERVER_ID}_"
    setta_double_prefix = f"{SETTA_MCP_SERVER_ID}{MCP_TOOL_NAME_SEPARATOR}"
    if normalized.startswith(setta_single_prefix) and not normalized.startswith(
        setta_double_prefix
    ):
        normalized = (
            f"{SETTA_MCP_SERVER_ID}{MCP_TOOL_NAME_SEPARATOR}"
            f"{normalized[len(setta_single_prefix) :]}"
        )
    return normalized
