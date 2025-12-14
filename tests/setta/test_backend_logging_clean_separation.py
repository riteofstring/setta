import unittest

from fastapi.routing import APIRoute, APIWebSocketRoute
from setta.middleware import bind_request_logging_context
from setta.server import app


def _collect_dependency_calls(dependant) -> set[object]:
    calls: set[object] = set()
    for dependency in dependant.dependencies:
        calls.add(dependency.call)
        calls.update(_collect_dependency_calls(dependency))
    return calls


class BackendLoggingCleanSeparationTests(unittest.TestCase):
    def test_server_has_no_global_logging_dependency(self) -> None:
        self.assertFalse(
            any(
                dependency.dependency is bind_request_logging_context
                for dependency in app.router.dependencies
            )
        )

    def test_websocket_routes_do_not_use_request_logging_dependency(self) -> None:
        websocket_paths: list[str] = []
        for route in app.router.routes:
            if not isinstance(route, APIWebSocketRoute):
                continue
            websocket_paths.append(route.path)
            dependency_calls = _collect_dependency_calls(route.dependant)
            self.assertNotIn(bind_request_logging_context, dependency_calls)

        self.assertTrue(websocket_paths)

    def test_http_routes_include_request_logging_dependency(self) -> None:
        matched_paths: list[str] = []
        for route in app.router.routes:
            if not isinstance(route, APIRoute):
                continue
            if not route.path.startswith("/api"):
                continue
            if route.path in {"/api/openapi.json", "/api/docs", "/api/redoc"}:
                continue
            dependency_calls = _collect_dependency_calls(route.dependant)
            if bind_request_logging_context in dependency_calls:
                matched_paths.append(route.path)

        self.assertTrue(matched_paths)


if __name__ == "__main__":
    unittest.main()
