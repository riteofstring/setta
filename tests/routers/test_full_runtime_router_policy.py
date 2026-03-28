from fastapi.routing import APIRoute
import pytest

from setta.routers.ai import router as ai_router
from setta.routers.app_spec_streaming import router as app_spec_streaming_router
from setta.routers.agentic import router as agentic_router
from setta.routers.artifact import router as artifact_router
from setta.routers.attachments import router as attachments_router
from setta.routers.git import router as git_router
from setta.routers.dependencies import (
    require_full_ide_runtime,
    require_ide_mode,
    require_not_launcher_mode,
)
from setta.routers.llm import router as llm_router
from setta.routers.listener import router as listener_router
from setta.routers.lsp import router as lsp_router
from setta.routers.mcp_tools import router as mcp_tools_router
from setta.routers.project_manager import router as project_manager_router
from setta.routers.projects import router as projects_router
from setta.routers.runs import router as runs_router
from setta.routers.sections import router as sections_router
from setta.routers.terminals import terminals_http_router
from setta.types.routes import Route


def _find_api_route(*, route_path: str, routers: list) -> APIRoute:
    for router in routers:
        for route in router.routes:
            if isinstance(route, APIRoute) and route.path == route_path:
                return route
    raise AssertionError(f"Missing route in test setup: {route_path}")


@pytest.mark.parametrize(
    "route_path",
    [
        Route.RESTART_LANGUAGE_SERVER.value,
        Route.TYPE_CHECK.value,
        Route.STREAM_APP_SPEC.value,
        Route.LOAD_ALL_PROJECT_METADATA.value,
        Route.LLM_CONFIG.value,
        Route.LLM_API_KEYS.value,
        Route.GET_EXTERNAL_AGENT_HEALTH.value,
        Route.GET_AI_FOLLOW_SNAPSHOT.value,
        Route.GET_LISTENER_COVERAGE.value,
        Route.CREATE_CHAT.value,
    ],
)
def test_full_runtime_routes_use_full_runtime_guard(route_path: str) -> None:
    route = _find_api_route(
        route_path=route_path,
        routers=[
            mcp_tools_router,
            lsp_router,
            app_spec_streaming_router,
            projects_router,
            llm_router,
            agentic_router,
            ai_router,
            listener_router,
        ],
    )
    dependency_calls = {dependency.dependency for dependency in route.dependencies}
    assert require_full_ide_runtime in dependency_calls
    assert require_ide_mode not in dependency_calls


@pytest.mark.parametrize(
    "route_path",
    [
        Route.TOOLS_CALL.value,
        Route.UPDATE_ARTIFACTS.value,
        Route.GET_ATTACHMENT_DOWNLOAD_URL.value,
        Route.GET_ATTACHMENT_DOWNLOAD_URLS.value,
        Route.DELETE_TERMINALS.value,
        Route.GET_LATEST_PROJECT_STATE.value,
        Route.RUN_DETACHED.value,
        Route.CREATE_FILE.value,
        Route.GET_GIT_STATUS.value,
    ],
)
def test_non_launcher_routes_use_non_launcher_guard(route_path: str) -> None:
    route = _find_api_route(
        route_path=route_path,
        routers=[
            mcp_tools_router,
            artifact_router,
            attachments_router,
            terminals_http_router,
            project_manager_router,
            runs_router,
            sections_router,
            git_router,
        ],
    )
    dependency_calls = {dependency.dependency for dependency in route.dependencies}
    assert require_not_launcher_mode in dependency_calls
