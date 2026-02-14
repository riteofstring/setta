from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from setta.plugins.manager import PluginManager
from setta.routers.plugins import assets_router as plugins_assets_router
from setta.routers.plugins import router as plugins_router
from setta.types.routes import Route


def _fixture_plugin_root(name: str) -> Path:
    return Path(__file__).resolve().parents[1] / "fixtures" / "plugins" / name


def _build_test_app(
    *,
    manager: PluginManager,
    deployment_mode: bool,
) -> FastAPI:
    app = FastAPI()
    app.state.setta = SimpleNamespace(
        plugin_manager=manager,
        deployment_mode=deployment_mode,
    )
    app.include_router(plugins_assets_router)
    app.include_router(plugins_router, prefix=Route.PREFIX.value)
    return app


def test_plugin_routes_link_and_asset_roundtrip() -> None:
    # Linking a real plugin fixture should surface in list/status and serve assets.
    with TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        workspace_root = root / "workspace"
        setta_files_root = root / "setta_files"
        setta_home = root / "setta_home"
        workspace_root.mkdir(parents=True, exist_ok=True)
        setta_files_root.mkdir(parents=True, exist_ok=True)
        setta_home.mkdir(parents=True, exist_ok=True)
        manager = PluginManager(
            workspace_root=workspace_root,
            setta_files_root=setta_files_root,
            setta_home=setta_home,
            server_mode="ide",
            setta_version="0.1.0",
        )
        app = _build_test_app(manager=manager, deployment_mode=False)

        with TestClient(app) as client:
            link_response = client.post(
                f"{Route.PREFIX.value}{Route.PLUGINS_LINK.value}",
                json={
                    "localPluginRoot": str(_fixture_plugin_root("frontend")),
                    "scope": "workspace",
                    "enable": True,
                    "force": True,
                },
            )
            assert link_response.status_code == 200
            link_payload = link_response.json()
            assert link_payload["pluginId"] == "setta-fixture-frontend"
            assert link_payload["state"] == "active"

            list_response = client.get(f"{Route.PREFIX.value}{Route.PLUGINS_LIST.value}")
            assert list_response.status_code == 200
            list_payload = list_response.json()
            assert len(list_payload["plugins"]) == 1
            assert list_payload["plugins"][0]["pluginId"] == "setta-fixture-frontend"
            assert "registerPane" in list_payload["plugins"][0]["effectiveCapabilities"]

            status_response = client.get(
                f"{Route.PREFIX.value}{Route.PLUGINS_STATUS.value}"
            )
            assert status_response.status_code == 200
            status_payload = status_response.json()
            assert status_payload["plugins"][0]["state"] == "active"
            assert status_payload["plugins"][0]["sourceScopeLabel"] == "workspace"

            restart_capability_response = client.get(
                f"{Route.PREFIX.value}{Route.PLUGINS_RESTART_CAPABILITY.value}"
            )
            assert restart_capability_response.status_code == 200
            assert restart_capability_response.json() == {
                "mode": "manual",
                "command": "setta",
                "reason": "Programmatic restart is not available in this runtime.",
            }

            restart_response = client.post(
                f"{Route.PREFIX.value}{Route.PLUGINS_RESTART.value}",
            )
            assert restart_response.status_code == 200
            assert restart_response.json() == {
                "accepted": False,
                "mode": "manual",
                "command": "setta",
                "reason": "Programmatic restart is not available in this runtime.",
            }

            asset_response = client.get(
                "/plugins/setta-fixture-frontend/frontend/dist/index.js"
            )
            assert asset_response.status_code == 200
            assert "export const apiVersion = 1;" in asset_response.text

            disable_response = client.post(
                f"{Route.PREFIX.value}{Route.PLUGINS_DISABLE.value}",
                json={"pluginId": "setta-fixture-frontend"},
            )
            assert disable_response.status_code == 200
            assert disable_response.json()["state"] == "disabled"


