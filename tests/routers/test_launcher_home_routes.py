from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from setta.routers.launcher_home import router as launcher_home_router
from setta.types.routes import Route


def _build_app(*, deployment_mode: bool = False, launcher_mode: bool = False) -> FastAPI:
    app = FastAPI()
    app.state.setta = SimpleNamespace(
        deployment_mode=deployment_mode,
        launcher_mode=launcher_mode,
        share_mode=False,
        app_mode=False,
    )
    app.include_router(launcher_home_router, prefix=Route.PREFIX.value)
    return app


def test_get_launcher_app_mode_reports_current_state() -> None:
    app = _build_app(launcher_mode=True)

    with TestClient(app) as client:
        response = client.get(f"{Route.PREFIX.value}{Route.GET_LAUNCHER_APP_MODE.value}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["launcherMode"] is True


def test_launcher_recent_workspaces_add_pin_remove_roundtrip(
    tmp_path: Path,
    monkeypatch,
) -> None:
    app = _build_app()
    setta_home = tmp_path / "setta-home"
    workspace = tmp_path / "workspace-a"
    workspace.mkdir(parents=True, exist_ok=True)

    monkeypatch.setenv("SETTA_LAUNCHER_ALLOWED_ROOTS", str(tmp_path))

    with TestClient(app) as client:
        add_response = client.post(
            f"{Route.PREFIX.value}{Route.ADD_LAUNCHER_RECENT_WORKSPACE.value}",
            json={
                "settaHome": str(setta_home),
                "workspaceRoot": str(workspace),
            },
        )
        assert add_response.status_code == 200
        add_payload = add_response.json()
        assert add_payload["ok"] is True
        assert add_payload["workspaces"][0]["workspaceRoot"] == str(
            workspace.resolve(strict=False)
        )
        assert add_payload["workspaces"][0]["pinned"] is False

        pin_response = client.post(
            f"{Route.PREFIX.value}{Route.PIN_LAUNCHER_RECENT_WORKSPACE.value}",
            json={
                "settaHome": str(setta_home),
                "workspaceRoot": str(workspace),
                "pinned": True,
            },
        )
        assert pin_response.status_code == 200
        pin_payload = pin_response.json()
        assert pin_payload["ok"] is True
        assert pin_payload["workspaces"][0]["pinned"] is True

        remove_response = client.post(
            f"{Route.PREFIX.value}{Route.REMOVE_LAUNCHER_RECENT_WORKSPACE.value}",
            json={
                "settaHome": str(setta_home),
                "workspaceRoot": str(workspace),
            },
        )
        assert remove_response.status_code == 200
        remove_payload = remove_response.json()
        assert remove_payload["ok"] is True
        assert remove_payload["workspaces"] == []


def test_launcher_directory_listing_rejects_outside_allowed_roots(
    tmp_path: Path,
    monkeypatch,
) -> None:
    app = _build_app()
    allowed = tmp_path / "allowed"
    disallowed = tmp_path / "outside"
    allowed.mkdir(parents=True, exist_ok=True)
    disallowed.mkdir(parents=True, exist_ok=True)

    monkeypatch.setenv("SETTA_LAUNCHER_ALLOWED_ROOTS", str(allowed))

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.LIST_LAUNCHER_DIRECTORY.value}",
            json={"path": str(disallowed)},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is False
    assert payload["error"]["code"] == "PathOutsideAllowedRoots"


def test_open_launcher_workspace_rejects_symlink_escape(
    tmp_path: Path,
    monkeypatch,
) -> None:
    app = _build_app()
    allowed = tmp_path / "allowed"
    outside = tmp_path / "outside"
    symlink_path = allowed / "escape"
    allowed.mkdir(parents=True, exist_ok=True)
    outside.mkdir(parents=True, exist_ok=True)
    symlink_path.symlink_to(outside, target_is_directory=True)

    monkeypatch.setenv("SETTA_LAUNCHER_ALLOWED_ROOTS", str(allowed))

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.OPEN_LAUNCHER_WORKSPACE.value}",
            json={"workspaceRoot": str(symlink_path)},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is False
    assert payload["error"]["code"] == "PathOutsideAllowedRoots"


def test_open_launcher_workspace_returns_bootstrap_fragment(
    tmp_path: Path,
    monkeypatch,
) -> None:
    app = _build_app()
    allowed = tmp_path / "allowed"
    setta_home = tmp_path / "setta-home"
    workspace = allowed / "new-workspace"
    allowed.mkdir(parents=True, exist_ok=True)

    monkeypatch.setenv("SETTA_LAUNCHER_ALLOWED_ROOTS", str(allowed))

    captured: dict[str, object] = {}

    def fake_launch_workspace_session(**kwargs):
        captured.update(kwargs)
        resolved_workspace = Path(str(kwargs["workspace_root"])).resolve(strict=False)
        session = SimpleNamespace(id="session-1", host="127.0.0.1", port=61234)
        paths = SimpleNamespace(
            workspace_root=resolved_workspace,
            setta_files_location="local",
            setta_files_root=(resolved_workspace / "setta_files").resolve(strict=False),
            runtime_root=(resolved_workspace / "setta_files" / "runtime").resolve(
                strict=False
            ),
            setta_home=setta_home.resolve(strict=False),
            profile_name=None,
        )
        registry = SimpleNamespace(load_secret=lambda _session: b"secret")
        return SimpleNamespace(
            session=session,
            paths=paths,
            registry=registry,
            started_new=True,
        )

    monkeypatch.setattr(
        "setta.routers.launcher_home.launch_workspace_session",
        fake_launch_workspace_session,
    )
    monkeypatch.setattr(
        "setta.routers.launcher_home.BOOTSTRAP_TOKEN_MANAGER.mint",
        lambda *_a, **_k: "tok",
    )
    monkeypatch.setattr(
        "setta.routers.launcher_home.build_bootstrap_urls",
        lambda host, port, token: (
            f"http://{host}:{port}/__setta__/bootstrap#token={token}",
            f"http://{host}:{port}/__setta__/bootstrap",
        ),
    )

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.OPEN_LAUNCHER_WORKSPACE.value}",
            json={
                "workspaceRoot": str(workspace),
                "settaHome": str(setta_home),
                "createIfMissing": True,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["workspaceRoot"] == str(workspace.resolve(strict=False))
    assert payload["bootstrapUrlFragment"].endswith("#token=tok")
    assert captured["server_mode"] == "ide"
    assert Path(str(captured["workspace_root"])).resolve(strict=False) == workspace.resolve(
        strict=False
    )
    assert workspace.exists()
