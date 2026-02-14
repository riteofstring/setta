import json
import os
import subprocess
import shutil
import tarfile
import sys
import zipfile
from collections.abc import Callable
from pathlib import Path
from typing import Literal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from setta.mcp.tool_setup import SETTA_MCP_TOOLS
from setta.plugins.errors import PluginManagerError
from setta.plugins.manager import PluginManager
from setta.plugins.models import (
    BlockedCapabilityReason,
    PluginRuntimeState,
    PluginScope,
    normalize_scope,
)

FIXTURE_PLUGIN_ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "plugins"


def _make_manager(
    tmp_path: Path,
    server_mode: Literal["ide", "share", "app"] = "ide",
    github_base_url: str | None = None,
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
        github_base_url=github_base_url,
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


def _build_local_pypi_wheel_from_fixture(
    *,
    tmp_path: Path,
    fixture_name: str,
    package_name: str,
    version: str,
) -> Path:
    source_root = _fixture_path(fixture_name)
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
                    "Summary: Setta test plugin",
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


def _build_local_github_bare_repo_from_fixture(
    *,
    tmp_path: Path,
    fixture_name: str,
    owner: str,
    repo: str,
) -> tuple[str, str]:
    source_root = _fixture_path(fixture_name)
    working_repo = tmp_path / "git-working" / repo
    working_repo.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source_root, working_repo)

    subprocess.run(["git", "init", "-q"], check=True, cwd=working_repo)
    subprocess.run(
        ["git", "config", "user.name", "Setta Tests"],
        check=True,
        cwd=working_repo,
    )
    subprocess.run(
        ["git", "config", "user.email", "setta-tests@example.com"],
        check=True,
        cwd=working_repo,
    )
    subprocess.run(["git", "add", "."], check=True, cwd=working_repo)
    subprocess.run(["git", "commit", "-qm", "fixture"], check=True, cwd=working_repo)
    subprocess.run(["git", "branch", "-M", "main"], check=True, cwd=working_repo)

    host_root = tmp_path / "github-host" / owner
    host_root.mkdir(parents=True, exist_ok=True)
    bare_repo = host_root / f"{repo}.git"
    subprocess.run(
        ["git", "clone", "--bare", str(working_repo), str(bare_repo)],
        check=True,
        cwd=tmp_path,
    )
    base_url = f"file://{(tmp_path / 'github-host').as_posix()}"
    return base_url, "main"