def test_plugin_routes_backend_static_router_fixture_roundtrip() -> None:
    # Backend static/router fixture should be linkable through routes and serve both surfaces.
    with TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        workspace_root = root / "workspace"
        setta_files_root = root / "setta_files"
        setta_home = root / "setta_home"
        workspace_root.mkdir(parents=True, exist_ok=True)
        setta_files_root.mkdir(parents=True, exist_ok=True)
        setta_home.mkdir(parents=True, exist_ok=True)
        manager = PluginManager(
            workspace_root=workspace_root,
            setta_files_root=setta_files_root,
            setta_home=setta_home,
            server_mode="ide",
            setta_version="0.1.0",
        )
        app = _build_test_app(manager=manager, deployment_mode=False)

        with TestClient(app) as client:
            link_response = client.post(
                f"{Route.PREFIX.value}{Route.PLUGINS_LINK.value}",
                json={
                    "localPluginRoot": str(_fixture_plugin_root("backend-static-router")),
                    "scope": "workspace",
                    "enable": True,
                    "force": True,
                },
            )
            assert link_response.status_code == 200
            assert link_response.json()["pluginId"] == "setta-fixture-backend-static-router"
            assert link_response.json()["state"] == "pending_restart"

            manager.load_backend_plugins(app=app)

            status_response = client.get(
                f"{Route.PREFIX.value}{Route.PLUGINS_STATUS.value}"
            )
            assert status_response.status_code == 200
            status_payload = status_response.json()
            assert status_payload["plugins"][0]["pluginId"] == (
                "setta-fixture-backend-static-router"
            )
            assert status_payload["plugins"][0]["state"] == "active"

            api_response = client.get("/api/plugins/setta-fixture-backend-static-router/info")
            assert api_response.status_code == 200
            assert api_response.json() == {
                "pluginId": "setta-fixture-backend-static-router",
                "kind": "backend-static-router",
            }


def test_plugin_restart_routes_support_programmatic_mode() -> None:
    # Restart contract routes should expose programmatic mode when callback support exists.
    with TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        workspace_root = root / "workspace"
        setta_files_root = root / "setta_files"
        setta_home = root / "setta_home"
        workspace_root.mkdir(parents=True, exist_ok=True)
        setta_files_root.mkdir(parents=True, exist_ok=True)
        setta_home.mkdir(parents=True, exist_ok=True)
        restart_calls: list[str] = []

        def restart_callback() -> bool:
            restart_calls.append("called")
            return True

        manager = PluginManager(
            workspace_root=workspace_root,
            setta_files_root=setta_files_root,
            setta_home=setta_home,
            server_mode="ide",
            setta_version="0.1.0",
            restart_callback=restart_callback,
        )
        app = _build_test_app(manager=manager, deployment_mode=False)

        with TestClient(app) as client:
            capability_response = client.get(
                f"{Route.PREFIX.value}{Route.PLUGINS_RESTART_CAPABILITY.value}"
            )
            assert capability_response.status_code == 200
            assert capability_response.json() == {
                "mode": "programmatic",
                "command": None,
                "reason": None,
            }

            restart_response = client.post(
                f"{Route.PREFIX.value}{Route.PLUGINS_RESTART.value}"
            )
            assert restart_response.status_code == 200
            assert restart_response.json() == {
                "accepted": True,
                "mode": "programmatic",
                "command": None,
                "reason": None,
            }
        assert restart_calls == ["called"]


def test_plugin_mutation_routes_blocked_in_deployment_mode() -> None:
    # Deployment mode should block plugin mutation routes but still allow read routes.
    with TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        workspace_root = root / "workspace"
        setta_files_root = root / "setta_files"
        setta_home = root / "setta_home"
        workspace_root.mkdir(parents=True, exist_ok=True)
        setta_files_root.mkdir(parents=True, exist_ok=True)
        setta_home.mkdir(parents=True, exist_ok=True)
        manager = PluginManager(
            workspace_root=workspace_root,
            setta_files_root=setta_files_root,
            setta_home=setta_home,
            server_mode="share",
            setta_version="0.1.0",
        )
        app = _build_test_app(manager=manager, deployment_mode=True)

        with TestClient(app) as client:
            blocked_response = client.post(
                f"{Route.PREFIX.value}{Route.PLUGINS_LINK.value}",
                json={
                    "localPluginRoot": str(_fixture_plugin_root("frontend")),
                    "scope": "workspace",
                    "enable": True,
                    "force": True,
                },
            )
            assert blocked_response.status_code == 403
            assert (
                blocked_response.json()["detail"]
                == "Deployment mode does not allow this endpoint."
            )

            list_response = client.get(f"{Route.PREFIX.value}{Route.PLUGINS_LIST.value}")
            assert list_response.status_code == 200
            assert list_response.json()["plugins"] == []


