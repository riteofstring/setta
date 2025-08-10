from typing import Any, Callable

from fastapi import APIRouter

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
