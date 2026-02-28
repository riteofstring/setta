import os
import sys
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from setta.launcher_metadata import (
    build_launcher_install_metadata,
    write_launcher_install_metadata,
)
from setta.routers.status import router as status_router
from setta.types.routes import Route


def _build_app(
    *, deployment_mode: bool = False, launcher_mode: bool = False
) -> FastAPI:
    app = FastAPI()
    app.state.setta = SimpleNamespace(
        deployment_mode=deployment_mode,
        launcher_mode=launcher_mode,
    )
    app.include_router(status_router, prefix=Route.PREFIX.value)
    return app


def test_launcher_status_route_reports_not_installed() -> None:
    app = _build_app()

    with TestClient(app) as client:
        response = client.get(f"{Route.PREFIX.value}{Route.GET_LAUNCHER_STATUS.value}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["installed"] is False
    assert payload["updateCapability"] == "unsupported"


def test_launcher_status_route_honors_setta_home_query(tmp_path: Path) -> None:
    app = _build_app()
    scoped_setta_home = (tmp_path / "scoped-setta-home").resolve(strict=False)

    with TestClient(app) as client:
        response = client.get(
            f"{Route.PREFIX.value}{Route.GET_LAUNCHER_STATUS.value}",
            params={"setta_home": str(scoped_setta_home)},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["settaHome"] == str(scoped_setta_home)


def test_launcher_status_route_blank_setta_home_uses_backend_default(
    tmp_path: Path,
    monkeypatch,
) -> None:
    app = _build_app()
    default_setta_home = (tmp_path / "default-setta-home").resolve(strict=False)
    monkeypatch.setattr(
        "setta.routers.launcher_scope.get_setta_paths",
        lambda: SimpleNamespace(setta_home=default_setta_home),
    )

    with TestClient(app) as client:
        response = client.get(
            f"{Route.PREFIX.value}{Route.GET_LAUNCHER_STATUS.value}",
            params={"setta_home": "   "},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["settaHome"] == str(default_setta_home)


def test_setup_and_remove_launcher_routes_roundtrip() -> None:
    app = _build_app()

    with TestClient(app) as client:
        setup_response = client.post(
            f"{Route.PREFIX.value}{Route.SETUP_LAUNCHER.value}",
            json={
                "channel": "uv-tool",
                "installSource": "uv-tool",
                "openMode": "chrome-app",
                "workspaceBehavior": "always-prompt",
                "installArtifacts": False,
            },
        )

        assert setup_response.status_code == 200
        setup_payload = setup_response.json()
        assert setup_payload["ok"] is True
        assert setup_payload["installed"] is True
        assert setup_payload["channel"] == "uv-tool"
        assert setup_payload["workspaceBehavior"] == "always_prompt"
        assert setup_payload["updateCapability"] == "in_app"

        remove_response = client.post(
            f"{Route.PREFIX.value}{Route.REMOVE_LAUNCHER.value}"
        )
        assert remove_response.status_code == 200
        remove_payload = remove_response.json()
        assert remove_payload["ok"] is True
        assert remove_payload["installed"] is False


def test_setup_launcher_route_rejects_unknown_managed_artifacts_field(
    tmp_path: Path,
) -> None:
    app = _build_app()

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.SETUP_LAUNCHER.value}",
            json={
                "channel": "manual",
                "openMode": "browser",
                "installArtifacts": False,
                "managedArtifacts": {"manual": str(tmp_path / "artifact")},
            },
        )

    assert response.status_code == 422


def test_setup_launcher_route_preserves_existing_identity_when_fields_omitted(
    tmp_path: Path,
) -> None:
    app = _build_app()
    setta_home = (tmp_path / "scoped-setta-home").resolve(strict=False)
    target = tmp_path / "python"
    target.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    target.chmod(0o755)

    metadata = build_launcher_install_metadata(
        target_command=[str(target), "-m", "setta"],
        channel="uv-tool",
        install_source="uv_tool",
        artifact_ownership_token="route-setup-preserve-token",
        setta_version="1.2.3",
        setta_home=setta_home,
        open_mode="browser",
        workspace_behavior="always_prompt",
        artifact_options={"app_name": "Setta Custom"},
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=metadata)

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.SETUP_LAUNCHER.value}",
            json={
                "settaHome": str(setta_home),
                "installArtifacts": False,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["channel"] == "uv-tool"
    assert payload["openMode"] == "browser"
    assert payload["workspaceBehavior"] == "always_prompt"
    assert payload["artifactOptions"] == {"app_name": "Setta Custom"}
    assert payload["updateCapability"] == "in_app"


def test_setup_launcher_route_preserves_no_artifact_mode_when_install_flag_omitted(
    tmp_path: Path,
    monkeypatch,
) -> None:
    app = _build_app()
    setta_home = (tmp_path / "scoped-setta-home").resolve(strict=False)
    target = tmp_path / "python"
    target.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    target.chmod(0o755)

    metadata = build_launcher_install_metadata(
        target_command=[str(target), "-m", "setta"],
        channel="uv-tool",
        install_source="uv_tool",
        artifact_ownership_token="route-setup-preserve-install-mode-token",
        setta_version="1.2.3",
        setta_home=setta_home,
        open_mode="browser",
        managed_artifacts={},
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=metadata)

    monkeypatch.setattr(
        "setta.launcher_setup.install_current_platform_artifacts",
        lambda **_kwargs: (_ for _ in ()).throw(
            AssertionError(
                "install_current_platform_artifacts should not run when installArtifacts is omitted for no-artifact installs."
            )
        ),
    )

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.SETUP_LAUNCHER.value}",
            json={
                "settaHome": str(setta_home),
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["managedArtifacts"] == {}


def test_setup_launcher_route_clears_artifact_options_when_explicitly_empty(
    tmp_path: Path,
) -> None:
    app = _build_app()
    setta_home = (tmp_path / "scoped-setta-home").resolve(strict=False)
    target = tmp_path / "python"
    target.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    target.chmod(0o755)

    metadata = build_launcher_install_metadata(
        target_command=[str(target), "-m", "setta"],
        channel="uv-tool",
        install_source="uv_tool",
        artifact_ownership_token="route-setup-clear-artifact-options-token",
        setta_version="1.2.3",
        setta_home=setta_home,
        open_mode="browser",
        workspace_behavior="always_prompt",
        artifact_options={"app_name": "Setta Custom"},
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=metadata)

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.SETUP_LAUNCHER.value}",
            json={
                "settaHome": str(setta_home),
                "installArtifacts": False,
                "artifactOptions": {},
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["artifactOptions"] == {}


def test_repair_launcher_route_rebinds_missing_target(tmp_path: Path) -> None:
    app = _build_app()
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    missing_target = tmp_path / "missing-python"
    metadata = build_launcher_install_metadata(
        target_command=[str(missing_target), "-m", "setta"],
        channel="manual",
        install_source="unsupported",
        artifact_ownership_token="route-repair-token",
        setta_version="1.2.3",
        setta_home=setta_home,
        open_mode="browser",
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=metadata)

    with TestClient(app) as client:
        response = client.post(f"{Route.PREFIX.value}{Route.REPAIR_LAUNCHER.value}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["targetValid"] is True
    assert payload["targetCommand"][0] == str(
        Path(sys.executable).resolve(strict=False)
    )


def test_update_launcher_route_reports_installer_managed_channel(
    tmp_path: Path,
) -> None:
    app = _build_app()
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    target = tmp_path / "python"
    target.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    target.chmod(0o755)
    metadata = build_launcher_install_metadata(
        target_command=[str(target), "-m", "setta"],
        channel="macos-script",
        install_source="installer_managed",
        artifact_ownership_token="route-update-token",
        setta_version="1.2.3",
        setta_home=setta_home,
        open_mode="browser",
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=metadata)

    with TestClient(app) as client:
        response = client.post(f"{Route.PREFIX.value}{Route.UPDATE_LAUNCHER.value}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is False
    assert payload["error"]["code"] == "UpdateUnavailable"


def test_launcher_management_routes_blocked_in_deployment_mode() -> None:
    app = _build_app(deployment_mode=True)

    with TestClient(app) as client:
        response = client.get(f"{Route.PREFIX.value}{Route.GET_LAUNCHER_STATUS.value}")

    assert response.status_code == 403


def test_launcher_management_routes_blocked_in_launcher_mode() -> None:
    app = _build_app(launcher_mode=True)

    with TestClient(app) as client:
        status_response = client.get(
            f"{Route.PREFIX.value}{Route.GET_LAUNCHER_STATUS.value}"
        )
        setup_response = client.post(
            f"{Route.PREFIX.value}{Route.SETUP_LAUNCHER.value}"
        )
        repair_response = client.post(
            f"{Route.PREFIX.value}{Route.REPAIR_LAUNCHER.value}"
        )
        remove_response = client.post(
            f"{Route.PREFIX.value}{Route.REMOVE_LAUNCHER.value}"
        )
        update_response = client.post(
            f"{Route.PREFIX.value}{Route.UPDATE_LAUNCHER.value}"
        )

    assert status_response.status_code == 403
    assert setup_response.status_code == 403
    assert repair_response.status_code == 403
    assert remove_response.status_code == 403
    assert update_response.status_code == 403
