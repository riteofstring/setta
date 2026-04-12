from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from setta.routers.launch import router as launch_router
from setta.types.routes import Route


def test_launch_route_blocked_in_share_mode() -> None:
    app = FastAPI()
    app.state.setta = SimpleNamespace(share_mode=True, deployment_mode=True)
    app.include_router(launch_router, prefix=Route.PREFIX.value)

    with TestClient(app) as client:
        response = client.post(f"{Route.PREFIX.value}{Route.LAUNCH.value}", json={})
    assert response.status_code == 403
