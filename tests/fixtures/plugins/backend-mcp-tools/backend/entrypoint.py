def register(plugin):
    def read_tool(*, value: str) -> str:
        return f"read:{plugin.plugin_id}:{value}"

    def write_tool(*, value: str) -> str:
        return f"write:{plugin.plugin_id}:{value}"

    plugin.register_mcp_tool(
        read_tool,
        name="setta_fixture_mcp_read",
        annotations={"accessType": "read"},
    )
    plugin.register_mcp_tool(
        write_tool,
        name="setta_fixture_mcp_write",
        annotations={"accessType": "write"},
    )
