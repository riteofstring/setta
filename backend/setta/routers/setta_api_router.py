from typing import Any, Callable

from fastapi import APIRouter

from setta.logging.project_id_route import ProjectIdContextRoute
from setta.types.routes import Route


class SettaAPIRouter(APIRouter):
    def websocket(self, path: Route, **kwargs: Any) -> Callable:  # type: ignore
        return super().websocket(path.value, **kwargs)

    def get(self, path: Route, **kwargs: Any) -> Callable:  # type: ignore
        return super().get(path.value, **kwargs)

    def post(self, path: Route, **kwargs: Any) -> Callable:  # type: ignore
        return super().post(path.value, **kwargs)

    def put(self, path: Route, **kwargs: Any) -> Callable:  # type: ignore
        return super().put(path.value, **kwargs)

    def delete(self, path: Route, **kwargs: Any) -> Callable:  # type: ignore
        return super().delete(path.value, **kwargs)

    def patch(self, path: Route, **kwargs: Any) -> Callable:  # type: ignore
        return super().patch(path.value, **kwargs)

    def options(self, path: Route, **kwargs: Any) -> Callable:  # type: ignore
        return super().options(path.value, **kwargs)

    def head(self, path: Route, **kwargs: Any) -> Callable:  # type: ignore
        return super().head(path.value, **kwargs)

    def trace(self, path: Route, **kwargs: Any) -> Callable:  # type: ignore
        return super().trace(path.value, **kwargs)


class SettaProjectContextAPIRouter(SettaAPIRouter):
    def __init__(
        self,
        *,
        require_project_context_by_default: bool = False,
        project_context_body_key: str = "projectConfigId",
        **kwargs: Any,
    ) -> None:
        self._setta_require_project_context_by_default = (
            require_project_context_by_default
        )
        self._setta_project_context_body_key = project_context_body_key
        super().__init__(route_class=ProjectIdContextRoute, **kwargs)

    def add_api_route(
        self, path: str, endpoint: Callable[..., Any], **kwargs: Any
    ) -> None:  # type: ignore[override]
        super().add_api_route(path, endpoint, **kwargs)
        route = self.routes[-1]
        if not isinstance(route, ProjectIdContextRoute):
            return
        setattr(
            route,
            "__setta_require_project_context_by_default__",
            self._setta_require_project_context_by_default,
        )
        setattr(
            route,
            "__setta_project_context_body_key__",
            self._setta_project_context_body_key,
        )
