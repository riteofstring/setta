import shutil
import os
import zipfile
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


def _build_local_pypi_wheel_from_fixture(
    *,
    tmp_path: Path,
    fixture_name: str,
    package_name: str,
    version: str,
) -> Path:
    source_root = FIXTURE_PLUGIN_ROOT / fixture_name
    wheel_name = f"{package_name.replace('-', '_')}-{version}-py3-none-any.whl"
    artifact_path = tmp_path / wheel_name
    dist_info_name = f"{package_name.replace('-', '_')}-{version}.dist-info"
    with zipfile.ZipFile(artifact_path, "w", compression=zipfile.ZIP_DEFLATED) as zipf:
        for path in sorted(source_root.rglob("*"), key=lambda item: str(item)):
            if not path.is_file():
                continue
            relative_path = path.relative_to(source_root).as_posix()
            zipf.write(path, arcname=relative_path)
        zipf.writestr(
            f"{dist_info_name}/METADATA",
            "\n".join(
                [
                    "Metadata-Version: 2.1",
                    f"Name: {package_name}",
                    f"Version: {version}",
                    "Summary: Setta fixture plugin",
                    "",
                ]
            ),
        )
        zipf.writestr(
            f"{dist_info_name}/WHEEL",
            "\n".join(
                [
                    "Wheel-Version: 1.0",
                    "Generator: setta-tests",
                    "Root-Is-Purelib: true",
                    "Tag: py3-none-any",
                    "",
                ]
            ),
        )
        zipf.writestr(f"{dist_info_name}/RECORD", "")
    return artifact_path


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
    with pytest.raises(PermissionError) as install_exc:
        install_plugin(sourceSpec="pypi:setta-fixture-frontend==0.1.0", ctx=ctx)
    assert str(install_exc.value) == "Deployment mode does not allow plugin mutations."

    with pytest.raises(PermissionError) as update_exc:
        update_plugin(pluginId="setta-fixture-frontend", scope="workspace", ctx=ctx)
    assert str(update_exc.value) == "Deployment mode does not allow plugin mutations."

    with pytest.raises(PermissionError) as rollback_exc:
        rollback_plugin(pluginId="setta-fixture-frontend", scope="workspace", ctx=ctx)
    assert str(rollback_exc.value) == "Deployment mode does not allow plugin mutations."

    with pytest.raises(PermissionError) as uninstall_exc:
        uninstall_plugin(pluginId="setta-fixture-frontend", ctx=ctx)
    assert str(uninstall_exc.value) == "Deployment mode does not allow plugin mutations."


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


def test_plugin_tools_install_update_rollback_and_uninstall_lifecycle(
    tmp_path: Path,
) -> None:
    # MCP lifecycle tools should support real install/update/rollback/uninstall roundtrip.
    _, ctx = _build_ctx(
        tmp_path,
        deployment_mode=False,
        server_mode="ide",
    )
    package_name = "setta-fixture-frontend"
    version = "0.1.0"
    artifact = _build_local_pypi_wheel_from_fixture(
        tmp_path=tmp_path,
        fixture_name="frontend",
        package_name=package_name,
        version=version,
    )

    old_no_index = os.environ.get("PIP_NO_INDEX")
    old_find_links = os.environ.get("PIP_FIND_LINKS")
    os.environ["PIP_NO_INDEX"] = "1"
    os.environ["PIP_FIND_LINKS"] = str(artifact.parent)
    try:
        installed = install_plugin(
            sourceSpec=f"pypi:{package_name}=={version}",
            scope="workspace",
            ctx=ctx,
        )
        assert installed.pluginId == package_name

        updated = update_plugin(
            pluginId=package_name,
            scope="workspace",
            ctx=ctx,
        )
        assert updated.pluginId == package_name
        assert updated.fromVersion == version
        assert updated.toVersion == version

        rolled_back = rollback_plugin(
            pluginId=package_name,
            scope="workspace",
            ctx=ctx,
        )
        assert rolled_back.pluginId == package_name
        assert rolled_back.restoredVersion == version

        removed = uninstall_plugin(
            pluginId=package_name,
            scope="workspace",
            ctx=ctx,
        )
        assert removed.pluginId == package_name
        assert removed.removedFromScope == "workspace"
    finally:
        if old_no_index is None:
            os.environ.pop("PIP_NO_INDEX", None)
        else:
            os.environ["PIP_NO_INDEX"] = old_no_index
        if old_find_links is None:
            os.environ.pop("PIP_FIND_LINKS", None)
        else:
            os.environ["PIP_FIND_LINKS"] = old_find_links
