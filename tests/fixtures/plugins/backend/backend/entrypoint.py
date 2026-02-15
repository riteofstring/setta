from fastapi import APIRouter
from pydantic import BaseModel


def _build_literal_dependency_event(
    *,
    section_id: str,
    payload: str,
    timestamp_ms: int,
) -> dict[str, object]:
    return {
        "dependencyKey": {
            "type": "Section",
            "sectionId": section_id,
        },
        "payload": {
            "type": "Literal",
            "payload": payload,
        },
        "timestampMs": timestamp_ms,
    }


class EmitListenerPayload(BaseModel):
    projectConfigId: str
    sectionId: str
    payload: str
    timestampMs: int = 1
    shareSessionId: str | None = None


class ListenerEndpointPayload(BaseModel):
    projectConfigId: str
    sectionId: str
    payload: str
    shareSessionId: str | None = None


def register(plugin):
    router = APIRouter()

    @router.get("/health")
    def get_health() -> dict[str, str]:
        return {
            "pluginId": plugin.plugin_id,
            "status": "ok",
        }

    @router.get("/project-state-summary")
    def get_project_state_summary(
        projectConfigId: str,
        shareSessionId: str | None = None,
    ) -> dict[str, object]:
        return {
            "projectState": plugin.read_project_state(
                project_config_id=projectConfigId,
                share_session_id=shareSessionId,
                view="summary",
            ),
            "view": "summary",
        }

    @router.post("/emit-listener")
    def post_emit_listener(
        payload: EmitListenerPayload,
    ) -> dict[str, object]:
        effective_timestamp = payload.timestampMs if payload.timestampMs > 0 else 1
        plugin.emit_listener_dependency_event(
            project_config_id=payload.projectConfigId,
            share_session_id=payload.shareSessionId,
            dependency_events=[
                _build_literal_dependency_event(
                    section_id=payload.sectionId,
                    payload=payload.payload,
                    timestamp_ms=effective_timestamp,
                )
            ],
        )
        return {
            "emitted": True,
            "projectConfigId": payload.projectConfigId,
            "sectionId": payload.sectionId,
            "timestampMs": effective_timestamp,
        }

    @router.post("/listener-endpoint")
    def fixture_listener_endpoint(
        payload: ListenerEndpointPayload,
    ) -> dict[str, object]:
        plugin.emit_listener_dependency_event(
            project_config_id=payload.projectConfigId,
            share_session_id=payload.shareSessionId,
            dependency_events=[
                _build_literal_dependency_event(
                    section_id=payload.sectionId,
                    payload=payload.payload,
                    timestamp_ms=123,
                )
            ],
        )
        return {
            "ok": True,
            "projectConfigId": payload.projectConfigId,
            "sectionId": payload.sectionId,
        }

    plugin.register_router(router)
    plugin.register_listener_endpoint("fixture_listener_endpoint")

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
