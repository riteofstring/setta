from fastapi import APIRouter


def register(plugin):
    router = APIRouter()

    @router.get("/health")
    def get_health() -> dict[str, str]:
        return {
            "pluginId": plugin.plugin_id,
            "status": "ok",
        }

    plugin.register_router(router)

    def setta_fixture_backend_echo(*, value: str) -> str:
        return f"{plugin.plugin_id}:{value}"

    plugin.register_mcp_tool(
        setta_fixture_backend_echo,
        name="setta_fixture_backend_echo",
        annotations={"accessType": "read"},
    )
