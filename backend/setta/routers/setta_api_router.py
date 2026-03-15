from typing import Any, Callable

from fastapi import APIRouter, Depends

from setta.logging.project_id_route import ProjectIdContextRoute
from setta.routers.dependencies import (
    require_full_ide_runtime,
    require_not_launcher_mode,
)
from setta.types.routes import Route


def _prepend_router_dependency(
    dependencies: list[Any] | None,
    dependency: Any,
) -> list[Any]:
    if dependencies is None:
        return [dependency]
    return [dependency, *dependencies]


class SettaAPIRouter(APIRouter):
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


class SettaFullRuntimeAPIRouter(SettaAPIRouter):
    def __init__(self, **kwargs: Any) -> None:
        dependencies = _prepend_router_dependency(
            kwargs.pop("dependencies", None),
            Depends(require_full_ide_runtime),
        )
        super().__init__(dependencies=dependencies, **kwargs)


class SettaProjectContextFullRuntimeAPIRouter(SettaProjectContextAPIRouter):
    def __init__(
        self,
        *,
        require_project_context_by_default: bool = False,
        project_context_body_key: str = "projectConfigId",
        **kwargs: Any,
    ) -> None:
        dependencies = _prepend_router_dependency(
            kwargs.pop("dependencies", None),
            Depends(require_full_ide_runtime),
        )
        super().__init__(
            require_project_context_by_default=require_project_context_by_default,
            project_context_body_key=project_context_body_key,
            dependencies=dependencies,
            **kwargs,
        )


class SettaProjectContextNonLauncherAPIRouter(SettaProjectContextAPIRouter):
    def __init__(
        self,
        *,
        require_project_context_by_default: bool = False,
        project_context_body_key: str = "projectConfigId",
        **kwargs: Any,
    ) -> None:
        dependencies = _prepend_router_dependency(
            kwargs.pop("dependencies", None),
            Depends(require_not_launcher_mode),
        )
        super().__init__(
            require_project_context_by_default=require_project_context_by_default,
            project_context_body_key=project_context_body_key,
            dependencies=dependencies,
            **kwargs,
        )
