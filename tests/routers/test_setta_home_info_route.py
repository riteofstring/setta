from fastapi import FastAPI
from fastapi.testclient import TestClient

from setta.routers.status import router as status_router
from setta.types.routes import Route
from setta.utils.setta_home import resolve_setta_home, resolve_setta_user_config_path
from setta.utils.user_config import load_setta_user_config


def test_setta_home_info_route_returns_resolved_paths() -> None:
    app = FastAPI()
    app.include_router(status_router, prefix=Route.PREFIX.value)

    expected_home = resolve_setta_home()
    expected_config_path = resolve_setta_user_config_path(setta_home=expected_home)
    expected_global_base = load_setta_user_config(
        setta_home=expected_home
    ).global_setta_files_base

    with TestClient(app) as client:
        response = client.get(
            f"{Route.PREFIX.value}{Route.GET_SETTA_HOME_INFO.value}"
        )

    assert response.status_code == 200
    assert response.json() == {
        "settaHome": str(expected_home),
        "configPath": str(expected_config_path),
        "globalSettaFilesBase": str(expected_global_base),
    }

