from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from setta.routers.settings import router as settings_router
from setta.types.generated.settings_state import SettingsState
from setta.types.routes import Route


async def _wait_until_ready() -> None:
    return


def test_load_settings_is_blocked_in_launcher_mode() -> None:
    # Launcher mode should fail fast without touching deferred settings state.
    app = FastAPI()
    app.state.setta = SimpleNamespace(
        deployment_mode=False,
        launcher_mode=True,
        wait_until_ready=_wait_until_ready,
        settings_file=SimpleNamespace(
            load_settings=lambda: (_ for _ in ()).throw(
                AssertionError("load_settings should be blocked in launcher mode.")
            ),
        ),
    )
    app.include_router(settings_router, prefix=Route.PREFIX.value)

    with TestClient(app) as client:
        response = client.post(f"{Route.PREFIX.value}{Route.LOAD_SETTINGS.value}")

    assert response.status_code == 403
    assert response.json()["detail"] == "Launcher mode does not allow this endpoint."


def test_load_settings_succeeds_in_ide_mode() -> None:
    # IDE mode keeps the existing happy-path contract.
    app = FastAPI()
    expected_settings = SettingsState()
    load_settings_called = False

    def load_settings() -> SettingsState:
        nonlocal load_settings_called
        load_settings_called = True
        return expected_settings

    app.state.setta = SimpleNamespace(
        deployment_mode=False,
        launcher_mode=False,
        wait_until_ready=_wait_until_ready,
        settings_file=SimpleNamespace(load_settings=load_settings),
    )
    app.include_router(settings_router, prefix=Route.PREFIX.value)

    with TestClient(app) as client:
        response = client.post(f"{Route.PREFIX.value}{Route.LOAD_SETTINGS.value}")

    assert response.status_code == 200
    assert load_settings_called
    assert response.json() == expected_settings.model_dump(mode="json")


def test_save_settings_is_blocked_in_launcher_mode() -> None:
    # Save follows the same full-runtime guard as load in launcher mode.
    app = FastAPI()
    app.state.setta = SimpleNamespace(
        deployment_mode=False,
        launcher_mode=True,
        wait_until_ready=_wait_until_ready,
        settings_file=SimpleNamespace(
            settings=SettingsState(),
            save_settings=lambda _settings: (_ for _ in ()).throw(
                AssertionError("save_settings should be blocked in launcher mode.")
            ),
        ),
    )
    app.include_router(settings_router, prefix=Route.PREFIX.value)

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.SAVE_SETTINGS.value}",
            json={"settings": SettingsState().model_dump(mode="json")},
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "Launcher mode does not allow this endpoint."
