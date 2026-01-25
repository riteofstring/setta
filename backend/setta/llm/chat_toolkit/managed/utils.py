from setta.mcp.namespacing import SETTA_MCP_SERVER_ID, split_namespaced_tool_name


def is_setta_tool_name(tool_name: str) -> bool:
    server_id, _ = split_namespaced_tool_name(tool_name)
    return server_id == SETTA_MCP_SERVER_ID