def _build_python_package_artifacts(plugin_root: Path) -> Path:
    dist_dir = plugin_root / "dist"
    if dist_dir.exists():
        shutil.rmtree(dist_dir)
    build_result = subprocess.run(
        [sys.executable, "-m", "build", "--wheel", "--sdist"],
        cwd=plugin_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if build_result.returncode != 0:
        raise AssertionError(
            "python -m build failed:\n"
            f"STDOUT:\n{build_result.stdout}\n"
            f"STDERR:\n{build_result.stderr}"
        )
    if not dist_dir.exists():
        raise AssertionError(f"Missing dist directory: {dist_dir}")
    if len(list(dist_dir.glob("*.whl"))) == 0:
        raise AssertionError(f"No wheel built in: {dist_dir}")
    if len(list(dist_dir.glob("*.tar.gz"))) == 0:
        raise AssertionError(f"No sdist built in: {dist_dir}")
    return dist_dir


@pytest.mark.parametrize(
    "fixture_name",
    ["backend", "backend-language-server", "frontend", "content", "full"],
)
def test_fixture_plugins_validate(fixture_name: str, tmp_path: Path) -> None:
    # Each first-party fixture should be a valid standalone plugin root.
    manager = _make_manager(tmp_path)
    manager.validate_plugin_folder(_fixture_path(fixture_name))


def test_install_plugin_from_local_pypi_artifact(tmp_path: Path) -> None:
    # Install flow should support pypi: source specs using real wheel artifacts.
    manager = _make_manager(tmp_path)
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
        installed = manager.install_plugin(
            source_spec=f"pypi:{package_name}=={version}",
            scope=PluginScope.workspace,
            enable=True,
            force=False,
        )
    finally:
        if old_no_index is None:
            os.environ.pop("PIP_NO_INDEX", None)
        else:
            os.environ["PIP_NO_INDEX"] = old_no_index
        if old_find_links is None:
            os.environ.pop("PIP_FIND_LINKS", None)
        else:
            os.environ["PIP_FIND_LINKS"] = old_find_links

    assert installed.pluginId == "setta-fixture-frontend"
    assert installed.version == version
    assert installed.state == PluginRuntimeState.active
    assert installed.sourceDigestSha256 is not None

    status_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-frontend"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(status_entries) == 1
    assert status_entries[0].state == PluginRuntimeState.active


def test_extract_artifact_rejects_zip_path_traversal(tmp_path: Path) -> None:
    # Source extraction must reject archive entries that escape extract_root.
    manager = _make_manager(tmp_path)
    malicious_zip = tmp_path / "malicious.whl"
    with zipfile.ZipFile(malicious_zip, "w", compression=zipfile.ZIP_DEFLATED) as zipf:
        zipf.writestr("../escape.txt", "not allowed")

    with pytest.raises(PluginManagerError) as exc_info:
        manager._extract_artifact(
            artifact_path=malicious_zip,
            extract_root=tmp_path / "extract",
        )
    assert exc_info.value.code == "PLUGIN_SOURCE_ARCHIVE_TRAVERSAL"


def test_extract_artifact_rejects_tar_symlink_entries(tmp_path: Path) -> None:
    # Source extraction must reject tar symlink/hardlink entries.
    manager = _make_manager(tmp_path)
    malicious_tar = tmp_path / "malicious.tgz"
    with tarfile.open(malicious_tar, "w:gz") as archive:
        link = tarfile.TarInfo("link-out")
        link.type = tarfile.SYMTYPE
        link.linkname = "/etc/passwd"
        archive.addfile(link)

    with pytest.raises(PluginManagerError) as exc_info:
        manager._extract_artifact(
            artifact_path=malicious_tar,
            extract_root=tmp_path / "extract",
        )
    assert exc_info.value.code == "PLUGIN_SOURCE_ARCHIVE_TRAVERSAL"


def test_lockfile_apply_reinstalls_from_pypi_source(tmp_path: Path) -> None:
    # Lockfile apply should reinstall plugins from stored pypi source specs.
    manager = _make_manager(tmp_path)
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
        manager.install_plugin(
            source_spec=f"pypi:{package_name}=={version}",
            scope=PluginScope.workspace,
            enable=True,
            force=False,
        )
        lock_write = manager.write_lockfile()
        assert lock_write.pluginCount == 1

        manager.uninstall_plugin(
            plugin_id="setta-fixture-frontend",
            scope=PluginScope.workspace,
        )
        check_result = manager.apply_lockfile(check=True)
        assert check_result.applied is False
        assert any(
            "install setta-fixture-frontend in workspace" in change
            for change in check_result.plannedChanges
        )

        apply_result = manager.apply_lockfile(check=False)
        assert apply_result.applied is True
    finally:
        if old_no_index is None:
            os.environ.pop("PIP_NO_INDEX", None)
        else:
            os.environ["PIP_NO_INDEX"] = old_no_index
        if old_find_links is None:
            os.environ.pop("PIP_FIND_LINKS", None)
        else:
            os.environ["PIP_FIND_LINKS"] = old_find_links

    status_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-frontend"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(status_entries) == 1
    assert status_entries[0].state == PluginRuntimeState.active


def test_install_plugin_from_local_github_artifact(tmp_path: Path) -> None:
    # Install flow should support github: source specs through real git clone paths.
    github_base_url, ref = _build_local_github_bare_repo_from_fixture(
        tmp_path=tmp_path,
        fixture_name="frontend",
        owner="acme",
        repo="setta-fixture-frontend",
    )
    manager = _make_manager(tmp_path, github_base_url=github_base_url)

    installed = manager.install_plugin(
        source_spec=f"github:acme/setta-fixture-frontend#{ref}",
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )

    assert installed.pluginId == "setta-fixture-frontend"
    assert installed.state == PluginRuntimeState.active
    assert installed.canonicalSourceKey == "github:acme/setta-fixture-frontend"

    status_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-frontend"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(status_entries) == 1
    assert status_entries[0].state == PluginRuntimeState.active


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


def test_enablement_source_tracks_workspace_overrides(tmp_path: Path) -> None:
    # Status should surface whether enablement is from manifest default or workspace overrides.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="frontend",
        scope=PluginScope.workspace,
    )
    manager.rescan()

    initial_entry = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-frontend"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ][0]
    assert initial_entry.state == PluginRuntimeState.active
    assert initial_entry.enablementSource == "manifest_default"

    manager.disable_plugin(plugin_id="setta-fixture-frontend")
    disabled_entry = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-frontend"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ][0]
    assert disabled_entry.state == PluginRuntimeState.disabled
    assert disabled_entry.enablementSource == "workspace_disabled"

    manager.enable_plugin(plugin_id="setta-fixture-frontend")
    enabled_entry = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-frontend"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ][0]
    assert enabled_entry.state == PluginRuntimeState.active
    assert enabled_entry.enablementSource == "workspace_enabled"


