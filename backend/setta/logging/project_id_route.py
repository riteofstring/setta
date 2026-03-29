"""FastAPI route helpers for enriching logging context with project identifiers."""

from collections.abc import Awaitable, Callable
from typing import Any, Final, TypeVar

from fastapi import Request
from fastapi.routing import APIRoute

from setta.logging.context import get_logging_context, push_logging_context

_T = TypeVar("_T")

_REQUIRE_PROJECT_CONTEXT_ATTR: Final[str] = "__setta_require_project_context__"
_PROJECT_CONTEXT_BODY_KEY_ATTR: Final[str] = "__setta_project_context_body_key__"
_REQUIRE_PROJECT_CONTEXT_BY_DEFAULT_ATTR: Final[str] = (
    "__setta_require_project_context_by_default__"
)


def require_project_context(
    *,
    body_key: str = "projectConfigId",
) -> Callable[[Callable[..., _T]], Callable[..., _T]]:
    """Mark an endpoint as requiring a project id in the request JSON body."""

    def decorator(endpoint: Callable[..., _T]) -> Callable[..., _T]:
        setattr(endpoint, _REQUIRE_PROJECT_CONTEXT_ATTR, True)
        setattr(endpoint, _PROJECT_CONTEXT_BODY_KEY_ATTR, body_key)
        return endpoint

    return decorator


class ProjectIdContextRoute(APIRoute):
    """APIRoute that enriches logging context with a project id from JSON bodies.

    If an endpoint is decorated with `require_project_context`, the route enforces
    that the configured JSON body key exists (raising KeyError if missing).
    Otherwise, it does a best-effort lookup and no-ops when absent.
    """

    def get_route_handler(self) -> Callable[[Request], Awaitable[Any]]:
        original_handler = super().get_route_handler()
        require_context = bool(
            getattr(self.endpoint, _REQUIRE_PROJECT_CONTEXT_ATTR, False)
        )
        require_by_default = bool(
            getattr(self, _REQUIRE_PROJECT_CONTEXT_BY_DEFAULT_ATTR, False)
        )
        required = require_context or require_by_default

        default_body_key = str(
            getattr(self, _PROJECT_CONTEXT_BODY_KEY_ATTR, "projectConfigId")
        )
        body_key = str(
            getattr(self.endpoint, _PROJECT_CONTEXT_BODY_KEY_ATTR, default_body_key)
        )

        async def handler(request: Request) -> Any:
            if required and "project_config_id" not in get_logging_context():
                await _require_project_id_from_json_body(
                    request,
                    body_key=body_key,
                )
            return await original_handler(request)

        return handler


async def _require_project_id_from_json_body(
    request: Request,
    *,
    body_key: str,
) -> None:
    if request.method.upper() not in {"POST", "PUT", "PATCH", "DELETE"}:
        return

    body = await request.json()
    if not isinstance(body, dict):
        raise KeyError(body_key)

    value = body[body_key]
    if value is None:
        raise KeyError(body_key)

    push_logging_context(project_config_id=str(value))
