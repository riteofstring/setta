from fastapi import APIRouter


def register(plugin):
    router = APIRouter()

    @router.get("/info")
    def get_info() -> dict[str, str]:
        return {
            "pluginId": plugin.plugin_id,
            "kind": "backend-static-router",
        }

    plugin.register_router(router)
    plugin.register_static_dir("fixture", "backend/static")
