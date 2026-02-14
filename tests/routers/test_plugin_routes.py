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
