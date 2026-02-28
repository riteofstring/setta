from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from setta.routers.ai import router as ai_router
from setta.routers.app_spec_streaming import router as app_spec_streaming_router
from setta.routers.agentic import router as agentic_router
from setta.routers.artifact import router as artifact_router
from setta.routers.attachments import router as attachments_router
from setta.routers.git import router as git_router
from setta.routers.llm import router as llm_router
from setta.routers.listener import router as listener_router
from setta.routers.lsp import router as lsp_router
from setta.routers.mcp_tools import router as mcp_tools_router
from setta.routers.project_manager import router as project_manager_router
from setta.routers.runs import router as runs_router
from setta.routers.sections import router as sections_router
from setta.routers.terminals import terminals_http_router
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


def test_llm_config_is_blocked_in_launcher_mode() -> None:
    app = FastAPI()
    app.state.setta = _build_launcher_mode_state(
        agent_runner=_DeferredRuntimeField("agent_runner"),
    )
    app.include_router(llm_router, prefix=Route.PREFIX.value)

    with TestClient(app) as client:
        response = client.get(f"{Route.PREFIX.value}{Route.LLM_CONFIG.value}")

    assert response.status_code == 403
    assert response.json()["detail"] == "Launcher mode does not allow this endpoint."


def test_external_agent_health_is_blocked_in_launcher_mode() -> None:
    app = FastAPI()
    app.state.setta = _build_launcher_mode_state(
        external_agent_runner=_DeferredRuntimeField("external_agent_runner"),
    )
    app.include_router(agentic_router, prefix=Route.PREFIX.value)

    with TestClient(app) as client:
        response = client.get(
            f"{Route.PREFIX.value}{Route.GET_EXTERNAL_AGENT_HEALTH.value}"
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "Launcher mode does not allow this endpoint."


def test_get_ai_follow_snapshot_is_blocked_in_launcher_mode() -> None:
    # Full-runtime router guard must reject launcher requests before deferred fields are touched.
    app = FastAPI()
    app.state.setta = _build_launcher_mode_state(
        agent_runner=_DeferredRuntimeField("agent_runner"),
        external_agent_runner=_DeferredRuntimeField("external_agent_runner"),
    )
    app.include_router(ai_router, prefix=Route.PREFIX.value)

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.GET_AI_FOLLOW_SNAPSHOT.value}",
            json={"projectConfigId": "project-1"},
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "Launcher mode does not allow this endpoint."


def test_get_listener_coverage_is_blocked_in_launcher_mode() -> None:
    # Listener runtime dependencies should never be dereferenced in launcher mode.
    app = FastAPI()
    app.state.setta = _build_launcher_mode_state(
        wmh_python_script_receiver=_DeferredRuntimeField("wmh_python_script_receiver"),
        listener_registry=_DeferredRuntimeField("listener_registry"),
    )
    app.include_router(listener_router, prefix=Route.PREFIX.value)

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.GET_LISTENER_COVERAGE.value}",
            json={"projectConfigId": "project-1"},
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "Launcher mode does not allow this endpoint."


def test_update_artifacts_is_blocked_in_launcher_mode() -> None:
    app = FastAPI()
    app.state.setta = _build_launcher_mode_state(
        artifacts=_DeferredRuntimeField("artifacts"),
    )
    app.include_router(artifact_router, prefix=Route.PREFIX.value)

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.UPDATE_ARTIFACTS.value}",
            json={"artifacts": [], "uploadScope": "generic"},
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "Launcher mode does not allow this endpoint."


def test_get_attachment_download_url_is_blocked_in_launcher_mode() -> None:
    app = FastAPI()
    app.state.setta = _build_launcher_mode_state(
        artifacts=_DeferredRuntimeField("artifacts"),
    )
    app.include_router(attachments_router, prefix=Route.PREFIX.value)

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.GET_ATTACHMENT_DOWNLOAD_URL.value}",
            json={"artifactId": "artifacts/x"},
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "Launcher mode does not allow this endpoint."


def test_delete_terminals_is_blocked_in_launcher_mode() -> None:
    app = FastAPI()
    app.state.setta = _build_launcher_mode_state(
        terminals=_DeferredRuntimeField("terminals"),
    )
    app.include_router(terminals_http_router, prefix=Route.PREFIX.value)

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.DELETE_TERMINALS.value}",
            json={"sectionIds": []},
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "Launcher mode does not allow this endpoint."


def test_get_latest_project_state_is_blocked_in_launcher_mode() -> None:
    app = FastAPI()
    app.state.setta = _build_launcher_mode_state(
        project_manager_switcher=_DeferredRuntimeField("project_manager_switcher"),
    )
    app.include_router(project_manager_router, prefix=Route.PREFIX.value)

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.GET_LATEST_PROJECT_STATE.value}",
            json={"projectConfigId": "project-1"},
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "Launcher mode does not allow this endpoint."


def test_run_detached_is_blocked_in_launcher_mode() -> None:
    app = FastAPI()
    app.state.setta = _build_launcher_mode_state(
        project_manager_switcher=_DeferredRuntimeField("project_manager_switcher"),
        detached_run_manager=_DeferredRuntimeField("detached_run_manager"),
    )
    app.include_router(runs_router, prefix=Route.PREFIX.value)

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.RUN_DETACHED.value}",
            json={"projectConfigId": "project-1"},
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "Launcher mode does not allow this endpoint."


def test_create_file_is_blocked_in_launcher_mode() -> None:
    # Sections mutations must fail before any runtime context work in launcher mode.
    app = FastAPI()
    app.state.setta = _build_launcher_mode_state()
    app.include_router(sections_router, prefix=Route.PREFIX.value)

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.CREATE_FILE.value}",
            json={"filepath": "src/main.py"},
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "Launcher mode does not allow this endpoint."


def test_get_git_status_is_blocked_in_launcher_mode() -> None:
    # Git endpoints should remain inaccessible in launcher mode.
    app = FastAPI()
    app.state.setta = _build_launcher_mode_state()
    app.include_router(git_router, prefix=Route.PREFIX.value)

    with TestClient(app) as client:
        response = client.post(f"{Route.PREFIX.value}{Route.GET_GIT_STATUS.value}")

    assert response.status_code == 403
    assert response.json()["detail"] == "Launcher mode does not allow this endpoint."