def test_plugin_routes_config_and_lock_roundtrip() -> None:
    # Config write + lockfile endpoints should roundtrip deterministic JSON payloads.
    with TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        workspace_root = root / "workspace"
        setta_files_root = root / "setta_files"
        setta_home = root / "setta_home"
        workspace_root.mkdir(parents=True, exist_ok=True)
        setta_files_root.mkdir(parents=True, exist_ok=True)
        setta_home.mkdir(parents=True, exist_ok=True)
        manager = PluginManager(
            workspace_root=workspace_root,
            setta_files_root=setta_files_root,
            setta_home=setta_home,
            server_mode="ide",
            setta_version="0.1.0",
        )
        app = _build_test_app(manager=manager, deployment_mode=False)

        with TestClient(app) as client:
            link_response = client.post(
                f"{Route.PREFIX.value}{Route.PLUGINS_LINK.value}",
                json={
                    "localPluginRoot": str(_fixture_plugin_root("full")),
                    "scope": "workspace",
                    "enable": True,
                    "force": True,
                },
            )
            assert link_response.status_code == 200
            assert link_response.json()["pluginId"] == "setta-fixture-full"

            config_response = client.post(
                f"{Route.PREFIX.value}{Route.PLUGINS_CONFIG.value}",
                json={
                    "pluginId": "setta-fixture-full",
                    "config": {"enabled": True, "label": "fixture"},
                },
            )
            assert config_response.status_code == 200
            assert config_response.json()["pluginId"] == "setta-fixture-full"
            assert config_response.json()["validation"] == {"ok": True}

            lock_write_response = client.post(
                f"{Route.PREFIX.value}{Route.PLUGINS_LOCK_WRITE.value}"
            )
            assert lock_write_response.status_code == 200
            assert lock_write_response.json()["pluginCount"] == 1

            lock_apply_response = client.post(
                f"{Route.PREFIX.value}{Route.PLUGINS_LOCK_APPLY.value}",
                json={"check": True},
            )
            assert lock_apply_response.status_code == 200
            assert lock_apply_response.json()["applied"] is False


def test_plugin_routes_update_and_rollback_missing_plugin_errors() -> None:
    # Update/rollback routes should preserve PluginManagerError HTTP code mappings.
    with TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        workspace_root = root / "workspace"
        setta_files_root = root / "setta_files"
        setta_home = root / "setta_home"
        workspace_root.mkdir(parents=True, exist_ok=True)
        setta_files_root.mkdir(parents=True, exist_ok=True)
        setta_home.mkdir(parents=True, exist_ok=True)
        manager = PluginManager(
            workspace_root=workspace_root,
            setta_files_root=setta_files_root,
            setta_home=setta_home,
            server_mode="ide",
            setta_version="0.1.0",
        )
        app = _build_test_app(manager=manager, deployment_mode=False)

        with TestClient(app) as client:
            update_response = client.post(
                f"{Route.PREFIX.value}{Route.PLUGINS_UPDATE.value}",
                json={"pluginId": "missing-plugin", "scope": "workspace", "to": None},
            )
            assert update_response.status_code == 404
            assert update_response.json()["detail"]["code"] == "PLUGIN_NOT_FOUND"

            rollback_response = client.post(
                f"{Route.PREFIX.value}{Route.PLUGINS_ROLLBACK.value}",
                json={"pluginId": "missing-plugin", "scope": "workspace"},
            )
            assert rollback_response.status_code in {400, 404}
            assert rollback_response.json()["detail"]["code"] in {
                "PLUGIN_NOT_FOUND",
                "PLUGIN_ROLLBACK_UNAVAILABLE",
            }


def test_plugin_asset_route_maps_invalid_and_missing_paths() -> None:
    # Asset route should map traversal and missing-file failures to deterministic errors.
    with TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        workspace_root = root / "workspace"
        setta_files_root = root / "setta_files"
        setta_home = root / "setta_home"
        workspace_root.mkdir(parents=True, exist_ok=True)
        setta_files_root.mkdir(parents=True, exist_ok=True)
        setta_home.mkdir(parents=True, exist_ok=True)
        manager = PluginManager(
            workspace_root=workspace_root,
            setta_files_root=setta_files_root,
            setta_home=setta_home,
            server_mode="ide",
            setta_version="0.1.0",
        )
        app = _build_test_app(manager=manager, deployment_mode=False)

        with TestClient(app) as client:
            link_response = client.post(
                f"{Route.PREFIX.value}{Route.PLUGINS_LINK.value}",
                json={
                    "localPluginRoot": str(_fixture_plugin_root("frontend")),
                    "scope": "workspace",
                    "enable": True,
                    "force": True,
                },
            )
            assert link_response.status_code == 200

            traversal_response = client.get(
                "/plugins/setta-fixture-frontend/%2E%2E/setta.plugin.json"
            )
            assert traversal_response.status_code == 400
            assert (
                traversal_response.json()["detail"]["code"]
                == "PLUGIN_ASSET_INVALID_PATH"
            )

            missing_response = client.get(
                "/plugins/setta-fixture-frontend/frontend/dist/missing.js"
            )
            assert missing_response.status_code == 404
            assert missing_response.json()["detail"]["code"] == "PLUGIN_ASSET_NOT_FOUND"
