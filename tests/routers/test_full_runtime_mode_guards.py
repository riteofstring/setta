from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from setta.routers.app_spec_streaming import router as app_spec_streaming_router
from setta.routers.lsp import router as lsp_router
from setta.routers.mcp_tools import router as mcp_tools_router
from setta.types.routes import Route


class _DeferredRuntimeField:
    def __init__(self, field_name: str) -> None:
        self._field_name = field_name

    def __getattr__(self, _name: str):
        raise AssertionError(
            f"{self._field_name} should not be accessed in launcher mode."
        )


async def _wait_until_ready() -> None:
    return


def _build_launcher_mode_state(**extra_fields: object) -> SimpleNamespace:
    fields: dict[str, object] = {
        "deployment_mode": False,
        "launcher_mode": True,
        "wait_until_ready": _wait_until_ready,
    }
    fields.update(extra_fields)
    return SimpleNamespace(**fields)


def test_tools_call_is_blocked_in_launcher_mode() -> None:
    app = FastAPI()
    app.state.setta = _build_launcher_mode_state(
        mcp_server=_DeferredRuntimeField("mcp_server"),
    )
    app.include_router(mcp_tools_router)

    with TestClient(app) as client:
        response = client.post(
            Route.TOOLS_CALL.value,
            json={"tool": "get_latest_project_state_summary"},
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "Launcher mode does not allow this endpoint."


def test_restart_language_server_is_blocked_in_launcher_mode() -> None:
    app = FastAPI()
    app.state.setta = _build_launcher_mode_state(
        lsps=_DeferredRuntimeField("lsps"),
        lsp_readers=_DeferredRuntimeField("lsp_readers"),
        lsp_writers=_DeferredRuntimeField("lsp_writers"),
    )
    app.include_router(lsp_router, prefix=Route.PREFIX.value)

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.RESTART_LANGUAGE_SERVER.value}",
            json={},
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "Launcher mode does not allow this endpoint."


def test_type_check_is_blocked_in_launcher_mode() -> None:
    app = FastAPI()
    app.state.setta = _build_launcher_mode_state(
        project_manager_switcher=_DeferredRuntimeField("project_manager_switcher"),
    )
    app.include_router(lsp_router, prefix=Route.PREFIX.value)

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.TYPE_CHECK.value}",
            json={"projectConfigId": "proj-1"},
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "Launcher mode does not allow this endpoint."


def test_stream_app_spec_is_blocked_in_launcher_mode() -> None:
    app = FastAPI()
    app.state.setta = _build_launcher_mode_state(
        agent_runner=_DeferredRuntimeField("agent_runner"),
    )
    app.include_router(app_spec_streaming_router, prefix=Route.PREFIX.value)

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.STREAM_APP_SPEC.value}",
            json={"prompt": "Build a dashboard"},
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "Launcher mode does not allow this endpoint."

