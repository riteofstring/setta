import json
from pathlib import Path
from typing import Callable

from click.testing import CliRunner
from fastapi import FastAPI

import setta.start as start_module
from setta.plugins.manager import PluginManager
from setta.start import plugins

FIXTURE_PLUGIN_ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "plugins"


def _build_manager(
    tmp_path: Path,
    *,
    restart_callback: Callable[[], bool] | None = None,
) -> PluginManager:
    workspace_root = tmp_path / "workspace"
    setta_files_root = tmp_path / "setta_files"
    setta_home = tmp_path / "setta_home"
    workspace_root.mkdir(parents=True, exist_ok=True)
    setta_files_root.mkdir(parents=True, exist_ok=True)
    setta_home.mkdir(parents=True, exist_ok=True)
    return PluginManager(
        workspace_root=workspace_root,
        setta_files_root=setta_files_root,
        setta_home=setta_home,
        server_mode="ide",
        setta_version="0.1.0",
        restart_callback=restart_callback,
    )


def _build_manager_from_paths(
    *,
    workspace_root: Path,
    setta_files_root: Path,
    setta_home: Path,
    restart_callback: Callable[[], bool] | None = None,
) -> PluginManager:
    return PluginManager(
        workspace_root=workspace_root,
        setta_files_root=setta_files_root,
        setta_home=setta_home,
        server_mode="ide",
        setta_version="0.1.0",
        restart_callback=restart_callback,
    )


def test_plugins_restart_required_text_includes_restart_capability(
    tmp_path: Path,
    monkeypatch,
) -> None:
    manager = _build_manager(tmp_path)
    manager.link_plugin(
        local_plugin_root=str(FIXTURE_PLUGIN_ROOT / "backend"),
        scope="workspace",
        enable=True,
        force=False,
    )

    monkeypatch.setattr(start_module, "_build_plugin_manager_for_cli", lambda: manager)
    runner = CliRunner()
    result = runner.invoke(plugins, ["restart-required"])

    assert result.exit_code == 0, result.output
    assert "Pending restart plugins:" in result.output
    assert "- setta-fixture-backend (0.1.0)" in result.output
    assert "Manual restart command: setta" in result.output
    assert "Programmatic restart is not available in this runtime." in result.output


def test_plugins_restart_required_json_includes_capability_payload(
    tmp_path: Path,
    monkeypatch,
) -> None:
    manager = _build_manager(tmp_path, restart_callback=lambda: True)
    monkeypatch.setattr(start_module, "_build_plugin_manager_for_cli", lambda: manager)

    runner = CliRunner()
    result = runner.invoke(plugins, ["restart-required", "--json"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload == {
        "pendingPlugins": [],
        "pendingPluginIds": [],
        "pendingPluginIdsWithoutStatus": [],
        "restartCapability": {
            "mode": "programmatic",
            "command": None,
            "reason": None,
        },
    }


def test_plugins_restart_required_reports_pending_ids_without_status(
    tmp_path: Path,
    monkeypatch,
) -> None:
    manager = _build_manager(tmp_path)
    linked = manager.link_plugin(
        local_plugin_root=str(FIXTURE_PLUGIN_ROOT / "backend"),
        scope="workspace",
        enable=True,
        force=False,
    )
    manager.load_backend_plugins(app=FastAPI())
    manager.uninstall_plugin(plugin_id=linked.pluginId, scope="workspace")

    reloaded = _build_manager_from_paths(
        workspace_root=manager.workspace_root,
        setta_files_root=manager.setta_files_root,
        setta_home=manager.setta_home,
    )
    monkeypatch.setattr(start_module, "_build_plugin_manager_for_cli", lambda: reloaded)

    runner = CliRunner()
    result = runner.invoke(plugins, ["restart-required"])

    assert result.exit_code == 0, result.output
    assert "Pending restart plugins:" in result.output
    assert "- setta-fixture-backend (status unavailable)" in result.output
