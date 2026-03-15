def register(plugin):
    def setta_fixture_backend_echo(*, value: str) -> str:
        return f"{plugin.plugin_id}:{value}"

    plugin.register_mcp_tool(
        setta_fixture_backend_echo,
        name="setta_fixture_backend_echo",
        annotations={"accessType": "read"},
    )

    def setta_fixture_backend_project_summary(
        *,
        project_config_id: str,
        share_session_id: str | None = None,
    ) -> dict[str, object]:
        return plugin.read_project_state(
            project_config_id=project_config_id,
            share_session_id=share_session_id,
            view="summary",
        )

    plugin.register_mcp_tool(
        setta_fixture_backend_project_summary,
        name="setta_fixture_backend_project_summary",
        annotations={"accessType": "read"},
    )
