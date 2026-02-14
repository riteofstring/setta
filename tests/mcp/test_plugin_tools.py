import shutil
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from mcp.server.fastmcp.server import Context

from setta.mcp.tool_setup import SETTA_MCP_TOOLS
from setta.mcp.tool_registry import build_setta_tool_manager, ensure_setta_mcp_tools_loaded
from setta.mcp.tools.plugins import (
    install_plugin,
    rescan_plugins,
    rollback_plugin,
    uninstall_plugin,
    update_plugin,
)
from setta.plugins.errors import PluginManagerError
from setta.plugins.manager import PluginManager

FIXTURE_PLUGIN_ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "plugins"


def _build_ctx(
    tmp_path: Path,
    *,
    deployment_mode: bool,
    server_mode: str,
) -> tuple[PluginManager, Context]:
    workspace_root = tmp_path / "workspace"
    setta_files_root = tmp_path / "setta_files"
    setta_home = tmp_path / "setta_home"
    workspace_root.mkdir(parents=True, exist_ok=True)
    setta_files_root.mkdir(parents=True, exist_ok=True)
    setta_home.mkdir(parents=True, exist_ok=True)

    manager = PluginManager(
        workspace_root=workspace_root,
        setta_files_root=setta_files_root,
        setta_home=setta_home,
        server_mode=server_mode,
        setta_version="0.1.0",
    )
    state = SimpleNamespace(
        plugin_manager=manager,
        deployment_mode=deployment_mode,
    )
    return manager, Context(fastmcp=SimpleNamespace(state=state))


def test_plugin_tools_rescan_and_uninstall_real_fixture(tmp_path: Path) -> None:
    # MCP plugin tools should operate on real plugin fixture folders, not mocked data.
    manager, ctx = _build_ctx(
        tmp_path,
        deployment_mode=False,
        server_mode="ide",
    )
    plugin_root = manager.workspace_root / "plugins" / "setta-fixture-frontend"
    plugin_root.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(
        FIXTURE_PLUGIN_ROOT / "frontend",
        plugin_root,
    )
    manager.rescan()

    scanned = rescan_plugins(ctx=ctx)
    assert scanned.installedPlugins == 1
    assert scanned.activePlugins == 1

    removed = uninstall_plugin(
        pluginId="setta-fixture-frontend",
        scope="workspace",
        ctx=ctx,
    )
    assert removed.pluginId == "setta-fixture-frontend"
    assert removed.restartRequired is False

    refreshed = rescan_plugins(ctx=ctx)
    assert refreshed.installedPlugins == 0
    assert refreshed.activePlugins == 0


def test_plugin_tools_load_backend_fixture_registers_multiple_mcp_tools(
    tmp_path: Path,
) -> None:
    # Backend MCP fixture should register multiple tools when backend plugins load.
    manager, _ = _build_ctx(
        tmp_path,
        deployment_mode=False,
        server_mode="ide",
    )
    plugin_root = manager.workspace_root / "plugins" / "setta-fixture-backend-mcp-tools"
    plugin_root.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(
        FIXTURE_PLUGIN_ROOT / "backend-mcp-tools",
        plugin_root,
    )
    manager.rescan()

    baseline_tools = list(SETTA_MCP_TOOLS)
    try:
        manager.load_backend_plugins(app=FastAPI())
        loaded_tool_names = {tool.__name__ for tool in SETTA_MCP_TOOLS}
        assert "setta_fixture_mcp_read" in loaded_tool_names
        assert "setta_fixture_mcp_write" in loaded_tool_names
    finally:
        SETTA_MCP_TOOLS[:] = baseline_tools


def test_install_plugin_tool_rejects_unsupported_scheme(tmp_path: Path) -> None:
    # The MCP installer path should preserve the source-scheme guardrails.
    _, ctx = _build_ctx(
        tmp_path,
        deployment_mode=False,
        server_mode="ide",
    )
    with pytest.raises(PluginManagerError) as exc_info:
        install_plugin(sourceSpec="local:/tmp/not-supported", ctx=ctx)
    assert exc_info.value.code == "PLUGIN_SOURCE_SCHEME_UNSUPPORTED"


def test_plugin_mutation_tools_blocked_in_deployment_mode(tmp_path: Path) -> None:
    # Deployment mode must reject plugin mutation tools before any manager mutation runs.
    _, ctx = _build_ctx(
        tmp_path,
        deployment_mode=True,
        server_mode="share",
    )
    with pytest.raises(PermissionError) as exc_info:
        uninstall_plugin(pluginId="setta-fixture-frontend", ctx=ctx)
    assert str(exc_info.value) == "Deployment mode does not allow plugin mutations."


def test_plugin_tools_are_registered() -> None:
    # Tool registry should expose plugin lifecycle MCP tools for chat-agent workflows.
    ensure_setta_mcp_tools_loaded()
    tool_manager = build_setta_tool_manager()
    tool_names = {tool.name for tool in tool_manager.list_tools()}
    assert "install_plugin" in tool_names
    assert "uninstall_plugin" in tool_names
    assert "rescan_plugins" in tool_names
    assert "update_plugin" in tool_names
    assert "rollback_plugin" in tool_names


def test_plugin_update_and_rollback_tools_expose_manager_errors(tmp_path: Path) -> None:
    # Unavailable lifecycle operations should return deterministic manager error codes.
    _, ctx = _build_ctx(
        tmp_path,
        deployment_mode=False,
        server_mode="ide",
    )
    with pytest.raises(PluginManagerError) as update_exc:
        update_plugin(pluginId="missing-plugin", scope="workspace", ctx=ctx)
    assert update_exc.value.code in {"PLUGIN_NOT_FOUND", "PLUGIN_UPDATE_UNAVAILABLE"}

    with pytest.raises(PluginManagerError) as rollback_exc:
        rollback_plugin(pluginId="missing-plugin", scope="workspace", ctx=ctx)
    assert rollback_exc.value.code in {"PLUGIN_NOT_FOUND", "PLUGIN_ROLLBACK_UNAVAILABLE"}
