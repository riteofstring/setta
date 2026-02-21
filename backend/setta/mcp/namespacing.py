MCP_TOOL_NAME_SEPARATOR = "__"
SETTA_MCP_SERVER_ID = "setta"


def build_namespaced_tool_name(server_id: str, tool_name: str) -> str:
    return f"{server_id}{MCP_TOOL_NAME_SEPARATOR}{tool_name}"


def split_namespaced_tool_name(tool_name: str) -> tuple[str | None, str]:
    if MCP_TOOL_NAME_SEPARATOR not in tool_name:
        return None, tool_name
    server_id, tool_basename = tool_name.split(MCP_TOOL_NAME_SEPARATOR, 1)
    return server_id, tool_basename
