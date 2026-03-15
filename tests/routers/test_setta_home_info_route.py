from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from setta.routers.status import router as status_router
from setta.types.routes import Route
from setta.utils.paths import get_setta_paths
from setta.utils.setta_home import resolve_setta_home
from setta.utils.user_config import load_setta_user_config
from tests.utils.setta_paths import temporary_setta_paths


def test_setta_home_info_route_returns_resolved_paths() -> None:
    app = FastAPI()
    app.state.setta = SimpleNamespace(deployment_mode=False, launcher_mode=False)
    app.include_router(status_router, prefix=Route.PREFIX.value)

    expected_home = resolve_setta_home()
    expected_global_base = load_setta_user_config(
        setta_home=expected_home
    ).global_setta_files_base
    expected_paths = get_setta_paths()

    with TestClient(app) as client:
        response = client.get(f"{Route.PREFIX.value}{Route.GET_SETTA_HOME_INFO.value}")

    assert response.status_code == 200
    assert response.json() == {
        "settaHome": str(expected_home),
        "globalSettaFilesBase": str(expected_global_base),
        "activeSettaFilesLocation": expected_paths.setta_files_location,
        "llmConfigPath": str(expected_paths.setta_files_root / "llm_config.json"),
    }


def test_setta_home_info_route_blocked_in_deployment_mode() -> None:
    app = FastAPI()
    app.state.setta = SimpleNamespace(deployment_mode=True, launcher_mode=False)
    app.include_router(status_router, prefix=Route.PREFIX.value)

    with TestClient(app) as client:
        response = client.get(f"{Route.PREFIX.value}{Route.GET_SETTA_HOME_INFO.value}")

    assert response.status_code == 403


def test_setta_home_info_route_blocked_in_launcher_mode() -> None:
    app = FastAPI()
    app.state.setta = SimpleNamespace(deployment_mode=False, launcher_mode=True)
    app.include_router(status_router, prefix=Route.PREFIX.value)

    with TestClient(app) as client:
        response = client.get(f"{Route.PREFIX.value}{Route.GET_SETTA_HOME_INFO.value}")

    assert response.status_code == 403


def test_setta_home_info_route_reports_custom_setta_files_location_when_explicit_root(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    setta_files_root = workspace_root / "setta_files_dev"
    setta_files_root.mkdir()

    app = FastAPI()
    app.state.setta = SimpleNamespace(deployment_mode=False, launcher_mode=False)
    app.include_router(status_router, prefix=Route.PREFIX.value)

    with temporary_setta_paths(
        workspace_root=workspace_root, setta_files_root=setta_files_root
    ):
        with TestClient(app) as client:
            response = client.get(
                f"{Route.PREFIX.value}{Route.GET_SETTA_HOME_INFO.value}"
            )

    assert response.status_code == 200
    assert response.json()["activeSettaFilesLocation"] == "custom"
    assert response.json()["llmConfigPath"] == str(setta_files_root / "llm_config.json")
