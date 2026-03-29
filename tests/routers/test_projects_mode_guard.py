from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from setta.routers.projects import router as projects_router
from setta.types.routes import Route


class _LauncherModeState:
    deployment_mode = False
    launcher_mode = True

    def __init__(self) -> None:
        # If the mode guard regresses, this assertion makes the failure obvious.
        self.project_manager_switcher = SimpleNamespace(
            main=SimpleNamespace(
                get_all_project_metadata=lambda: (_ for _ in ()).throw(
                    AssertionError(
                        "Project metadata should be blocked before runtime access."
                    )
                )
            )
        )

    async def wait_until_ready(self) -> None:
        return


def test_load_all_project_metadata_is_blocked_in_launcher_mode() -> None:
    app = FastAPI()
    app.state.setta = _LauncherModeState()
    app.include_router(projects_router, prefix=Route.PREFIX.value)

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.LOAD_ALL_PROJECT_METADATA.value}",
            json={},
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "Launcher mode does not allow this endpoint."
