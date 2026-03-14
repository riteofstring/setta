from fastapi import APIRouter
from pydantic import BaseModel


class ListenerEndpointPayload(BaseModel):
    projectConfigId: str
    message: str


def register(plugin):
    router = APIRouter()

    @router.post("/listener-endpoint")
    def fixture_listener_endpoint(
        payload: ListenerEndpointPayload,
    ) -> dict[str, object]:
        return {
            "ok": True,
            "handledByPlugin": plugin.plugin_id,
            "projectConfigId": payload.projectConfigId,
            "message": payload.message,
        }

    plugin.register_router(router)
    plugin.register_listener_endpoint("fixture_listener_endpoint")
