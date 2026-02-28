import json
import signal
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

from fastapi import FastAPI
from fastapi.testclient import TestClient

from setta import trusted_frontend_origins as trusted_frontend_origins_module
from setta.launch import LaunchError
from setta.launcher_workspace_store import resolve_recent_workspaces_path
from setta.routers.launcher_home import router as launcher_home_router
from setta.trusted_frontend_origins import (
    TrustedFrontendOriginStore,
    TrustedFrontendOriginStoreError,
)
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


def test_launcher_directory_listing_filters_before_applying_entry_cap(
    tmp_path: Path,
    monkeypatch,
) -> None:
    app = _build_app()
    allowed = tmp_path / "allowed"
    listed_dir = allowed / "listed"
    outside = tmp_path / "outside"
    allowed.mkdir(parents=True, exist_ok=True)
    listed_dir.mkdir(parents=True, exist_ok=True)
    outside.mkdir(parents=True, exist_ok=True)

    monkeypatch.setenv("SETTA_LAUNCHER_ALLOWED_ROOTS", str(allowed))
    monkeypatch.setattr("setta.routers.launcher_home._MAX_DIRECTORY_ENTRIES", 3)

    # These entries sort first but resolve outside allowed roots, so they should
    # not consume the entry cap.
    for escaped_name in ("a-escape", "b-escape", "c-escape"):
        escape_target = outside / escaped_name
        escape_target.mkdir(parents=True, exist_ok=True)
        (listed_dir / escaped_name).symlink_to(escape_target, target_is_directory=True)

    for valid_name in ("z-valid-1", "z-valid-2", "z-valid-3", "z-valid-4"):
        (listed_dir / valid_name).mkdir(parents=True, exist_ok=True)

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.LIST_LAUNCHER_DIRECTORY.value}",
            json={"path": str(listed_dir)},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert [entry["name"] for entry in payload["entries"]] == [
        "z-valid-1",
        "z-valid-2",
        "z-valid-3",
    ]


def test_launcher_directory_listing_cap_counts_only_valid_entries(
    tmp_path: Path,
    monkeypatch,
) -> None:
    app = _build_app()
    allowed = tmp_path / "allowed"
    listed_dir = allowed / "listed"
    outside = tmp_path / "outside"
    allowed.mkdir(parents=True, exist_ok=True)
    listed_dir.mkdir(parents=True, exist_ok=True)
    outside.mkdir(parents=True, exist_ok=True)

    monkeypatch.setenv("SETTA_LAUNCHER_ALLOWED_ROOTS", str(allowed))
    monkeypatch.setattr("setta.routers.launcher_home._MAX_DIRECTORY_ENTRIES", 1)

    # One escaped symlink sorts first; cap=1 should still return the first valid
    # in-policy entry instead of an empty list.
    escaped_target = outside / "a-escape"
    escaped_target.mkdir(parents=True, exist_ok=True)
    (listed_dir / "a-escape").symlink_to(escaped_target, target_is_directory=True)
    (listed_dir / "b-valid").mkdir(parents=True, exist_ok=True)
    (listed_dir / "c-valid").mkdir(parents=True, exist_ok=True)

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.LIST_LAUNCHER_DIRECTORY.value}",
            json={"path": str(listed_dir)},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert [entry["name"] for entry in payload["entries"]] == ["b-valid"]


def test_launcher_directory_listing_supports_cursor_pagination(
    tmp_path: Path,
    monkeypatch,
) -> None:
    app = _build_app()
    allowed = tmp_path / "allowed"
    listed_dir = allowed / "listed"
    allowed.mkdir(parents=True, exist_ok=True)
    listed_dir.mkdir(parents=True, exist_ok=True)
    for name in ("alpha", "beta", "gamma", "delta"):
        (listed_dir / name).mkdir(parents=True, exist_ok=True)

    monkeypatch.setenv("SETTA_LAUNCHER_ALLOWED_ROOTS", str(allowed))

    with TestClient(app) as client:
        first = client.post(
            f"{Route.PREFIX.value}{Route.LIST_LAUNCHER_DIRECTORY.value}",
            json={"path": str(listed_dir), "pageSize": 2},
        )
        assert first.status_code == 200
        first_payload = first.json()
        assert first_payload["ok"] is True
        assert first_payload["hasMore"] is True
        assert first_payload["nextCursor"] is not None
        assert len(first_payload["entries"]) == 2
        first_names = {entry["name"] for entry in first_payload["entries"]}

        second = client.post(
            f"{Route.PREFIX.value}{Route.LIST_LAUNCHER_DIRECTORY.value}",
            json={
                "path": str(listed_dir),
                "pageSize": 2,
                "cursor": first_payload["nextCursor"],
            },
        )
        assert second.status_code == 200
        second_payload = second.json()
        assert second_payload["ok"] is True
        assert len(second_payload["entries"]) == 2
        second_names = {entry["name"] for entry in second_payload["entries"]}

    assert first_names.isdisjoint(second_names)
    assert first_names | second_names == {"alpha", "beta", "gamma", "delta"}


