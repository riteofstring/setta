import json
import os
import shutil
from collections.abc import Callable
from pathlib import Path
from typing import Literal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from setta.mcp.tool_setup import SETTA_MCP_TOOLS
from setta.plugins.errors import PluginManagerError
from setta.plugins.manager import PluginManager
from setta.plugins.models import PluginRuntimeState, PluginScope, normalize_scope

FIXTURE_PLUGIN_ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "plugins"


def _make_manager(
    tmp_path: Path,
    server_mode: Literal["ide", "share", "app"] = "ide",
    restart_callback: Callable[[], bool] | None = None,
    backend_startup_timeout_seconds: float = 10.0,
    backend_register_timeout_seconds: float = 10.0,
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
        server_mode=server_mode,
        setta_version="0.1.0",
        restart_callback=restart_callback,
        backend_startup_timeout_seconds=backend_startup_timeout_seconds,
        backend_register_timeout_seconds=backend_register_timeout_seconds,
    )


def _fixture_path(name: str) -> Path:
    return FIXTURE_PLUGIN_ROOT / name


def _fixture_manifest(name: str) -> dict:
    return json.loads((_fixture_path(name) / "setta.plugin.json").read_text())


def _scope_root(manager: PluginManager, scope: PluginScope) -> Path:
    if scope == PluginScope.workspace:
        return manager.workspace_root / "plugins"
    if scope == PluginScope.setta_files:
        return manager.setta_files_root / "plugins"
    return manager.setta_home / "plugins"


def _copy_fixture_to_scope(
    *,
    manager: PluginManager,
    fixture_name: str,
    scope: PluginScope,
) -> Path:
    manifest = _fixture_manifest(fixture_name)
    plugin_id = manifest["id"]
    destination = _scope_root(manager, scope) / plugin_id
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(_fixture_path(fixture_name), destination)
    return destination


def _entry_for_scope(status_entries, scope: PluginScope):
    for entry in status_entries:
        if entry.sourceScope == scope:
            return entry
    raise KeyError(f"Missing status entry for scope {scope}")


@pytest.mark.parametrize("fixture_name", ["backend", "frontend", "content", "full"])
def test_fixture_plugins_validate(fixture_name: str, tmp_path: Path) -> None:
    # Each first-party fixture should be a valid standalone plugin root.
    manager = _make_manager(tmp_path)
    manager.validate_plugin_folder(_fixture_path(fixture_name))


def test_discovery_respects_scope_precedence_and_shadowing(tmp_path: Path) -> None:
    # Workspace plugins should shadow setta_files and global plugins for the same id.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="frontend",
        scope=PluginScope.global_scope,
    )
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="frontend",
        scope=PluginScope.setta_files,
    )
    workspace_path = _copy_fixture_to_scope(
        manager=manager,
        fixture_name="frontend",
        scope=PluginScope.workspace,
    )

    status = manager.rescan()
    assert status.installedPlugins == 1
    plugin_id = _fixture_manifest("frontend")["id"]
    entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == plugin_id
    ]
    assert len(entries) == 3

    workspace_entry = _entry_for_scope(entries, PluginScope.workspace)
    setta_files_entry = _entry_for_scope(entries, PluginScope.setta_files)
    global_entry = _entry_for_scope(entries, PluginScope.global_scope)

    assert workspace_entry.state == PluginRuntimeState.active
    assert workspace_entry.shadowedBySourcePath is None
    assert setta_files_entry.state == PluginRuntimeState.shadowed
    assert setta_files_entry.shadowedBySourcePath == str(workspace_path)
    assert global_entry.state == PluginRuntimeState.shadowed
    assert global_entry.shadowedBySourcePath == str(workspace_path)


def test_scope_alias_environment_maps_to_setta_files() -> None:
    # The user-facing "environment" alias should normalize to canonical setta_files.
    assert normalize_scope("environment") == PluginScope.setta_files


def test_uninstall_requires_scope_when_plugin_exists_in_multiple_scopes(
    tmp_path: Path,
) -> None:
    # Uninstalling by id only must fail if the plugin id exists in multiple scopes.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="frontend",
        scope=PluginScope.workspace,
    )
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="frontend",
        scope=PluginScope.setta_files,
    )
    manager.rescan()
    plugin_id = _fixture_manifest("frontend")["id"]

    with pytest.raises(PluginManagerError) as exc_info:
        manager.uninstall_plugin(plugin_id=plugin_id, scope=None)

    assert exc_info.value.code == "PLUGIN_UNINSTALL_SCOPE_REQUIRED"


