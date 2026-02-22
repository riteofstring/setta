import json
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

from fastapi import FastAPI
from fastapi.testclient import TestClient

from setta.launcher_workspace_store import resolve_recent_workspaces_path
from setta.routers.launcher_home import router as launcher_home_router
from setta.types.routes import Route


def _build_app(*, deployment_mode: bool = False, launcher_mode: bool = True) -> FastAPI:
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
        response = client.get(
            f"{Route.PREFIX.value}{Route.GET_LAUNCHER_APP_MODE.value}"
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["launcherMode"] is True


def test_launcher_home_routes_are_blocked_outside_launcher_mode() -> None:
    app = _build_app(launcher_mode=False)

    with TestClient(app) as client:
        response = client.get(
            f"{Route.PREFIX.value}{Route.GET_LAUNCHER_RECENT_WORKSPACES.value}"
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "Launcher mode does not allow this endpoint."


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


def test_get_launcher_recent_workspaces_honors_setta_home_query(
    tmp_path: Path,
    monkeypatch,
) -> None:
    app = _build_app()
    setta_home = tmp_path / "setta-home-alt"
    workspace = tmp_path / "workspace-b"
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

        get_response = client.get(
            f"{Route.PREFIX.value}{Route.GET_LAUNCHER_RECENT_WORKSPACES.value}",
            params={"setta_home": str(setta_home)},
        )

    assert get_response.status_code == 200
    payload = get_response.json()
    assert payload["ok"] is True
    assert payload["workspaces"][0]["workspaceRoot"] == str(
        workspace.resolve(strict=False)
    )


def test_get_launcher_recent_workspaces_blank_scope_uses_backend_default_home(
    tmp_path: Path,
    monkeypatch,
) -> None:
    app = _build_app()
    default_setta_home = (tmp_path / "default-setta-home").resolve(strict=False)
    workspace = tmp_path / "workspace-default-home"
    workspace.mkdir(parents=True, exist_ok=True)

    monkeypatch.setenv("SETTA_LAUNCHER_ALLOWED_ROOTS", str(tmp_path))
    monkeypatch.setattr(
        "setta.routers.launcher_scope.get_setta_paths",
        lambda: SimpleNamespace(setta_home=default_setta_home),
    )

    with TestClient(app) as client:
        add_response = client.post(
            f"{Route.PREFIX.value}{Route.ADD_LAUNCHER_RECENT_WORKSPACE.value}",
            json={"workspaceRoot": str(workspace)},
        )
        assert add_response.status_code == 200

        get_response = client.get(
            f"{Route.PREFIX.value}{Route.GET_LAUNCHER_RECENT_WORKSPACES.value}",
            params={"setta_home": "   "},
        )

    assert get_response.status_code == 200
    payload = get_response.json()
    assert payload["ok"] is True
    assert len(payload["workspaces"]) == 1
    assert payload["workspaces"][0]["workspaceRoot"] == str(
        workspace.resolve(strict=False)
    )
    assert payload["workspaces"][0]["pinned"] is False


def test_get_launcher_recent_workspaces_prunes_outside_allowed_roots(
    tmp_path: Path,
    monkeypatch,
) -> None:
    app = _build_app()
    setta_home = (tmp_path / "setta-home-prune").resolve(strict=False)
    allowed_root = (tmp_path / "allowed").resolve(strict=False)
    allowed_workspace = (allowed_root / "workspace-ok").resolve(strict=False)
    blocked_workspace = (tmp_path / "blocked" / "workspace-stale").resolve(strict=False)
    allowed_workspace.mkdir(parents=True, exist_ok=True)
    blocked_workspace.mkdir(parents=True, exist_ok=True)

    monkeypatch.setenv("SETTA_LAUNCHER_ALLOWED_ROOTS", str(allowed_root))

    recent_path = resolve_recent_workspaces_path(setta_home=setta_home)
    recent_path.parent.mkdir(parents=True, exist_ok=True)
    recent_path.write_text(
        json.dumps(
            [
                {
                    "workspaceRoot": str(blocked_workspace),
                    "pinned": True,
                    "lastUsedAt": 9,
                },
                {
                    "workspaceRoot": str(allowed_workspace),
                    "pinned": False,
                    "lastUsedAt": 4,
                },
            ],
            indent=2,
            sort_keys=True,
        ),
        encoding="utf-8",
    )

    with TestClient(app) as client:
        get_response = client.get(
            f"{Route.PREFIX.value}{Route.GET_LAUNCHER_RECENT_WORKSPACES.value}",
            params={"setta_home": str(setta_home)},
        )

    assert get_response.status_code == 200
    payload = get_response.json()
    assert payload["ok"] is True
    assert payload["workspaces"] == [
        {
            "workspaceRoot": str(allowed_workspace),
            "pinned": False,
            "lastUsedAt": 4,
        }
    ]

    persisted_payload = json.loads(recent_path.read_text(encoding="utf-8"))
    assert persisted_payload == [
        {
            "workspaceRoot": str(allowed_workspace),
            "pinned": False,
            "lastUsedAt": 4,
        }
    ]


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
    hash_params = parse_qs(urlsplit(payload["bootstrapUrlFragment"]).fragment)
    assert hash_params.get("token") == ["tok"]
    assert hash_params.get("lo") == ["http://testserver"]
    assert len(hash_params.get("lop", [""])) == 1
    assert hash_params["lop"][0]
    assert captured["server_mode"] == "ide"
    assert Path(str(captured["workspace_root"])).resolve(
        strict=False
    ) == workspace.resolve(strict=False)
    assert workspace.exists()


def test_open_launcher_workspace_uses_backend_setta_home_when_scope_is_omitted(
    tmp_path: Path,
    monkeypatch,
) -> None:
    app = _build_app()
    allowed = tmp_path / "allowed"
    workspace = allowed / "workspace"
    default_setta_home = (tmp_path / "runtime-setta-home").resolve(strict=False)
    allowed.mkdir(parents=True, exist_ok=True)
    workspace.mkdir(parents=True, exist_ok=True)

    monkeypatch.setenv("SETTA_LAUNCHER_ALLOWED_ROOTS", str(allowed))
    monkeypatch.setattr(
        "setta.routers.launcher_scope.get_setta_paths",
        lambda: SimpleNamespace(setta_home=default_setta_home),
    )

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
            setta_home=default_setta_home,
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
                "createIfMissing": False,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert captured["setta_home"] == str(default_setta_home)


def test_open_launcher_workspace_rejects_dot_segments_for_create(
    tmp_path: Path,
    monkeypatch,
) -> None:
    app = _build_app()
    allowed = tmp_path / "allowed"
    allowed.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("SETTA_LAUNCHER_ALLOWED_ROOTS", str(allowed))

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.OPEN_LAUNCHER_WORKSPACE.value}",
            json={
                "workspaceRoot": str(allowed / ".." / "escape"),
                "createIfMissing": True,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is False
    assert payload["error"]["code"] == "BadRequest"
    assert "must not contain '.' or '..' segments" in payload["error"]["message"]


def test_open_launcher_workspace_ignores_metadata_update_os_errors(
    tmp_path: Path,
    monkeypatch,
) -> None:
    app = _build_app()
    allowed = tmp_path / "allowed"
    setta_home = tmp_path / "setta-home"
    workspace = allowed / "workspace"
    allowed.mkdir(parents=True, exist_ok=True)
    workspace.mkdir(parents=True, exist_ok=True)

    monkeypatch.setenv("SETTA_LAUNCHER_ALLOWED_ROOTS", str(allowed))

    def fake_launch_workspace_session(**kwargs):
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
        "setta.routers.launcher_home.update_launcher_last_used_workspace_if_installed",
        lambda **_kwargs: (_ for _ in ()).throw(OSError("disk full")),
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
                "createIfMissing": False,
                "settaHome": str(setta_home),
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