def test_launcher_directory_listing_rejects_invalid_cursor(
    tmp_path: Path,
    monkeypatch,
) -> None:
    app = _build_app()
    allowed = tmp_path / "allowed"
    listed_dir = allowed / "listed"
    allowed.mkdir(parents=True, exist_ok=True)
    listed_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("SETTA_LAUNCHER_ALLOWED_ROOTS", str(allowed))

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.LIST_LAUNCHER_DIRECTORY.value}",
            json={"path": str(listed_dir), "cursor": "-1"},
        )

    assert response.status_code == 200
    payload = response.json()
    # Cursor parsing should fail closed instead of silently accepting malformed values.
    assert payload["ok"] is False
    assert payload["error"]["code"] == "BadRequest"


def test_launcher_directory_listing_scan_cap_reports_explicit_truncation(
    tmp_path: Path,
    monkeypatch,
) -> None:
    app = _build_app()
    allowed = tmp_path / "allowed"
    listed_dir = allowed / "listed"
    allowed.mkdir(parents=True, exist_ok=True)
    listed_dir.mkdir(parents=True, exist_ok=True)
    for name in ("alpha", "beta", "gamma", "delta"):
        (listed_dir / name).mkdir(parents=True, exist_ok=True)

    monkeypatch.setenv("SETTA_LAUNCHER_ALLOWED_ROOTS", str(allowed))
    monkeypatch.setattr("setta.routers.launcher_home._MAX_DIRECTORY_SCAN_ENTRIES", 3)

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.LIST_LAUNCHER_DIRECTORY.value}",
            json={"path": str(listed_dir), "pageSize": 2, "cursor": "3"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["entries"] == []
    assert payload["hasMore"] is False
    assert payload["nextCursor"] is None
    assert payload["truncated"] is True


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
    trusted_origin_store = TrustedFrontendOriginStore(
        storage_path=tmp_path / "trusted_frontend_origins.json"
    )
    allowed.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(
        trusted_frontend_origins_module,
        "_TRUSTED_FRONTEND_ORIGIN_STORE",
        trusted_origin_store,
    )
    monkeypatch.setenv("SETTA_LAUNCHER_ALLOWED_ROOTS", str(allowed))

    captured: dict[str, object] = {}

    def fake_launch_workspace_session(**kwargs):
        captured.update(kwargs)
        resolved_workspace = Path(str(kwargs["workspace_root"])).resolve(strict=False)
        session = SimpleNamespace(
            id="session-1",
            host="127.0.0.1",
            port=61234,
            pid=12345,
        )
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
        "setta.routers.launcher_home.load_current_session_secret",
        lambda: (SimpleNamespace(id="launcher-session"), b"launcher-secret"),
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
    assert (
        trusted_origin_store.is_trusted(
            session_id="launcher-session",
            origin="http://127.0.0.1:61234",
            now=0,
        )
        is True
    )


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
        session = SimpleNamespace(
            id="session-1",
            host="127.0.0.1",
            port=61234,
            pid=12345,
        )
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


def test_open_launcher_workspace_fails_when_trust_persistence_fails(
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
    removed_sessions: list[str] = []
    kill_calls: list[tuple[int, int]] = []

    class _Registry:
        def load_secret(self, _session: object) -> bytes:
            return b"secret"

        def delete_session(self, session_id: str) -> None:
            removed_sessions.append(session_id)

    def fake_launch_workspace_session(**kwargs):
        resolved_workspace = Path(str(kwargs["workspace_root"])).resolve(strict=False)
        session = SimpleNamespace(id="session-1", host="127.0.0.1", port=61234, pid=12345)
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
        return SimpleNamespace(
            session=session,
            paths=paths,
            registry=_Registry(),
            started_new=True,
        )

    monkeypatch.setattr(
        "setta.routers.launcher_home.launch_workspace_session",
        fake_launch_workspace_session,
    )
    monkeypatch.setattr(
        "setta.routers.launcher_home.load_current_session_secret",
        lambda: (SimpleNamespace(id="launcher-session"), b"launcher-secret"),
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
    monkeypatch.setattr(
        "setta.routers.launcher_home.trust_launched_workspace_origin_for_launcher_session",
        lambda **_kwargs: (_ for _ in ()).throw(
            TrustedFrontendOriginStoreError("store unavailable")
        ),
    )
    monkeypatch.setattr(
        "setta.routers.launcher_home.os.kill",
        lambda pid, sig: kill_calls.append((pid, sig)),
    )

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.OPEN_LAUNCHER_WORKSPACE.value}",
            json={
                "workspaceRoot": str(workspace),
                "settaHome": str(setta_home),
                "createIfMissing": False,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is False
    assert payload["error"]["code"] == "TrustedFrontendOriginStoreUnavailable"
    assert kill_calls == [(12345, signal.SIGTERM)]
    assert removed_sessions == ["session-1"]


def test_open_launcher_workspace_does_not_cleanup_reused_session_on_trust_failure(
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
    removed_sessions: list[str] = []
    kill_calls: list[tuple[int, int]] = []

    class _Registry:
        def load_secret(self, _session: object) -> bytes:
            return b"secret"

        def delete_session(self, session_id: str) -> None:
            removed_sessions.append(session_id)

    def fake_launch_workspace_session(**kwargs):
        resolved_workspace = Path(str(kwargs["workspace_root"])).resolve(strict=False)
        session = SimpleNamespace(id="session-1", host="127.0.0.1", port=61234, pid=12345)
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
        return SimpleNamespace(
            session=session,
            paths=paths,
            registry=_Registry(),
            started_new=False,
        )

    monkeypatch.setattr(
        "setta.routers.launcher_home.launch_workspace_session",
        fake_launch_workspace_session,
    )
    monkeypatch.setattr(
        "setta.routers.launcher_home.load_current_session_secret",
        lambda: (SimpleNamespace(id="launcher-session"), b"launcher-secret"),
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
    monkeypatch.setattr(
        "setta.routers.launcher_home.trust_launched_workspace_origin_for_launcher_session",
        lambda **_kwargs: (_ for _ in ()).throw(
            TrustedFrontendOriginStoreError("store unavailable")
        ),
    )
    monkeypatch.setattr(
        "setta.routers.launcher_home.os.kill",
        lambda pid, sig: kill_calls.append((pid, sig)),
    )

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.OPEN_LAUNCHER_WORKSPACE.value}",
            json={
                "workspaceRoot": str(workspace),
                "settaHome": str(setta_home),
                "createIfMissing": False,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is False
    assert payload["error"]["code"] == "TrustedFrontendOriginStoreUnavailable"
    assert kill_calls == []
    assert removed_sessions == []


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


def test_open_launcher_workspace_profile_preserves_omitted_setta_files_location(
    tmp_path: Path,
    monkeypatch,
) -> None:
    app = _build_app()
    allowed = tmp_path / "allowed"
    workspace = allowed / "workspace"
    allowed.mkdir(parents=True, exist_ok=True)
    workspace.mkdir(parents=True, exist_ok=True)

    monkeypatch.setenv("SETTA_LAUNCHER_ALLOWED_ROOTS", str(allowed))
    captured: dict[str, object] = {}

    def fake_launch_workspace_session(**kwargs):
        captured["setta_files_location"] = kwargs.get("setta_files_location")
        raise LaunchError("Captured", "intentional capture")

    monkeypatch.setattr(
        "setta.routers.launcher_home.launch_workspace_session",
        fake_launch_workspace_session,
    )

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.OPEN_LAUNCHER_WORKSPACE.value}",
            json={
                "workspaceRoot": str(workspace),
                "profile": "dev",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is False
    assert payload["error"]["code"] == "Captured"
    assert captured["setta_files_location"] is None


def test_open_launcher_workspace_explicit_auto_overrides_profile(
    tmp_path: Path,
    monkeypatch,
) -> None:
    app = _build_app()
    allowed = tmp_path / "allowed"
    workspace = allowed / "workspace"
    allowed.mkdir(parents=True, exist_ok=True)
    workspace.mkdir(parents=True, exist_ok=True)

    monkeypatch.setenv("SETTA_LAUNCHER_ALLOWED_ROOTS", str(allowed))
    captured: dict[str, object] = {}

    def fake_launch_workspace_session(**kwargs):
        captured["setta_files_location"] = kwargs.get("setta_files_location")
        raise LaunchError("Captured", "intentional capture")

    monkeypatch.setattr(
        "setta.routers.launcher_home.launch_workspace_session",
        fake_launch_workspace_session,
    )

    with TestClient(app) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.OPEN_LAUNCHER_WORKSPACE.value}",
            json={
                "workspaceRoot": str(workspace),
                "profile": "dev",
                "settaFilesLocation": "auto",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is False
    assert payload["error"]["code"] == "Captured"
    assert captured["setta_files_location"] == "auto"