def test_backend_plugin_disable_stays_pending_restart(tmp_path: Path) -> None:
    # Backend plugin enable/disable transitions remain restart-gated in MVP.
    manager = _make_manager(tmp_path)
    backend_root = _fixture_path("backend")
    linked = manager.link_plugin(
        local_plugin_root=str(backend_root),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    assert linked.state == PluginRuntimeState.pending_restart
    assert linked.restartRequired is True

    disabled = manager.disable_plugin(plugin_id=linked.pluginId)
    assert disabled.state == PluginRuntimeState.pending_restart
    assert disabled.restartRequired is True

    status_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == linked.pluginId
    ]
    assert len(status_entries) == 1
    assert status_entries[0].state == PluginRuntimeState.pending_restart
    assert status_entries[0].restartRequired is True


def test_link_backend_plugin_writes_runtime_marker(tmp_path: Path) -> None:
    # Link/install flows should prepare plugin-scoped backend runtime metadata.
    manager = _make_manager(tmp_path)
    linked = manager.link_plugin(
        local_plugin_root=str(_fixture_path("backend")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    assert linked.sourceDigestSha256 is not None
    runtime_marker = manager._runtime_marker_path(
        plugin_id=linked.pluginId,
        version=linked.version,
        source_digest_sha256=linked.sourceDigestSha256,
    )
    assert runtime_marker.exists()
    marker_payload = json.loads(runtime_marker.read_text(encoding="utf-8"))
    assert marker_payload["pluginId"] == linked.pluginId
    assert marker_payload["version"] == linked.version
    assert marker_payload["sourceDigestSha256"] == linked.sourceDigestSha256
    assert marker_payload["dependencies"] == []


def test_backend_worker_uses_runtime_python_when_available(tmp_path: Path) -> None:
    # Worker orchestration should prefer plugin-scoped runtime Python interpreters.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry("setta-fixture-backend", PluginScope.workspace)
    assert entry is not None
    assert entry.source_digest_sha256 is not None

    runtime_path = manager._runtime_path(
        plugin_id=entry.plugin_id,
        version=entry.version,
        source_digest_sha256=entry.source_digest_sha256,
    )
    runtime_path.mkdir(parents=True, exist_ok=True)
    runtime_python = (
        runtime_path / ".venv" / "Scripts" / "python.exe"
        if os.name == "nt"
        else runtime_path / ".venv" / "bin" / "python"
    )
    runtime_python.parent.mkdir(parents=True, exist_ok=True)
    runtime_python.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    runtime_python.chmod(0o755)

    resolved_python = manager._resolve_backend_worker_python(entry)
    assert resolved_python == str(runtime_python)


def test_programmatic_restart_capability_and_action(tmp_path: Path) -> None:
    # Programmatic restart mode should expose deterministic capability/action payloads.
    restart_calls: list[str] = []

    def restart_callback() -> bool:
        restart_calls.append("called")
        return True

    manager = _make_manager(tmp_path, restart_callback=restart_callback)

    capability = manager.get_restart_capability()
    assert capability.mode == "programmatic"
    assert capability.command is None
    assert capability.reason is None

    response = manager.restart_backend()
    assert response == {
        "accepted": True,
        "mode": "programmatic",
        "command": None,
        "reason": None,
    }
    assert restart_calls == ["called"]


def test_programmatic_restart_rejection_falls_back_to_manual_command(
    tmp_path: Path,
) -> None:
    # A rejected programmatic restart should include explicit fallback command details.
    manager = _make_manager(tmp_path, restart_callback=lambda: False)

    response = manager.restart_backend()
    assert response == {
        "accepted": False,
        "mode": "programmatic",
        "command": "setta",
        "reason": "Programmatic restart request was rejected.",
    }


def test_load_backend_plugins_registers_fixture_router_and_mcp_tool(
    tmp_path: Path,
) -> None:
    # Backend fixture plugins should load real entrypoints and register router/tool hooks.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()

    app = FastAPI()
    baseline_tools = list(SETTA_MCP_TOOLS)
    try:
        manager.load_backend_plugins(app=app)

        backend_entries = [
            entry
            for entry in manager.get_status_response().plugins
            if entry.pluginId == "setta-fixture-backend"
            and entry.sourceScope == PluginScope.workspace
            and entry.shadowedBySourcePath is None
        ]
        assert len(backend_entries) == 1
        assert backend_entries[0].state == PluginRuntimeState.active

        loaded_tool_names = {tool.__name__ for tool in SETTA_MCP_TOOLS}
        assert "setta_fixture_backend_echo" in loaded_tool_names

        with TestClient(app) as client:
            response = client.get("/api/plugins/setta-fixture-backend/health")
            assert response.status_code == 200
            assert response.json() == {
                "pluginId": "setta-fixture-backend",
                "status": "ok",
            }
    finally:
        SETTA_MCP_TOOLS[:] = baseline_tools


def test_backend_worker_processes_stay_alive_until_shutdown(tmp_path: Path) -> None:
    # Backend workers should remain running after load and stop on explicit shutdown.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()

    app = FastAPI()
    manager.load_backend_plugins(app=app)

    process = manager._backend_worker_processes.get("setta-fixture-backend")
    assert process is not None
    assert process.poll() is None
    assert "setta_fixture_backend_echo" in {tool.__name__ for tool in SETTA_MCP_TOOLS}

    manager.shutdown_backend_plugins()

    assert manager._backend_worker_processes == {}
    assert process.poll() is not None
    assert "setta_fixture_backend_echo" not in {
        tool.__name__ for tool in SETTA_MCP_TOOLS
    }


def test_load_backend_plugins_marks_import_failures_invalid(tmp_path: Path) -> None:
    # Backend import failures should map to deterministic invalid-plugin status codes.
    manager = _make_manager(tmp_path)
    backend_root = _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    (backend_root / "backend" / "entrypoint.py").write_text(
        "def register(plugin):\n    if True\n",
        encoding="utf-8",
    )
    manager.rescan()

    manager.load_backend_plugins(app=FastAPI())

    backend_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(backend_entries) == 1
    assert backend_entries[0].state == PluginRuntimeState.invalid
    error_codes = {error.code for error in backend_entries[0].errors}
    assert "PLUGIN_BACKEND_IMPORT_FAILED" in error_codes


def test_backend_plugin_capability_denied_is_reported(tmp_path: Path) -> None:
    # Calling blocked backend APIs in non-IDE modes should fail with capability-denied.
    manager = _make_manager(tmp_path, server_mode="share")
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()

    manager.load_backend_plugins(app=FastAPI())

    backend_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(backend_entries) == 1
    assert backend_entries[0].state == PluginRuntimeState.invalid
    error_codes = {error.code for error in backend_entries[0].errors}
    assert "PLUGIN_CAPABILITY_DENIED" in error_codes


def test_backend_plugin_startup_timeout_is_reported(tmp_path: Path) -> None:
    # Backend import stalls should fail with explicit startup-timeout error codes.
    manager = _make_manager(
        tmp_path,
        backend_startup_timeout_seconds=0.1,
        backend_register_timeout_seconds=5.0,
    )
    backend_root = _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    (backend_root / "backend" / "entrypoint.py").write_text(
        "import time\n\n"
        "time.sleep(0.5)\n\n"
        "def register(plugin):\n"
        "    return None\n",
        encoding="utf-8",
    )
    manager.rescan()

    manager.load_backend_plugins(app=FastAPI())

    backend_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(backend_entries) == 1
    assert backend_entries[0].state == PluginRuntimeState.invalid
    error_codes = {error.code for error in backend_entries[0].errors}
    assert "PLUGIN_BACKEND_STARTUP_TIMEOUT" in error_codes


def test_backend_plugin_register_timeout_is_reported(tmp_path: Path) -> None:
    # Backend register stalls should fail with explicit register-timeout error codes.
    manager = _make_manager(
        tmp_path,
        backend_startup_timeout_seconds=5.0,
        backend_register_timeout_seconds=0.1,
    )
    backend_root = _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    (backend_root / "backend" / "entrypoint.py").write_text(
        "import time\n\n"
        "def register(plugin):\n"
        "    time.sleep(0.5)\n",
        encoding="utf-8",
    )
    manager.rescan()

    manager.load_backend_plugins(app=FastAPI())

    backend_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(backend_entries) == 1
    assert backend_entries[0].state == PluginRuntimeState.invalid
    error_codes = {error.code for error in backend_entries[0].errors}
    assert "PLUGIN_BACKEND_REGISTER_TIMEOUT" in error_codes


def test_backend_plugin_worker_transport_error_is_reported(tmp_path: Path) -> None:
    # Abrupt worker/preflight termination should map to transport-error status.
    manager = _make_manager(tmp_path)
    backend_root = _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    (backend_root / "backend" / "entrypoint.py").write_text(
        "import os\n\n"
        "os._exit(1)\n",
        encoding="utf-8",
    )
    manager.rescan()

    manager.load_backend_plugins(app=FastAPI())

    backend_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(backend_entries) == 1
    assert backend_entries[0].state == PluginRuntimeState.invalid
    error_codes = {error.code for error in backend_entries[0].errors}
    assert "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR" in error_codes


def test_backend_plugin_handshake_api_mismatch_is_reported(tmp_path: Path) -> None:
    # Worker handshake API mismatches should invalidate the backend plugin deterministically.
    manager = _make_manager(tmp_path)
    backend_root = _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    handshake_override = backend_root / "backend" / "handshake.override.json"
    handshake_override.write_text(
        json.dumps({"backendPluginApiVersion": 999}, indent=2),
        encoding="utf-8",
    )
    manager.rescan()

    manager.load_backend_plugins(app=FastAPI())

    backend_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(backend_entries) == 1
    assert backend_entries[0].state == PluginRuntimeState.invalid
    error_codes = {error.code for error in backend_entries[0].errors}
    assert "PLUGIN_BACKEND_API_VERSION_MISMATCH" in error_codes


def test_backend_plugin_missing_dependency_runtime_is_invalid(tmp_path: Path) -> None:
    # Backend plugins with declared dependencies should fail activation if runtime install is missing.
    manager = _make_manager(tmp_path)
    backend_root = _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    (backend_root / "pyproject.toml").write_text(
        "[build-system]\n"
        'requires = ["setuptools>=68", "wheel"]\n'
        'build-backend = "setuptools.build_meta"\n\n'
        "[project]\n"
        'name = "setta-fixture-backend"\n'
        'version = "0.1.0"\n'
        'description = "Backend fixture plugin for Setta tests"\n'
        'requires-python = ">=3.12"\n'
        'dependencies = ["requests>=2"]\n',
        encoding="utf-8",
    )
    manager.rescan()

    manager.load_backend_plugins(app=FastAPI())

    backend_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(backend_entries) == 1
    assert backend_entries[0].state == PluginRuntimeState.invalid
    error_codes = {error.code for error in backend_entries[0].errors}
    assert "PLUGIN_BACKEND_DEPENDENCY_INSTALL_FAILED" in error_codes


def test_link_backend_plugin_rejects_invalid_dependency_spec(tmp_path: Path) -> None:
    # Invalid dependency specs should fail install-time runtime preparation deterministically.
    manager = _make_manager(tmp_path)
    plugin_root = tmp_path / "backend-invalid-deps"
    shutil.copytree(_fixture_path("backend"), plugin_root)
    (plugin_root / "pyproject.toml").write_text(
        "[build-system]\n"
        'requires = ["setuptools>=68", "wheel"]\n'
        'build-backend = "setuptools.build_meta"\n\n'
        "[project]\n"
        'name = "setta-fixture-backend"\n'
        'version = "0.1.0"\n'
        'description = "Backend fixture plugin for Setta tests"\n'
        'requires-python = ">=3.12"\n'
        'dependencies = ["not a valid requirement @@@"]\n',
        encoding="utf-8",
    )

    with pytest.raises(PluginManagerError) as exc_info:
        manager.link_plugin(
            local_plugin_root=str(plugin_root),
            scope=PluginScope.workspace,
            enable=True,
            force=False,
        )
    assert exc_info.value.code == "PLUGIN_BACKEND_DEPENDENCY_INSTALL_FAILED"


def test_plugin_config_schema_validation_and_list_descriptors(
    tmp_path: Path,
) -> None:
    # Plugins with configSchemaPath should reject invalid config and expose schema metadata.
    manager = _make_manager(tmp_path)
    full_root = _fixture_path("full")
    linked = manager.link_plugin(
        local_plugin_root=str(full_root),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    plugin_id = linked.pluginId

    with pytest.raises(PluginManagerError) as exc_info:
        manager.write_plugin_config(
            plugin_id=plugin_id,
            config={"enabled": "yes"},
        )
    assert exc_info.value.code == "PLUGIN_CONFIG_INVALID"

    saved = manager.write_plugin_config(
        plugin_id=plugin_id,
        config={"enabled": True, "label": "fixture"},
    )
    assert saved.validation["ok"] is True
    assert saved.config["enabled"] is True

    plugin_entry = manager.get_list_response().plugins[0]
    assert plugin_entry.pluginId == plugin_id
    assert plugin_entry.content.hasBlueprints is True
    assert plugin_entry.content.hasProjectTemplates is True
    assert plugin_entry.content.hasPrompts is True
    assert plugin_entry.config.hasSchema is True
    assert isinstance(plugin_entry.config.schemaJson, dict)


def test_init_template_generates_publish_ready_scaffold(tmp_path: Path) -> None:
    # `setta plugins init` should output validate/build/publish-ready starter files.
    manager = _make_manager(tmp_path)
    plugin_root = manager.init_plugin_template(
        plugin_id="setta-init-fixture",
        template="full",
        out_dir=str(tmp_path),
    )

    assert (plugin_root / "setta.plugin.json").exists()
    assert (plugin_root / "pyproject.toml").exists()
    assert (plugin_root / "README.md").exists()
    assert (plugin_root / ".github" / "workflows" / "release.yml").exists()

    frontend_entrypoint = plugin_root / "frontend" / "dist" / "index.js"
    assert frontend_entrypoint.exists()
    entrypoint_text = frontend_entrypoint.read_text(encoding="utf-8")
    assert "export const apiVersion = 1;" in entrypoint_text

    manager.validate_plugin_folder(plugin_root)


def test_init_template_can_be_linked_and_served(tmp_path: Path) -> None:
    # A freshly scaffolded plugin should be linkable and serve frontend assets.
    manager = _make_manager(tmp_path)
    plugin_root = manager.init_plugin_template(
        plugin_id="setta-runtime-fixture",
        template="frontend",
        out_dir=str(tmp_path),
    )
    manager.validate_plugin_folder(plugin_root)

    linked = manager.link_plugin(
        local_plugin_root=str(plugin_root),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    assert linked.pluginId == "setta-runtime-fixture"
    assert linked.state == PluginRuntimeState.active
    assert linked.restartRequired is False

    listed = manager.get_list_response().plugins
    assert len(listed) == 1
    plugin_entry = listed[0]
    assert plugin_entry.pluginId == "setta-runtime-fixture"
    assert plugin_entry.frontend.entrypointUrl is not None

    asset = manager.resolve_plugin_asset_path(
        plugin_id="setta-runtime-fixture",
        asset_path="frontend/dist/index.js",
    )
    entrypoint_text = asset.read_text(encoding="utf-8")
    assert "export function register(host)" in entrypoint_text


def test_validate_rejects_invalid_capability_value(tmp_path: Path) -> None:
    # Manifest capability names must come from the host's closed vocabulary.
    manager = _make_manager(tmp_path)
    plugin_root = tmp_path / "invalid-capability-plugin"
    shutil.copytree(_fixture_path("frontend"), plugin_root)
    manifest_path = plugin_root / "setta.plugin.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["capabilities"] = ["registerPane", "notARealCapability"]
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    with pytest.raises(PluginManagerError) as exc_info:
        manager.validate_plugin_folder(plugin_root)
    assert exc_info.value.code == "PLUGIN_MANIFEST_INVALID_CAPABILITY"


def test_validate_rejects_duplicate_capability_value(tmp_path: Path) -> None:
    # Duplicate capability entries should fail fast so intent is unambiguous.
    manager = _make_manager(tmp_path)
    plugin_root = tmp_path / "duplicate-capability-plugin"
    shutil.copytree(_fixture_path("frontend"), plugin_root)
    manifest_path = plugin_root / "setta.plugin.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["capabilities"] = ["registerPane", "registerPane"]
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    with pytest.raises(PluginManagerError) as exc_info:
        manager.validate_plugin_folder(plugin_root)
    assert exc_info.value.code == "PLUGIN_MANIFEST_DUPLICATE_CAPABILITY"


def test_validate_rejects_unsupported_manifest_schema_version(tmp_path: Path) -> None:
    # Future schema versions should be rejected with explicit unsupported-schema errors.
    manager = _make_manager(tmp_path)
    plugin_root = tmp_path / "future-schema-plugin"
    shutil.copytree(_fixture_path("frontend"), plugin_root)
    manifest_path = plugin_root / "setta.plugin.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["schemaVersion"] = 999
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    with pytest.raises(PluginManagerError) as exc_info:
        manager.validate_plugin_folder(plugin_root)
    assert exc_info.value.code == "PLUGIN_MANIFEST_UNSUPPORTED_SCHEMA"
