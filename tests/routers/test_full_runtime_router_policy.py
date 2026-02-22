from fastapi.routing import APIRoute
import pytest

from setta.routers.app_spec_streaming import router as app_spec_streaming_router
from setta.routers.agentic import router as agentic_router
from setta.routers.dependencies import require_full_ide_runtime, require_ide_mode
from setta.routers.llm import router as llm_router
from setta.routers.lsp import router as lsp_router
from setta.routers.mcp_tools import router as mcp_tools_router
from setta.routers.projects import router as projects_router
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
        Route.TOOLS_CALL.value,
        Route.RESTART_LANGUAGE_SERVER.value,
        Route.TYPE_CHECK.value,
        Route.STREAM_APP_SPEC.value,
        Route.LOAD_ALL_PROJECT_METADATA.value,
        Route.LLM_CONFIG.value,
        Route.LLM_API_KEYS.value,
        Route.GET_EXTERNAL_AGENT_HEALTH.value,
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
        ],
    )
    dependency_calls = {
        dependency.dependency
        for dependency in route.dependencies
    }
    assert require_full_ide_runtime in dependency_calls
    assert require_ide_mode not in dependency_calls