def test_global_install_uses_global_auto_enable_source(tmp_path: Path) -> None:
    # Global install enablement should flow through global defaults, not workspace overrides.
    manager = _make_manager(tmp_path)
    install_result = manager.link_plugin(
        local_plugin_root=str(_fixture_path("frontend")),
        scope=PluginScope.global_scope,
        enable=True,
        force=False,
    )
    assert install_result.sourceScope == PluginScope.global_scope

    status_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-frontend"
        and entry.sourceScope == PluginScope.global_scope
        and entry.shadowedBySourcePath is None
    ]
    assert len(status_entries) == 1
    assert status_entries[0].state == PluginRuntimeState.active
    assert status_entries[0].enablementSource == "global_auto_enabled"


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


def test_backend_pending_restart_clears_after_load(tmp_path: Path) -> None:
    # Backend pending-restart entries should clear after backend load/restart.
    manager = _make_manager(tmp_path)
    linked = manager.link_plugin(
        local_plugin_root=str(_fixture_path("backend")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    assert linked.state == PluginRuntimeState.pending_restart

    manager.load_backend_plugins(app=FastAPI())

    status_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == linked.pluginId
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(status_entries) == 1
    assert status_entries[0].state == PluginRuntimeState.active
    assert status_entries[0].restartRequired is False


def test_backend_uninstall_surfaces_pending_restart_tombstone(tmp_path: Path) -> None:
    # Backend uninstall should remain visible as pending_restart until backend reload.
    manager = _make_manager(tmp_path)
    linked = manager.link_plugin(
        local_plugin_root=str(_fixture_path("backend")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    manager.load_backend_plugins(app=FastAPI())

    removed = manager.uninstall_plugin(
        plugin_id=linked.pluginId,
        scope=PluginScope.workspace,
    )
    assert removed.restartRequired is True

    status_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == linked.pluginId
    ]
    assert len(status_entries) == 1
    assert status_entries[0].state == PluginRuntimeState.pending_restart
    assert status_entries[0].restartRequired is True
    assert status_entries[0].sourceScope == PluginScope.workspace


def test_backend_uninstall_pending_restart_clears_after_load(tmp_path: Path) -> None:
    # Pending restart tombstones from backend uninstall clear after backend reload.
    manager = _make_manager(tmp_path)
    linked = manager.link_plugin(
        local_plugin_root=str(_fixture_path("backend")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    manager.load_backend_plugins(app=FastAPI())
    manager.uninstall_plugin(
        plugin_id=linked.pluginId,
        scope=PluginScope.workspace,
    )

    manager.load_backend_plugins(app=FastAPI())

    status_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == linked.pluginId
    ]
    assert status_entries == []


def test_pending_restart_state_persists_across_manager_instances(
    tmp_path: Path,
) -> None:
    # Pending restart ids must persist in plugins_state for fresh manager instances.
    manager = _make_manager(tmp_path)
    linked = manager.link_plugin(
        local_plugin_root=str(_fixture_path("backend")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    assert linked.state == PluginRuntimeState.pending_restart

    manager_reloaded = PluginManager(
        workspace_root=manager.workspace_root,
        setta_files_root=manager.setta_files_root,
        setta_home=manager.setta_home,
        server_mode="ide",
        setta_version="0.1.0",
    )
    status_entries = [
        entry
        for entry in manager_reloaded.get_status_response().plugins
        if entry.pluginId == linked.pluginId
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(status_entries) == 1
    assert status_entries[0].state == PluginRuntimeState.pending_restart


def test_load_backend_plugins_clears_persisted_pending_restart_state(
    tmp_path: Path,
) -> None:
    # Backend load/restart should clear persisted pending restart ids.
    manager = _make_manager(tmp_path)
    linked = manager.link_plugin(
        local_plugin_root=str(_fixture_path("backend")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    assert linked.state == PluginRuntimeState.pending_restart

    manager_reloaded = PluginManager(
        workspace_root=manager.workspace_root,
        setta_files_root=manager.setta_files_root,
        setta_home=manager.setta_home,
        server_mode="ide",
        setta_version="0.1.0",
    )
    manager_reloaded.load_backend_plugins(app=FastAPI())

    plugins_state_path = manager_reloaded.setta_files_root / "plugins_state.json"
    plugins_state_payload = json.loads(plugins_state_path.read_text(encoding="utf-8"))
    assert plugins_state_payload["pendingRestartBackendPluginIds"] == []


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


def test_load_backend_plugins_registers_fixture_language_server(
    tmp_path: Path,
) -> None:
    # Backend fixture plugins should be able to register language server definitions.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-language-server",
        scope=PluginScope.workspace,
    )
    manager.rescan()

    manager.load_backend_plugins(app=FastAPI())

    backend_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend-language-server"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(backend_entries) == 1
    assert backend_entries[0].state == PluginRuntimeState.active
    assert len(backend_entries[0].registeredLanguageServers) == 1
    status_registration = backend_entries[0].registeredLanguageServers[0]
    assert status_registration.name == "setta-fixture-backend-language-server:typescript"
    assert status_registration.language == "typescript"
    assert status_registration.command == "typescript-language-server"
    assert status_registration.args == ["--stdio"]
    assert status_registration.settingsKey == "typescriptLanguageServer"

    registrations = manager.get_backend_language_servers()
    assert len(registrations) == 1
    registration = registrations[0]
    assert registration.plugin_id == "setta-fixture-backend-language-server"
    assert registration.language.value == "typescript"
    assert registration.command == "typescript-language-server"
    assert registration.args == ("--stdio",)
    assert registration.settings_key == "typescriptLanguageServer"


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
    baseline_tools = list(SETTA_MCP_TOOLS)
    try:
        manager.load_backend_plugins(app=app)

        process = manager._backend_worker_processes.get("setta-fixture-backend")
        assert process is not None
        assert process.poll() is None
        assert "setta_fixture_backend_echo" in {
            tool.__name__ for tool in SETTA_MCP_TOOLS
        }

        manager.shutdown_backend_plugins()

        assert manager._backend_worker_processes == {}
        assert process.poll() is not None
        assert [tool.__name__ for tool in SETTA_MCP_TOOLS] == [
            tool.__name__ for tool in baseline_tools
        ]
    finally:
        manager.shutdown_backend_plugins()
        SETTA_MCP_TOOLS[:] = baseline_tools


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


def test_backend_language_server_registration_rejects_invalid_provider_payload(
    tmp_path: Path,
) -> None:
    # Language-server provider payload validation should fail fast on bad field types.
    manager = _make_manager(tmp_path)
    backend_root = _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-language-server",
        scope=PluginScope.workspace,
    )
    (backend_root / "backend" / "entrypoint.py").write_text(
        "def register(plugin):\n"
        "    plugin.register_language_server(\n"
        "        {\n"
        "            'language': 'typescript',\n"
        "            'command': 'typescript-language-server',\n"
        "            'args': '--stdio',\n"
        "        }\n"
        "    )\n",
        encoding="utf-8",
    )
    manager.rescan()

    manager.load_backend_plugins(app=FastAPI())

    backend_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend-language-server"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(backend_entries) == 1
    assert backend_entries[0].state == PluginRuntimeState.invalid
    assert any(
        error.code == "PLUGIN_BACKEND_REGISTER_FAILED"
        and "args must be an array of strings" in error.message
        for error in backend_entries[0].errors
    )


@pytest.mark.parametrize("server_mode", ["share", "app"])
def test_mode_policy_blocks_backend_language_server_registration(
    tmp_path: Path,
    server_mode: Literal["share", "app"],
) -> None:
    # Share/App should block registerLanguageServer and surface deterministic status.
    manager = _make_manager(tmp_path, server_mode=server_mode)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-language-server",
        scope=PluginScope.workspace,
    )
    manager.rescan()

    list_response = manager.get_list_response()
    list_entries = [
        entry
        for entry in list_response.plugins
        if entry.pluginId == "setta-fixture-backend-language-server"
    ]
    assert len(list_entries) == 1
    assert list_entries[0].effectiveCapabilities == []

    status_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend-language-server"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(status_entries) == 1
    status_entry = status_entries[0]
    assert status_entry.state == PluginRuntimeState.active
    assert status_entry.requestedCapabilities == ["registerLanguageServer"]
    assert status_entry.effectiveCapabilities == []
    assert status_entry.registeredLanguageServers == []
    assert len(status_entry.blockedCapabilities) == 1
    assert status_entry.blockedCapabilities[0].capability == "registerLanguageServer"
    assert (
        status_entry.blockedCapabilities[0].reason
        == BlockedCapabilityReason.mode_policy
    )

    manager.load_backend_plugins(app=FastAPI())

    loaded_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend-language-server"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(loaded_entries) == 1
    assert loaded_entries[0].state == PluginRuntimeState.invalid
    assert any(
        error.code == "PLUGIN_CAPABILITY_DENIED" for error in loaded_entries[0].errors
    )


@pytest.mark.parametrize("server_mode", ["share", "app"])
def test_mode_policy_blocked_capabilities_are_exposed_in_status_and_list(
    tmp_path: Path, server_mode: Literal["share", "app"]
) -> None:
    # Share/App should expose deterministic mode-policy blocked capability metadata.
    manager = _make_manager(tmp_path, server_mode=server_mode)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()

    list_response = manager.get_list_response()
    assert list_response.serverMode == server_mode
    list_entries = [
        entry
        for entry in list_response.plugins
        if entry.pluginId == "setta-fixture-backend"
    ]
    assert len(list_entries) == 1
    assert list_entries[0].effectiveCapabilities == []

    status_response = manager.get_status_response()
    assert status_response.serverMode == server_mode
    status_entries = [
        entry
        for entry in status_response.plugins
        if entry.pluginId == "setta-fixture-backend"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(status_entries) == 1
    entry = status_entries[0]
    assert entry.state == PluginRuntimeState.active
    assert set(entry.requestedCapabilities) == {"registerRouter", "registerMcpTools"}
    assert entry.effectiveCapabilities == []
    blocked_reasons = {
        blocked.capability: blocked.reason for blocked in entry.blockedCapabilities
    }
    assert blocked_reasons == {
        "registerRouter": BlockedCapabilityReason.mode_policy,
        "registerMcpTools": BlockedCapabilityReason.mode_policy,
    }


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
        "import time\n\ntime.sleep(0.5)\n\ndef register(plugin):\n    return None\n",
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
        "import time\n\ndef register(plugin):\n    time.sleep(0.5)\n",
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
        "import os\n\nos._exit(1)\n",
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


def test_backend_plugin_handshake_missing_methods_is_reported(tmp_path: Path) -> None:
    # Handshakes missing required RPC methods should invalidate backend plugins.
    manager = _make_manager(tmp_path)
    backend_root = _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    handshake_override = backend_root / "backend" / "handshake.override.json"
    handshake_override.write_text(
        json.dumps(
            {
                "supportedRpcMethods": [
                    "plugin.initialize",
                    "plugin.register",
                    "plugin.shutdown",
                ]
            },
            indent=2,
        ),
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
    assert "PLUGIN_BACKEND_HANDSHAKE_INVALID" in error_codes


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


def test_init_build_install_golden_path_plugin_is_usable(tmp_path: Path) -> None:
    # Golden path: init -> build artifact -> install via pypi source -> load/use plugin.
    manager = _make_manager(tmp_path)
    plugin_id = "setta-golden-path-plugin"
    plugin_root = manager.init_plugin_template(
        plugin_id=plugin_id,
        template="full",
        out_dir=str(tmp_path),
    )

    (plugin_root / "backend" / "entrypoint.py").write_text(
        "import json\n"
        "from pathlib import Path\n\n"
        "def register(plugin):\n"
        "    marker_path = Path(plugin.plugin_root) / 'backend' / 'register.marker.json'\n"
        "    marker_path.write_text(\n"
        "        json.dumps({'pluginId': plugin.plugin_id, 'serverMode': plugin.server_mode}),\n"
        "        encoding='utf-8',\n"
        "    )\n",
        encoding="utf-8",
    )

    manager.validate_plugin_folder(plugin_root)
    dist_dir = _build_python_package_artifacts(plugin_root)

    old_no_index = os.environ.get("PIP_NO_INDEX")
    old_find_links = os.environ.get("PIP_FIND_LINKS")
    os.environ["PIP_NO_INDEX"] = "1"
    os.environ["PIP_FIND_LINKS"] = str(dist_dir)
    try:
        installed = manager.install_plugin(
            source_spec=f"pypi:{plugin_id}==0.1.0",
            scope=PluginScope.workspace,
            enable=True,
            force=False,
        )
    finally:
        if old_no_index is None:
            os.environ.pop("PIP_NO_INDEX", None)
        else:
            os.environ["PIP_NO_INDEX"] = old_no_index
        if old_find_links is None:
            os.environ.pop("PIP_FIND_LINKS", None)
        else:
            os.environ["PIP_FIND_LINKS"] = old_find_links

    assert installed.pluginId == plugin_id
    assert installed.version == "0.1.0"
    assert installed.state == PluginRuntimeState.pending_restart
    assert installed.restartRequired is True
    assert installed.sourceDigestSha256 is not None

    listed_entries = [
        entry
        for entry in manager.get_list_response().plugins
        if entry.pluginId == plugin_id
    ]
    assert len(listed_entries) == 1
    assert listed_entries[0].frontend.entrypointUrl is not None
    assert listed_entries[0].sourceScope == PluginScope.workspace

    app = FastAPI()
    manager.load_backend_plugins(app=app)
    status_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == plugin_id
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(status_entries) == 1
    assert status_entries[0].state == PluginRuntimeState.active
    assert status_entries[0].restartRequired is False

    marker_payload = json.loads(
        (
            manager.workspace_root
            / "plugins"
            / plugin_id
            / "backend"
            / "register.marker.json"
        ).read_text(encoding="utf-8")
    )
    assert marker_payload == {
        "pluginId": plugin_id,
        "serverMode": "ide",
    }

    frontend_asset = manager.resolve_plugin_asset_path(
        plugin_id=plugin_id,
        asset_path="frontend/dist/index.js",
    )
    frontend_asset_text = frontend_asset.read_text(encoding="utf-8")
    assert "export const apiVersion = 1;" in frontend_asset_text


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
