import shutil
import json
from pathlib import Path

import pytest
from fastapi import FastAPI

import setta.server_state as server_state_module
from setta.database.db_objs import DBE
from setta.plugins.models import PluginRuntimeState
from setta.server_state import SettaFastAPIState
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.section_impls import CodeLanguage
from tests.utils.setta_paths import temporary_setta_paths

FIXTURE_PLUGIN_ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "plugins"


@pytest.mark.asyncio
async def test_ide_state_registers_plugin_language_servers_before_lsp_writers(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Plugin language servers should be present in LSP writers immediately after startup.
    workspace_root = tmp_path / "workspace"
    setta_home = tmp_path / ".setta"
    workspace_root.mkdir(parents=True, exist_ok=True)
    setta_home.mkdir(parents=True, exist_ok=True)

    plugin_id = "setta-fixture-backend-language-server"
    plugin_destination = workspace_root / ".setta_plugins" / plugin_id
    plugin_destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(FIXTURE_PLUGIN_ROOT / "backend-language-server", plugin_destination)

    async def _noop_start_lsps(_lsps, _lsp_readers, _lsp_writers) -> None:
        return None

    monkeypatch.setattr(server_state_module, "start_lsps", _noop_start_lsps)

    with temporary_setta_paths(
        workspace_root=workspace_root,
        setta_files_location="local",
        setta_home=setta_home,
    ):
        app = FastAPI()
        state = SettaFastAPIState(
            app,
            enable_mcp_connections=False,
        )
        await state.wait_until_ready()

        assert state.lsp_writers is not None
        assert state.lsp_writers.get_for_language(CodeLanguage.typescript) is not None


@pytest.mark.asyncio
async def test_ide_state_supports_register_time_read_project_state(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Backend plugin register-time read_project_state should succeed during IDE startup.
    workspace_root = tmp_path / "workspace"
    setta_home = tmp_path / ".setta"
    workspace_root.mkdir(parents=True, exist_ok=True)
    setta_home.mkdir(parents=True, exist_ok=True)

    setta_files_root = workspace_root / "setta_files"
    setta_files_root.mkdir(parents=True, exist_ok=True)
    project_config = ProjectConfig(id="fixture-project", name="Fixture Project")
    DBE(setta_files_root).write_project(
        ProjectStateBackend(
            projectConfigs={project_config.id: project_config},
            defaultProjectConfigId=project_config.id,
        )
    )

    plugin_id = "setta-fixture-register-state-read"
    plugin_destination = workspace_root / ".setta_plugins" / plugin_id
    backend_root = plugin_destination / "backend"
    backend_root.mkdir(parents=True, exist_ok=True)
    (plugin_destination / "setta.plugin.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "id": plugin_id,
                "name": "Setta Fixture Register State Read",
                "version": "0.1.0",
                "settaVersionRange": ">=0.0.0",
                "enabledByDefault": True,
                "capabilities": ["registerRouter", "readProjectState"],
                "backend": {
                    "entrypoint": "backend/entrypoint.py",
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    (backend_root / "entrypoint.py").write_text(
        "from fastapi import APIRouter\n"
        "\n"
        "def register(plugin):\n"
        "    summary = plugin.read_project_state(project_config_id='fixture-project', view='summary')\n"
        "    router = APIRouter()\n"
        "\n"
        "    @router.get('/summary-id')\n"
        "    def get_summary_id() -> dict[str, str]:\n"
        "        return {'projectConfigId': summary['projectConfig']['id']}\n"
        "\n"
        "    plugin.register_router(router)\n",
        encoding="utf-8",
    )

    async def _noop_start_lsps(_lsps, _lsp_readers, _lsp_writers) -> None:
        return None

    monkeypatch.setattr(server_state_module, "start_lsps", _noop_start_lsps)

    with temporary_setta_paths(
        workspace_root=workspace_root,
        setta_files_location="local",
        setta_home=setta_home,
    ):
        app = FastAPI()
        state = SettaFastAPIState(
            app,
            enable_mcp_connections=False,
        )
        await state.wait_until_ready()

        status_entry = next(
            entry
            for entry in state.plugin_manager.get_status_response().plugins
            if entry.pluginId == plugin_id and entry.shadowedBySourcePath is None
        )
        assert status_entry.state == PluginRuntimeState.active
        route_paths = {route.path for route in app.routes if hasattr(route, "path")}
        assert f"/api/plugins/{plugin_id}/summary-id" in route_paths


@pytest.mark.asyncio
async def test_ide_state_cleans_up_lsps_when_startup_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Startup failure after LSP initialization should trigger LSP cleanup.
    workspace_root = tmp_path / "workspace"
    setta_home = tmp_path / ".setta"
    workspace_root.mkdir(parents=True, exist_ok=True)
    setta_home.mkdir(parents=True, exist_ok=True)

    async def _failing_start_lsps(_lsps, _lsp_readers, _lsp_writers) -> None:
        raise RuntimeError("lsp startup failed")

    stop_calls: list[bool] = []

    async def _record_stop_lsps(_lsps, _lsp_readers) -> None:
        stop_calls.append(True)

    monkeypatch.setattr(server_state_module, "start_lsps", _failing_start_lsps)
    monkeypatch.setattr(server_state_module, "stop_lsps", _record_stop_lsps)

    with temporary_setta_paths(
        workspace_root=workspace_root,
        setta_files_location="local",
        setta_home=setta_home,
    ):
        app = FastAPI()
        state = SettaFastAPIState(
            app,
            enable_mcp_connections=False,
        )
        with pytest.raises(RuntimeError, match="lsp startup failed"):
            await state.wait_until_ready()

    assert stop_calls == [True]
