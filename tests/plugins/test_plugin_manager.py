import base64
import json
import os
import subprocess
import shutil
import tarfile
import sys
import threading
import time
import zipfile
import importlib.metadata
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from setta.mcp.tool_metadata import get_tool_access
from setta.mcp.tool_setup import SETTA_MCP_TOOLS
from setta.plugins.errors import PluginManagerError
from setta.plugins.manager import CandidatePlugin, PluginManager
from setta.plugins.models import (
    BlockedCapabilityReason,
    PluginInstallerBackend,
    PluginInstallHistoryEntry,
    PluginRuntimeState,
    PluginScope,
    normalize_scope,
)
from setta.types.helpers_lvl3 import merge_single_config_into_backend
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig

FIXTURE_PLUGIN_ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "plugins"


def _make_manager(
    tmp_path: Path,
    server_mode: Literal["ide", "share", "app"] = "ide",
    github_base_url: str | None = None,
    restart_callback: Callable[[], bool] | None = None,
    backend_startup_timeout_seconds: float = 10.0,
    backend_register_timeout_seconds: float = 10.0,
    backend_operation_timeout_seconds: float = 120.0,
    package_manager_search_paths: list[Path] | None = None,
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
        backend_operation_timeout_seconds=backend_operation_timeout_seconds,
        package_manager_search_paths=package_manager_search_paths,
    )


def _fixture_path(name: str) -> Path:
    return FIXTURE_PLUGIN_ROOT / name


def _fixture_manifest(name: str) -> dict:
    return json.loads((_fixture_path(name) / "setta.plugin.json").read_text())


def _scope_root(manager: PluginManager, scope: PluginScope) -> Path:
    if scope == PluginScope.workspace:
        return manager.workspace_root / ".setta_plugins"
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


def _install_fixture_distribution_in_site_packages(
    *,
    tmp_path: Path,
    fixture_name: str,
    package_name: str,
    version: str,
) -> Path:
    site_packages = tmp_path / "site-packages"
    site_packages.mkdir(parents=True, exist_ok=True)
    plugin_root = site_packages / package_name
    shutil.copytree(_fixture_path(fixture_name), plugin_root)

    dist_info_name = f"{package_name.replace('-', '_')}-{version}.dist-info"
    dist_info = site_packages / dist_info_name
    dist_info.mkdir(parents=True, exist_ok=True)
    (dist_info / "METADATA").write_text(
        "\n".join(
            [
                "Metadata-Version: 2.1",
                f"Name: {package_name}",
                f"Version: {version}",
                "Summary: Setta fixture plugin",
                "",
            ]
        ),
        encoding="utf-8",
    )

    record_lines: list[str] = []
    for path in sorted(site_packages.rglob("*"), key=lambda item: str(item)):
        if not path.is_file():
            continue
        relative_path = path.relative_to(site_packages).as_posix()
        if relative_path.endswith("RECORD"):
            continue
        record_lines.append(f"{relative_path},,")
    record_lines.append(f"{dist_info_name}/RECORD,,")
    (dist_info / "RECORD").write_text("\n".join(record_lines) + "\n", encoding="utf-8")
    return site_packages


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
    dist_dir.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(
        (plugin_root / "setta.plugin.json").read_text(encoding="utf-8")
    )
    package_name = str(manifest["id"])
    version = str(manifest["version"])
    normalized_name = package_name.replace("-", "_")
    dist_info_name = f"{normalized_name}-{version}.dist-info"
    wheel_path = dist_dir / f"{normalized_name}-{version}-py3-none-any.whl"
    with zipfile.ZipFile(wheel_path, "w", compression=zipfile.ZIP_DEFLATED) as zipf:
        for path in sorted(plugin_root.rglob("*"), key=lambda item: str(item)):
            if not path.is_file():
                continue
            if path.is_relative_to(dist_dir):
                continue
            relative_path = path.relative_to(plugin_root).as_posix()
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

    sdist_root = f"{package_name}-{version}"
    sdist_path = dist_dir / f"{sdist_root}.tar.gz"
    with tarfile.open(sdist_path, "w:gz") as archive:
        for path in sorted(plugin_root.rglob("*"), key=lambda item: str(item)):
            if path.is_relative_to(dist_dir):
                continue
            archive.add(
                path,
                arcname=f"{sdist_root}/{path.relative_to(plugin_root).as_posix()}",
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
    [
        "backend",
        "backend-codegen",
        "backend-language-server",
        "backend-language-server-e2e",
        "backend-external-agent",
        "backend-mcp-tools",
        "backend-static-router",
        "backend-worker-failure-api-version",
        "backend-worker-failure-missing-method",
        "backend-worker-failure-transport",
        "backend-worker-failure-timeout-startup",
        "backend-worker-failure-timeout-register",
        "frontend",
        "frontend-topnav",
        "frontend-errors",
        "content",
        "full",
        "metadata-mismatch-id",
        "metadata-mismatch-version",
        "scope-shadowing",
    ],
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
            installer=PluginInstallerBackend.pip,
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
    assert installed.requestedCapabilities == [
        "registerSectionKinds",
        "registerPane",
        "registerCommand",
        "readProjectState",
        "subscribeProjectState",
        "emitListenerEvents",
    ]
    assert installed.trustStatus == "unverified"
    assert "Source is unverified." in installed.trustWarning

    status_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-frontend"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(status_entries) == 1
    assert status_entries[0].state == PluginRuntimeState.active


def test_install_plugin_rejects_metadata_identity_mismatch_from_fixture(
    tmp_path: Path,
) -> None:
    # PyPI install must fail when package metadata name does not match manifest id.
    manager = _make_manager(tmp_path)
    package_name = "setta-fixture-metadata-id-package"
    version = "0.1.0"
    artifact = _build_local_pypi_wheel_from_fixture(
        tmp_path=tmp_path,
        fixture_name="metadata-mismatch-id",
        package_name=package_name,
        version=version,
    )

    old_no_index = os.environ.get("PIP_NO_INDEX")
    old_find_links = os.environ.get("PIP_FIND_LINKS")
    os.environ["PIP_NO_INDEX"] = "1"
    os.environ["PIP_FIND_LINKS"] = str(artifact.parent)
    try:
        with pytest.raises(PluginManagerError) as exc_info:
            manager.install_plugin(
                source_spec=f"pypi:{package_name}=={version}",
                installer=PluginInstallerBackend.pip,
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

    assert exc_info.value.code == "PLUGIN_SOURCE_IDENTITY_MISMATCH"


def test_install_plugin_rejects_metadata_version_mismatch_from_fixture(
    tmp_path: Path,
) -> None:
    # PyPI install must fail when package metadata version does not match manifest version.
    manager = _make_manager(tmp_path)
    package_name = "setta-fixture-metadata-version"
    version = "0.1.0"
    artifact = _build_local_pypi_wheel_from_fixture(
        tmp_path=tmp_path,
        fixture_name="metadata-mismatch-version",
        package_name=package_name,
        version=version,
    )

    old_no_index = os.environ.get("PIP_NO_INDEX")
    old_find_links = os.environ.get("PIP_FIND_LINKS")
    os.environ["PIP_NO_INDEX"] = "1"
    os.environ["PIP_FIND_LINKS"] = str(artifact.parent)
    try:
        with pytest.raises(PluginManagerError) as exc_info:
            manager.install_plugin(
                source_spec=f"pypi:{package_name}=={version}",
                installer=PluginInstallerBackend.pip,
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

    assert exc_info.value.code == "PLUGIN_SOURCE_VERSION_MISMATCH"


def test_install_plugin_rejects_ambiguous_plugin_root_layout_from_fixture(
    tmp_path: Path,
) -> None:
    # PyPI install must fail when an artifact contains multiple plugin manifests.
    manager = _make_manager(tmp_path)
    package_name = "setta-fixture-layout-bundle"
    version = "0.1.0"
    artifact = _build_local_pypi_wheel_from_fixture(
        tmp_path=tmp_path,
        fixture_name="metadata-mismatch-layout",
        package_name=package_name,
        version=version,
    )

    old_no_index = os.environ.get("PIP_NO_INDEX")
    old_find_links = os.environ.get("PIP_FIND_LINKS")
    os.environ["PIP_NO_INDEX"] = "1"
    os.environ["PIP_FIND_LINKS"] = str(artifact.parent)
    try:
        with pytest.raises(PluginManagerError) as exc_info:
            manager.install_plugin(
                source_spec=f"pypi:{package_name}=={version}",
                installer=PluginInstallerBackend.pip,
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

    assert exc_info.value.code == "PLUGIN_SOURCE_AMBIGUOUS_PLUGIN_ROOT"


def test_install_plugin_auto_installer_falls_back_to_pip_when_uv_unavailable(
    tmp_path: Path,
) -> None:
    # Auto installer should fall back to pip when uv is not available on PATH.
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
    old_path = os.environ.get("PATH")
    os.environ["PIP_NO_INDEX"] = "1"
    os.environ["PIP_FIND_LINKS"] = str(artifact.parent)
    os.environ["PATH"] = ""
    try:
        installed = manager.install_plugin(
            source_spec=f"pypi:{package_name}=={version}",
            installer=PluginInstallerBackend.auto,
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
        if old_path is None:
            os.environ.pop("PATH", None)
        else:
            os.environ["PATH"] = old_path

    assert installed.pluginId == "setta-fixture-frontend"
    assert installed.state == PluginRuntimeState.active


def test_install_plugin_auto_installer_falls_back_to_pip_when_uv_install_fails(
    tmp_path: Path,
) -> None:
    # Auto installer should recover through pip when uv exists but install command fails.
    manager = _make_manager(tmp_path)
    package_name = "setta-fixture-frontend"
    version = "0.1.0"
    artifact = _build_local_pypi_wheel_from_fixture(
        tmp_path=tmp_path,
        fixture_name="frontend",
        package_name=package_name,
        version=version,
    )
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir(parents=True, exist_ok=True)
    uv_calls_path = tmp_path / "uv_calls.log"
    fake_uv = fake_bin / "uv"
    fake_uv.write_text(
        f'#!/usr/bin/env bash\necho "called" >> "{uv_calls_path}"\nexit 2\n',
        encoding="utf-8",
    )
    fake_uv.chmod(0o755)

    old_no_index = os.environ.get("PIP_NO_INDEX")
    old_find_links = os.environ.get("PIP_FIND_LINKS")
    old_path = os.environ.get("PATH")
    os.environ["PIP_NO_INDEX"] = "1"
    os.environ["PIP_FIND_LINKS"] = str(artifact.parent)
    os.environ["PATH"] = (
        f"{fake_bin}:{old_path}" if old_path is not None else str(fake_bin)
    )
    try:
        installed = manager.install_plugin(
            source_spec=f"pypi:{package_name}=={version}",
            installer=PluginInstallerBackend.auto,
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
        if old_path is None:
            os.environ.pop("PATH", None)
        else:
            os.environ["PATH"] = old_path

    assert installed.pluginId == "setta-fixture-frontend"
    assert installed.state == PluginRuntimeState.active
    assert uv_calls_path.read_text(encoding="utf-8").strip() == "called"


def test_install_plugin_explicit_uv_backend_requires_uv_binary(tmp_path: Path) -> None:
    # Explicit uv backend should fail with a deterministic error when uv is unavailable.
    manager = _make_manager(tmp_path)
    old_path = os.environ.get("PATH")
    os.environ["PATH"] = ""
    try:
        with pytest.raises(PluginManagerError) as exc_info:
            manager.install_plugin(
                source_spec="pypi:setta-fixture-frontend==0.1.0",
                installer=PluginInstallerBackend.uv,
                scope=PluginScope.workspace,
                enable=True,
                force=False,
            )
    finally:
        if old_path is None:
            os.environ.pop("PATH", None)
        else:
            os.environ["PATH"] = old_path

    assert exc_info.value.code == "PLUGIN_INSTALLER_BACKEND_UNAVAILABLE"


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
            installer=PluginInstallerBackend.pip,
            scope=PluginScope.workspace,
            enable=True,
            force=False,
        )
        lock_write = manager.write_lockfile()
        assert lock_write.pluginCount == 1
        lock_payload = json.loads(manager._lockfile_path.read_text(encoding="utf-8"))
        lock_entries = lock_payload.get("plugins", [])
        assert len(lock_entries) == 1
        assert lock_entries[0]["installerBackend"] == "pip"

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


def test_install_plugin_from_github_strips_git_metadata_and_is_digest_stable(
    tmp_path: Path,
) -> None:
    # GitHub installs should exclude VCS metadata so identical refs produce stable digests.
    github_base_url, ref = _build_local_github_bare_repo_from_fixture(
        tmp_path=tmp_path,
        fixture_name="frontend",
        owner="acme",
        repo="setta-fixture-frontend",
    )
    manager = _make_manager(tmp_path, github_base_url=github_base_url)

    first_install = manager.install_plugin(
        source_spec=f"github:acme/setta-fixture-frontend#{ref}",
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    installed_root = (
        manager.workspace_root / ".setta_plugins" / "setta-fixture-frontend"
    )
    assert not (installed_root / ".git").exists()
    assert first_install.sourceDigestSha256 is not None

    manager.uninstall_plugin(
        plugin_id="setta-fixture-frontend",
        scope=PluginScope.workspace,
    )
    second_install = manager.install_plugin(
        source_spec=f"github:acme/setta-fixture-frontend#{ref}",
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    assert second_install.sourceDigestSha256 == first_install.sourceDigestSha256


def test_candidate_from_github_reports_missing_git_binary(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # GitHub source fetches should map missing git to structured plugin fetch errors.
    manager = _make_manager(tmp_path)
    source_spec = manager._parse_source_spec("github:acme/setta-fixture-frontend#main")
    fetch_dir = tmp_path / "github-fetch"
    fetch_dir.mkdir(parents=True, exist_ok=True)

    def _raise_missing_git(*_args, **_kwargs):
        raise FileNotFoundError(2, "No such file or directory", "git")

    monkeypatch.setattr("setta.plugins.manager.subprocess.run", _raise_missing_git)
    with pytest.raises(PluginManagerError) as exc_info:
        manager._candidate_from_github(source_spec, fetch_dir)

    assert exc_info.value.code == "PLUGIN_SOURCE_FETCH_FAILED"
    assert "git is not installed or not available on PATH." in exc_info.value.message


@pytest.mark.parametrize(
    ("env_value", "expected_timeout"),
    [
        ("75.5", 75.5),
        ("0", 1.0),
        ("10000", 600.0),
        ("nan", 30.0),
        ("not-a-number", 30.0),
        ("", 30.0),
    ],
)
def test_plugin_manager_reads_github_clone_timeout_from_env(
    tmp_path: Path,
    monkeypatch,
    env_value: str,
    expected_timeout: float,
) -> None:
    # Clone timeout env values should parse deterministically with validation and bounds.
    monkeypatch.setenv("SETTA_PLUGIN_GITHUB_CLONE_TIMEOUT_SECONDS", env_value)
    manager = _make_manager(tmp_path)
    assert manager._github_clone_timeout_seconds == expected_timeout


def test_candidate_from_github_reports_clone_timeouts(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # GitHub source fetches should fail fast when clone exceeds timeout bounds.
    manager = _make_manager(tmp_path)
    source_spec = manager._parse_source_spec("github:acme/setta-fixture-frontend#main")
    fetch_dir = tmp_path / "github-fetch-timeout"
    fetch_dir.mkdir(parents=True, exist_ok=True)

    def _raise_timeout(*_args, **kwargs):
        assert kwargs["timeout"] == manager._github_clone_timeout_seconds
        clone_env = kwargs["env"]
        assert isinstance(clone_env, dict)
        assert clone_env.get("GIT_TERMINAL_PROMPT") == "0"
        raise subprocess.TimeoutExpired(
            cmd=["git", "clone"],
            timeout=manager._github_clone_timeout_seconds,
        )

    monkeypatch.setattr("setta.plugins.manager.subprocess.run", _raise_timeout)
    with pytest.raises(PluginManagerError) as exc_info:
        manager._candidate_from_github(source_spec, fetch_dir)

    assert exc_info.value.code == "PLUGIN_SOURCE_FETCH_FAILED"
    assert "Timed out waiting for git clone." in exc_info.value.message


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


def test_package_manager_plugins_are_discovered_from_environment_search_paths(
    tmp_path: Path,
) -> None:
    # Plugins shipped inside active environment distributions should be discovered as setta_files-scoped.
    package_name = "setta-fixture-frontend"
    version = "0.1.0"
    site_packages = _install_fixture_distribution_in_site_packages(
        tmp_path=tmp_path,
        fixture_name="frontend",
        package_name=package_name,
        version=version,
    )
    manager = _make_manager(tmp_path)
    manager._package_manager_search_paths = [site_packages]
    manager.rescan()

    entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == package_name
        and entry.sourceScope == PluginScope.setta_files
        and entry.shadowedBySourcePath is None
    ]
    assert len(entries) == 1
    entry = entries[0]
    assert entry.sourceScopeLabel == "setta_files"
    assert entry.sourceManager == "package_manager"
    assert entry.canonicalSourceKey == "pypi:setta-fixture-frontend"
    assert entry.sourceManagerHint is not None
    assert "Use uv/pip/Poetry" in entry.sourceManagerHint

    list_entries = [
        plugin
        for plugin in manager.get_runtime_response().list.plugins
        if plugin.pluginId == package_name
    ]
    assert len(list_entries) == 1
    assert list_entries[0].sourceManager == "package_manager"
    assert list_entries[0].sourceScopeLabel == "setta_files"


def test_package_manager_discovery_uses_distribution_fingerprint_not_tree_walk(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Package-manager discovery should not recurse plugin roots to compute digests.
    package_name = "setta-fixture-frontend"
    version = "0.1.0"
    site_packages = _install_fixture_distribution_in_site_packages(
        tmp_path=tmp_path,
        fixture_name="frontend",
        package_name=package_name,
        version=version,
    )
    manager = _make_manager(tmp_path)
    manager._package_manager_search_paths = [site_packages]

    def _fail_directory_digest(_root: Path) -> str:
        raise AssertionError(
            "Expected package-manager discovery to avoid directory tree digesting."
        )

    monkeypatch.setattr(
        manager,
        "_compute_directory_digest",
        _fail_directory_digest,
    )

    manager.rescan()
    entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == package_name
        and entry.sourceManager == "package_manager"
        and entry.shadowedBySourcePath is None
    ]
    assert len(entries) == 1


def test_package_manager_source_digest_cache_is_bounded(tmp_path: Path) -> None:
    # Package-manager digest cache should stay bounded in long-lived sessions.
    package_name = "setta-fixture-frontend"
    version = "0.1.0"
    site_packages = _install_fixture_distribution_in_site_packages(
        tmp_path=tmp_path,
        fixture_name="frontend",
        package_name=package_name,
        version=version,
    )
    manager = _make_manager(
        tmp_path,
        package_manager_search_paths=[site_packages],
    )

    distribution = next(
        item
        for item in importlib.metadata.distributions(path=[str(site_packages)])
        if item.metadata.get("Name") == package_name
    )
    max_entries = 256
    for index in range(max_entries + 20):
        manager._compute_package_manager_source_digest(
            distribution=distribution,
            plugin_root=tmp_path / f"digest-cache-root-{index}",
        )

    assert len(manager._package_manager_source_digest_cache) <= max_entries


def test_package_manager_discovery_marks_multiple_manifest_roots_invalid(
    tmp_path: Path,
) -> None:
    # Distributions exposing multiple plugin manifests should be surfaced as invalid.
    package_name = "setta-fixture-layout-bundle"
    version = "0.1.0"
    site_packages = _install_fixture_distribution_in_site_packages(
        tmp_path=tmp_path,
        fixture_name="metadata-mismatch-layout",
        package_name=package_name,
        version=version,
    )
    manager = _make_manager(
        tmp_path,
        package_manager_search_paths=[site_packages],
    )

    entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == package_name
        and entry.sourceScope == PluginScope.setta_files
        and entry.shadowedBySourcePath is None
    ]
    assert len(entries) == 1
    entry = entries[0]
    assert entry.sourceManager == "package_manager"
    assert entry.state == PluginRuntimeState.invalid
    error_codes = {error.code for error in entry.errors}
    assert "PLUGIN_SOURCE_AMBIGUOUS_PLUGIN_ROOT" in error_codes


def test_package_manager_discovery_marks_invalid_manifest_payloads_invalid(
    tmp_path: Path,
) -> None:
    # Package-manager discovery should expose manifest parse failures as invalid entries.
    package_name = "setta-fixture-frontend"
    version = "0.1.0"
    site_packages = _install_fixture_distribution_in_site_packages(
        tmp_path=tmp_path,
        fixture_name="frontend",
        package_name=package_name,
        version=version,
    )
    plugin_root = site_packages / package_name
    (plugin_root / "setta.plugin.json").write_text("{not-json", encoding="utf-8")

    manager = _make_manager(
        tmp_path,
        package_manager_search_paths=[site_packages],
    )
    entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == package_name
        and entry.sourceScope == PluginScope.setta_files
        and entry.shadowedBySourcePath is None
    ]
    assert len(entries) == 1
    entry = entries[0]
    assert entry.sourceManager == "package_manager"
    assert entry.state == PluginRuntimeState.invalid
    error_codes = {error.code for error in entry.errors}
    assert "PLUGIN_MANIFEST_INVALID" in error_codes


def test_same_scope_setta_plugins_shadow_package_manager_plugins(
    tmp_path: Path,
) -> None:
    # Within the same scope, setta-managed plugin roots should win over package-managed roots.
    package_name = "setta-fixture-frontend"
    version = "0.1.0"
    site_packages = _install_fixture_distribution_in_site_packages(
        tmp_path=tmp_path,
        fixture_name="frontend",
        package_name=package_name,
        version=version,
    )
    manager = _make_manager(
        tmp_path,
        package_manager_search_paths=[site_packages],
    )
    setta_source_path = _copy_fixture_to_scope(
        manager=manager,
        fixture_name="frontend",
        scope=PluginScope.setta_files,
    )
    manager.rescan()

    status_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == package_name
        and entry.sourceScope == PluginScope.setta_files
    ]
    assert len(status_entries) == 2
    setta_entry = next(
        entry for entry in status_entries if entry.sourceManager == "setta"
    )
    package_manager_entry = next(
        entry for entry in status_entries if entry.sourceManager == "package_manager"
    )
    assert setta_entry.state == PluginRuntimeState.active
    assert setta_entry.shadowedBySourcePath is None
    assert package_manager_entry.state == PluginRuntimeState.shadowed
    assert package_manager_entry.shadowedBySourcePath == str(setta_source_path)

    list_entries = [
        entry
        for entry in manager.get_runtime_response().list.plugins
        if entry.pluginId == package_name
    ]
    assert len(list_entries) == 1
    assert list_entries[0].sourceManager == "setta"
    assert list_entries[0].sourceScope == PluginScope.setta_files


def test_package_manager_plugins_shadow_global_setta_plugins_across_scopes(
    tmp_path: Path,
) -> None:
    # Scope precedence should beat source-manager precedence across scopes.
    package_name = "setta-fixture-frontend"
    version = "0.1.0"
    site_packages = _install_fixture_distribution_in_site_packages(
        tmp_path=tmp_path,
        fixture_name="frontend",
        package_name=package_name,
        version=version,
    )
    manager = _make_manager(
        tmp_path,
        package_manager_search_paths=[site_packages],
    )
    global_source_path = _copy_fixture_to_scope(
        manager=manager,
        fixture_name="frontend",
        scope=PluginScope.global_scope,
    )
    manager.rescan()

    status_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == package_name
    ]
    assert len(status_entries) == 2
    package_manager_entry = next(
        entry for entry in status_entries if entry.sourceManager == "package_manager"
    )
    global_entry = next(
        entry
        for entry in status_entries
        if entry.sourceManager == "setta"
        and entry.sourceScope == PluginScope.global_scope
    )
    assert package_manager_entry.state == PluginRuntimeState.active
    assert package_manager_entry.sourceScope == PluginScope.setta_files
    assert package_manager_entry.shadowedBySourcePath is None
    assert global_entry.state == PluginRuntimeState.shadowed
    assert global_entry.shadowedBySourcePath == str(package_manager_entry.sourcePath)
    assert str(global_entry.sourcePath) == str(global_source_path)

    list_entries = [
        entry
        for entry in manager.get_runtime_response().list.plugins
        if entry.pluginId == package_name
    ]
    assert len(list_entries) == 1
    assert list_entries[0].sourceManager == "package_manager"
    assert list_entries[0].sourceScope == PluginScope.setta_files


def test_package_manager_plugins_reject_setta_write_lifecycle_actions(
    tmp_path: Path,
) -> None:
    # Environment-managed plugins should use package-manager workflows for update/uninstall.
    package_name = "setta-fixture-frontend"
    version = "0.1.0"
    site_packages = _install_fixture_distribution_in_site_packages(
        tmp_path=tmp_path,
        fixture_name="frontend",
        package_name=package_name,
        version=version,
    )
    manager = _make_manager(
        tmp_path,
        package_manager_search_paths=[site_packages],
    )

    with pytest.raises(PluginManagerError) as uninstall_error:
        manager.uninstall_plugin(
            plugin_id=package_name,
            scope=PluginScope.setta_files,
        )
    assert uninstall_error.value.code == "PLUGIN_MANAGED_EXTERNALLY"

    with pytest.raises(PluginManagerError) as update_error:
        manager.update_plugin(
            plugin_id=package_name,
            scope=PluginScope.setta_files,
        )
    assert update_error.value.code == "PLUGIN_MANAGED_EXTERNALLY"


def test_write_lockfile_excludes_package_manager_managed_plugins(
    tmp_path: Path,
) -> None:
    # Lockfiles should include only Setta-managed lifecycle entries.
    package_name = "setta-fixture-frontend"
    version = "0.1.0"
    site_packages = _install_fixture_distribution_in_site_packages(
        tmp_path=tmp_path,
        fixture_name="frontend",
        package_name=package_name,
        version=version,
    )
    manager = _make_manager(
        tmp_path,
        package_manager_search_paths=[site_packages],
    )
    manager.link_plugin(
        local_plugin_root=str(_fixture_path("backend")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )

    lock_write = manager.write_lockfile()
    payload = json.loads(manager._lockfile_path.read_text(encoding="utf-8"))
    lock_plugins = payload.get("plugins", [])

    assert lock_write.pluginCount == 1
    assert len(lock_plugins) == 1
    assert lock_plugins[0]["pluginId"] == "setta-fixture-backend"
    assert lock_plugins[0]["scope"] == "workspace"
    assert lock_plugins[0]["sourceSpec"].startswith("local:")


def test_apply_lockfile_skips_package_manager_drift(tmp_path: Path) -> None:
    # Lockfile convergence should ignore package-manager managed entries in current runtime.
    package_name = "setta-fixture-frontend"
    version = "0.1.0"
    site_packages = _install_fixture_distribution_in_site_packages(
        tmp_path=tmp_path,
        fixture_name="frontend",
        package_name=package_name,
        version=version,
    )
    manager = _make_manager(
        tmp_path,
        package_manager_search_paths=[site_packages],
    )
    lockfile_path = manager.workspace_root / ".setta_plugins" / "plugins.lock.json"
    lockfile_path.parent.mkdir(parents=True, exist_ok=True)
    lockfile_path.write_text(json.dumps({"plugins": []}), encoding="utf-8")

    check_result = manager.apply_lockfile(check=True)
    assert check_result.plannedChanges == []

    apply_result = manager.apply_lockfile(check=False)
    assert apply_result.applied is True
    assert apply_result.plannedChanges == []

    remaining_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == package_name
        and entry.sourceScope == PluginScope.setta_files
        and entry.sourceManager == "package_manager"
        and entry.shadowedBySourcePath is None
    ]
    assert len(remaining_entries) == 1


def test_apply_lockfile_skips_external_managed_lock_entries_without_source_spec(
    tmp_path: Path,
) -> None:
    # External-managed setta_files lock entries should never trigger install attempts.
    manager = _make_manager(tmp_path)
    lockfile_path = manager.workspace_root / ".setta_plugins" / "plugins.lock.json"
    lockfile_path.parent.mkdir(parents=True, exist_ok=True)
    lockfile_path.write_text(
        json.dumps(
            {
                "plugins": [
                    {
                        "pluginId": "setta-fixture-frontend",
                        "version": "0.1.0",
                        "canonicalSourceKey": "pypi:setta-fixture-frontend",
                        "scope": "setta_files",
                        "sourceDigestSha256": None,
                        "sourceSpec": None,
                        "installerBackend": None,
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    check_result = manager.apply_lockfile(check=True)
    assert check_result.plannedChanges == []

    apply_result = manager.apply_lockfile(check=False)
    assert apply_result.applied is True
    assert apply_result.plannedChanges == []


def test_package_manager_source_digest_tracks_plugin_root_when_record_has_no_hashes(
    tmp_path: Path,
) -> None:
    # Editable/no-hash distributions should include plugin-root change stamps in source digest.
    package_name = "setta-fixture-frontend"
    version = "0.1.0"
    site_packages = _install_fixture_distribution_in_site_packages(
        tmp_path=tmp_path,
        fixture_name="frontend",
        package_name=package_name,
        version=version,
    )
    manager = _make_manager(
        tmp_path,
        package_manager_search_paths=[site_packages],
    )
    distribution = next(
        item
        for item in importlib.metadata.distributions(path=[str(site_packages)])
        if item.metadata.get("Name") == package_name
    )
    plugin_root = site_packages / package_name
    manifest = manager._load_and_validate_manifest(plugin_root / "setta.plugin.json")

    first_digest = manager._compute_package_manager_source_digest(
        distribution=distribution,
        plugin_root=plugin_root,
        manifest=manifest,
    )
    frontend_entrypoint = plugin_root / "frontend" / "dist" / "index.js"
    frontend_entrypoint.write_text(
        frontend_entrypoint.read_text(encoding="utf-8") + "\n// digest-change\n",
        encoding="utf-8",
    )
    second_digest = manager._compute_package_manager_source_digest(
        distribution=distribution,
        plugin_root=plugin_root,
        manifest=manifest,
    )

    assert first_digest != second_digest


def test_update_plugin_marks_pending_restart_for_backend_only(
    tmp_path: Path,
) -> None:
    # Backend updates should require restart while frontend-only updates should not.
    manager = _make_manager(tmp_path)
    backend_package = "setta-fixture-backend"
    frontend_package = "setta-fixture-frontend"
    version = "0.1.0"
    backend_artifact = _build_local_pypi_wheel_from_fixture(
        tmp_path=tmp_path,
        fixture_name="backend",
        package_name=backend_package,
        version=version,
    )
    _ = _build_local_pypi_wheel_from_fixture(
        tmp_path=tmp_path,
        fixture_name="frontend",
        package_name=frontend_package,
        version=version,
    )

    old_no_index = os.environ.get("PIP_NO_INDEX")
    old_find_links = os.environ.get("PIP_FIND_LINKS")
    os.environ["PIP_NO_INDEX"] = "1"
    os.environ["PIP_FIND_LINKS"] = str(backend_artifact.parent)
    try:
        manager.install_plugin(
            source_spec=f"pypi:{backend_package}=={version}",
            installer=PluginInstallerBackend.pip,
            scope=PluginScope.workspace,
            enable=True,
            force=False,
        )
        manager.install_plugin(
            source_spec=f"pypi:{frontend_package}=={version}",
            installer=PluginInstallerBackend.pip,
            scope=PluginScope.workspace,
            enable=True,
            force=False,
        )

        backend_update = manager.update_plugin(
            plugin_id=backend_package,
            scope=PluginScope.workspace,
        )
        frontend_update = manager.update_plugin(
            plugin_id=frontend_package,
            scope=PluginScope.workspace,
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

    assert backend_update.restartRequired is True
    assert frontend_update.restartRequired is False

    backend_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == backend_package
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(backend_entries) == 1
    assert backend_entries[0].state == PluginRuntimeState.pending_restart
    assert backend_entries[0].restartRequired is True

    frontend_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == frontend_package
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(frontend_entries) == 1
    assert frontend_entries[0].state == PluginRuntimeState.active
    assert frontend_entries[0].restartRequired is False


def test_update_plugin_with_explicit_target_persists_source_metadata(
    tmp_path: Path,
) -> None:
    # update_plugin(to=...) should persist retargeted source metadata and canonical source key.
    manager = _make_manager(tmp_path)
    package_name = "setta-fixture-frontend"
    version = "0.1.0"
    artifact = _build_local_pypi_wheel_from_fixture(
        tmp_path=tmp_path,
        fixture_name="frontend",
        package_name=package_name,
        version=version,
    )
    replacement_source_spec = f"pypi:setta_fixture_frontend=={version}"
    replacement_canonical_source_key = "pypi:setta_fixture_frontend"

    old_no_index = os.environ.get("PIP_NO_INDEX")
    old_find_links = os.environ.get("PIP_FIND_LINKS")
    os.environ["PIP_NO_INDEX"] = "1"
    os.environ["PIP_FIND_LINKS"] = str(artifact.parent)
    try:
        manager.install_plugin(
            source_spec=f"pypi:{package_name}=={version}",
            installer=PluginInstallerBackend.pip,
            scope=PluginScope.workspace,
            enable=True,
            force=False,
        )
        update_result = manager.update_plugin(
            plugin_id=package_name,
            scope=PluginScope.workspace,
            to=replacement_source_spec,
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

    assert update_result.pluginId == package_name
    assert update_result.fromVersion == version
    assert update_result.toVersion == version

    status_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == package_name
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(status_entries) == 1
    assert status_entries[0].canonicalSourceKey == replacement_canonical_source_key

    metadata_key = manager._metadata_key(package_name, PluginScope.workspace)
    metadata = manager._load_install_metadata().entries[metadata_key]
    assert metadata.sourceSpec == replacement_source_spec
    assert metadata.canonicalSourceKey == replacement_canonical_source_key


def test_update_plugin_rejects_linked_local_sources(tmp_path: Path) -> None:
    # Linked local plugins should expose a domain-specific update-unavailable error.
    manager = _make_manager(tmp_path)
    manager.link_plugin(
        local_plugin_root=str(_fixture_path("frontend")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )

    with pytest.raises(PluginManagerError) as exc_info:
        manager.update_plugin(
            plugin_id="setta-fixture-frontend",
            scope=PluginScope.workspace,
        )
    assert exc_info.value.code == "PLUGIN_UPDATE_UNAVAILABLE"
    assert "linked local plugins" in exc_info.value.message


def test_scope_environment_is_rejected() -> None:
    # Scope normalization should reject removed aliases so callers use canonical scope labels.
    with pytest.raises(
        ValueError,
        match="'environment' is not supported; use 'setta_files'",
    ):
        normalize_scope("environment")


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


@pytest.mark.parametrize("mutation", ["enable", "disable"])
def test_missing_enable_disable_is_noop_for_plugins_state(
    tmp_path: Path,
    mutation: Literal["enable", "disable"],
) -> None:
    # Missing plugin enable/disable must fail before touching plugins_state persistence.
    manager = _make_manager(tmp_path)
    plugins_state_path = manager.setta_files_root / "plugins_state.json"
    assert not plugins_state_path.exists()

    with pytest.raises(PluginManagerError) as exc_info:
        if mutation == "enable":
            manager.enable_plugin(plugin_id="missing-plugin")
        else:
            manager.disable_plugin(plugin_id="missing-plugin")
    assert exc_info.value.code == "PLUGIN_NOT_FOUND"
    assert not plugins_state_path.exists()


def test_enable_disable_mutations_are_serialized(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Concurrent enable/disable should not interleave state-file read/modify/write cycles.
    manager = _make_manager(tmp_path)
    manager.link_plugin(
        local_plugin_root=str(_fixture_path("frontend")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )

    original_load_state = manager._load_plugins_state
    first_load_started = threading.Event()
    release_first_load = threading.Event()
    second_load_started = threading.Event()
    load_call_count = 0

    def _blocking_load_state():
        nonlocal load_call_count
        load_call_count += 1
        if load_call_count == 1:
            first_load_started.set()
            assert release_first_load.wait(timeout=2.0)
        else:
            second_load_started.set()
        return original_load_state()

    monkeypatch.setattr(manager, "_load_plugins_state", _blocking_load_state)

    raised: list[Exception] = []

    def _run_disable() -> None:
        try:
            manager.disable_plugin(plugin_id="setta-fixture-frontend")
        except Exception as exc:  # pragma: no cover - assertion path
            raised.append(exc)

    def _run_enable() -> None:
        try:
            manager.enable_plugin(plugin_id="setta-fixture-frontend")
        except Exception as exc:  # pragma: no cover - assertion path
            raised.append(exc)

    disable_thread = threading.Thread(target=_run_disable)
    enable_thread = threading.Thread(target=_run_enable)
    disable_thread.start()
    assert first_load_started.wait(timeout=2.0)

    enable_thread.start()
    assert not second_load_started.wait(timeout=0.2)
    release_first_load.set()

    disable_thread.join(timeout=2.0)
    enable_thread.join(timeout=2.0)

    assert raised == []
    assert second_load_started.is_set()

    final_entry = next(
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-frontend"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    )
    assert final_entry.state == PluginRuntimeState.active


@pytest.mark.parametrize(
    "reader_method_name",
    ["get_status_response", "get_runtime_response"],
)
def test_plugin_read_responses_wait_for_mutation_lock(
    tmp_path: Path,
    reader_method_name: Literal[
        "get_status_response",
        "get_runtime_response",
    ],
) -> None:
    # Read endpoints should share the mutation lock so callers never observe half-applied plugin mutations.
    manager = _make_manager(tmp_path)
    manager.link_plugin(
        local_plugin_root=str(_fixture_path("frontend")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    read_started = threading.Event()
    read_finished = threading.Event()
    raised: list[Exception] = []

    def _run_read() -> None:
        try:
            read_started.set()
            getattr(manager, reader_method_name)()
            read_finished.set()
        except Exception as exc:  # pragma: no cover - assertion path
            raised.append(exc)

    with manager._mutation_lock:
        read_thread = threading.Thread(target=_run_read)
        read_thread.start()
        assert read_started.wait(timeout=2.0)
        assert not read_finished.wait(timeout=0.2)

    read_thread.join(timeout=2.0)
    assert raised == []
    assert read_finished.is_set()


def test_generate_backend_codegen_target_waits_for_mutation_lock(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Codegen generation should observe lifecycle mutation locking.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-codegen",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    manager.load_backend_plugins(app=FastAPI())

    started = threading.Event()
    finished = threading.Event()
    raised: list[Exception] = []

    monkeypatch.setattr(
        manager,
        "_call_backend_worker_method",
        lambda **_kwargs: {
            "files": [
                {
                    "relativePath": "generated.ts",
                    "content": "export const locked = true;\n",
                }
            ]
        },
    )

    def _run_codegen() -> None:
        try:
            started.set()
            manager.generate_backend_codegen_target(
                target_id="setta-fixture-backend-codegen:typescript",
                project_state={"projectConfig": {"name": "FixtureProject"}},
                target_options={},
            )
            finished.set()
        except Exception as exc:  # pragma: no cover - assertion path
            raised.append(exc)

    with manager._mutation_lock:
        thread = threading.Thread(target=_run_codegen)
        thread.start()
        assert started.wait(timeout=2.0)
        assert not finished.wait(timeout=0.2)

    thread.join(timeout=2.0)
    assert raised == []
    assert finished.is_set()


def test_install_plugin_does_not_hold_lock_during_candidate_resolution(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Install candidate fetch should run outside mutation lock so runtime/status reads stay responsive.
    manager = _make_manager(tmp_path)
    source_root = _fixture_path("frontend")
    manifest = manager._load_and_validate_manifest(source_root / "setta.plugin.json")
    candidate = CandidatePlugin(
        root=source_root,
        manifest=manifest,
        canonical_source_key="pypi:setta-fixture-frontend",
        source_spec="pypi:setta-fixture-frontend==0.1.0",
        source_digest_sha256="sha256:test",
    )

    candidate_started = threading.Event()
    release_candidate = threading.Event()
    read_completed = threading.Event()
    install_finished = threading.Event()
    raised: list[Exception] = []

    def _patched_candidate_from_pypi(*_args, **_kwargs):
        candidate_started.set()
        if not read_completed.wait(timeout=2.0):
            raise AssertionError(
                "Expected status read to finish while install candidate resolved."
            )
        if not release_candidate.wait(timeout=2.0):
            raise AssertionError("Expected install flow release signal.")
        return candidate

    monkeypatch.setattr(
        manager,
        "_candidate_from_pypi",
        _patched_candidate_from_pypi,
    )
    monkeypatch.setattr(manager, "_install_candidate", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        manager,
        "_apply_enablement_after_install",
        lambda **_kwargs: None,
    )

    def _run_install() -> None:
        try:
            manager.install_plugin(
                source_spec="pypi:setta-fixture-frontend==0.1.0",
                scope=PluginScope.workspace,
                installer=PluginInstallerBackend.pip,
                enable=True,
                force=True,
                rescan=False,
            )
            install_finished.set()
        except Exception as exc:  # pragma: no cover - assertion path
            raised.append(exc)

    install_thread = threading.Thread(target=_run_install)
    install_thread.start()
    assert candidate_started.wait(timeout=2.0)

    manager.get_status_response()
    read_completed.set()
    release_candidate.set()

    install_thread.join(timeout=2.0)
    assert raised == []
    assert install_finished.is_set()


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


def test_link_plugin_force_replace_preserves_restart_requirement_for_backend_replacement(
    tmp_path: Path,
) -> None:
    # Replacing a backend plugin with frontend-only source must still require restart.
    manager = _make_manager(tmp_path)
    linked_backend = manager.link_plugin(
        local_plugin_root=str(_fixture_path("backend")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    assert linked_backend.restartRequired is True

    replacement_root = tmp_path / "frontend-replacement"
    shutil.copytree(_fixture_path("frontend"), replacement_root)
    replacement_manifest_path = replacement_root / "setta.plugin.json"
    replacement_manifest = json.loads(
        replacement_manifest_path.read_text(encoding="utf-8")
    )
    replacement_manifest["id"] = linked_backend.pluginId
    replacement_manifest["name"] = linked_backend.pluginId
    replacement_manifest_path.write_text(
        json.dumps(replacement_manifest, indent=2),
        encoding="utf-8",
    )

    replacement_result = manager.link_plugin(
        local_plugin_root=str(replacement_root),
        scope=PluginScope.workspace,
        enable=True,
        force=True,
    )

    assert replacement_result.pluginId == linked_backend.pluginId
    assert replacement_result.restartRequired is True
    assert replacement_result.state == PluginRuntimeState.pending_restart


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


def test_backend_enable_is_noop_when_already_enabled(tmp_path: Path) -> None:
    # Re-enabling an already-enabled backend plugin should not introduce restart churn.
    manager = _make_manager(tmp_path)
    linked = manager.link_plugin(
        local_plugin_root=str(_fixture_path("backend")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    assert linked.state == PluginRuntimeState.pending_restart

    manager.load_backend_plugins(app=FastAPI())
    assert manager.get_pending_restart_backend_plugin_ids() == []

    enabled = manager.enable_plugin(plugin_id=linked.pluginId)
    assert enabled.state == PluginRuntimeState.active
    assert enabled.restartRequired is False
    assert manager.get_pending_restart_backend_plugin_ids() == []


def test_backend_disable_is_noop_when_already_disabled(tmp_path: Path) -> None:
    # Re-disabling an already-disabled backend plugin should remain a no-op.
    manager = _make_manager(tmp_path)
    linked = manager.link_plugin(
        local_plugin_root=str(_fixture_path("backend")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    assert linked.state == PluginRuntimeState.pending_restart

    initial_disable = manager.disable_plugin(plugin_id=linked.pluginId)
    assert initial_disable.state == PluginRuntimeState.pending_restart
    assert initial_disable.restartRequired is True

    manager.load_backend_plugins(app=FastAPI())
    assert manager.get_pending_restart_backend_plugin_ids() == []
    status_entry = next(
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == linked.pluginId and entry.shadowedBySourcePath is None
    )
    assert status_entry.state == PluginRuntimeState.disabled
    assert status_entry.restartRequired is False

    disabled = manager.disable_plugin(plugin_id=linked.pluginId)
    assert disabled.state == PluginRuntimeState.disabled
    assert disabled.restartRequired is False
    assert manager.get_pending_restart_backend_plugin_ids() == []


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


def test_load_backend_plugins_performs_one_discovery_rescan(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Backend loading should avoid redundant full discovery rescans.
    manager = _make_manager(tmp_path)
    manager.link_plugin(
        local_plugin_root=str(_fixture_path("backend")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    original_rescan = manager.rescan
    rescan_calls = 0

    def _count_rescan():
        nonlocal rescan_calls
        rescan_calls += 1
        return original_rescan()

    monkeypatch.setattr(manager, "rescan", _count_rescan)
    manager.load_backend_plugins(app=FastAPI())

    assert rescan_calls == 1


def test_rescan_can_skip_package_manager_discovery_for_lookup_flows(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Lookup-only rescans should be able to skip package-manager discovery work.
    manager = _make_manager(tmp_path)
    package_manager_discovery_calls = 0

    def _record_package_manager_discovery() -> list:
        nonlocal package_manager_discovery_calls
        package_manager_discovery_calls += 1
        return []

    monkeypatch.setattr(
        manager,
        "_discover_package_manager_plugins",
        _record_package_manager_discovery,
    )

    manager.rescan(include_package_manager_plugins=False)
    assert package_manager_discovery_calls == 0
    manager.rescan(include_package_manager_plugins=True)
    assert package_manager_discovery_calls == 1


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
    assert linked.requestedCapabilities == [
        "registerRouter",
        "registerMcpTools",
        "readProjectState",
        "emitListenerEvents",
        "registerListenerEndpoint",
    ]
    assert linked.trustStatus == "unverified"
    assert "Source is unverified." in linked.trustWarning
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
    assert marker_payload["workerDependencies"] == (
        manager._build_backend_worker_runtime_dependencies()
    )


def test_prepare_backend_runtime_installs_worker_and_plugin_dependencies_for_venv(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Runtime setup should install worker baseline deps alongside plugin deps in plugin venvs.
    manager = _make_manager(tmp_path)
    plugin_root = tmp_path / "backend-runtime-install"
    shutil.copytree(_fixture_path("backend"), plugin_root)
    (plugin_root / "pyproject.toml").write_text(
        "[build-system]\n"
        'requires = ["setuptools==80.9.0", "wheel==0.45.1"]\n'
        'build-backend = "setuptools.build_meta"\n\n'
        "[project]\n"
        'name = "setta-fixture-backend"\n'
        'version = "0.1.0"\n'
        'dependencies = ["requests==2.32.4"]\n',
        encoding="utf-8",
    )
    executed_commands: list[list[str]] = []

    def _patched_run(command: list[str], **_kwargs):
        executed_commands.append(command)
        return subprocess.CompletedProcess(command, 0, "", "")

    monkeypatch.setattr("setta.plugins.manager.subprocess.run", _patched_run)

    manager._prepare_backend_runtime(
        plugin_id="setta-fixture-backend",
        version="0.1.0",
        source_digest_sha256="runtime-digest",
        plugin_root=plugin_root,
    )

    pip_command = next(
        command
        for command in executed_commands
        if len(command) >= 4 and command[1] == "-m" and command[2] == "pip"
    )
    install_requirements = pip_command[4:]
    assert "requests==2.32.4" in install_requirements
    for worker_requirement in manager._build_backend_worker_runtime_dependencies():
        assert worker_requirement in install_requirements

    runtime_marker = manager._runtime_marker_path(
        plugin_id="setta-fixture-backend",
        version="0.1.0",
        source_digest_sha256="runtime-digest",
    )
    marker_payload = json.loads(runtime_marker.read_text(encoding="utf-8"))
    assert marker_payload["dependencies"] == ["requests==2.32.4"]
    assert marker_payload["workerDependencies"] == (
        manager._build_backend_worker_runtime_dependencies()
    )


def test_backend_runtime_marker_without_worker_dependencies_triggers_reprepare(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Legacy runtime markers without worker dependency metadata should be treated as stale.
    manager = _make_manager(tmp_path)
    backend_root = _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    (backend_root / "pyproject.toml").write_text(
        "[build-system]\n"
        'requires = ["setuptools==80.9.0", "wheel==0.45.1"]\n'
        'build-backend = "setuptools.build_meta"\n\n'
        "[project]\n"
        'name = "setta-fixture-backend"\n'
        'version = "0.1.0"\n'
        'dependencies = ["requests==2.32.4"]\n',
        encoding="utf-8",
    )
    manager.rescan()
    entry = manager._find_entry("setta-fixture-backend", PluginScope.workspace)
    assert entry is not None
    assert entry.source_digest_sha256 is not None

    marker_path = manager._runtime_marker_path(
        plugin_id=entry.plugin_id,
        version=entry.version,
        source_digest_sha256=entry.source_digest_sha256,
    )
    marker_path.parent.mkdir(parents=True, exist_ok=True)
    marker_path.write_text(
        json.dumps(
            {
                "pluginId": entry.plugin_id,
                "version": entry.version,
                "sourceDigestSha256": entry.source_digest_sha256,
                "dependencies": ["requests==2.32.4"],
            }
        ),
        encoding="utf-8",
    )

    prepare_calls = 0

    def _patched_prepare_backend_runtime(**_kwargs):
        nonlocal prepare_calls
        prepare_calls += 1

    monkeypatch.setattr(
        manager,
        "_prepare_backend_runtime",
        _patched_prepare_backend_runtime,
    )

    manager._ensure_backend_runtime_for_entry(entry)
    assert prepare_calls == 1


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


@pytest.mark.parametrize("server_mode", ["share", "app"])
def test_non_ide_restart_capability_is_manual_even_with_callback(
    tmp_path: Path,
    server_mode: Literal["share", "app"],
) -> None:
    # Non-IDE runtimes should not expose programmatic restart capability.
    restart_calls: list[str] = []

    def _restart_callback() -> bool:
        restart_calls.append("called")
        return True

    manager = _make_manager(
        tmp_path,
        server_mode=server_mode,
        restart_callback=_restart_callback,
    )

    capability = manager.get_restart_capability()
    assert capability.mode == "manual"
    assert capability.command == "setta"
    assert capability.reason == "Plugin runtime restart is available only in IDE mode."

    response = manager.restart_backend()
    assert response == {
        "accepted": False,
        "mode": "manual",
        "command": "setta",
        "reason": "Plugin runtime restart is available only in IDE mode.",
    }
    assert restart_calls == []


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
        assert "setta_fixture_backend_project_summary" in loaded_tool_names

        with TestClient(app) as client:
            response = client.get("/api/plugins/setta-fixture-backend/health")
            assert response.status_code == 200
            assert response.json() == {
                "pluginId": "setta-fixture-backend",
                "status": "ok",
            }
    finally:
        SETTA_MCP_TOOLS[:] = baseline_tools


def test_backend_fixture_state_read_and_listener_emit_roundtrip(
    tmp_path: Path,
) -> None:
    # Backend fixture should read project state through host RPC and emit listener dependency events.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()

    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(id="fixture-project", name="Fixture Project")
    )
    backend_state = merge_single_config_into_backend(
        ProjectStateBackend(),
        project_state,
    )
    backend_state.validate_default_project_id()

    class _StateManager:
        def __init__(self, state: ProjectStateBackend) -> None:
            self.project_state_backend = state

    class _Switcher:
        def __init__(self, state: ProjectStateBackend) -> None:
            self._manager = _StateManager(state)

        def get(self, project_identifier: str, *, share_session_id: str | None = None):
            assert share_session_id is None
            assert project_identifier == "fixture-project"
            return self._manager

    class _RealtimeHub:
        def __init__(self) -> None:
            self.calls: list[tuple[str, int, str | None]] = []

        async def emit_dependency_event(
            self,
            *,
            project_config_id: str,
            dependency_events: list[Any],
            share_session_id: str | None = None,
        ) -> None:
            self.calls.append(
                (project_config_id, len(dependency_events), share_session_id)
            )

    class _FakeSettaState:
        def __init__(self, state: ProjectStateBackend, hub: _RealtimeHub) -> None:
            self.deployment_mode = False
            self.project_manager_switcher = _Switcher(state)
            self.realtime_event_hub = hub

    realtime_hub = _RealtimeHub()
    app = FastAPI()
    app.state.setta = _FakeSettaState(backend_state, realtime_hub)
    baseline_tools = list(SETTA_MCP_TOOLS)
    try:
        manager.load_backend_plugins(app=app)
        with TestClient(app) as client:
            summary_response = client.get(
                "/api/plugins/setta-fixture-backend/project-state-summary",
                params={"projectConfigId": "fixture-project"},
            )
            assert summary_response.status_code == 200
            assert (
                summary_response.json()["projectState"]["projectConfig"]["id"]
                == "fixture-project"
            )

            emit_response = client.post(
                "/api/plugins/setta-fixture-backend/emit-listener",
                json={
                    "projectConfigId": "fixture-project",
                    "sectionId": "fixture-section",
                    "payload": "hello",
                    "timestampMs": 111,
                },
            )
            assert emit_response.status_code == 200
            assert emit_response.json()["emitted"] is True
            deadline = time.time() + 1.0
            while len(realtime_hub.calls) == 0 and time.time() < deadline:
                time.sleep(0.01)
            assert realtime_hub.calls == [("fixture-project", 1, None)]

        tools_by_name = {tool.__name__: tool for tool in SETTA_MCP_TOOLS}
        summary_tool = tools_by_name["setta_fixture_backend_project_summary"]
        summary_payload = summary_tool(project_config_id="fixture-project")
        assert summary_payload["projectConfig"]["id"] == "fixture-project"
    finally:
        manager.shutdown_backend_plugins()
        SETTA_MCP_TOOLS[:] = baseline_tools


def test_load_backend_plugins_registers_fixture_static_dir_and_router(
    tmp_path: Path,
) -> None:
    # Backend static/router fixture should expose both API and static file mount points.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-static-router",
        scope=PluginScope.workspace,
    )
    manager.rescan()

    app = FastAPI()
    manager.load_backend_plugins(app=app)

    status_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend-static-router"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(status_entries) == 1
    assert status_entries[0].state == PluginRuntimeState.active

    with TestClient(app) as client:
        api_response = client.get(
            "/api/plugins/setta-fixture-backend-static-router/info"
        )
        assert api_response.status_code == 200
        assert api_response.json() == {
            "pluginId": "setta-fixture-backend-static-router",
            "kind": "backend-static-router",
        }

        static_response = client.get(
            "/plugin-static/setta-fixture-backend-static-router/fixture/hello.txt"
        )
        assert static_response.status_code == 200
        assert static_response.text == "fixture static payload\n"


def test_load_backend_plugins_registers_multiple_fixture_mcp_tools(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Backend MCP fixture should register multiple named tools with callable behavior.
    manager = _make_manager(tmp_path, backend_operation_timeout_seconds=19.0)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-mcp-tools",
        scope=PluginScope.workspace,
    )
    manager.rescan()

    baseline_tools = list(SETTA_MCP_TOOLS)
    try:
        manager.load_backend_plugins(app=FastAPI())

        status_entries = [
            entry
            for entry in manager.get_status_response().plugins
            if entry.pluginId == "setta-fixture-backend-mcp-tools"
            and entry.sourceScope == PluginScope.workspace
            and entry.shadowedBySourcePath is None
        ]
        assert len(status_entries) == 1
        assert status_entries[0].state == PluginRuntimeState.active

        tools_by_name = {tool.__name__: tool for tool in SETTA_MCP_TOOLS}
        assert "setta_fixture_mcp_read" in tools_by_name
        assert "setta_fixture_mcp_write" in tools_by_name
        captured_timeouts: list[float] = []

        def _patched_call_backend_worker_method(**kwargs):
            captured_timeouts.append(kwargs["timeout_seconds"])
            params = kwargs["params"]
            tool_name = params["toolName"]
            kwargs_payload = params["kwargs"]
            if tool_name == "setta_fixture_mcp_read":
                return {
                    "result": (
                        "read:setta-fixture-backend-mcp-tools:"
                        f"{kwargs_payload['value']}"
                    )
                }
            return {
                "result": (
                    f"write:setta-fixture-backend-mcp-tools:{kwargs_payload['value']}"
                )
            }

        monkeypatch.setattr(
            manager,
            "_call_backend_worker_method",
            _patched_call_backend_worker_method,
        )
        assert (
            tools_by_name["setta_fixture_mcp_read"](value="ok")
            == "read:setta-fixture-backend-mcp-tools:ok"
        )
        assert (
            tools_by_name["setta_fixture_mcp_write"](value="ok")
            == "write:setta-fixture-backend-mcp-tools:ok"
        )
        assert captured_timeouts == [19.0, 19.0]
    finally:
        SETTA_MCP_TOOLS[:] = baseline_tools


def test_load_backend_plugins_applies_mcp_tool_access_metadata(
    tmp_path: Path,
) -> None:
    # MCP annotations should attach tool access metadata to registered plugin tools.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-mcp-tools",
        scope=PluginScope.workspace,
    )
    manager.rescan()

    baseline_tools = list(SETTA_MCP_TOOLS)
    try:
        manager.load_backend_plugins(app=FastAPI())
        tools_by_name = {tool.__name__: tool for tool in SETTA_MCP_TOOLS}
        read_meta = get_tool_access(tools_by_name["setta_fixture_mcp_read"])
        write_meta = get_tool_access(tools_by_name["setta_fixture_mcp_write"])
        assert read_meta is not None
        assert write_meta is not None
        assert read_meta.accessType == "read"
        assert write_meta.accessType == "write"
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
    assert (
        status_registration.name == "setta-fixture-backend-language-server:typescript"
    )
    assert status_registration.language == "typescript"
    assert status_registration.command == sys.executable
    assert status_registration.args == ["--stdio"]
    assert status_registration.settingsKey == "typescriptLanguageServer"

    registrations = manager.get_backend_language_servers()
    assert len(registrations) == 1
    registration = registrations[0]
    assert registration.plugin_id == "setta-fixture-backend-language-server"
    assert registration.language == "typescript"
    assert registration.command == sys.executable
    assert registration.args == ("--stdio",)
    assert registration.settings_key == "typescriptLanguageServer"


def test_load_backend_plugins_accepts_dot_slash_language_server_commands(
    tmp_path: Path,
) -> None:
    # Language-server registration should treat ./command as plugin-relative path.
    if os.name == "nt":
        pytest.skip("Executable fixture script uses POSIX shell.")
    manager = _make_manager(tmp_path)
    backend_root = _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-language-server",
        scope=PluginScope.workspace,
    )
    command_path = backend_root / "backend" / "fixture-language-server.sh"
    command_path.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    command_path.chmod(0o755)
    (backend_root / "backend" / "entrypoint.py").write_text(
        "def register(plugin):\n"
        "    plugin.register_language_server(\n"
        "        {\n"
        "            'language': 'typescript',\n"
        "            'command': './backend/fixture-language-server.sh',\n"
        "            'args': ['--stdio'],\n"
        "            'settingsKey': 'typescriptLanguageServer',\n"
        "        }\n"
        "    )\n",
        encoding="utf-8",
    )
    manager.rescan()

    manager.load_backend_plugins(app=FastAPI())

    registrations = manager.get_backend_language_servers()
    assert len(registrations) == 1
    registration = registrations[0]
    assert registration.plugin_id == "setta-fixture-backend-language-server"
    assert registration.language == "typescript"
    assert registration.command == str(command_path.resolve(strict=False))

    status_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend-language-server"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(status_entries) == 1
    assert status_entries[0].state == PluginRuntimeState.active
    assert status_entries[0].registeredLanguageServers[0].command == str(
        command_path.resolve(strict=False)
    )


def test_load_backend_plugins_accepts_dot_slash_external_agent_adapter_commands(
    tmp_path: Path,
) -> None:
    # External-agent adapter registration should treat ./command as plugin-relative path.
    if os.name == "nt":
        pytest.skip("Executable fixture script uses POSIX shell.")
    manager = _make_manager(tmp_path)
    backend_root = _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-external-agent",
        scope=PluginScope.workspace,
    )
    command_path = backend_root / "backend" / "fixture-external-agent.sh"
    command_path.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    command_path.chmod(0o755)
    (backend_root / "backend" / "entrypoint.py").write_text(
        "def register(plugin):\n"
        "    plugin.register_external_agent_adapter(\n"
        "        {\n"
        "            'id': 'fixture-agent',\n"
        "            'name': 'Fixture External Agent',\n"
        "            'runModes': ['sdk'],\n"
        "            'command': './backend/fixture-external-agent.sh',\n"
        "        }\n"
        "    )\n",
        encoding="utf-8",
    )
    manager.rescan()

    manager.load_backend_plugins(app=FastAPI())

    registrations = manager.get_backend_external_agent_adapters()
    assert len(registrations) == 1
    registration = registrations[0]
    assert registration.pluginId == "setta-fixture-backend-external-agent"
    assert registration.command == str(command_path.resolve(strict=False))

    status_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend-external-agent"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(status_entries) == 1
    assert status_entries[0].state == PluginRuntimeState.active
    assert status_entries[0].registeredExternalAgentAdapters[0].command == str(
        command_path.resolve(strict=False)
    )


def test_load_backend_plugins_registers_custom_language_server_key(
    tmp_path: Path,
) -> None:
    # Language server registrations should accept plugin-defined language keys.
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
        "            'language': 'fixturedsl',\n"
        f"            'command': {sys.executable!r},\n"
        "            'args': ['--stdio'],\n"
        "            'settingsKey': 'fixtureDslLanguageServer',\n"
        "        }\n"
        "    )\n",
        encoding="utf-8",
    )
    manager.rescan()

    manager.load_backend_plugins(app=FastAPI())

    registrations = manager.get_backend_language_servers()
    assert len(registrations) == 1
    registration = registrations[0]
    assert registration.plugin_id == "setta-fixture-backend-language-server"
    assert registration.name == "setta-fixture-backend-language-server:fixturedsl"
    assert registration.language == "fixturedsl"
    assert registration.settings_key == "fixtureDslLanguageServer"

    status_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend-language-server"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(status_entries) == 1
    assert status_entries[0].state == PluginRuntimeState.active
    assert status_entries[0].registeredLanguageServers[0].language == "fixturedsl"


def test_load_backend_plugins_registers_fixture_external_agent_adapter(
    tmp_path: Path,
) -> None:
    # Backend fixture plugins should be able to register external agent adapters.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-external-agent",
        scope=PluginScope.workspace,
    )
    manager.rescan()

    manager.load_backend_plugins(app=FastAPI())

    backend_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend-external-agent"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(backend_entries) == 1
    assert backend_entries[0].state == PluginRuntimeState.active
    assert len(backend_entries[0].registeredExternalAgentAdapters) == 1
    status_registration = backend_entries[0].registeredExternalAgentAdapters[0]
    assert (
        status_registration.adapterId
        == "setta-fixture-backend-external-agent:fixture-agent"
    )
    assert status_registration.pluginId == "setta-fixture-backend-external-agent"
    assert status_registration.name == "Fixture External Agent"
    assert status_registration.runModes == ["sdk"]
    assert status_registration.command == sys.executable
    assert status_registration.defaultModel == "fixture-model"
    assert status_registration.envVarWhitelist == ["FIXTURE_EXTERNAL_AGENT_TOKEN"]

    registrations = manager.get_backend_external_agent_adapters()
    assert len(registrations) == 1
    registration = registrations[0]
    assert (
        registration.adapterId == "setta-fixture-backend-external-agent:fixture-agent"
    )
    assert registration.pluginId == "setta-fixture-backend-external-agent"
    assert registration.runModes == ["sdk"]


def test_load_backend_plugins_registers_fixture_codegen_target(
    tmp_path: Path,
) -> None:
    # Backend fixture plugins should be able to register worker-based codegen targets.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-codegen",
        scope=PluginScope.workspace,
    )
    manager.rescan()

    manager.load_backend_plugins(app=FastAPI())

    backend_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend-codegen"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(backend_entries) == 1
    assert backend_entries[0].state == PluginRuntimeState.active
    assert len(backend_entries[0].registeredCodegenTargets) == 1
    status_registration = backend_entries[0].registeredCodegenTargets[0]
    assert status_registration.targetId == "setta-fixture-backend-codegen:typescript"
    assert status_registration.pluginId == "setta-fixture-backend-codegen"
    assert status_registration.language == "typescript"
    assert status_registration.name == "TypeScript"
    assert status_registration.defaultFileName == "setta_gen.ts"

    registrations = manager.get_backend_codegen_targets()
    assert len(registrations) == 1
    registration = registrations[0]
    assert registration.targetId == "setta-fixture-backend-codegen:typescript"
    assert registration.pluginId == "setta-fixture-backend-codegen"
    assert registration.language == "typescript"

    generated_files = manager.generate_backend_codegen_target(
        target_id="setta-fixture-backend-codegen:typescript",
        project_state={"projectConfig": {"name": "FixtureProject"}},
        target_options={"className": "FixtureState"},
    )
    assert generated_files == [
        (
            "setta_gen.ts",
            "export class FixtureState {\n"
            "  readonly projectName = 'FixtureProject';\n"
            "}\n",
        )
    ]


def test_shutdown_backend_plugins_clears_backend_registration_state(
    tmp_path: Path,
) -> None:
    # Shutdown should clear all backend runtime registrations and loaded-plugin markers.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-language-server",
        scope=PluginScope.workspace,
    )
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-external-agent",
        scope=PluginScope.workspace,
    )
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-codegen",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    manager.load_backend_plugins(app=FastAPI())

    assert manager.get_backend_language_servers() != []
    assert manager.get_backend_external_agent_adapters() != []
    assert manager.get_backend_codegen_targets() != []
    assert manager._backend_loaded_plugin_ids != set()

    manager.shutdown_backend_plugins()

    assert manager.get_backend_language_servers() == []
    assert manager.get_backend_external_agent_adapters() == []
    assert manager.get_backend_codegen_targets() == []
    assert manager._backend_loaded_plugin_ids == set()
    assert manager._backend_runtime_errors == {}
    assert manager._backend_worker_request_locks == {}
    assert manager._backend_worker_next_request_ids == {}
    assert manager._backend_worker_pipe_readers == {}


def test_generate_backend_codegen_target_uses_operation_timeout(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Runtime codegen RPC should use operation timeout, not backend register timeout.
    manager = _make_manager(tmp_path, backend_operation_timeout_seconds=42.0)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-codegen",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    manager.load_backend_plugins(app=FastAPI())

    captured_timeout: float | None = None

    def _patched_call_backend_worker_method(**kwargs):
        nonlocal captured_timeout
        captured_timeout = kwargs["timeout_seconds"]
        return {
            "files": [
                {
                    "relativePath": "generated.ts",
                    "content": "export const ok = true;\n",
                }
            ]
        }

    monkeypatch.setattr(
        manager,
        "_call_backend_worker_method",
        _patched_call_backend_worker_method,
    )
    generated_files = manager.generate_backend_codegen_target(
        target_id="setta-fixture-backend-codegen:typescript",
        project_state={"projectConfig": {"name": "FixtureProject"}},
        target_options={"className": "FixtureState"},
    )
    assert captured_timeout == 42.0
    assert generated_files == [("generated.ts", "export const ok = true;\n")]


def test_codegen_target_implementation_key_includes_plugin_identity(
    tmp_path: Path,
) -> None:
    # Codegen implementation key should encode plugin version/source identity for cache invalidation.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-codegen",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    manager.load_backend_plugins(app=FastAPI())
    entry = manager._find_entry("setta-fixture-backend-codegen", PluginScope.workspace)
    assert entry is not None
    assert entry.source_digest_sha256 is not None

    implementation_key = manager.get_backend_codegen_target_implementation_key(
        "setta-fixture-backend-codegen:typescript"
    )
    assert "setta-fixture-backend-codegen:typescript" in implementation_key
    assert f":{entry.version}:" in implementation_key
    assert entry.source_digest_sha256 in implementation_key


@pytest.mark.parametrize("server_mode", ["share", "app"])
def test_mode_policy_blocks_backend_codegen_target_registration(
    tmp_path: Path,
    server_mode: Literal["share", "app"],
) -> None:
    # Share/App should block registerCodegenTarget and surface deterministic status.
    manager = _make_manager(tmp_path, server_mode=server_mode)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-codegen",
        scope=PluginScope.workspace,
    )
    manager.rescan()

    list_response = manager.get_runtime_response().list
    list_entries = [
        entry
        for entry in list_response.plugins
        if entry.pluginId == "setta-fixture-backend-codegen"
    ]
    assert len(list_entries) == 1
    assert list_entries[0].effectiveCapabilities == []

    status_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend-codegen"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(status_entries) == 1
    status_entry = status_entries[0]
    assert status_entry.state == PluginRuntimeState.active
    assert status_entry.requestedCapabilities == ["registerCodegenTarget"]
    assert status_entry.effectiveCapabilities == []
    assert status_entry.registeredCodegenTargets == []
    assert len(status_entry.blockedCapabilities) == 1
    assert status_entry.blockedCapabilities[0].capability == "registerCodegenTarget"
    assert (
        status_entry.blockedCapabilities[0].reason
        == BlockedCapabilityReason.mode_policy
    )

    manager.load_backend_plugins(app=FastAPI())

    loaded_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend-codegen"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(loaded_entries) == 1
    assert loaded_entries[0].state == PluginRuntimeState.invalid
    assert any(
        error.code == "PLUGIN_CAPABILITY_DENIED" for error in loaded_entries[0].errors
    )


@pytest.mark.parametrize("server_mode", ["share", "app"])
def test_mode_policy_blocks_backend_external_agent_registration(
    tmp_path: Path,
    server_mode: Literal["share", "app"],
) -> None:
    # Share/App should block registerExternalAgentAdapter and surface deterministic status.
    manager = _make_manager(tmp_path, server_mode=server_mode)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-external-agent",
        scope=PluginScope.workspace,
    )
    manager.rescan()

    list_response = manager.get_runtime_response().list
    list_entries = [
        entry
        for entry in list_response.plugins
        if entry.pluginId == "setta-fixture-backend-external-agent"
    ]
    assert len(list_entries) == 1
    assert list_entries[0].effectiveCapabilities == []

    status_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend-external-agent"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(status_entries) == 1
    status_entry = status_entries[0]
    assert status_entry.state == PluginRuntimeState.active
    assert status_entry.requestedCapabilities == ["registerExternalAgentAdapter"]
    assert status_entry.effectiveCapabilities == []
    assert status_entry.registeredExternalAgentAdapters == []
    assert len(status_entry.blockedCapabilities) == 1
    assert (
        status_entry.blockedCapabilities[0].capability == "registerExternalAgentAdapter"
    )
    assert (
        status_entry.blockedCapabilities[0].reason
        == BlockedCapabilityReason.mode_policy
    )

    manager.load_backend_plugins(app=FastAPI())

    loaded_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend-external-agent"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(loaded_entries) == 1
    assert loaded_entries[0].state == PluginRuntimeState.invalid
    assert any(
        error.code == "PLUGIN_CAPABILITY_DENIED" for error in loaded_entries[0].errors
    )


@pytest.mark.parametrize("server_mode", ["share", "app"])
def test_backend_worker_context_uses_runtime_mode_metadata(
    tmp_path: Path,
    server_mode: Literal["share", "app"],
) -> None:
    # Worker register context should expose host server mode + capability metadata.
    manager = _make_manager(tmp_path, server_mode=server_mode)
    backend_root = _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    marker_path = backend_root / "backend" / "context.marker.json"
    (backend_root / "backend" / "entrypoint.py").write_text(
        "import json\n"
        "from pathlib import Path\n\n"
        "def register(plugin):\n"
        "    Path(plugin.plugin_root, 'backend', 'context.marker.json').write_text(\n"
        "        json.dumps(\n"
        "            {\n"
        "                'serverMode': plugin.server_mode,\n"
        "                'deploymentMode': plugin.deployment_mode,\n"
        "                'requestedCapabilities': list(plugin.requested_capabilities),\n"
        "                'effectiveCapabilities': list(plugin.effective_capabilities),\n"
        "            }\n"
        "        ),\n"
        "        encoding='utf-8',\n"
        "    )\n",
        encoding="utf-8",
    )
    manager.rescan()

    manager.load_backend_plugins(app=FastAPI())
    marker_payload = json.loads(marker_path.read_text(encoding="utf-8"))

    assert marker_payload["serverMode"] == server_mode
    assert marker_payload["deploymentMode"] is True
    assert set(marker_payload["requestedCapabilities"]) == {
        "registerRouter",
        "registerMcpTools",
        "readProjectState",
        "emitListenerEvents",
        "registerListenerEndpoint",
    }
    assert marker_payload["effectiveCapabilities"] == [
        "readProjectState",
        "emitListenerEvents",
    ]


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
        f"            'command': {sys.executable!r},\n"
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


def test_backend_external_agent_registration_rejects_invalid_adapter_payload(
    tmp_path: Path,
) -> None:
    # External-agent adapter registration should fail fast on malformed payloads.
    manager = _make_manager(tmp_path)
    backend_root = _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-external-agent",
        scope=PluginScope.workspace,
    )
    (backend_root / "backend" / "entrypoint.py").write_text(
        "def register(plugin):\n"
        "    plugin.register_external_agent_adapter(\n"
        "        {\n"
        "            'id': 'fixture-agent',\n"
        "            'name': 'Fixture External Agent',\n"
        "            'runModes': 'sdk',\n"
        "            'command': 'python',\n"
        "        }\n"
        "    )\n",
        encoding="utf-8",
    )
    manager.rescan()

    manager.load_backend_plugins(app=FastAPI())

    backend_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend-external-agent"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(backend_entries) == 1
    assert backend_entries[0].state == PluginRuntimeState.invalid
    assert any(
        error.code == "PLUGIN_BACKEND_REGISTER_FAILED"
        and "runModes array" in error.message
        for error in backend_entries[0].errors
    )


@pytest.mark.parametrize(
    ("adapter_payload", "expected_message_fragment"),
    [
        (
            {
                "id": "fixture-agent",
                "name": "Fixture External Agent",
                "runModes": ["sdk"],
                "command": sys.executable,
                "unsupported": True,
            },
            "unsupported keys",
        ),
        (
            {
                "id": "fixture-agent",
                "name": "Fixture External Agent",
                "runModes": ["sdk", 2],
                "command": sys.executable,
            },
            "runModes entries must be strings",
        ),
        (
            {
                "id": "fixture-agent",
                "name": "Fixture External Agent",
                "runModes": ["sdk", "  "],
                "command": sys.executable,
            },
            "runModes cannot contain empty values",
        ),
        (
            {
                "id": "fixture-agent",
                "name": "Fixture External Agent",
                "runModes": ["sdk", "not-a-mode"],
                "command": sys.executable,
            },
            "runMode is not supported",
        ),
        (
            {
                "id": "fixture-agent",
                "name": "Fixture External Agent",
                "runModes": ["sdk"],
                "command": sys.executable,
                "args": ["--stdio", 5],
            },
            "args must be strings",
        ),
        (
            {
                "id": "fixture-agent",
                "name": "Fixture External Agent",
                "runModes": ["sdk"],
                "command": sys.executable,
                "envVarWhitelist": ["OPENAI_API_KEY", 5],
            },
            "envVarWhitelist entries must be strings",
        ),
        (
            {
                "id": "fixture-agent",
                "name": "Fixture External Agent",
                "runModes": ["sdk"],
                "command": sys.executable,
                "defaultModel": 5,
            },
            "defaultModel must be a non-empty string",
        ),
        (
            {
                "id": "fixture-agent",
                "name": "Fixture External Agent",
                "runModes": ["sdk"],
                "command": "setta-missing-external-agent-adapter-bin",
            },
            "command is not available on PATH",
        ),
    ],
)
def test_external_agent_adapter_registration_validation_rejects_invalid_fields(
    tmp_path: Path,
    adapter_payload: dict[str, object],
    expected_message_fragment: str,
) -> None:
    # Adapter registration helper should reject malformed payload fields deterministically.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-external-agent",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry(
        "setta-fixture-backend-external-agent",
        PluginScope.workspace,
    )
    assert entry is not None

    with pytest.raises(PluginManagerError) as exc_info:
        manager._build_backend_external_agent_adapter_registration(
            entry=entry,
            adapter=adapter_payload,
        )
    assert exc_info.value.code == "PLUGIN_BACKEND_REGISTER_FAILED"
    assert expected_message_fragment in exc_info.value.message


@pytest.mark.parametrize(
    ("provider_payload", "expected_message_fragment"),
    [
        (
            {
                "language": "typescript",
                "command": "typescript-language-server",
                "unsupported": True,
            },
            "unsupported keys",
        ),
        (
            {
                "language": "python",
                "command": "python-language-server",
            },
            "cannot target python",
        ),
        (
            {
                "language": "typescript",
                "command": "typescript-language-server",
                "args": "--stdio",
            },
            "args must be an array of strings",
        ),
        (
            {
                "language": "typescript",
                "command": "typescript-language-server",
                "args": ["--stdio", 5],
            },
            "args must be strings",
        ),
        (
            {
                "language": "typescript",
                "command": "typescript-language-server",
                "settingsKey": "",
            },
            "settingsKey must be a non-empty string",
        ),
        (
            {
                "language": "typescript",
                "command": "   ",
            },
            "missing command",
        ),
    ],
)
def test_language_server_registration_validation_rejects_invalid_fields(
    tmp_path: Path,
    provider_payload: dict[str, object],
    expected_message_fragment: str,
) -> None:
    # Language-server registration helper should reject malformed payload fields.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-language-server",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry(
        "setta-fixture-backend-language-server",
        PluginScope.workspace,
    )
    assert entry is not None

    with pytest.raises(PluginManagerError) as exc_info:
        manager._build_backend_language_server_registration(
            entry=entry,
            provider=provider_payload,
        )
    assert exc_info.value.code == "PLUGIN_BACKEND_REGISTER_FAILED"
    assert expected_message_fragment in exc_info.value.message


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

    list_response = manager.get_runtime_response().list
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

    list_response = manager.get_runtime_response().list
    assert list_response.serverMode == server_mode
    list_entries = [
        entry
        for entry in list_response.plugins
        if entry.pluginId == "setta-fixture-backend"
    ]
    assert len(list_entries) == 1
    assert set(list_entries[0].effectiveCapabilities) == {
        "readProjectState",
        "emitListenerEvents",
    }

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
    assert set(entry.requestedCapabilities) == {
        "registerRouter",
        "registerMcpTools",
        "readProjectState",
        "emitListenerEvents",
        "registerListenerEndpoint",
    }
    assert set(entry.effectiveCapabilities) == {
        "readProjectState",
        "emitListenerEvents",
    }
    blocked_reasons = {
        blocked.capability: blocked.reason for blocked in entry.blockedCapabilities
    }
    assert blocked_reasons == {
        "registerRouter": BlockedCapabilityReason.mode_policy,
        "registerMcpTools": BlockedCapabilityReason.mode_policy,
        "registerListenerEndpoint": BlockedCapabilityReason.mode_policy,
    }
    assert entry.runtimePayloadDigestSha256 is not None
    assert len(entry.runtimePayloadDigestSha256) == 64


def test_redacted_config_descriptor_reuses_cached_schema_presence(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Redacted runtime config descriptors should reuse schema presence cache.
    manager = _make_manager(tmp_path, server_mode="share")
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="full",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry("setta-fixture-full", PluginScope.workspace)
    assert entry is not None

    resolve_calls = 0
    original_resolve_relative_path = manager._resolve_relative_path

    def _counting_resolve_relative_path(
        root: Path,
        relative_path: str,
        *,
        code: str,
        message_prefix: str,
    ) -> Path:
        nonlocal resolve_calls
        if message_prefix == "Invalid configSchemaPath":
            resolve_calls += 1
        return original_resolve_relative_path(
            root,
            relative_path,
            code=code,
            message_prefix=message_prefix,
        )

    monkeypatch.setattr(
        manager,
        "_resolve_relative_path",
        _counting_resolve_relative_path,
    )
    _ = manager._build_redacted_config_descriptor(entry)
    _ = manager._build_redacted_config_descriptor(entry)
    assert resolve_calls == 1


def test_status_entry_runtime_digest_is_reused_across_noop_reads(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # No-op status reads should reuse cached runtime payload digests without re-hashing.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="frontend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    digest_calls = 0
    original_compute = manager._compute_json_payload_digest

    def _count_digest_calls(value: Any) -> str:
        nonlocal digest_calls
        digest_calls += 1
        return original_compute(value)

    monkeypatch.setattr(manager, "_compute_json_payload_digest", _count_digest_calls)
    _ = manager.get_status_response()
    first_read_calls = digest_calls
    _ = manager.get_status_response()
    assert first_read_calls > 0
    assert digest_calls == first_read_calls


def test_status_entry_runtime_digest_cache_invalidates_on_backend_state_mutation(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Backend registration generation bumps should invalidate cached status digests.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="frontend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    digest_calls = 0
    original_compute = manager._compute_json_payload_digest

    def _count_digest_calls(value: Any) -> str:
        nonlocal digest_calls
        digest_calls += 1
        return original_compute(value)

    monkeypatch.setattr(manager, "_compute_json_payload_digest", _count_digest_calls)
    _ = manager.get_status_response()
    first_read_calls = digest_calls
    manager._mark_backend_registration_state_changed()
    _ = manager.get_status_response()
    assert digest_calls > first_read_calls


def test_runtime_response_includes_config_payload_digests(
    tmp_path: Path,
) -> None:
    # Runtime list entries should expose stable digests for config schema/current payloads.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="full",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    manager.write_plugin_config(
        plugin_id="setta-fixture-full",
        config={"enabled": True},
    )

    first_runtime = manager.get_runtime_response()
    list_entry = next(
        entry
        for entry in first_runtime.list.plugins
        if entry.pluginId == "setta-fixture-full"
    )
    assert list_entry.config.schemaJsonDigestSha256 is not None
    assert len(list_entry.config.schemaJsonDigestSha256) == 64
    assert list_entry.config.currentConfigDigestSha256 is not None
    assert len(list_entry.config.currentConfigDigestSha256) == 64
    first_current_config_digest = list_entry.config.currentConfigDigestSha256

    manager.write_plugin_config(
        plugin_id="setta-fixture-full",
        config={"enabled": True, "label": "digest-change"},
    )
    second_runtime = manager.get_runtime_response()
    updated_list_entry = next(
        entry
        for entry in second_runtime.list.plugins
        if entry.pluginId == "setta-fixture-full"
    )
    assert updated_list_entry.config.currentConfigDigestSha256 is not None
    assert (
        updated_list_entry.config.currentConfigDigestSha256
        != first_current_config_digest
    )


def test_host_policy_blocks_register_context_menu_capability(tmp_path: Path) -> None:
    # Context-menu capability should be blocked until host support is implemented.
    manager = _make_manager(tmp_path, server_mode="ide")

    effective, blocked = manager._resolve_effective_capabilities(
        ["registerContextMenu", "registerPane"]
    )

    assert effective == ["registerPane"]
    assert len(blocked) == 1
    assert blocked[0].capability == "registerContextMenu"
    assert blocked[0].reason == BlockedCapabilityReason.host_policy


@pytest.mark.parametrize("server_mode", ["share", "app"])
def test_list_response_redacts_config_payload_outside_ide(
    tmp_path: Path, server_mode: Literal["share", "app"]
) -> None:
    # Share/App should not expose plugin config values or schema payloads via list response.
    manager = _make_manager(tmp_path, server_mode=server_mode)
    manager.link_plugin(
        local_plugin_root=str(_fixture_path("full")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    manager.write_plugin_config(
        plugin_id="setta-fixture-full",
        config={"enabled": True, "label": "secret-value"},
    )

    list_entry = next(
        plugin
        for plugin in manager.get_runtime_response().list.plugins
        if plugin.pluginId == "setta-fixture-full"
    )
    assert list_entry.config.hasSchema is True
    assert list_entry.config.schemaJson is None
    assert list_entry.config.currentConfig == {}


@pytest.mark.parametrize("server_mode", ["share", "app"])
def test_runtime_response_redacted_config_does_not_load_plugin_state(
    tmp_path: Path,
    server_mode: Literal["share", "app"],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Redacted runtime payloads should avoid plugin-state reads in non-IDE server modes.
    manager = _make_manager(tmp_path, server_mode=server_mode)
    manager.link_plugin(
        local_plugin_root=str(_fixture_path("full")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )

    def _fail_load_plugins_state() -> Any:
        raise AssertionError(
            "plugins state should not be loaded for redacted config payloads"
        )

    monkeypatch.setattr(manager, "_load_plugins_state", _fail_load_plugins_state)

    list_entry = next(
        plugin
        for plugin in manager.get_runtime_response().list.plugins
        if plugin.pluginId == "setta-fixture-full"
    )
    assert list_entry.config.hasSchema is True
    assert list_entry.config.schemaJson is None
    assert list_entry.config.currentConfig == {}


@pytest.mark.parametrize("server_mode", ["share", "app"])
def test_status_redaction_keeps_source_identity_unique_across_scopes(
    tmp_path: Path, server_mode: Literal["share", "app"]
) -> None:
    # Redacted source fields should remain unique when duplicate plugin ids exist in multiple scopes.
    manager = _make_manager(tmp_path, server_mode=server_mode)
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

    status_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-frontend"
    ]
    assert len(status_entries) == 2
    assert len({entry.sourcePath for entry in status_entries}) == 2
    assert len({entry.canonicalSourceKey for entry in status_entries}) == 2


@pytest.mark.parametrize("server_mode", ["share", "app"])
def test_status_redaction_keeps_same_scope_source_manager_entries_distinct(
    tmp_path: Path, server_mode: Literal["share", "app"]
) -> None:
    # Same-scope setta/package-manager duplicates should remain distinct and preserve shadow source identity.
    package_name = "setta-fixture-frontend"
    version = "0.1.0"
    site_packages = _install_fixture_distribution_in_site_packages(
        tmp_path=tmp_path,
        fixture_name="frontend",
        package_name=package_name,
        version=version,
    )
    manager = _make_manager(
        tmp_path,
        server_mode=server_mode,
        package_manager_search_paths=[site_packages],
    )
    manager.link_plugin(
        local_plugin_root=str(_fixture_path("frontend")),
        scope=PluginScope.setta_files,
        enable=True,
        force=True,
    )
    manager.rescan()

    status_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == package_name
        and entry.sourceScope == PluginScope.setta_files
    ]
    assert len(status_entries) == 2
    assert len({entry.sourcePath for entry in status_entries}) == 2
    assert len({entry.canonicalSourceKey for entry in status_entries}) == 2

    shadowed_entry = next(
        entry for entry in status_entries if entry.state == PluginRuntimeState.shadowed
    )
    active_entry = next(
        entry for entry in status_entries if entry.state == PluginRuntimeState.active
    )
    assert shadowed_entry.sourcePath != active_entry.sourcePath
    assert shadowed_entry.shadowedBySourcePath == active_entry.sourcePath
    assert shadowed_entry.shadowedBySourcePath != shadowed_entry.sourcePath


@pytest.mark.parametrize("server_mode", ["share", "app"])
def test_source_redaction_tokens_use_canonical_scope_and_manager_values(
    tmp_path: Path, server_mode: Literal["share", "app"]
) -> None:
    # Redacted source identifiers should expose stable scope/manager values.
    manager = _make_manager(tmp_path, server_mode=server_mode)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="frontend",
        scope=PluginScope.workspace,
    )
    manager.rescan()

    list_entry = next(
        entry
        for entry in manager.get_runtime_response().list.plugins
        if entry.pluginId == "setta-fixture-frontend"
    )
    status_entry = next(
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-frontend"
        and entry.shadowedBySourcePath is None
    )

    assert ":workspace:setta:setta-fixture-frontend:" in list_entry.canonicalSourceKey
    assert "PluginScope." not in list_entry.canonicalSourceKey
    assert "PluginSourceManager." not in list_entry.canonicalSourceKey
    assert ":workspace:setta:setta-fixture-frontend:" in status_entry.sourcePath
    assert "PluginScope." not in status_entry.sourcePath
    assert "PluginSourceManager." not in status_entry.sourcePath


def test_list_response_caches_content_and_config_schema_descriptors(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # List response should reuse content/schema descriptor work between calls until next rescan.
    manager = _make_manager(tmp_path)
    manager.link_plugin(
        local_plugin_root=str(_fixture_path("full")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    entry = manager._find_entry("setta-fixture-full", PluginScope.workspace)
    assert entry is not None
    assert entry.manifest is not None
    assert entry.manifest.configSchemaPath is not None
    schema_path = manager._resolve_relative_path(
        entry.source_path,
        entry.manifest.configSchemaPath,
        code="PLUGIN_MANIFEST_PATH_NOT_FOUND",
        message_prefix="Invalid config schema path",
    )

    directory_check_count = 0
    original_directory_has_files = manager._directory_has_files

    def _counting_directory_has_files(path: Path | None) -> bool:
        nonlocal directory_check_count
        directory_check_count += 1
        return original_directory_has_files(path)

    schema_read_count = 0
    original_read_text = Path.read_text

    def _counting_read_text(self: Path, *args: Any, **kwargs: Any) -> str:
        nonlocal schema_read_count
        if self == schema_path:
            schema_read_count += 1
        return original_read_text(self, *args, **kwargs)

    monkeypatch.setattr(manager, "_directory_has_files", _counting_directory_has_files)
    monkeypatch.setattr(Path, "read_text", _counting_read_text)

    manager.get_runtime_response()
    manager.get_runtime_response()

    assert directory_check_count == 3
    assert schema_read_count == 1

    before_rescan_directory_checks = directory_check_count
    before_rescan_schema_reads = schema_read_count
    manager.rescan()
    manager.get_runtime_response()

    assert directory_check_count > before_rescan_directory_checks
    assert schema_read_count > before_rescan_schema_reads


def test_backend_plugin_startup_timeout_is_reported(tmp_path: Path) -> None:
    # Backend import stalls should fail with explicit startup-timeout error codes.
    manager = _make_manager(
        tmp_path,
        backend_startup_timeout_seconds=0.1,
        backend_register_timeout_seconds=5.0,
    )
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-worker-failure-timeout-startup",
        scope=PluginScope.workspace,
    )
    manager.rescan()

    manager.load_backend_plugins(app=FastAPI())

    backend_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend-worker-failure-timeout-startup"
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
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-worker-failure-timeout-register",
        scope=PluginScope.workspace,
    )
    manager.rescan()

    manager.load_backend_plugins(app=FastAPI())

    backend_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend-worker-failure-timeout-register"
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
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-worker-failure-transport",
        scope=PluginScope.workspace,
    )
    manager.rescan()

    manager.load_backend_plugins(app=FastAPI())

    backend_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend-worker-failure-transport"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(backend_entries) == 1
    assert backend_entries[0].state == PluginRuntimeState.invalid
    error_codes = {error.code for error in backend_entries[0].errors}
    assert "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR" in error_codes


def test_backend_plugin_stdout_logs_do_not_corrupt_worker_transport(
    tmp_path: Path,
) -> None:
    # Import-time plugin stdout logs should be redirected away from JSON-RPC transport.
    manager = _make_manager(tmp_path)
    backend_root = _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    entrypoint_path = backend_root / "backend" / "entrypoint.py"
    original_entrypoint = entrypoint_path.read_text(encoding="utf-8")
    entrypoint_path.write_text(
        "print('plugin-import-log')\n" + original_entrypoint,
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
    assert backend_entries[0].state == PluginRuntimeState.active
    error_codes = {error.code for error in backend_entries[0].errors}
    assert "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR" not in error_codes


def test_backend_plugin_handshake_api_mismatch_is_reported(tmp_path: Path) -> None:
    # Worker handshake API mismatches should invalidate the backend plugin deterministically.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-worker-failure-api-version",
        scope=PluginScope.workspace,
    )
    manager.rescan()

    manager.load_backend_plugins(app=FastAPI())

    backend_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend-worker-failure-api-version"
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
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-worker-failure-missing-method",
        scope=PluginScope.workspace,
    )
    manager.rescan()

    manager.load_backend_plugins(app=FastAPI())

    backend_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend-worker-failure-missing-method"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(backend_entries) == 1
    assert backend_entries[0].state == PluginRuntimeState.invalid
    error_codes = {error.code for error in backend_entries[0].errors}
    assert "PLUGIN_BACKEND_HANDSHAKE_INVALID" in error_codes


def test_backend_plugin_load_reprepares_missing_dependency_runtime(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Backend load should backfill missing dependency runtimes instead of failing as invalid.
    manager = _make_manager(tmp_path)
    backend_root = _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    (backend_root / "pyproject.toml").write_text(
        "[build-system]\n"
        'requires = ["setuptools==80.9.0", "wheel==0.45.1"]\n'
        'build-backend = "setuptools.build_meta"\n\n'
        "[project]\n"
        'name = "setta-fixture-backend"\n'
        'version = "0.1.0"\n'
        'description = "Backend fixture plugin for Setta tests"\n'
        'requires-python = ">=3.12"\n'
        'dependencies = ["requests==2.32.4"]\n',
        encoding="utf-8",
    )
    manager.rescan()
    prepare_calls = 0

    def _record_prepare(**_kwargs):
        nonlocal prepare_calls
        prepare_calls += 1

    monkeypatch.setattr(manager, "_prepare_backend_runtime", _record_prepare)

    manager.load_backend_plugins(app=FastAPI())

    backend_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(backend_entries) == 1
    assert backend_entries[0].state == PluginRuntimeState.active
    assert prepare_calls == 1


def test_link_backend_plugin_rejects_invalid_dependency_spec(tmp_path: Path) -> None:
    # Invalid dependency specs should fail install-time runtime preparation deterministically.
    manager = _make_manager(tmp_path)
    plugin_root = tmp_path / "backend-invalid-deps"
    shutil.copytree(_fixture_path("backend"), plugin_root)
    (plugin_root / "pyproject.toml").write_text(
        "[build-system]\n"
        'requires = ["setuptools==80.9.0", "wheel==0.45.1"]\n'
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

    plugin_entry = manager.get_runtime_response().list.plugins[0]
    assert plugin_entry.pluginId == plugin_id
    assert plugin_entry.content.hasBlueprints is True
    assert plugin_entry.content.hasProjectTemplates is True
    assert plugin_entry.content.hasPrompts is True
    assert plugin_entry.config.hasSchema is True
    assert isinstance(plugin_entry.config.schemaJson, dict)
    assert plugin_entry.config.currentConfig == {
        "enabled": True,
        "label": "fixture",
    }


@pytest.mark.parametrize("removal_api", ["uninstall_plugin"])
def test_plugin_config_is_cleared_when_plugin_is_removed(
    tmp_path: Path,
    removal_api: str,
) -> None:
    # Removing a plugin should clear persisted config so relink starts from defaults.
    manager = _make_manager(tmp_path)
    full_root = _fixture_path("full")
    manager.link_plugin(
        local_plugin_root=str(full_root),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )

    manager.write_plugin_config(
        plugin_id="setta-fixture-full",
        config={"enabled": True, "label": "persisted-config"},
    )
    configured_entry = next(
        plugin
        for plugin in manager.get_runtime_response().list.plugins
        if plugin.pluginId == "setta-fixture-full"
    )
    assert configured_entry.config.currentConfig == {
        "enabled": True,
        "label": "persisted-config",
    }

    remove_plugin = getattr(manager, removal_api)
    remove_plugin(plugin_id="setta-fixture-full", scope=PluginScope.workspace)

    manager.link_plugin(
        local_plugin_root=str(full_root),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    relinked_entry = next(
        plugin
        for plugin in manager.get_runtime_response().list.plugins
        if plugin.pluginId == "setta-fixture-full"
    )
    assert relinked_entry.config.currentConfig == {}


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
    workflow_path = plugin_root / ".github" / "workflows" / "release.yml"
    assert workflow_path.exists()
    workflow_text = workflow_path.read_text(encoding="utf-8")
    assert "python -m pip install --upgrade build twine setta" in workflow_text
    assert "setta plugins validate ." in workflow_text

    frontend_entrypoint = plugin_root / "frontend" / "dist" / "index.js"
    assert frontend_entrypoint.exists()
    entrypoint_text = frontend_entrypoint.read_text(encoding="utf-8")
    assert "export const apiVersion = 1;" in entrypoint_text

    manager.validate_plugin_folder(plugin_root)


def test_init_template_supports_backend_and_content_variants(tmp_path: Path) -> None:
    # Backend/content templates should generate only the expected component scaffolding.
    manager = _make_manager(tmp_path)

    backend_root = manager.init_plugin_template(
        plugin_id="setta-init-backend-fixture",
        template="backend",
        out_dir=str(tmp_path),
    )
    manager.validate_plugin_folder(backend_root)
    backend_manifest = json.loads(
        (backend_root / "setta.plugin.json").read_text(encoding="utf-8")
    )
    assert backend_manifest["backend"] == {"entrypoint": "backend/entrypoint.py"}
    assert "frontend" not in backend_manifest
    assert "content" not in backend_manifest
    assert (backend_root / "backend" / "entrypoint.py").exists()
    assert not (backend_root / "frontend").exists()
    assert not (backend_root / "content").exists()

    content_root = manager.init_plugin_template(
        plugin_id="setta-init-content-fixture",
        template="content",
        out_dir=str(tmp_path),
    )
    manager.validate_plugin_folder(content_root)
    content_manifest = json.loads(
        (content_root / "setta.plugin.json").read_text(encoding="utf-8")
    )
    assert content_manifest["content"] == {
        "blueprintsDir": "content/blueprints",
        "projectTemplatesDir": "content/project_templates",
        "promptsDir": "content/prompts",
    }
    assert "backend" not in content_manifest
    assert "frontend" not in content_manifest
    assert (content_root / "content" / "blueprints" / "starter-blueprint.json").exists()
    assert (
        content_root / "content" / "project_templates" / "starter-template.json"
    ).exists()
    assert (content_root / "content" / "prompts" / "starter-prompt.md").exists()
    assert not (content_root / "backend").exists()
    assert not (content_root / "frontend").exists()


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

    listed = manager.get_runtime_response().list.plugins
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


def test_plugin_asset_resolution_rejects_backend_files_outside_frontend_roots(
    tmp_path: Path,
) -> None:
    # Asset resolution must not expose backend/internal plugin files.
    manager = _make_manager(tmp_path)
    manager.link_plugin(
        local_plugin_root=str(_fixture_path("full")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )

    with pytest.raises(PluginManagerError) as exc_info:
        manager.resolve_plugin_asset_path(
            plugin_id="setta-fixture-full",
            asset_path="backend/entrypoint.py",
        )

    assert exc_info.value.code == "PLUGIN_ASSET_NOT_FOUND"


def test_list_response_encodes_plugin_frontend_asset_urls(tmp_path: Path) -> None:
    # Frontend asset URLs should encode reserved path characters for browser-safe requests.
    manager = _make_manager(tmp_path)
    plugin_root = tmp_path / "encoded-asset-plugin"
    shutil.copytree(_fixture_path("frontend"), plugin_root)
    manifest_path = plugin_root / "setta.plugin.json"
    manifest_payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest_payload["id"] = "setta-fixture-frontend-encoded"
    manifest_payload["name"] = "Setta Fixture Frontend Encoded"
    manifest_payload["frontend"]["entrypoint"] = "frontend/dist/entry #main.js"
    manifest_path.write_text(json.dumps(manifest_payload, indent=2), encoding="utf-8")
    dist_root = plugin_root / "frontend" / "dist"
    (dist_root / "index.js").rename(dist_root / "entry #main.js")

    manager.link_plugin(
        local_plugin_root=str(plugin_root),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    listed = manager.get_runtime_response().list.plugins
    assert len(listed) == 1
    entrypoint_url = listed[0].frontend.entrypointUrl
    assert entrypoint_url is not None
    assert (
        "/plugins/setta-fixture-frontend-encoded/frontend/dist/entry%20%23main.js"
        in entrypoint_url
    )
    assert "#" not in entrypoint_url
    assert "v=" in entrypoint_url


def test_directory_digest_cache_skips_rehash_when_tree_is_unchanged(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Digest cache should avoid reopening files when directory contents are unchanged.
    manager = _make_manager(tmp_path)
    digest_root = tmp_path / "digest-root"
    digest_root.mkdir(parents=True, exist_ok=True)
    sample_file = digest_root / "sample.txt"
    sample_file.write_text("first", encoding="utf-8")

    first_digest = manager._compute_directory_digest(digest_root)
    with monkeypatch.context() as scope:
        scope.setattr(
            Path,
            "open",
            lambda *_args, **_kwargs: (_ for _ in ()).throw(
                AssertionError("Expected cached directory digest to skip file reads.")
            ),
        )
        second_digest = manager._compute_directory_digest(digest_root)

    sample_file.write_text("second", encoding="utf-8")
    updated_digest = manager._compute_directory_digest(digest_root)

    assert second_digest == first_digest
    assert updated_digest != first_digest


def test_directory_digest_cache_is_bounded_and_prunes_deleted_roots(
    tmp_path: Path,
) -> None:
    # Digest cache should cap entry count and remove roots that no longer exist.
    manager = _make_manager(tmp_path)
    max_entries = 256

    for index in range(max_entries + 10):
        root = tmp_path / f"digest-cache-{index}"
        root.mkdir(parents=True, exist_ok=True)
        (root / "value.txt").write_text(str(index), encoding="utf-8")
        manager._compute_directory_digest(root)

    assert len(manager._directory_digest_cache) <= max_entries

    stale_root = tmp_path / "digest-stale"
    stale_root.mkdir(parents=True, exist_ok=True)
    (stale_root / "value.txt").write_text("stale", encoding="utf-8")
    manager._compute_directory_digest(stale_root)
    stale_key = str(stale_root.resolve(strict=False))
    assert stale_key in manager._directory_digest_cache

    shutil.rmtree(stale_root)
    fresh_root = tmp_path / "digest-fresh"
    fresh_root.mkdir(parents=True, exist_ok=True)
    (fresh_root / "value.txt").write_text("fresh", encoding="utf-8")
    manager._compute_directory_digest(fresh_root)

    assert stale_key not in manager._directory_digest_cache


def test_directory_digest_tracks_symlinked_file_target_changes(tmp_path: Path) -> None:
    # Symlinked files inside the plugin root should contribute to digest invalidation.
    manager = _make_manager(tmp_path)
    digest_root = tmp_path / "digest-symlink-root"
    digest_root.mkdir(parents=True, exist_ok=True)
    target_file = tmp_path / "digest-symlink-target.txt"
    target_file.write_text("v1", encoding="utf-8")
    (digest_root / "linked.txt").symlink_to(target_file)

    initial_digest = manager._compute_directory_digest(digest_root)
    target_file.write_text("v2", encoding="utf-8")
    updated_digest = manager._compute_directory_digest(digest_root)

    assert updated_digest != initial_digest


def test_directory_has_files_does_not_follow_symlink_cycles(tmp_path: Path) -> None:
    # Directory file detection should terminate safely when symlink cycles are present.
    manager = _make_manager(tmp_path)
    content_root = tmp_path / "content"
    prompts_root = content_root / "prompts"
    prompts_root.mkdir(parents=True, exist_ok=True)
    (prompts_root / "loop").symlink_to(prompts_root, target_is_directory=True)

    assert manager._directory_has_files(content_root) is False

    (prompts_root / "prompt.md").write_text("hello", encoding="utf-8")
    assert manager._directory_has_files(content_root) is True


def test_load_plugins_state_uses_cache_and_invalidates_on_file_change(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Plugins state loads should reuse cached payloads until the on-disk file changes.
    manager = _make_manager(tmp_path)
    state_file = manager._load_plugins_state()
    state_file.enabledPluginIds = ["alpha.plugin"]
    manager._save_plugins_state(state_file)
    plugins_state_path = manager.setta_files_root / "plugins_state.json"

    first_load = manager._load_plugins_state()
    assert first_load.enabledPluginIds == ["alpha.plugin"]

    original_read_text = Path.read_text

    def _patched_read_text(self: Path, *args, **kwargs) -> str:
        if self == plugins_state_path:
            raise AssertionError(
                "Expected cached plugins_state load to skip file reads."
            )
        return original_read_text(self, *args, **kwargs)

    with monkeypatch.context() as scope:
        scope.setattr(Path, "read_text", _patched_read_text)
        second_load = manager._load_plugins_state()

    assert second_load.enabledPluginIds == ["alpha.plugin"]
    assert second_load is not first_load

    second_load.enabledPluginIds.append("mutated")
    third_load = manager._load_plugins_state()
    assert third_load.enabledPluginIds == ["alpha.plugin"]

    updated_payload = third_load.model_dump(mode="json")
    updated_payload["enabledPluginIds"] = ["beta.plugin"]
    plugins_state_path.write_text(
        json.dumps(updated_payload, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    updated_load = manager._load_plugins_state()
    assert updated_load.enabledPluginIds == ["beta.plugin"]


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
            installer=PluginInstallerBackend.pip,
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
        for entry in manager.get_runtime_response().list.plugins
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
            / ".setta_plugins"
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


def test_apply_lockfile_fails_when_lockfile_missing(tmp_path: Path) -> None:
    # Lockfile apply must fail deterministically when the lockfile does not exist.
    manager = _make_manager(tmp_path)

    with pytest.raises(PluginManagerError) as exc_info:
        manager.apply_lockfile(check=False)
    assert exc_info.value.code == "PLUGIN_LOCKFILE_NOT_FOUND"


def test_apply_lockfile_fails_on_invalid_json(tmp_path: Path) -> None:
    # Lockfile apply must fail deterministically on malformed lockfile JSON payloads.
    manager = _make_manager(tmp_path)
    lockfile_path = manager.workspace_root / ".setta_plugins" / "plugins.lock.json"
    lockfile_path.parent.mkdir(parents=True, exist_ok=True)
    lockfile_path.write_text("{not-valid-json", encoding="utf-8")

    with pytest.raises(PluginManagerError) as exc_info:
        manager.apply_lockfile(check=False)
    assert exc_info.value.code == "PLUGIN_LOCKFILE_INVALID"


def test_apply_lockfile_requires_source_spec_for_missing_plugin(tmp_path: Path) -> None:
    # Lockfile apply must reject entries that require install but omit sourceSpec.
    manager = _make_manager(tmp_path)
    lockfile_path = manager.workspace_root / ".setta_plugins" / "plugins.lock.json"
    lockfile_path.parent.mkdir(parents=True, exist_ok=True)
    lockfile_path.write_text(
        json.dumps(
            {
                "plugins": [
                    {
                        "pluginId": "setta-fixture-frontend",
                        "version": "0.1.0",
                        "canonicalSourceKey": "pypi:setta-fixture-frontend",
                        "scope": "workspace",
                        "sourceDigestSha256": "fixture-digest",
                        "sourceSpec": None,
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    with pytest.raises(PluginManagerError) as exc_info:
        manager.apply_lockfile(check=False)
    assert exc_info.value.code == "PLUGIN_LOCKFILE_ENTRY_MISSING_SOURCE"


def test_apply_lockfile_uses_installer_backend_from_lockfile(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Lockfile apply should pass through installer backend persisted in lock entries.
    manager = _make_manager(tmp_path)
    lockfile_path = manager.workspace_root / ".setta_plugins" / "plugins.lock.json"
    lockfile_path.parent.mkdir(parents=True, exist_ok=True)
    lockfile_path.write_text(
        json.dumps(
            {
                "plugins": [
                    {
                        "pluginId": "setta-fixture-frontend",
                        "version": "0.1.0",
                        "canonicalSourceKey": "pypi:setta-fixture-frontend",
                        "scope": "workspace",
                        "sourceDigestSha256": "fixture-digest",
                        "sourceSpec": "pypi:setta-fixture-frontend==0.1.0",
                        "installerBackend": "pip",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    captured_installer: PluginInstallerBackend | None = None

    def _fake_install_plugin(*, installer: PluginInstallerBackend | None, **_kwargs):
        nonlocal captured_installer
        captured_installer = installer

    monkeypatch.setattr(manager, "install_plugin", _fake_install_plugin)

    result = manager.apply_lockfile(check=False)

    assert result.applied is True
    assert captured_installer == PluginInstallerBackend.pip


def test_apply_lockfile_plans_uninstall_for_plugins_missing_from_lockfile(
    tmp_path: Path,
) -> None:
    # Lockfile check mode should plan uninstall operations for extra installed plugins.
    manager = _make_manager(tmp_path)
    manager.link_plugin(
        local_plugin_root=str(_fixture_path("frontend")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    lockfile_path = manager.workspace_root / ".setta_plugins" / "plugins.lock.json"
    lockfile_path.parent.mkdir(parents=True, exist_ok=True)
    lockfile_path.write_text(
        json.dumps(
            {
                "plugins": [],
            }
        ),
        encoding="utf-8",
    )

    check_result = manager.apply_lockfile(check=True)
    assert check_result.applied is False
    assert any(
        "uninstall setta-fixture-frontend from workspace" in change
        for change in check_result.plannedChanges
    )


def test_apply_lockfile_executes_uninstall_for_plugins_missing_from_lockfile(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Lockfile apply mode should execute uninstall operations for extra plugins.
    manager = _make_manager(tmp_path)
    manager.link_plugin(
        local_plugin_root=str(_fixture_path("frontend")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    lockfile_path = manager.workspace_root / ".setta_plugins" / "plugins.lock.json"
    lockfile_path.parent.mkdir(parents=True, exist_ok=True)
    lockfile_path.write_text(
        json.dumps(
            {
                "plugins": [],
            }
        ),
        encoding="utf-8",
    )

    uninstall_calls: list[tuple[str, PluginScope | None]] = []
    original_uninstall = manager.uninstall_plugin

    def _record_uninstall(
        *,
        plugin_id: str,
        scope: str | PluginScope | None = None,
        rescan: bool = True,
    ):
        resolved_scope = None if scope is None else normalize_scope(scope)
        uninstall_calls.append((plugin_id, resolved_scope))
        return original_uninstall(plugin_id=plugin_id, scope=scope, rescan=rescan)

    monkeypatch.setattr(manager, "uninstall_plugin", _record_uninstall)
    apply_result = manager.apply_lockfile(check=False)
    assert apply_result.applied is True
    assert uninstall_calls == [("setta-fixture-frontend", PluginScope.workspace)]

    remaining_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-frontend"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert remaining_entries == []


def test_apply_lockfile_plans_and_uninstalls_invalid_filesystem_plugins(
    tmp_path: Path,
) -> None:
    # Invalid setta-managed entries should be included in lockfile convergence/uninstall.
    manager = _make_manager(tmp_path)
    invalid_plugin_root = (
        manager.workspace_root / ".setta_plugins" / "setta-invalid-missing-manifest"
    )
    invalid_plugin_root.mkdir(parents=True, exist_ok=True)
    (invalid_plugin_root / "README.txt").write_text(
        "missing manifest", encoding="utf-8"
    )
    manager.rescan()

    lockfile_path = manager.workspace_root / ".setta_plugins" / "plugins.lock.json"
    lockfile_path.parent.mkdir(parents=True, exist_ok=True)
    lockfile_path.write_text(json.dumps({"plugins": []}), encoding="utf-8")

    check_result = manager.apply_lockfile(check=True)
    assert any(
        "uninstall setta-invalid-missing-manifest from workspace" in change
        for change in check_result.plannedChanges
    )

    apply_result = manager.apply_lockfile(check=False)
    assert apply_result.applied is True
    assert not invalid_plugin_root.exists()


def test_apply_lockfile_preserves_disabled_state_when_reconciling_source(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Reconcile installs should preserve a plugin's disabled state from current runtime.
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
    captured_enable_flags: list[bool] = []
    original_install = manager.install_plugin

    def _record_install_plugin(**kwargs):
        enable_value = kwargs.get("enable")
        assert isinstance(enable_value, bool)
        captured_enable_flags.append(enable_value)
        return original_install(**kwargs)

    monkeypatch.setattr(manager, "install_plugin", _record_install_plugin)
    try:
        manager.install_plugin(
            source_spec=f"pypi:{package_name}=={version}",
            installer=PluginInstallerBackend.pip,
            scope=PluginScope.workspace,
            enable=True,
            force=False,
        )
        manager.disable_plugin(plugin_id=package_name)
        lockfile_path = manager.workspace_root / ".setta_plugins" / "plugins.lock.json"
        lockfile_path.parent.mkdir(parents=True, exist_ok=True)
        lockfile_path.write_text(
            json.dumps(
                {
                    "plugins": [
                        {
                            "pluginId": package_name,
                            "version": version,
                            "canonicalSourceKey": "pypi:setta_fixture_frontend",
                            "scope": "workspace",
                            "sourceDigestSha256": None,
                            "sourceSpec": f"pypi:setta_fixture_frontend=={version}",
                        }
                    ]
                }
            ),
            encoding="utf-8",
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

    assert captured_enable_flags[-1] is False
    final_entry = next(
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == package_name
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    )
    assert final_entry.state == PluginRuntimeState.disabled


def test_apply_lockfile_batches_mutations_and_performs_one_final_rescan(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Lockfile apply should pass rescan=False to each mutation and run one final rescan.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="frontend",
        scope=PluginScope.workspace,
    )
    manager.rescan()

    package_name = "setta-fixture-backend"
    version = "0.1.0"
    artifact = _build_local_pypi_wheel_from_fixture(
        tmp_path=tmp_path,
        fixture_name="backend",
        package_name=package_name,
        version=version,
    )
    lockfile_path = manager.workspace_root / ".setta_plugins" / "plugins.lock.json"
    lockfile_path.parent.mkdir(parents=True, exist_ok=True)
    lockfile_path.write_text(
        json.dumps(
            {
                "plugins": [
                    {
                        "pluginId": package_name,
                        "version": version,
                        "canonicalSourceKey": f"pypi:{package_name}",
                        "scope": "workspace",
                        "sourceDigestSha256": None,
                        "sourceSpec": f"pypi:{package_name}=={version}",
                        "installerBackend": "pip",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    install_rescan_flags: list[bool] = []
    uninstall_rescan_flags: list[bool] = []
    original_install = manager.install_plugin
    original_uninstall = manager.uninstall_plugin

    def _record_install_plugin(**kwargs):
        rescan_value = kwargs.get("rescan", True)
        assert isinstance(rescan_value, bool)
        install_rescan_flags.append(rescan_value)
        return original_install(**kwargs)

    def _record_uninstall_plugin(**kwargs):
        rescan_value = kwargs.get("rescan", True)
        assert isinstance(rescan_value, bool)
        uninstall_rescan_flags.append(rescan_value)
        return original_uninstall(**kwargs)

    monkeypatch.setattr(manager, "install_plugin", _record_install_plugin)
    monkeypatch.setattr(manager, "uninstall_plugin", _record_uninstall_plugin)

    original_rescan = manager.rescan
    rescan_count = 0

    def _count_rescan():
        nonlocal rescan_count
        rescan_count += 1
        return original_rescan()

    monkeypatch.setattr(manager, "rescan", _count_rescan)

    old_no_index = os.environ.get("PIP_NO_INDEX")
    old_find_links = os.environ.get("PIP_FIND_LINKS")
    os.environ["PIP_NO_INDEX"] = "1"
    os.environ["PIP_FIND_LINKS"] = str(artifact.parent)
    try:
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

    assert install_rescan_flags == [False]
    assert uninstall_rescan_flags == [False]
    assert rescan_count == 1


def test_apply_lockfile_reconciles_digest_mismatches_for_existing_plugins(
    tmp_path: Path,
) -> None:
    # Lockfile apply should plan and execute digest reconciliation when version matches.
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
            installer=PluginInstallerBackend.pip,
            scope=PluginScope.workspace,
            enable=True,
            force=False,
        )
        lockfile_path = manager.workspace_root / ".setta_plugins" / "plugins.lock.json"
        lockfile_path.parent.mkdir(parents=True, exist_ok=True)
        lockfile_path.write_text(
            json.dumps(
                {
                    "plugins": [
                        {
                            "pluginId": package_name,
                            "version": version,
                            "canonicalSourceKey": f"pypi:{package_name}",
                            "scope": "workspace",
                            "sourceDigestSha256": "digest-reconcile-target",
                            "sourceSpec": f"pypi:{package_name}=={version}",
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )

        check_result = manager.apply_lockfile(check=True)
        assert check_result.applied is False
        assert any(
            "reconcile digest for setta-fixture-frontend in workspace" in change
            for change in check_result.plannedChanges
        )

        apply_result = manager.apply_lockfile(check=False)
        assert apply_result.applied is True
        assert any(
            "reconcile digest for setta-fixture-frontend in workspace" in change
            for change in apply_result.plannedChanges
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


def test_apply_lockfile_reconciles_source_spec_changes_for_existing_plugins(
    tmp_path: Path,
) -> None:
    # Lockfile apply should reinstall when source spec/source key drift, even at same version.
    manager = _make_manager(tmp_path)
    package_name = "setta-fixture-frontend"
    version = "0.1.0"
    artifact = _build_local_pypi_wheel_from_fixture(
        tmp_path=tmp_path,
        fixture_name="frontend",
        package_name=package_name,
        version=version,
    )
    replacement_source_spec = f"pypi:setta_fixture_frontend=={version}"
    replacement_canonical_source_key = "pypi:setta_fixture_frontend"

    old_no_index = os.environ.get("PIP_NO_INDEX")
    old_find_links = os.environ.get("PIP_FIND_LINKS")
    os.environ["PIP_NO_INDEX"] = "1"
    os.environ["PIP_FIND_LINKS"] = str(artifact.parent)
    try:
        manager.install_plugin(
            source_spec=f"pypi:{package_name}=={version}",
            installer=PluginInstallerBackend.pip,
            scope=PluginScope.workspace,
            enable=True,
            force=False,
        )
        lockfile_path = manager.workspace_root / ".setta_plugins" / "plugins.lock.json"
        lockfile_path.parent.mkdir(parents=True, exist_ok=True)
        lockfile_path.write_text(
            json.dumps(
                {
                    "plugins": [
                        {
                            "pluginId": package_name,
                            "version": version,
                            "canonicalSourceKey": replacement_canonical_source_key,
                            "scope": "workspace",
                            "sourceDigestSha256": None,
                            "sourceSpec": replacement_source_spec,
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )

        check_result = manager.apply_lockfile(check=True)
        assert check_result.applied is False
        assert any(
            "reconcile source for setta-fixture-frontend in workspace" in change
            for change in check_result.plannedChanges
        )

        apply_result = manager.apply_lockfile(check=False)
        assert apply_result.applied is True
        assert any(
            "reconcile source for setta-fixture-frontend in workspace" in change
            for change in apply_result.plannedChanges
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

    status_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == package_name
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(status_entries) == 1
    assert status_entries[0].canonicalSourceKey == replacement_canonical_source_key

    metadata_key = manager._metadata_key(package_name, PluginScope.workspace)
    metadata = manager._load_install_metadata().entries[metadata_key]
    assert metadata.sourceSpec == replacement_source_spec


def test_apply_lockfile_requires_source_spec_for_source_reconcile(
    tmp_path: Path,
) -> None:
    # Source reconciliation must fail fast when lockfile omits sourceSpec for existing plugin.
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
            installer=PluginInstallerBackend.pip,
            scope=PluginScope.workspace,
            enable=True,
            force=False,
        )
        lockfile_path = manager.workspace_root / ".setta_plugins" / "plugins.lock.json"
        lockfile_path.parent.mkdir(parents=True, exist_ok=True)
        lockfile_path.write_text(
            json.dumps(
                {
                    "plugins": [
                        {
                            "pluginId": package_name,
                            "version": version,
                            "canonicalSourceKey": "pypi:setta_fixture_frontend",
                            "scope": "workspace",
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )

        check_result = manager.apply_lockfile(check=True)
        assert check_result.applied is False
        assert any(
            "reconcile source for setta-fixture-frontend in workspace" in change
            for change in check_result.plannedChanges
        )

        with pytest.raises(PluginManagerError) as exc_info:
            manager.apply_lockfile(check=False)
        assert exc_info.value.code == "PLUGIN_LOCKFILE_ENTRY_MISSING_SOURCE"
    finally:
        if old_no_index is None:
            os.environ.pop("PIP_NO_INDEX", None)
        else:
            os.environ["PIP_NO_INDEX"] = old_no_index
        if old_find_links is None:
            os.environ.pop("PIP_FIND_LINKS", None)
        else:
            os.environ["PIP_FIND_LINKS"] = old_find_links


def test_resolve_plugin_asset_path_rejects_traversal_and_missing_files(
    tmp_path: Path,
) -> None:
    # Asset resolution should reject path traversal and missing files deterministically.
    manager = _make_manager(tmp_path)
    manager.link_plugin(
        local_plugin_root=str(_fixture_path("frontend")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )

    with pytest.raises(PluginManagerError) as traversal_error:
        manager.resolve_plugin_asset_path(
            plugin_id="setta-fixture-frontend",
            asset_path="../setta.plugin.json",
        )
    assert traversal_error.value.code == "PLUGIN_ASSET_INVALID_PATH"

    with pytest.raises(PluginManagerError) as missing_error:
        manager.resolve_plugin_asset_path(
            plugin_id="setta-fixture-frontend",
            asset_path="frontend/dist/missing.js",
        )
    assert missing_error.value.code == "PLUGIN_ASSET_NOT_FOUND"


@pytest.mark.parametrize(
    ("target_payload", "expected_message_fragment"),
    [
        (
            {
                "id": "typescript",
                "name": "TypeScript",
                "language": "typescript",
                "handlerId": "typescript",
                "unsupported": True,
            },
            "unsupported keys",
        ),
        (
            {
                "id": " ",
                "name": "TypeScript",
                "language": "typescript",
                "handlerId": "typescript",
            },
            "id cannot be empty",
        ),
        (
            {
                "id": "typescript",
                "name": " ",
                "language": "typescript",
                "handlerId": "typescript",
            },
            "name cannot be empty",
        ),
        (
            {
                "id": "typescript",
                "name": "TypeScript",
                "language": "python",
                "handlerId": "typescript",
            },
            "cannot reuse python language id",
        ),
        (
            {
                "id": "typescript",
                "name": "TypeScript",
                "language": "typescript",
                "handlerId": " ",
            },
            "handlerId cannot be empty",
        ),
        (
            {
                "id": "typescript",
                "name": "TypeScript",
                "language": "typescript",
                "handlerId": "typescript",
                "defaultFileName": 1,
            },
            "defaultFileName must be a string",
        ),
        (
            {
                "id": "bad:id",
                "name": "TypeScript",
                "language": "typescript",
                "handlerId": "typescript",
            },
            "id cannot contain ':'",
        ),
    ],
)
def test_codegen_target_registration_validation_rejects_invalid_fields(
    tmp_path: Path,
    target_payload: dict[str, object],
    expected_message_fragment: str,
) -> None:
    # Codegen target registration helper should reject malformed registration payload fields.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-codegen",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry(
        "setta-fixture-backend-codegen",
        PluginScope.workspace,
    )
    assert entry is not None

    with pytest.raises(PluginManagerError) as exc_info:
        manager._build_backend_codegen_target_registration(
            entry=entry,
            target=target_payload,
        )
    assert exc_info.value.code == "PLUGIN_BACKEND_REGISTER_FAILED"
    assert expected_message_fragment in exc_info.value.message


def test_generate_backend_codegen_target_rejects_unknown_target(tmp_path: Path) -> None:
    # Codegen target generation should fail when the target id is missing or unknown.
    manager = _make_manager(tmp_path)

    with pytest.raises(PluginManagerError) as missing_error:
        manager.generate_backend_codegen_target(
            target_id=" ",
            project_state={},
            target_options={},
        )
    assert missing_error.value.code == "PLUGIN_CODEGEN_TARGET_NOT_FOUND"

    with pytest.raises(PluginManagerError) as unknown_error:
        manager.generate_backend_codegen_target(
            target_id="setta-fixture-backend-codegen:missing",
            project_state={},
            target_options={},
        )
    assert unknown_error.value.code == "PLUGIN_CODEGEN_TARGET_NOT_FOUND"


def test_generate_backend_codegen_target_validates_input_payload_shapes(
    tmp_path: Path,
) -> None:
    # Codegen generation should reject non-object project_state/target_options payloads.
    manager = _make_manager(tmp_path)

    with pytest.raises(PluginManagerError) as project_state_error:
        manager.generate_backend_codegen_target(
            target_id="setta-fixture-backend-codegen:typescript",
            project_state=[],
            target_options={},
        )
    assert project_state_error.value.code == "PLUGIN_BACKEND_CODEGEN_FAILED"

    with pytest.raises(PluginManagerError) as target_options_error:
        manager.generate_backend_codegen_target(
            target_id="setta-fixture-backend-codegen:typescript",
            project_state={},
            target_options=[],
        )
    assert target_options_error.value.code == "PLUGIN_BACKEND_CODEGEN_FAILED"


def test_generate_backend_codegen_target_rejects_invalid_worker_result_payload(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Worker generation payloads should still be normalized/validated by manager.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-codegen",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    manager.load_backend_plugins(app=FastAPI())

    monkeypatch.setattr(manager, "_call_backend_worker_method", lambda **_kwargs: {})

    with pytest.raises(PluginManagerError) as exc_info:
        manager.generate_backend_codegen_target(
            target_id="setta-fixture-backend-codegen:typescript",
            project_state={"projectConfig": {"name": "FixtureProject"}},
            target_options={"className": "FixtureState"},
        )
    assert exc_info.value.code == "PLUGIN_BACKEND_CODEGEN_FAILED"


@pytest.mark.parametrize(
    ("payload", "expected_message_fragment"),
    [
        ({}, "must include files array"),
        ({"files": []}, "must generate at least one file"),
        (
            {
                "files": [
                    {
                        "relativePath": "/tmp/absolute.ts",
                        "content": "export const x = 1;\n",
                    }
                ]
            },
            "relativePath cannot be absolute",
        ),
        (
            {
                "files": [
                    {
                        "relativePath": "C:/tmp/absolute.ts",
                        "content": "export const x = 1;\n",
                    }
                ]
            },
            "relativePath cannot be absolute",
        ),
        (
            {
                "files": [
                    {
                        "relativePath": r"C:\tmp\absolute.ts",
                        "content": "export const x = 1;\n",
                    }
                ]
            },
            "relativePath cannot be absolute",
        ),
        (
            {
                "files": [
                    {
                        "relativePath": r"\\server\share\absolute.ts",
                        "content": "export const x = 1;\n",
                    }
                ]
            },
            "relativePath cannot be absolute",
        ),
        (
            {
                "files": [
                    {
                        "relativePath": "../escape.ts",
                        "content": "export const x = 1;\n",
                    }
                ]
            },
            "relativePath cannot escape target root",
        ),
        (
            {
                "files": [
                    {
                        "relativePath": "setta_gen.ts",
                        "content": "first",
                    },
                    {
                        "relativePath": "./setta_gen.ts",
                        "content": "second",
                    },
                ]
            },
            "relativePath is duplicated",
        ),
        (
            {
                "files": [
                    {
                        "relativePath": "setta_gen.ts",
                        "content": 123,
                    }
                ]
            },
            "content must be a string",
        ),
    ],
)
def test_normalize_codegen_generation_payload_rejects_invalid_file_entries(
    tmp_path: Path,
    payload: dict[str, object],
    expected_message_fragment: str,
) -> None:
    # Normalization should reject malformed file arrays from plugin codegen handlers.
    manager = _make_manager(tmp_path)

    with pytest.raises(PluginManagerError) as exc_info:
        manager._normalize_codegen_generation_payload(
            plugin_id="setta-fixture-backend-codegen",
            target_id="setta-fixture-backend-codegen:typescript",
            payload=payload,
            default_file_name="setta_gen.ts",
        )
    assert exc_info.value.code == "PLUGIN_BACKEND_CODEGEN_FAILED"
    assert expected_message_fragment in str(exc_info.value)


def test_normalize_codegen_generation_payload_canonicalizes_relative_paths(
    tmp_path: Path,
) -> None:
    # Normalization should collapse equivalent relative path spellings to one canonical form.
    manager = _make_manager(tmp_path)

    generated_files = manager._normalize_codegen_generation_payload(
        plugin_id="setta-fixture-backend-codegen",
        target_id="setta-fixture-backend-codegen:typescript",
        payload={
            "files": [
                {
                    "relativePath": "./nested//setta_gen.ts",
                    "content": "export const x = 1;\n",
                }
            ]
        },
        default_file_name="setta_gen.ts",
    )

    assert generated_files == [("nested/setta_gen.ts", "export const x = 1;\n")]


def test_rollback_plugin_requires_history(tmp_path: Path) -> None:
    # Rollback should reject linked local plugins with actionable guidance.
    manager = _make_manager(tmp_path)
    manager.link_plugin(
        local_plugin_root=str(_fixture_path("frontend")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )

    with pytest.raises(PluginManagerError) as exc_info:
        manager.rollback_plugin(
            plugin_id="setta-fixture-frontend",
            scope=PluginScope.workspace,
        )
    assert exc_info.value.code == "PLUGIN_ROLLBACK_UNAVAILABLE"
    assert "linked local plugins" in exc_info.value.message


def test_force_install_backs_up_previous_snapshot_and_supports_rollback(
    tmp_path: Path,
) -> None:
    # Force install should snapshot the previous plugin tree and allow rollback.
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
            installer=PluginInstallerBackend.pip,
            scope=PluginScope.workspace,
            enable=True,
            force=False,
        )
        manager.install_plugin(
            source_spec=f"pypi:{package_name}=={version}",
            installer=PluginInstallerBackend.pip,
            scope=PluginScope.workspace,
            enable=True,
            force=True,
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

    metadata = manager._load_install_metadata()
    metadata_key = manager._metadata_key(package_name, PluginScope.workspace)
    entry = metadata.entries[metadata_key]
    assert entry.version == version
    assert len(entry.history) == 1
    snapshot_path = Path(entry.history[0].snapshotPath)
    assert snapshot_path.exists()
    snapshot_manifest = json.loads(
        (snapshot_path / "setta.plugin.json").read_text(encoding="utf-8")
    )
    assert snapshot_manifest["version"] == version

    rollback_result = manager.rollback_plugin(
        plugin_id=package_name,
        scope=PluginScope.workspace,
    )
    assert rollback_result.restoredVersion == version

    active_entry = next(
        plugin
        for plugin in manager.get_status_response().plugins
        if plugin.pluginId == package_name
        and plugin.sourceScope == PluginScope.workspace
        and plugin.shadowedBySourcePath is None
    )
    assert active_entry.version == version


def test_rollback_plugin_requires_existing_snapshot_path(tmp_path: Path) -> None:
    # Rollback should fail deterministically when history references a missing snapshot.
    manager = _make_manager(tmp_path)
    manager.link_plugin(
        local_plugin_root=str(_fixture_path("frontend")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    metadata = manager._load_install_metadata()
    metadata_key = manager._metadata_key(
        "setta-fixture-frontend", PluginScope.workspace
    )
    entry = metadata.entries[metadata_key]
    entry.history.append(
        PluginInstallHistoryEntry(
            version=entry.version,
            sourceDigestSha256=entry.sourceDigestSha256,
            snapshotPath=str(tmp_path / "missing-rollback-snapshot"),
            timestampIso="2026-01-01T00:00:00+00:00",
        )
    )
    metadata.entries[metadata_key] = entry
    manager._save_install_metadata(metadata)

    with pytest.raises(PluginManagerError) as exc_info:
        manager.rollback_plugin(
            plugin_id="setta-fixture-frontend",
            scope=PluginScope.workspace,
        )
    assert exc_info.value.code == "PLUGIN_ROLLBACK_UNAVAILABLE"


def test_rollback_plugin_flags_restart_when_restoring_backend_plugin(
    tmp_path: Path,
) -> None:
    # Restoring a backend plugin snapshot should mark the plugin as restart-required.
    manager = _make_manager(tmp_path)
    manager.link_plugin(
        local_plugin_root=str(_fixture_path("backend")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )

    snapshot_root = tmp_path / "backend-rollback-snapshot"
    shutil.copytree(_fixture_path("backend"), snapshot_root)
    snapshot_manifest_path = snapshot_root / "setta.plugin.json"
    snapshot_manifest = json.loads(snapshot_manifest_path.read_text(encoding="utf-8"))
    snapshot_manifest["version"] = "0.0.9"
    snapshot_manifest_path.write_text(
        json.dumps(snapshot_manifest, indent=2),
        encoding="utf-8",
    )
    metadata = manager._load_install_metadata()
    metadata_key = manager._metadata_key("setta-fixture-backend", PluginScope.workspace)
    entry = metadata.entries[metadata_key]
    # Rollback is blocked for linked local plugins; mark this fixture as managed-source
    # metadata so this test continues validating restart behavior for supported rollbacks.
    entry.sourceSpec = "pypi:setta-fixture-backend==0.1.0"
    entry.history.append(
        PluginInstallHistoryEntry(
            version="0.0.9",
            sourceDigestSha256=None,
            snapshotPath=str(snapshot_root),
            timestampIso="2026-01-01T00:00:00+00:00",
        )
    )
    metadata.entries[metadata_key] = entry
    manager._save_install_metadata(metadata)

    rollback_result = manager.rollback_plugin(
        plugin_id="setta-fixture-backend",
        scope=PluginScope.workspace,
    )
    assert rollback_result.restoredVersion == "0.0.9"
    assert rollback_result.restartRequired is True

    restored_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(restored_entries) == 1
    assert restored_entries[0].state == PluginRuntimeState.pending_restart


def test_plugins_state_file_invalid_payload_raises(tmp_path: Path) -> None:
    # Invalid plugins_state payloads should raise deterministic state-file errors.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="frontend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    plugins_state_path = manager.setta_files_root / "plugins_state.json"
    plugins_state_path.write_text("{invalid-json", encoding="utf-8")

    with pytest.raises(PluginManagerError) as exc_info:
        manager.disable_plugin(plugin_id="setta-fixture-frontend")
    assert exc_info.value.code == "PLUGIN_STATE_INVALID"


def test_plugins_global_state_file_invalid_payload_raises(tmp_path: Path) -> None:
    # Invalid plugins_global_state payloads should fail global enablement mutations.
    manager = _make_manager(tmp_path)
    global_state_path = manager.setta_home / "plugins_global_state.json"
    global_state_path.write_text("{invalid-json", encoding="utf-8")

    with pytest.raises(PluginManagerError) as exc_info:
        manager.link_plugin(
            local_plugin_root=str(_fixture_path("frontend")),
            scope=PluginScope.global_scope,
            enable=True,
            force=False,
        )
    assert exc_info.value.code == "PLUGIN_GLOBAL_STATE_INVALID"


def test_plugins_install_metadata_invalid_payload_raises(tmp_path: Path) -> None:
    # Invalid install metadata payloads should raise deterministic metadata errors.
    manager = _make_manager(tmp_path)
    metadata_path = manager.setta_files_root / "plugins_install_metadata.json"
    metadata_path.write_text("{invalid-json", encoding="utf-8")

    with pytest.raises(PluginManagerError) as exc_info:
        manager._load_install_metadata()
    assert exc_info.value.code == "PLUGIN_INSTALL_METADATA_INVALID"


def test_parse_source_spec_rejects_invalid_formats(tmp_path: Path) -> None:
    # Source spec parsing should reject malformed github/pypi references.
    manager = _make_manager(tmp_path)

    with pytest.raises(PluginManagerError) as github_error:
        manager._parse_source_spec("github:acme")
    assert github_error.value.code == "PLUGIN_SOURCE_INVALID"

    with pytest.raises(PluginManagerError) as pypi_error:
        manager._parse_source_spec("pypi:bad@@name")
    assert pypi_error.value.code == "PLUGIN_SOURCE_INVALID"


def test_parse_source_spec_accepts_github_hash_and_at_refs(tmp_path: Path) -> None:
    # Source spec parsing should support both github:#ref and github:@ref forms.
    manager = _make_manager(tmp_path)

    with_hash_ref = manager._parse_source_spec("github:acme/plugin#release-1")
    assert with_hash_ref.scheme.value == "github"
    assert with_hash_ref.owner == "acme"
    assert with_hash_ref.repo == "plugin"
    assert with_hash_ref.ref == "release-1"

    with_at_ref = manager._parse_source_spec("github:acme/plugin@release-2")
    assert with_at_ref.scheme.value == "github"
    assert with_at_ref.owner == "acme"
    assert with_at_ref.repo == "plugin"
    assert with_at_ref.ref == "release-2"


def test_normalize_worker_route_query_params_handles_repeated_keys(
    tmp_path: Path,
) -> None:
    # Query-param normalization should collapse repeated keys into ordered lists.
    manager = _make_manager(tmp_path)

    class _FakeQueryParams:
        def multi_items(self) -> list[tuple[str, str]]:
            return [
                ("kind", "first"),
                ("kind", "second"),
                ("single", "value"),
                ("kind", "third"),
            ]

    class _FakeRequest:
        query_params = _FakeQueryParams()

    normalized = manager._normalize_worker_route_query_params(_FakeRequest())
    assert normalized == {
        "kind": ["first", "second", "third"],
        "single": "value",
    }


def test_normalize_worker_route_methods_validates_shape_and_values(
    tmp_path: Path,
) -> None:
    # Route method normalization should uppercase, dedupe, and reject invalid inputs.
    manager = _make_manager(tmp_path)
    normalized = manager._normalize_worker_route_methods(
        plugin_id="fixture.plugin",
        route_id="route_1",
        raw_methods=["get", "GET", "post", " patch "],
    )
    assert normalized == ["GET", "POST", "PATCH"]

    with pytest.raises(PluginManagerError) as not_array_error:
        manager._normalize_worker_route_methods(
            plugin_id="fixture.plugin",
            route_id="route_2",
            raw_methods="GET",
        )
    assert not_array_error.value.code == "PLUGIN_BACKEND_REGISTER_FAILED"

    with pytest.raises(PluginManagerError) as unsupported_error:
        manager._normalize_worker_route_methods(
            plugin_id="fixture.plugin",
            route_id="route_3",
            raw_methods=["TRACE"],
        )
    assert unsupported_error.value.code == "PLUGIN_BACKEND_REGISTER_FAILED"

    with pytest.raises(PluginManagerError) as options_error:
        manager._normalize_worker_route_methods(
            plugin_id="fixture.plugin",
            route_id="route_4",
            raw_methods=["OPTIONS"],
        )
    assert options_error.value.code == "PLUGIN_BACKEND_REGISTER_FAILED"


def test_build_uv_install_env_maps_pip_env_vars(tmp_path: Path, monkeypatch) -> None:
    # UV install env should inherit pip index flags when uv-specific vars are absent.
    manager = _make_manager(tmp_path)
    monkeypatch.setenv("PIP_NO_INDEX", "1")
    monkeypatch.setenv("PIP_FIND_LINKS", "/tmp/fixtures")
    monkeypatch.delenv("UV_NO_INDEX", raising=False)
    monkeypatch.delenv("UV_FIND_LINKS", raising=False)

    mapped = manager._build_uv_install_env()
    assert mapped["UV_NO_INDEX"] == "1"
    assert mapped["UV_FIND_LINKS"] == "/tmp/fixtures"

    monkeypatch.setenv("UV_NO_INDEX", "0")
    monkeypatch.setenv("UV_FIND_LINKS", "keep-existing")
    preserved = manager._build_uv_install_env()
    assert preserved["UV_NO_INDEX"] == "0"
    assert preserved["UV_FIND_LINKS"] == "keep-existing"


def test_retarget_source_spec_rewrites_github_and_pypi_targets(tmp_path: Path) -> None:
    # Source retargeting should preserve scheme semantics for github/pypi updates.
    manager = _make_manager(tmp_path)
    assert (
        manager._retarget_source_spec("github:acme/plugin#main", "v2")
        == "github:acme/plugin#v2"
    )
    assert (
        manager._retarget_source_spec("github:acme/plugin@main", "v2")
        == "github:acme/plugin#v2"
    )
    assert (
        manager._retarget_source_spec(
            "pypi:setta-fixture-frontend==0.1.0",
            "0.2.0",
        )
        == "pypi:setta-fixture-frontend==0.2.0"
    )
    assert (
        manager._retarget_source_spec(
            "pypi:setta-fixture-frontend==0.1.0",
            "setta-fixture-frontend==0.3.0",
        )
        == "pypi:setta-fixture-frontend==0.3.0"
    )
    assert (
        manager._retarget_source_spec(
            "github:acme/plugin#main",
            "github:other/repo#tag",
        )
        == "github:other/repo#tag"
    )
    assert (
        manager._retarget_source_spec("github:acme/plugin#main", "   ")
        == "github:acme/plugin#main"
    )


def test_target_plugin_path_rejects_traversal_values(tmp_path: Path) -> None:
    # Target plugin path resolution must reject path traversal ids.
    manager = _make_manager(tmp_path)

    with pytest.raises(PluginManagerError) as exc_info:
        manager._target_plugin_path(PluginScope.workspace, "../escape")
    assert exc_info.value.code == "PLUGIN_TARGET_PATH_TRAVERSAL"


def test_link_plugin_rejects_missing_source_root(tmp_path: Path) -> None:
    # Linking should fail with deterministic source-not-found errors for missing roots.
    manager = _make_manager(tmp_path)

    with pytest.raises(PluginManagerError) as exc_info:
        manager.link_plugin(
            local_plugin_root=str(tmp_path / "missing-plugin-root"),
            scope=PluginScope.workspace,
            enable=True,
            force=False,
        )
    assert exc_info.value.code == "PLUGIN_SOURCE_NOT_FOUND"


def test_link_plugin_rejects_incompatible_setta_version_before_mutation(
    tmp_path: Path,
) -> None:
    # Link should fail fast on settaVersionRange before writing links/metadata.
    manager = _make_manager(tmp_path)
    plugin_root = tmp_path / "incompatible-link-plugin"
    shutil.copytree(_fixture_path("frontend"), plugin_root)
    manifest_path = plugin_root / "setta.plugin.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["settaVersionRange"] = ">=999.0.0"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    with pytest.raises(PluginManagerError) as exc_info:
        manager.link_plugin(
            local_plugin_root=str(plugin_root),
            scope=PluginScope.workspace,
            enable=True,
            force=False,
        )
    assert exc_info.value.code == "PLUGIN_MANIFEST_VERSION_INCOMPATIBLE"
    expected_target = _scope_root(manager, PluginScope.workspace) / manifest["id"]
    assert not expected_target.exists()
    assert manager._load_install_metadata().entries == {}


def test_link_plugin_rejects_invalid_config_schema_before_mutation(
    tmp_path: Path,
) -> None:
    # Link should fail fast when config schema JSON is invalid and avoid partial installs.
    manager = _make_manager(tmp_path)
    plugin_root = tmp_path / "invalid-config-schema-link-plugin"
    shutil.copytree(_fixture_path("full"), plugin_root)
    (plugin_root / "content" / "config" / "schema.json").write_text(
        "{bad-json",
        encoding="utf-8",
    )

    with pytest.raises(PluginManagerError) as exc_info:
        manager.link_plugin(
            local_plugin_root=str(plugin_root),
            scope=PluginScope.workspace,
            enable=True,
            force=False,
        )
    assert exc_info.value.code == "PLUGIN_CONFIG_SCHEMA_INVALID"
    expected_target = _scope_root(manager, PluginScope.workspace) / "setta-fixture-full"
    assert not expected_target.exists()
    assert manager._load_install_metadata().entries == {}


def test_link_plugin_rejects_existing_target_without_force(tmp_path: Path) -> None:
    # Linking should fail when a target path already exists unless force is set.
    manager = _make_manager(tmp_path)
    manager.link_plugin(
        local_plugin_root=str(_fixture_path("frontend")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )

    with pytest.raises(PluginManagerError) as exc_info:
        manager.link_plugin(
            local_plugin_root=str(_fixture_path("frontend")),
            scope=PluginScope.workspace,
            enable=True,
            force=False,
        )
    assert exc_info.value.code == "PLUGIN_TARGET_EXISTS"


def test_link_plugin_conflict_fails_before_backend_runtime_prepare(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Existing-target link failures should not prepare backend runtime side effects.
    manager = _make_manager(tmp_path)
    manager.link_plugin(
        local_plugin_root=str(_fixture_path("backend")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )

    prepare_calls = 0

    def _patched_prepare_backend_runtime(**_kwargs):
        nonlocal prepare_calls
        prepare_calls += 1
        raise AssertionError(
            "backend runtime prepare should not run on target conflicts"
        )

    monkeypatch.setattr(
        manager,
        "_prepare_backend_runtime",
        _patched_prepare_backend_runtime,
    )

    with pytest.raises(PluginManagerError) as exc_info:
        manager.link_plugin(
            local_plugin_root=str(_fixture_path("backend")),
            scope=PluginScope.workspace,
            enable=True,
            force=False,
        )
    assert exc_info.value.code == "PLUGIN_TARGET_EXISTS"
    assert prepare_calls == 0


def test_install_plugin_conflict_fails_before_backend_runtime_prepare(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Existing-target install failures should not prepare backend runtime side effects.
    manager = _make_manager(tmp_path)
    fixture_root = tmp_path / "fixture-install-candidate"
    shutil.copytree(_fixture_path("backend"), fixture_root)
    manifest = manager._load_and_validate_manifest(fixture_root / "setta.plugin.json")
    source_digest = manager._compute_directory_digest(fixture_root)
    candidate = CandidatePlugin(
        root=fixture_root,
        manifest=manifest,
        canonical_source_key="pypi:setta-fixture-backend==0.1.0",
        source_spec="pypi:setta-fixture-backend==0.1.0",
        source_digest_sha256=source_digest,
    )
    existing_target = _scope_root(manager, PluginScope.workspace) / manifest.id
    existing_target.parent.mkdir(parents=True, exist_ok=True)
    existing_target.mkdir(parents=True, exist_ok=True)

    def _patched_candidate_from_pypi(
        _parsed_spec,
        _tmp_dir,
        *,
        installer_backend: PluginInstallerBackend,
    ) -> CandidatePlugin:
        _ = installer_backend
        return candidate

    prepare_calls = 0

    def _patched_prepare_backend_runtime(**_kwargs):
        nonlocal prepare_calls
        prepare_calls += 1
        raise AssertionError(
            "backend runtime prepare should not run on target conflicts"
        )

    monkeypatch.setattr(manager, "_candidate_from_pypi", _patched_candidate_from_pypi)
    monkeypatch.setattr(
        manager,
        "_prepare_backend_runtime",
        _patched_prepare_backend_runtime,
    )

    with pytest.raises(PluginManagerError) as exc_info:
        manager.install_plugin(
            source_spec="pypi:setta-fixture-backend==0.1.0",
            scope=PluginScope.workspace,
            installer=PluginInstallerBackend.auto,
            enable=True,
            force=False,
            rescan=False,
        )
    assert exc_info.value.code == "PLUGIN_TARGET_EXISTS"
    assert prepare_calls == 0


def test_install_plugin_conflict_while_in_progress_fails_before_second_prepare(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Concurrent installs targeting the same plugin path should fail before a second backend prepare.
    manager = _make_manager(tmp_path)
    fixture_root = tmp_path / "fixture-install-candidate-in-progress"
    shutil.copytree(_fixture_path("backend"), fixture_root)
    manifest = manager._load_and_validate_manifest(fixture_root / "setta.plugin.json")
    source_digest = manager._compute_directory_digest(fixture_root)
    candidate = CandidatePlugin(
        root=fixture_root,
        manifest=manifest,
        canonical_source_key="pypi:setta-fixture-backend==0.1.0",
        source_spec="pypi:setta-fixture-backend==0.1.0",
        source_digest_sha256=source_digest,
    )

    def _patched_candidate_from_pypi(
        _parsed_spec,
        _tmp_dir,
        *,
        installer_backend: PluginInstallerBackend,
    ) -> CandidatePlugin:
        _ = installer_backend
        return candidate

    prepare_calls = 0
    first_prepare_started = threading.Event()
    release_first_prepare = threading.Event()

    def _blocking_prepare_backend_runtime(**_kwargs):
        nonlocal prepare_calls
        prepare_calls += 1
        if prepare_calls > 1:
            raise AssertionError(
                "backend runtime prepare should not run for in-progress install conflicts"
            )
        first_prepare_started.set()
        assert release_first_prepare.wait(timeout=2.0)

    monkeypatch.setattr(manager, "_candidate_from_pypi", _patched_candidate_from_pypi)
    monkeypatch.setattr(
        manager,
        "_prepare_backend_runtime",
        _blocking_prepare_backend_runtime,
    )

    raised_by_first_install: list[Exception] = []

    def _run_first_install() -> None:
        try:
            manager.install_plugin(
                source_spec="pypi:setta-fixture-backend==0.1.0",
                scope=PluginScope.workspace,
                installer=PluginInstallerBackend.auto,
                enable=True,
                force=False,
                rescan=False,
            )
        except Exception as exc:  # pragma: no cover - assertion path
            raised_by_first_install.append(exc)

    first_install_thread = threading.Thread(target=_run_first_install)
    first_install_thread.start()
    assert first_prepare_started.wait(timeout=2.0)

    with pytest.raises(PluginManagerError) as exc_info:
        manager.install_plugin(
            source_spec="pypi:setta-fixture-backend==0.1.0",
            scope=PluginScope.workspace,
            installer=PluginInstallerBackend.auto,
            enable=True,
            force=False,
            rescan=False,
        )
    assert exc_info.value.code == "PLUGIN_TARGET_EXISTS"
    assert "already in progress" in exc_info.value.message

    release_first_prepare.set()
    first_install_thread.join(timeout=2.0)

    assert raised_by_first_install == []
    assert prepare_calls == 1


def test_prepare_backend_runtime_is_serialized_per_runtime_path(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Concurrent runtime preparation for the same plugin runtime path should be single-flight.
    manager = _make_manager(tmp_path)
    plugin_root = tmp_path / "runtime-lock-fixture"
    shutil.copytree(_fixture_path("backend"), plugin_root)
    (plugin_root / "pyproject.toml").write_text(
        "[build-system]\n"
        'requires = ["setuptools==80.9.0", "wheel==0.45.1"]\n'
        'build-backend = "setuptools.build_meta"\n\n'
        "[project]\n"
        'name = "setta-fixture-backend"\n'
        'version = "0.1.0"\n'
        'dependencies = ["requests==2.32.4"]\n',
        encoding="utf-8",
    )

    active_subprocess_calls = 0
    overlap_detected = False
    venv_call_count = 0
    pip_call_count = 0
    first_subprocess_started = threading.Event()
    release_first_subprocess = threading.Event()

    def _patched_run(command: list[str], **_kwargs):
        nonlocal active_subprocess_calls
        nonlocal overlap_detected
        nonlocal venv_call_count
        nonlocal pip_call_count
        active_subprocess_calls += 1
        if active_subprocess_calls > 1:
            overlap_detected = True
        try:
            if command[1:3] == ["-m", "venv"] and len(command) >= 4:
                venv_call_count += 1
                venv_path = Path(command[3])
                runtime_python = (
                    venv_path / "Scripts" / "python.exe"
                    if os.name == "nt"
                    else venv_path / "bin" / "python"
                )
                runtime_python.parent.mkdir(parents=True, exist_ok=True)
                runtime_python.write_text("", encoding="utf-8")
                runtime_python.chmod(0o755)
            if len(command) >= 4 and command[1:3] == ["-m", "pip"]:
                pip_call_count += 1
            if not first_subprocess_started.is_set():
                first_subprocess_started.set()
                assert release_first_subprocess.wait(timeout=2.0)
            time.sleep(0.02)
            return subprocess.CompletedProcess(command, 0, "", "")
        finally:
            active_subprocess_calls -= 1

    monkeypatch.setattr("setta.plugins.manager.subprocess.run", _patched_run)

    raised_errors: list[Exception] = []

    def _run_prepare() -> None:
        try:
            manager._prepare_backend_runtime(
                plugin_id="setta-fixture-backend",
                version="0.1.0",
                source_digest_sha256="runtime-lock-digest",
                plugin_root=plugin_root,
            )
        except Exception as exc:  # pragma: no cover - assertion path
            raised_errors.append(exc)

    first_thread = threading.Thread(target=_run_prepare)
    second_thread = threading.Thread(target=_run_prepare)
    first_thread.start()
    assert first_subprocess_started.wait(timeout=2.0)
    second_thread.start()
    time.sleep(0.05)
    release_first_subprocess.set()
    first_thread.join(timeout=2.0)
    second_thread.join(timeout=2.0)

    assert raised_errors == []
    assert overlap_detected is False
    assert venv_call_count == 1
    assert pip_call_count == 1
    assert manager._runtime_path_locks == {}


def test_prepare_backend_runtime_uses_precomputed_dependency_inputs(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Precomputed dependency payloads should bypass duplicate dependency resolution reads.
    manager = _make_manager(tmp_path)
    plugin_root = tmp_path / "runtime-precompute-fixture"
    shutil.copytree(_fixture_path("backend"), plugin_root)

    def _fail_read_backend_dependencies(_root: Path) -> list[str]:
        raise AssertionError("backend dependency file read should be bypassed")

    def _fail_build_worker_dependencies() -> list[str]:
        raise AssertionError("worker dependency build should be bypassed")

    monkeypatch.setattr(
        manager, "_read_backend_dependencies", _fail_read_backend_dependencies
    )
    monkeypatch.setattr(
        manager,
        "_build_backend_worker_runtime_dependencies",
        _fail_build_worker_dependencies,
    )

    manager._prepare_backend_runtime(
        plugin_id="setta-fixture-backend",
        version="0.1.0",
        source_digest_sha256="runtime-precompute-digest",
        plugin_root=plugin_root,
        dependencies=[],
        worker_dependencies=[],
    )


def test_validate_plugin_folder_rejects_missing_manifest(tmp_path: Path) -> None:
    # Plugin folder validation must reject roots without setta.plugin.json.
    manager = _make_manager(tmp_path)
    plugin_root = tmp_path / "missing-manifest"
    plugin_root.mkdir(parents=True, exist_ok=True)

    with pytest.raises(PluginManagerError) as exc_info:
        manager.validate_plugin_folder(plugin_root)
    assert exc_info.value.code == "PLUGIN_SOURCE_MANIFEST_NOT_FOUND"


def test_validate_plugin_folder_rejects_invalid_manifest_json(tmp_path: Path) -> None:
    # Plugin folder validation must reject invalid manifest JSON payloads.
    manager = _make_manager(tmp_path)
    plugin_root = tmp_path / "invalid-manifest"
    plugin_root.mkdir(parents=True, exist_ok=True)
    (plugin_root / "setta.plugin.json").write_text("{bad-json", encoding="utf-8")

    with pytest.raises(PluginManagerError) as exc_info:
        manager.validate_plugin_folder(plugin_root)
    assert exc_info.value.code == "PLUGIN_MANIFEST_INVALID"


def test_validate_plugin_folder_rejects_missing_manifest_paths(tmp_path: Path) -> None:
    # Plugin validation must fail when manifest-declared frontend assets are missing.
    manager = _make_manager(tmp_path)
    plugin_root = tmp_path / "missing-path-plugin"
    shutil.copytree(_fixture_path("frontend"), plugin_root)
    (plugin_root / "frontend" / "dist" / "index.js").unlink()

    with pytest.raises(PluginManagerError) as exc_info:
        manager.validate_plugin_folder(plugin_root)
    assert exc_info.value.code == "PLUGIN_MANIFEST_PATH_NOT_FOUND"


def test_validate_plugin_folder_rejects_invalid_config_schema_json(
    tmp_path: Path,
) -> None:
    # Plugin validation must reject malformed config schema JSON documents.
    manager = _make_manager(tmp_path)
    plugin_root = tmp_path / "invalid-config-schema-plugin"
    shutil.copytree(_fixture_path("full"), plugin_root)
    (plugin_root / "content" / "config" / "schema.json").write_text(
        "{not-json",
        encoding="utf-8",
    )

    with pytest.raises(PluginManagerError) as exc_info:
        manager.validate_plugin_folder(plugin_root)
    assert exc_info.value.code == "PLUGIN_CONFIG_SCHEMA_INVALID"


def test_validate_plugin_folder_rejects_incompatible_setta_version(
    tmp_path: Path,
) -> None:
    # Plugin validation must reject plugins that require newer host versions.
    manager = _make_manager(tmp_path)
    plugin_root = tmp_path / "incompatible-version-plugin"
    shutil.copytree(_fixture_path("frontend"), plugin_root)
    manifest_path = plugin_root / "setta.plugin.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["settaVersionRange"] = ">=999.0.0"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    with pytest.raises(PluginManagerError) as exc_info:
        manager.validate_plugin_folder(plugin_root)
    assert exc_info.value.code == "PLUGIN_MANIFEST_VERSION_INCOMPATIBLE"


def test_validate_plugin_folder_rejects_invalid_host_version(tmp_path: Path) -> None:
    # Plugin validation must reject invalid host Setta version payloads.
    manager = _make_manager(tmp_path)
    manager.setta_version = "not-a-version"

    with pytest.raises(PluginManagerError) as exc_info:
        manager.validate_plugin_folder(_fixture_path("frontend"))
    assert exc_info.value.code == "PLUGIN_HOST_VERSION_INVALID"


def test_init_template_rejects_empty_plugin_id(tmp_path: Path) -> None:
    # Init template should reject empty plugin ids.
    manager = _make_manager(tmp_path)

    with pytest.raises(PluginManagerError) as exc_info:
        manager.init_plugin_template(
            plugin_id="   ",
            template="frontend",
            out_dir=str(tmp_path),
        )
    assert exc_info.value.code == "PLUGIN_INIT_INVALID_ID"


@pytest.mark.parametrize(
    "plugin_id",
    [
        "../escape",
        "bad/id",
        "bad\\id",
        "-starts-with-dash",
        "has spaces",
    ],
)
def test_init_template_rejects_invalid_plugin_ids(
    tmp_path: Path,
    plugin_id: str,
) -> None:
    # Init template should reject traversal and malformed plugin ids.
    manager = _make_manager(tmp_path)
    before_children = {child.name for child in tmp_path.iterdir()}

    with pytest.raises(PluginManagerError) as exc_info:
        manager.init_plugin_template(
            plugin_id=plugin_id,
            template="frontend",
            out_dir=str(tmp_path),
        )

    assert exc_info.value.code == "PLUGIN_INIT_INVALID_ID"
    after_children = {child.name for child in tmp_path.iterdir()}
    assert after_children == before_children


def test_init_template_rejects_existing_target(tmp_path: Path) -> None:
    # Init template should reject destinations that already exist.
    manager = _make_manager(tmp_path)
    existing_plugin_root = tmp_path / "setta-existing-plugin"
    existing_plugin_root.mkdir(parents=True, exist_ok=True)

    with pytest.raises(PluginManagerError) as exc_info:
        manager.init_plugin_template(
            plugin_id="setta-existing-plugin",
            template="frontend",
            out_dir=str(tmp_path),
        )
    assert exc_info.value.code == "PLUGIN_INIT_TARGET_EXISTS"


def test_manifest_schema_loader_rejects_missing_schema_file(tmp_path: Path) -> None:
    # Manifest schema loading should fail when the schema file is missing.
    manager = _make_manager(tmp_path)
    manager._manifest_schema_path = tmp_path / "missing-schema.json"

    with pytest.raises(PluginManagerError) as exc_info:
        manager._load_manifest_schema()
    assert exc_info.value.code == "PLUGIN_MANIFEST_SCHEMA_NOT_FOUND"


def test_manifest_schema_loader_rejects_invalid_schema_json(tmp_path: Path) -> None:
    # Manifest schema loading should fail when the schema payload is malformed.
    manager = _make_manager(tmp_path)
    schema_path = tmp_path / "invalid-schema.json"
    schema_path.write_text("{bad-json", encoding="utf-8")
    manager._manifest_schema_path = schema_path

    with pytest.raises(PluginManagerError) as exc_info:
        manager._load_manifest_schema()
    assert exc_info.value.code == "PLUGIN_MANIFEST_SCHEMA_INVALID"


def test_install_plugin_reports_install_failed_if_rescan_drops_entry(
    tmp_path: Path, monkeypatch
) -> None:
    # Install should fail with PLUGIN_INSTALL_FAILED when post-install discovery fails.
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
    monkeypatch.setattr(manager, "rescan", lambda: None)
    try:
        with pytest.raises(PluginManagerError) as exc_info:
            manager.install_plugin(
                source_spec=f"pypi:{package_name}=={version}",
                installer=PluginInstallerBackend.pip,
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
    assert exc_info.value.code == "PLUGIN_INSTALL_FAILED"


def test_link_plugin_reports_link_failed_if_rescan_drops_entry(
    tmp_path: Path, monkeypatch
) -> None:
    # Link should fail with PLUGIN_LINK_FAILED when post-link discovery fails.
    manager = _make_manager(tmp_path)
    monkeypatch.setattr(manager, "rescan", lambda: None)

    with pytest.raises(PluginManagerError) as exc_info:
        manager.link_plugin(
            local_plugin_root=str(_fixture_path("frontend")),
            scope=PluginScope.workspace,
            enable=True,
            force=False,
        )
    assert exc_info.value.code == "PLUGIN_LINK_FAILED"


def test_extract_artifact_rejects_unsupported_artifact_type(tmp_path: Path) -> None:
    # Artifact extraction should fail for unsupported file types.
    manager = _make_manager(tmp_path)
    artifact_path = tmp_path / "plugin-artifact.txt"
    artifact_path.write_text("fixture", encoding="utf-8")

    with pytest.raises(PluginManagerError) as exc_info:
        manager._extract_artifact(
            artifact_path=artifact_path,
            extract_root=tmp_path / "extract",
        )
    assert exc_info.value.code == "PLUGIN_SOURCE_FETCH_FAILED"


def test_write_backend_worker_payload_reports_missing_stdin_and_write_errors(
    tmp_path: Path,
) -> None:
    # Worker payload writes should fail deterministically when stdin is missing or broken.
    manager = _make_manager(tmp_path)

    no_stdin_process = subprocess.Popen(
        [sys.executable, "-u", "-c", "import time; time.sleep(30)"],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        with pytest.raises(PluginManagerError) as missing_stdin_error:
            manager._write_backend_worker_payload(
                process=no_stdin_process,
                plugin_id="fixture-plugin",
                payload={"jsonrpc": "2.0", "id": 1, "method": "plugin.initialize"},
                phase="plugin.initialize",
            )
    finally:
        no_stdin_process.terminate()
        no_stdin_process.wait(timeout=2.0)
        for stream in (no_stdin_process.stdout, no_stdin_process.stderr):
            if stream is not None:
                stream.close()
    assert missing_stdin_error.value.code == "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
    assert "stdin unavailable" in missing_stdin_error.value.message

    broken_pipe_process = subprocess.Popen(
        [sys.executable, "-u", "-c", "pass"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        broken_pipe_process.wait(timeout=2.0)
        with pytest.raises(PluginManagerError) as broken_pipe_error:
            manager._write_backend_worker_payload(
                process=broken_pipe_process,
                plugin_id="fixture-plugin",
                payload={"jsonrpc": "2.0", "id": 2, "method": "plugin.register"},
                phase="plugin.register",
            )
    finally:
        for stream in (
            broken_pipe_process.stdin,
            broken_pipe_process.stdout,
            broken_pipe_process.stderr,
        ):
            if stream is not None:
                try:
                    stream.close()
                except OSError:
                    pass
    assert broken_pipe_error.value.code == "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
    assert "transport write failed" in broken_pipe_error.value.message


@pytest.mark.parametrize(
    ("stdout_line", "expected_message_fragment"),
    [
        ("{not-json", "returned invalid JSON"),
        ("[]", "response type invalid"),
    ],
)
def test_read_backend_worker_message_rejects_invalid_payload_shapes(
    tmp_path: Path,
    stdout_line: str,
    expected_message_fragment: str,
) -> None:
    # Worker message reads should reject invalid JSON and non-object JSON-RPC payloads.
    manager = _make_manager(tmp_path)
    process = subprocess.Popen(
        [
            sys.executable,
            "-u",
            "-c",
            (
                "import sys, time\n"
                f"sys.stdout.write({stdout_line!r} + '\\n')\n"
                "sys.stdout.flush()\n"
                "time.sleep(30)\n"
            ),
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        with pytest.raises(PluginManagerError) as exc_info:
            manager._read_backend_worker_message(
                process=process,
                plugin_id="fixture-plugin",
                method="plugin.initialize",
                timeout_seconds=2.0,
                timeout_code="PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
            )
    finally:
        process.terminate()
        process.wait(timeout=2.0)
        for stream in (process.stdin, process.stdout, process.stderr):
            if stream is not None:
                stream.close()
    assert exc_info.value.code == "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
    assert expected_message_fragment in exc_info.value.message


def test_read_backend_worker_message_handles_transport_edge_cases(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Worker message reads should handle missing stdout, read timeouts, and EOF stderr details.
    manager = _make_manager(tmp_path)

    no_stdout_process = subprocess.Popen(
        [sys.executable, "-u", "-c", "import time; time.sleep(30)"],
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        with pytest.raises(PluginManagerError) as no_stdout_error:
            manager._read_backend_worker_message(
                process=no_stdout_process,
                plugin_id="fixture-plugin",
                method="plugin.initialize",
                timeout_seconds=1.0,
                timeout_code="PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
            )
    finally:
        no_stdout_process.terminate()
        no_stdout_process.wait(timeout=2.0)
        for stream in (no_stdout_process.stdin, no_stdout_process.stderr):
            if stream is not None:
                stream.close()
    assert no_stdout_error.value.code == "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
    assert "stdout unavailable" in no_stdout_error.value.message

    timeout_process = subprocess.Popen(
        [sys.executable, "-u", "-c", "import time; time.sleep(30)"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        with monkeypatch.context() as scope:
            scope.setattr(
                manager, "_read_stream_line_with_timeout", lambda *_a, **_k: None
            )
            with pytest.raises(PluginManagerError) as timeout_error:
                manager._read_backend_worker_message(
                    process=timeout_process,
                    plugin_id="fixture-plugin",
                    method="plugin.initialize",
                    timeout_seconds=1.0,
                    timeout_code="PLUGIN_BACKEND_STARTUP_TIMEOUT",
                )
    finally:
        timeout_process.terminate()
        timeout_process.wait(timeout=2.0)
        for stream in (
            timeout_process.stdin,
            timeout_process.stdout,
            timeout_process.stderr,
        ):
            if stream is not None:
                stream.close()
    assert timeout_error.value.code == "PLUGIN_BACKEND_STARTUP_TIMEOUT"
    assert "timed out" in timeout_error.value.message

    eof_process = subprocess.Popen(
        [
            sys.executable,
            "-u",
            "-c",
            "import sys\nsys.stderr.write('worker-boom\\n')\nsys.stderr.flush()\n",
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        with monkeypatch.context() as scope:
            scope.setattr(
                manager, "_read_available_pipe_text", lambda _stream: "worker-boom"
            )
            with pytest.raises(PluginManagerError) as eof_error:
                manager._read_backend_worker_message(
                    process=eof_process,
                    plugin_id="fixture-plugin",
                    method="plugin.register",
                    timeout_seconds=2.0,
                    timeout_code="PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                )
    finally:
        eof_process.wait(timeout=2.0)
        for stream in (eof_process.stdin, eof_process.stdout, eof_process.stderr):
            if stream is not None:
                stream.close()
    assert eof_error.value.code == "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
    assert "exited before responding" in eof_error.value.message
    assert "Stderr: worker-boom" in eof_error.value.message


def test_read_stream_line_with_timeout_reuses_one_reader_per_stream(
    tmp_path: Path,
) -> None:
    # Timeout retries should reuse one reader thread per stream instead of spawning per call.
    manager = _make_manager(tmp_path)
    release_read = threading.Event()

    class _BlockingStream:
        def __init__(self) -> None:
            self.read_calls = 0

        def readline(self) -> str:
            self.read_calls += 1
            release_read.wait(timeout=2.0)
            return ""

    stream = _BlockingStream()
    try:
        assert (
            manager._read_stream_line_with_timeout(stream, timeout_seconds=0.01) is None
        )
        assert (
            manager._read_stream_line_with_timeout(stream, timeout_seconds=0.01) is None
        )
        assert (
            manager._read_stream_line_with_timeout(stream, timeout_seconds=0.01) is None
        )
        assert stream.read_calls == 1
    finally:
        release_read.set()

    assert manager._read_stream_line_with_timeout(stream, timeout_seconds=1.0) == ""
    assert id(stream) not in manager._backend_worker_pipe_readers


def test_stop_backend_worker_process_continues_on_post_kill_timeout(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Stop should continue cleanup even when wait() still times out after kill().
    manager = _make_manager(tmp_path)

    class _FakeStream:
        def __init__(self) -> None:
            self.closed = False

        def close(self) -> None:
            self.closed = True

    class _FakeProcess:
        def __init__(self) -> None:
            self.stdout = _FakeStream()
            self.stderr = _FakeStream()
            self.stdin = _FakeStream()
            self.wait_calls = 0
            self.terminate_calls = 0
            self.kill_calls = 0

        def poll(self) -> None:
            return None

        def terminate(self) -> None:
            self.terminate_calls += 1

        def wait(self, timeout: float) -> None:
            _ = timeout
            self.wait_calls += 1
            raise subprocess.TimeoutExpired(cmd=["worker"], timeout=1.0)

        def kill(self) -> None:
            self.kill_calls += 1

    process = _FakeProcess()
    monkeypatch.setattr(manager, "_discard_worker_pipe_reader", lambda _stream: None)
    manager._stop_backend_worker_process(process)  # type: ignore[arg-type]

    assert process.terminate_calls == 1
    assert process.kill_calls == 1
    assert process.wait_calls == 2
    assert process.stdin.closed is True
    assert process.stdout.closed is True
    assert process.stderr.closed is True


@pytest.mark.parametrize(
    ("response_payload", "expected_code", "expected_message_fragment"),
    [
        (
            {"jsonrpc": "2.0", "id": 1000},
            "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
            "result missing",
        ),
        (
            {
                "jsonrpc": "2.0",
                "id": 1000,
                "error": {"code": 123, "message": None},
            },
            "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
            "invalid error payload",
        ),
    ],
)
def test_call_backend_worker_method_rejects_invalid_response_contracts(
    tmp_path: Path,
    response_payload: dict[str, object],
    expected_code: str,
    expected_message_fragment: str,
) -> None:
    # Worker call responses should enforce JSON-RPC result/error contract validation.
    manager = _make_manager(tmp_path)
    process = subprocess.Popen(
        [
            sys.executable,
            "-u",
            "-c",
            (
                "import json, sys\n"
                "_ = sys.stdin.readline()\n"
                f"sys.stdout.write({json.dumps(response_payload)!r} + '\\n')\n"
                "sys.stdout.flush()\n"
            ),
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        with pytest.raises(PluginManagerError) as exc_info:
            manager._call_backend_worker_method(
                process=process,
                plugin_id="fixture-plugin",
                request_id=1000,
                method="plugin.initialize",
                timeout_seconds=2.0,
                timeout_code="PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
            )
    finally:
        process.wait(timeout=2.0)
        for stream in (process.stdin, process.stdout, process.stderr):
            if stream is not None:
                stream.close()
    assert exc_info.value.code == expected_code
    assert expected_message_fragment in exc_info.value.message


def test_call_backend_worker_method_rejects_response_id_mismatch(
    tmp_path: Path,
) -> None:
    # Worker call responses should reject mismatched response ids.
    manager = _make_manager(tmp_path)
    process = subprocess.Popen(
        [
            sys.executable,
            "-u",
            "-c",
            (
                "import json, sys\n"
                "_ = sys.stdin.readline()\n"
                "sys.stdout.write(json.dumps({'jsonrpc': '2.0', 'id': 999, 'result': {'ok': True}}) + '\\n')\n"
                "sys.stdout.flush()\n"
            ),
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        with pytest.raises(PluginManagerError) as exc_info:
            manager._call_backend_worker_method(
                process=process,
                plugin_id="fixture-plugin",
                request_id=1000,
                method="plugin.initialize",
                timeout_seconds=2.0,
                timeout_code="PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
            )
    finally:
        process.wait(timeout=2.0)
        for stream in (process.stdin, process.stdout, process.stderr):
            if stream is not None:
                stream.close()
    assert exc_info.value.code == "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
    assert "response id mismatch" in exc_info.value.message


def test_call_backend_worker_method_serializes_requests_per_plugin(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Per-plugin worker lock should prevent concurrent request interleaving.
    manager = _make_manager(tmp_path)
    write_request_ids: list[int] = []
    pending_request_ids: list[int] = []
    read_call_count = 0
    first_read_started = threading.Event()
    release_first_read = threading.Event()
    results: dict[int, dict[str, bool | int]] = {}
    raised: list[Exception] = []

    class _DummyProcess:
        pass

    def _patched_write(**kwargs):
        payload = kwargs["payload"]
        request_id = payload["id"]
        assert isinstance(request_id, int)
        write_request_ids.append(request_id)
        pending_request_ids.append(request_id)

    def _patched_read(**_kwargs):
        nonlocal read_call_count
        read_call_count += 1
        if read_call_count == 1:
            first_read_started.set()
            assert release_first_read.wait(timeout=2.0)
        request_id = pending_request_ids.pop(0)
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {"ok": True, "requestId": request_id},
        }

    monkeypatch.setattr(manager, "_write_backend_worker_payload", _patched_write)
    monkeypatch.setattr(manager, "_read_backend_worker_message", _patched_read)

    def _run_call(request_id: int) -> None:
        try:
            result = manager._call_backend_worker_method(
                process=_DummyProcess(),  # type: ignore[arg-type]
                plugin_id="fixture-plugin",
                request_id=request_id,
                method="plugin.register",
                timeout_seconds=2.0,
                timeout_code="PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
            )
            assert isinstance(result, dict)
            results[request_id] = result
        except Exception as exc:  # pragma: no cover - assertion path
            raised.append(exc)

    thread_one = threading.Thread(target=_run_call, args=(1000,))
    thread_two = threading.Thread(target=_run_call, args=(1001,))
    thread_one.start()
    assert first_read_started.wait(timeout=2.0)
    thread_two.start()

    # If locking failed, thread_two would write before thread_one read returns.
    assert write_request_ids == [1000]
    release_first_read.set()

    thread_one.join(timeout=2.0)
    thread_two.join(timeout=2.0)

    assert raised == []
    assert write_request_ids == [1000, 1001]
    assert results[1000]["requestId"] == 1000
    assert results[1001]["requestId"] == 1001


def test_call_backend_worker_method_maps_unexpected_nested_host_exceptions(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Unexpected host exceptions should be converted to nested JSON-RPC error payloads.
    manager = _make_manager(tmp_path)
    written_payloads: list[dict[str, Any]] = []
    read_count = 0

    class _DummyProcess:
        pass

    def _patched_write(**kwargs):
        payload = kwargs.get("payload")
        assert isinstance(payload, dict)
        written_payloads.append(payload)

    def _patched_read(**_kwargs):
        nonlocal read_count
        read_count += 1
        if read_count == 1:
            return {
                "jsonrpc": "2.0",
                "id": 2000,
                "method": "host.read_project_state",
                "params": {
                    "projectConfigId": "fixture-project",
                    "view": "summary",
                },
            }
        return {
            "jsonrpc": "2.0",
            "id": 1000,
            "result": {"ok": True},
        }

    def _raise_unexpected_host_error(**_kwargs):
        raise RuntimeError("startup in progress")

    monkeypatch.setattr(manager, "_write_backend_worker_payload", _patched_write)
    monkeypatch.setattr(manager, "_read_backend_worker_message", _patched_read)
    monkeypatch.setattr(
        manager,
        "_dispatch_backend_worker_host_request",
        _raise_unexpected_host_error,
    )

    result = manager._call_backend_worker_method(
        process=_DummyProcess(),  # type: ignore[arg-type]
        plugin_id="fixture-plugin",
        request_id=1000,
        method="plugin.register",
        timeout_seconds=2.0,
        timeout_code="PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
    )
    assert result == {"ok": True}
    assert len(written_payloads) == 2
    nested_response = written_payloads[1]
    assert nested_response["id"] == 2000
    nested_error = nested_response.get("error")
    assert isinstance(nested_error, dict)
    assert nested_error.get("code") == "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
    assert "Host method host.read_project_state failed" in str(
        nested_error.get("message")
    )


@pytest.mark.parametrize(
    ("prefix", "expected"),
    [
        (None, "/api/plugins/setta-fixture-backend"),
        ("", "/api/plugins/setta-fixture-backend"),
        ("/", "/api/plugins/setta-fixture-backend"),
        ("foo", "/api/plugins/setta-fixture-backend/foo"),
        ("/foo", "/api/plugins/setta-fixture-backend/foo"),
    ],
)
def test_build_plugin_route_prefix_normalizes_common_prefix_shapes(
    tmp_path: Path,
    prefix: str | None,
    expected: str,
) -> None:
    # Route prefix helper should normalize empty/root/non-root prefix variants.
    manager = _make_manager(tmp_path)
    assert (
        manager._build_plugin_route_prefix("setta-fixture-backend", prefix) == expected
    )


@pytest.mark.parametrize(
    "invalid_prefix",
    [
        "../escape",
        "/foo//bar",
        "/%2e%2e/escape",
        "/with space",
    ],
)
def test_build_plugin_route_prefix_rejects_invalid_segments(
    tmp_path: Path,
    invalid_prefix: str,
) -> None:
    # Route prefixes should reject traversal, empty, encoded-dot, and invalid character segments.
    manager = _make_manager(tmp_path)

    with pytest.raises(PluginManagerError) as exc_info:
        manager._build_plugin_route_prefix("setta-fixture-backend", invalid_prefix)

    assert exc_info.value.code == "PLUGIN_BACKEND_REGISTER_FAILED"
    assert "route prefix" in exc_info.value.message


@pytest.mark.parametrize(
    "invalid_url_prefix",
    [
        "../escape",
        "/%2e%2e/escape",
        "fixture//nested",
        "fixture with spaces",
    ],
)
def test_register_backend_static_dir_rejects_invalid_url_prefix(
    tmp_path: Path,
    invalid_url_prefix: str,
) -> None:
    # Static mount URL prefixes should reject traversal/empty/invalid segments.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-static-router",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry(
        "setta-fixture-backend-static-router",
        PluginScope.workspace,
    )
    assert entry is not None
    static_root = _fixture_path("backend-static-router") / "backend" / "static"

    with pytest.raises(PluginManagerError) as exc_info:
        manager._register_backend_static_dir(
            app=FastAPI(),
            entry=entry,
            url_prefix=invalid_url_prefix,
            path=static_root,
        )

    assert exc_info.value.code == "PLUGIN_BACKEND_REGISTER_FAILED"
    assert "static url prefix" in exc_info.value.message


def test_dispatch_backend_worker_host_request_rejects_unsupported_host_method(
    tmp_path: Path,
) -> None:
    # Host request dispatch should reject unknown worker host methods explicitly.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry("setta-fixture-backend", PluginScope.workspace)
    assert entry is not None

    with pytest.raises(PluginManagerError) as exc_info:
        manager._dispatch_backend_worker_host_request(
            plugin_id=entry.plugin_id,
            method="host.unsupported",
            params={},
            entry=entry,
            app=FastAPI(),
        )
    assert exc_info.value.code == "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
    assert "Unsupported worker host method" in exc_info.value.message


@pytest.mark.parametrize(
    ("method", "params", "expected_message_fragment"),
    [
        (
            "host.register_router",
            {"prefix": "/x", "routes": "invalid"},
            "routes array",
        ),
        (
            "host.register_static_dir",
            {"path": "backend/static"},
            "missing urlPrefix",
        ),
        (
            "host.register_mcp_tool",
            {"tool": {"name": "fixture_tool", "metadata": ["invalid"]}},
            "metadata must be an object",
        ),
    ],
)
def test_dispatch_backend_worker_host_request_rejects_malformed_payloads(
    tmp_path: Path,
    method: str,
    params: dict[str, object],
    expected_message_fragment: str,
) -> None:
    # Worker host registration payloads should fail fast on malformed router/static/tool fields.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry("setta-fixture-backend", PluginScope.workspace)
    assert entry is not None

    with pytest.raises(PluginManagerError) as exc_info:
        manager._dispatch_backend_worker_host_request(
            plugin_id=entry.plugin_id,
            method=method,
            params=params,
            entry=entry,
            app=FastAPI(),
        )
    assert exc_info.value.code == "PLUGIN_BACKEND_REGISTER_FAILED"
    assert expected_message_fragment in exc_info.value.message


def test_dispatch_backend_worker_host_request_reads_project_state_summary(
    tmp_path: Path,
) -> None:
    # Worker host read_project_state should return summary snapshots for valid project ids.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry("setta-fixture-backend", PluginScope.workspace)
    assert entry is not None

    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(id="fixture-project", name="Fixture Project")
    )
    backend_state = merge_single_config_into_backend(
        ProjectStateBackend(),
        project_state,
    )
    backend_state.validate_default_project_id()

    class _Manager:
        def __init__(self, state: ProjectStateBackend) -> None:
            self.project_state_backend = state

    class _Switcher:
        def __init__(self, state: ProjectStateBackend) -> None:
            self._manager = _Manager(state)

        def get(self, project_identifier: str, *, share_session_id: str | None = None):
            assert project_identifier == "fixture-project"
            assert share_session_id is None
            return self._manager

    class _FakeSettaState:
        def __init__(self) -> None:
            self.deployment_mode = False
            self.project_manager_switcher = _Switcher(backend_state)

    app = FastAPI()
    app.state.setta = _FakeSettaState()
    result = manager._dispatch_backend_worker_host_request(
        plugin_id=entry.plugin_id,
        method="host.read_project_state",
        params={
            "projectConfigId": "fixture-project",
            "view": "summary",
        },
        entry=entry,
        app=app,
    )
    assert result["view"] == "summary"
    assert result["projectState"]["projectConfig"]["id"] == "fixture-project"


def test_dispatch_backend_worker_host_request_rejects_unknown_share_session(
    tmp_path: Path,
) -> None:
    # Deployment-mode read_project_state should fail when share session is missing/unknown.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry("setta-fixture-backend", PluginScope.workspace)
    assert entry is not None

    class _FakeShareSessionStore:
        def has_session(self, _session_id: str) -> bool:
            return False

        def touch_session(self, _session_id: str) -> None:
            raise AssertionError("touch_session should not run for unknown sessions")

    class _FakeSettaState:
        def __init__(self) -> None:
            self.deployment_mode = True
            self.share_session_store = _FakeShareSessionStore()

    app = FastAPI()
    app.state.setta = _FakeSettaState()
    with pytest.raises(PluginManagerError) as exc_info:
        manager._dispatch_backend_worker_host_request(
            plugin_id=entry.plugin_id,
            method="host.read_project_state",
            params={
                "projectConfigId": "fixture-project",
                "shareSessionId": "missing-share-session",
                "view": "summary",
            },
            entry=entry,
            app=app,
        )
    assert exc_info.value.code == "PLUGIN_BACKEND_PROJECT_STATE_READ_FAILED"


def test_dispatch_backend_worker_host_request_maps_preinit_switcher_runtime_error(
    tmp_path: Path,
) -> None:
    # Pre-init manager-switcher runtime failures should map to deterministic plugin errors.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry("setta-fixture-backend", PluginScope.workspace)
    assert entry is not None

    class _FakeSettaState:
        def __init__(self) -> None:
            self.deployment_mode = False

        @property
        def project_manager_switcher(self):
            raise RuntimeError("project manager switcher not ready")

    app = FastAPI()
    app.state.setta = _FakeSettaState()
    with pytest.raises(PluginManagerError) as exc_info:
        manager._dispatch_backend_worker_host_request(
            plugin_id=entry.plugin_id,
            method="host.read_project_state",
            params={
                "projectConfigId": "fixture-project",
                "view": "summary",
            },
            entry=entry,
            app=app,
        )
    assert exc_info.value.code == "PLUGIN_BACKEND_PROJECT_STATE_READ_FAILED"
    assert "unavailable before startup completes" in exc_info.value.message


def test_dispatch_backend_worker_host_request_emits_listener_dependency_event(
    tmp_path: Path,
) -> None:
    # Worker host emit_listener_dependency_event should validate and publish dependency events.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry("setta-fixture-backend", PluginScope.workspace)
    assert entry is not None

    class _FakeRealtimeEventHub:
        def __init__(self) -> None:
            self.calls: list[tuple[str, int, str | None]] = []

        async def emit_dependency_event(
            self,
            *,
            project_config_id: str,
            dependency_events: list[Any],
            share_session_id: str | None = None,
        ) -> None:
            self.calls.append(
                (project_config_id, len(dependency_events), share_session_id)
            )

    class _FakeSettaState:
        def __init__(self, hub: _FakeRealtimeEventHub) -> None:
            self.deployment_mode = False
            self.realtime_event_hub = hub

    hub = _FakeRealtimeEventHub()
    app = FastAPI()
    app.state.setta = _FakeSettaState(hub)

    result = manager._dispatch_backend_worker_host_request(
        plugin_id=entry.plugin_id,
        method="host.emit_listener_dependency_event",
        params={
            "projectConfigId": "fixture-project",
            "dependencyEvents": [
                {
                    "dependencyKey": {
                        "type": "Section",
                        "sectionId": "fixture-section",
                    },
                    "payload": {
                        "type": "Literal",
                        "payload": "hello",
                    },
                    "timestampMs": 123,
                }
            ],
        },
        entry=entry,
        app=app,
    )
    assert result == {"ok": True}
    assert hub.calls == [("fixture-project", 1, None)]


def test_dispatch_backend_worker_host_request_registers_listener_endpoint(
    tmp_path: Path,
) -> None:
    # Worker host register_listener_endpoint should bind registered route ids by endpoint name.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry("setta-fixture-backend", PluginScope.workspace)
    assert entry is not None
    manager._backend_route_ids_by_plugin_id[entry.plugin_id] = {"route_0"}

    result = manager._dispatch_backend_worker_host_request(
        plugin_id=entry.plugin_id,
        method="host.register_listener_endpoint",
        params={
            "endpointName": "fixture_listener_echo",
            "routeId": "route_0",
        },
        entry=entry,
        app=FastAPI(),
    )
    assert result == {"ok": True}
    assert manager._backend_listener_endpoint_route_by_name == {
        "fixture_listener_echo": (entry.plugin_id, "route_0")
    }


def test_invoke_listener_endpoint_dispatches_worker_route(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Listener endpoint invocation should route through plugin worker invoke_route and return body.
    manager = _make_manager(tmp_path, backend_operation_timeout_seconds=33.0)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry("setta-fixture-backend", PluginScope.workspace)
    assert entry is not None

    class _AliveProcess:
        def poll(self) -> None:
            return None

    manager._backend_worker_processes[entry.plugin_id] = _AliveProcess()  # type: ignore[assignment]
    manager._backend_listener_endpoint_route_by_name["fixture_listener_echo"] = (
        entry.plugin_id,
        "route_0",
    )

    def _patched_call_backend_worker_method(**kwargs):
        assert kwargs["method"] == "plugin.invoke_route"
        assert kwargs["timeout_seconds"] == 33.0
        assert kwargs["entry"] == entry
        assert kwargs["params"]["routeId"] == "route_0"
        assert kwargs["params"]["jsonBody"] == {"projectConfigId": "fixture-project"}
        return {
            "statusCode": 200,
            "body": {"ok": True},
        }

    monkeypatch.setattr(
        manager,
        "_call_backend_worker_method",
        _patched_call_backend_worker_method,
    )

    result = manager.invoke_listener_endpoint(
        endpoint_name="fixture_listener_echo",
        payload={"projectConfigId": "fixture-project"},
    )
    assert result == {"ok": True}


def test_invoke_listener_endpoint_rejects_invalid_worker_status_code(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Listener endpoint invocation should fail when worker returns malformed statusCode values.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry("setta-fixture-backend", PluginScope.workspace)
    assert entry is not None

    class _AliveProcess:
        def poll(self) -> None:
            return None

    manager._backend_worker_processes[entry.plugin_id] = _AliveProcess()  # type: ignore[assignment]
    manager._backend_listener_endpoint_route_by_name["fixture_listener_echo"] = (
        entry.plugin_id,
        "route_0",
    )

    monkeypatch.setattr(
        manager,
        "_call_backend_worker_method",
        lambda **_kwargs: {"statusCode": "not-an-int", "body": {"ok": True}},
    )

    with pytest.raises(PluginManagerError) as exc_info:
        manager.invoke_listener_endpoint(
            endpoint_name="fixture_listener_echo",
            payload={"projectConfigId": "fixture-project"},
        )
    assert exc_info.value.code == "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
    assert "invalid statusCode value" in exc_info.value.message


def test_worker_route_proxy_returns_503_when_worker_process_unavailable(
    tmp_path: Path,
) -> None:
    # Proxy routes should return 503 when no live worker process exists.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry("setta-fixture-backend", PluginScope.workspace)
    assert entry is not None

    app = FastAPI()
    manager._register_backend_router_from_worker_request(
        app=app,
        entry=entry,
        params={
            "prefix": "/proxy",
            "routes": [
                {
                    "routeId": "route_0",
                    "path": "echo",
                    "methods": ["GET"],
                }
            ],
        },
    )

    with TestClient(app) as client:
        response = client.get("/api/plugins/setta-fixture-backend/proxy/echo")
    assert response.status_code == 503
    assert response.json()["code"] == "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
    assert "Backend worker unavailable" in response.json()["message"]


def test_worker_route_proxy_maps_worker_errors_and_rejects_invalid_status_codes(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Proxy routes should map worker errors and reject malformed status codes.
    manager = _make_manager(tmp_path, backend_operation_timeout_seconds=27.0)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry("setta-fixture-backend", PluginScope.workspace)
    assert entry is not None

    app = FastAPI()
    manager._register_backend_router_from_worker_request(
        app=app,
        entry=entry,
        params={
            "prefix": "/proxy",
            "routes": [
                {
                    "routeId": "route_0",
                    "path": "/echo",
                    "methods": ["GET"],
                }
            ],
        },
    )

    class _AliveProcess:
        def poll(self) -> None:
            return None

    manager._backend_worker_processes[entry.plugin_id] = _AliveProcess()  # type: ignore[assignment]
    route_path = "/api/plugins/setta-fixture-backend/proxy/echo"

    with TestClient(app) as client:
        with monkeypatch.context() as scope:

            def _raise_worker_error(**_kwargs):
                raise PluginManagerError(
                    "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                    "worker invoke failed",
                )

            scope.setattr(manager, "_call_backend_worker_method", _raise_worker_error)
            error_response = client.get(route_path)
        assert error_response.status_code == 502
        assert error_response.json() == {
            "code": "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
            "message": "worker invoke failed",
        }

        with monkeypatch.context() as scope:
            scope.setattr(manager, "_call_backend_worker_method", lambda **_kwargs: [])
            non_object_response = client.get(route_path)
        assert non_object_response.status_code == 502
        assert non_object_response.json() == {
            "code": "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
            "message": "Plugin worker route response must be an object.",
        }

        with monkeypatch.context() as scope:
            captured_timeout: float | None = None

            def _status_fallback_payload(**kwargs):
                nonlocal captured_timeout
                captured_timeout = kwargs["timeout_seconds"]
                return {
                    "statusCode": "not-an-int",
                    "body": {"ok": True, "source": "worker"},
                }

            scope.setattr(
                manager,
                "_call_backend_worker_method",
                _status_fallback_payload,
            )
            status_fallback_response = client.get(route_path)
        assert status_fallback_response.status_code == 502
        assert (
            status_fallback_response.json()["code"]
            == "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
        )
        assert "invalid statusCode value" in status_fallback_response.json()["message"]
        assert captured_timeout == 27.0


def test_worker_route_proxy_handles_plain_text_body_and_head_options_requests(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Proxy should pass through non-JSON request bodies and avoid body forwarding for HEAD/OPTIONS.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry("setta-fixture-backend", PluginScope.workspace)
    assert entry is not None

    app = FastAPI()
    manager._register_backend_router_from_worker_request(
        app=app,
        entry=entry,
        params={
            "prefix": "/proxy",
            "routes": [
                {
                    "routeId": "route_0",
                    "path": "/echo",
                    "methods": ["GET", "POST"],
                }
            ],
        },
    )

    class _AliveProcess:
        def poll(self) -> None:
            return None

    manager._backend_worker_processes[entry.plugin_id] = _AliveProcess()  # type: ignore[assignment]
    captured_params: list[dict[str, object]] = []

    def _capture_call(**kwargs):
        params = kwargs["params"]
        assert isinstance(params, dict)
        captured_params.append(params)
        return {
            "statusCode": 200,
            "body": {
                "jsonBody": params.get("jsonBody"),
                "rawBodyBase64": params.get("rawBodyBase64"),
            },
        }

    monkeypatch.setattr(manager, "_call_backend_worker_method", _capture_call)
    route_path = "/api/plugins/setta-fixture-backend/proxy/echo"

    with TestClient(app) as client:
        plain_text_response = client.post(
            route_path,
            content="plain-text-body",
            headers={"Content-Type": "text/plain"},
        )
        assert plain_text_response.status_code == 200
        assert plain_text_response.json() == {
            "jsonBody": "plain-text-body",
            "rawBodyBase64": "cGxhaW4tdGV4dC1ib2R5",
        }

        calls_after_post = len(captured_params)
        head_response = client.head(route_path)
        assert head_response.status_code in {200, 405}
        calls_after_head = len(captured_params)
        if head_response.status_code == 200:
            assert calls_after_head == calls_after_post + 1
            assert captured_params[-1]["jsonBody"] is None
        else:
            assert calls_after_head == calls_after_post

        calls_before_options = len(captured_params)
        options_response = client.request(
            "OPTIONS",
            route_path,
            content="ignored-options-body",
            headers={"Content-Type": "text/plain"},
        )
        assert options_response.status_code in {200, 405}
        calls_after_options = len(captured_params)
        if options_response.status_code == 200:
            assert calls_after_options == calls_before_options + 1
            assert captured_params[-1]["jsonBody"] is None
        else:
            assert calls_after_options == calls_before_options

    assert len(captured_params) >= 1
    assert captured_params[0]["jsonBody"] == "plain-text-body"
    assert captured_params[0]["rawBodyBase64"] == "cGxhaW4tdGV4dC1ib2R5"
    request_context = captured_params[0].get("requestContext")
    assert isinstance(request_context, dict)
    assert request_context.get("method") == "POST"
    assert request_context.get("path") == route_path
    assert isinstance(request_context.get("headers"), list)


def test_worker_route_proxy_skips_raw_body_when_route_does_not_require_request(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Route descriptors that opt out of raw body transport should avoid base64 payload forwarding.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry("setta-fixture-backend", PluginScope.workspace)
    assert entry is not None

    app = FastAPI()
    manager._register_backend_router_from_worker_request(
        app=app,
        entry=entry,
        params={
            "prefix": "/proxy",
            "routes": [
                {
                    "routeId": "route_0",
                    "path": "/echo",
                    "methods": ["POST"],
                    "needsRawBody": False,
                }
            ],
        },
    )

    class _AliveProcess:
        def poll(self) -> None:
            return None

    manager._backend_worker_processes[entry.plugin_id] = _AliveProcess()  # type: ignore[assignment]
    captured_params: list[dict[str, object]] = []

    def _capture_call(**kwargs):
        params = kwargs["params"]
        assert isinstance(params, dict)
        captured_params.append(params)
        return {"statusCode": 200, "body": {"ok": True}}

    monkeypatch.setattr(manager, "_call_backend_worker_method", _capture_call)
    route_path = "/api/plugins/setta-fixture-backend/proxy/echo"

    with TestClient(app) as client:
        response = client.post(
            route_path,
            content="plain-text-body",
            headers={"Content-Type": "text/plain"},
        )
    assert response.status_code == 200
    assert captured_params[0]["jsonBody"] == "plain-text-body"
    assert captured_params[0].get("rawBodyBase64") is None


def test_register_backend_router_rejects_non_boolean_needs_raw_body_descriptor(
    tmp_path: Path,
) -> None:
    # Worker router descriptors must use boolean needsRawBody values.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry("setta-fixture-backend", PluginScope.workspace)
    assert entry is not None

    app = FastAPI()
    with pytest.raises(PluginManagerError) as exc_info:
        manager._register_backend_router_from_worker_request(
            app=app,
            entry=entry,
            params={
                "prefix": "/proxy",
                "routes": [
                    {
                        "routeId": "route_0",
                        "path": "/echo",
                        "methods": ["POST"],
                        "needsRawBody": "yes",
                    }
                ],
            },
        )
    assert exc_info.value.code == "PLUGIN_BACKEND_REGISTER_FAILED"


def test_worker_route_proxy_preserves_non_utf8_request_payloads(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Proxy should preserve non-UTF8 request bytes via rawBodyBase64 transport.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry("setta-fixture-backend", PluginScope.workspace)
    assert entry is not None

    app = FastAPI()
    manager._register_backend_router_from_worker_request(
        app=app,
        entry=entry,
        params={
            "prefix": "/proxy",
            "routes": [
                {
                    "routeId": "route_0",
                    "path": "/echo",
                    "methods": ["POST"],
                }
            ],
        },
    )

    class _AliveProcess:
        def poll(self) -> None:
            return None

    manager._backend_worker_processes[entry.plugin_id] = _AliveProcess()  # type: ignore[assignment]
    captured_params: list[dict[str, object]] = []

    def _capture_call(**kwargs):
        params = kwargs["params"]
        assert isinstance(params, dict)
        captured_params.append(params)
        return {"statusCode": 200, "body": {"ok": True}}

    monkeypatch.setattr(manager, "_call_backend_worker_method", _capture_call)
    route_path = "/api/plugins/setta-fixture-backend/proxy/echo"

    with TestClient(app) as client:
        response = client.post(
            route_path,
            content=b"\xffabc\xfe",
            headers={"Content-Type": "application/octet-stream"},
        )
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert len(captured_params) == 1
    assert captured_params[0]["jsonBody"] is None
    assert captured_params[0]["rawBodyBase64"] == "/2FiY/4="


def test_worker_route_proxy_forwards_worker_response_status_headers_and_errors(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Proxy should forward status, media type, and headers from worker route envelopes.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry("setta-fixture-backend", PluginScope.workspace)
    assert entry is not None

    app = FastAPI()
    manager._register_backend_router_from_worker_request(
        app=app,
        entry=entry,
        params={
            "prefix": "/proxy",
            "routes": [
                {
                    "routeId": "route_0",
                    "path": "/echo",
                    "methods": ["GET"],
                }
            ],
        },
    )

    class _AliveProcess:
        def poll(self) -> None:
            return None

    manager._backend_worker_processes[entry.plugin_id] = _AliveProcess()  # type: ignore[assignment]
    route_path = "/api/plugins/setta-fixture-backend/proxy/echo"
    payloads = [
        {
            "statusCode": 201,
            "body": {"ok": True},
            "mediaType": "application/json",
            "headers": [["x-fixture", "created"]],
        },
        {
            "statusCode": 404,
            "body": {"detail": "missing"},
            "mediaType": "application/json",
        },
    ]

    def _next_payload(**_kwargs):
        if len(payloads) == 0:
            raise AssertionError("Expected worker payload fixture.")
        return payloads.pop(0)

    monkeypatch.setattr(manager, "_call_backend_worker_method", _next_payload)

    with TestClient(app) as client:
        created_response = client.get(route_path)
        assert created_response.status_code == 201
        assert created_response.headers["x-fixture"] == "created"
        assert created_response.json() == {"ok": True}

        missing_response = client.get(route_path)
        assert missing_response.status_code == 404
        assert missing_response.json() == {"detail": "missing"}


@pytest.mark.parametrize(
    ("response_headers", "expected_message_fragment"),
    [
        ([["x-fixture", "✓"]], "non-latin-1 header name or value"),
        ([["x-fixture\ninvalid", "value"]], "headers containing newline characters"),
        ([["x-fixture", "value\rinvalid"]], "headers containing newline characters"),
    ],
)
def test_worker_route_proxy_rejects_invalid_header_transport_values(
    tmp_path: Path,
    monkeypatch,
    response_headers: list[list[str]],
    expected_message_fragment: str,
) -> None:
    # Proxy should convert invalid worker header payloads into structured transport errors.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry("setta-fixture-backend", PluginScope.workspace)
    assert entry is not None

    app = FastAPI()
    manager._register_backend_router_from_worker_request(
        app=app,
        entry=entry,
        params={
            "prefix": "/proxy",
            "routes": [
                {
                    "routeId": "route_0",
                    "path": "/echo",
                    "methods": ["GET"],
                }
            ],
        },
    )

    class _AliveProcess:
        def poll(self) -> None:
            return None

    manager._backend_worker_processes[entry.plugin_id] = _AliveProcess()  # type: ignore[assignment]
    route_path = "/api/plugins/setta-fixture-backend/proxy/echo"

    monkeypatch.setattr(
        manager,
        "_call_backend_worker_method",
        lambda **_kwargs: {
            "statusCode": 200,
            "body": {"ok": True},
            "headers": response_headers,
        },
    )

    with TestClient(app) as client:
        response = client.get(route_path)
    assert response.status_code == 502
    assert response.json()["code"] == "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
    assert expected_message_fragment in response.json()["message"]


def test_worker_route_proxy_preserves_multiple_set_cookie_headers(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Proxy should preserve repeated Set-Cookie headers instead of collapsing them.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry("setta-fixture-backend", PluginScope.workspace)
    assert entry is not None

    app = FastAPI()
    manager._register_backend_router_from_worker_request(
        app=app,
        entry=entry,
        params={
            "prefix": "/proxy",
            "routes": [
                {
                    "routeId": "route_0",
                    "path": "/echo",
                    "methods": ["GET"],
                }
            ],
        },
    )

    class _AliveProcess:
        def poll(self) -> None:
            return None

    manager._backend_worker_processes[entry.plugin_id] = _AliveProcess()  # type: ignore[assignment]
    route_path = "/api/plugins/setta-fixture-backend/proxy/echo"

    monkeypatch.setattr(
        manager,
        "_call_backend_worker_method",
        lambda **_kwargs: {
            "statusCode": 200,
            "body": {"ok": True},
            "headers": [
                ["set-cookie", "a=1; Path=/; HttpOnly"],
                ["set-cookie", "b=2; Path=/; Secure"],
                ["x-fixture", "cookies"],
            ],
        },
    )

    with TestClient(app) as client:
        response = client.get(route_path)
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert response.headers["x-fixture"] == "cookies"
    assert response.headers.get_list("set-cookie") == [
        "a=1; Path=/; HttpOnly",
        "b=2; Path=/; Secure",
    ]


def test_worker_route_proxy_preserves_duplicate_link_headers(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Proxy should preserve repeated Link headers instead of overwriting values.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry("setta-fixture-backend", PluginScope.workspace)
    assert entry is not None

    app = FastAPI()
    manager._register_backend_router_from_worker_request(
        app=app,
        entry=entry,
        params={
            "prefix": "/proxy",
            "routes": [
                {
                    "routeId": "route_0",
                    "path": "/echo",
                    "methods": ["GET"],
                }
            ],
        },
    )

    class _AliveProcess:
        def poll(self) -> None:
            return None

    manager._backend_worker_processes[entry.plugin_id] = _AliveProcess()  # type: ignore[assignment]
    route_path = "/api/plugins/setta-fixture-backend/proxy/echo"

    monkeypatch.setattr(
        manager,
        "_call_backend_worker_method",
        lambda **_kwargs: {
            "statusCode": 200,
            "body": {"ok": True},
            "headers": [
                ["link", "</a.css>; rel=preload; as=style"],
                ["link", "</b.css>; rel=preload; as=style"],
                ["x-fixture", "links"],
            ],
        },
    )

    with TestClient(app) as client:
        response = client.get(route_path)
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert response.headers["x-fixture"] == "links"
    assert response.headers.get_list("link") == [
        "</a.css>; rel=preload; as=style",
        "</b.css>; rel=preload; as=style",
    ]


def test_worker_route_proxy_returns_empty_body_for_no_content_status(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Proxy should emit a true empty response for no-content worker statuses.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry("setta-fixture-backend", PluginScope.workspace)
    assert entry is not None

    app = FastAPI()
    manager._register_backend_router_from_worker_request(
        app=app,
        entry=entry,
        params={
            "prefix": "/proxy",
            "routes": [
                {
                    "routeId": "route_0",
                    "path": "/echo",
                    "methods": ["GET"],
                }
            ],
        },
    )

    class _AliveProcess:
        def poll(self) -> None:
            return None

    manager._backend_worker_processes[entry.plugin_id] = _AliveProcess()  # type: ignore[assignment]
    route_path = "/api/plugins/setta-fixture-backend/proxy/echo"

    monkeypatch.setattr(
        manager,
        "_call_backend_worker_method",
        lambda **_kwargs: {
            "statusCode": 204,
            "body": None,
        },
    )

    with TestClient(app) as client:
        response = client.get(route_path)
    assert response.status_code == 204
    assert response.content == b""
    assert response.headers.get("content-type") is None


@pytest.mark.parametrize(
    "worker_payload",
    [
        {
            "statusCode": 204,
            "mediaType": "text/plain",
            "body": "should-not-be-sent",
        },
        {
            "statusCode": 205,
            "mediaType": "application/octet-stream",
            "bodyEncoding": "base64",
            "body": base64.b64encode(b"ignored").decode("ascii"),
        },
        {
            "statusCode": 304,
            "mediaType": "text/plain",
            "bodyEncoding": "base64",
            "body": base64.b64encode(b"still-ignored").decode("ascii"),
        },
    ],
)
def test_worker_route_proxy_ignores_body_payload_for_no_content_statuses(
    tmp_path: Path,
    monkeypatch,
    worker_payload: dict[str, object],
) -> None:
    # No-content statuses must ignore text/base64 worker bodies across media-type branches.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry("setta-fixture-backend", PluginScope.workspace)
    assert entry is not None

    app = FastAPI()
    manager._register_backend_router_from_worker_request(
        app=app,
        entry=entry,
        params={
            "prefix": "/proxy",
            "routes": [
                {
                    "routeId": "route_0",
                    "path": "/echo",
                    "methods": ["GET"],
                }
            ],
        },
    )

    class _AliveProcess:
        def poll(self) -> None:
            return None

    manager._backend_worker_processes[entry.plugin_id] = _AliveProcess()  # type: ignore[assignment]
    route_path = "/api/plugins/setta-fixture-backend/proxy/echo"
    monkeypatch.setattr(
        manager,
        "_call_backend_worker_method",
        lambda **_kwargs: worker_payload,
    )

    with TestClient(app) as client:
        response = client.get(route_path)
    expected_status = worker_payload["statusCode"]
    assert isinstance(expected_status, int)
    assert response.status_code == expected_status
    assert response.content == b""


def test_worker_route_proxy_preserves_explicit_json_null_body(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Explicit JSON null from worker routes should be preserved as a JSON body.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry("setta-fixture-backend", PluginScope.workspace)
    assert entry is not None

    app = FastAPI()
    manager._register_backend_router_from_worker_request(
        app=app,
        entry=entry,
        params={
            "prefix": "/proxy",
            "routes": [
                {
                    "routeId": "route_0",
                    "path": "/echo",
                    "methods": ["GET"],
                }
            ],
        },
    )

    class _AliveProcess:
        def poll(self) -> None:
            return None

    manager._backend_worker_processes[entry.plugin_id] = _AliveProcess()  # type: ignore[assignment]
    route_path = "/api/plugins/setta-fixture-backend/proxy/echo"

    monkeypatch.setattr(
        manager,
        "_call_backend_worker_method",
        lambda **_kwargs: {
            "statusCode": 200,
            "mediaType": "application/json",
            "body": None,
        },
    )

    with TestClient(app) as client:
        response = client.get(route_path)
    assert response.status_code == 200
    assert response.content == b"null"
    assert response.headers.get("content-type") == "application/json"
    assert response.json() is None


def test_worker_route_proxy_keeps_empty_json_body_empty(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Worker payloads without a body key should stay empty, not JSON null.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    entry = manager._find_entry("setta-fixture-backend", PluginScope.workspace)
    assert entry is not None

    app = FastAPI()
    manager._register_backend_router_from_worker_request(
        app=app,
        entry=entry,
        params={
            "prefix": "/proxy",
            "routes": [
                {
                    "routeId": "route_0",
                    "path": "/echo",
                    "methods": ["GET"],
                }
            ],
        },
    )

    class _AliveProcess:
        def poll(self) -> None:
            return None

    manager._backend_worker_processes[entry.plugin_id] = _AliveProcess()  # type: ignore[assignment]
    route_path = "/api/plugins/setta-fixture-backend/proxy/echo"

    monkeypatch.setattr(
        manager,
        "_call_backend_worker_method",
        lambda **_kwargs: {
            "statusCode": 200,
            "mediaType": "application/json",
        },
    )

    with TestClient(app) as client:
        response = client.get(route_path)
    assert response.status_code == 200
    assert response.content == b""
    assert response.headers.get("content-type") == "application/json"


def test_scoped_link_and_uninstall_work_for_shadowed_entries(tmp_path: Path) -> None:
    # Explicit scope lifecycle operations should work even when that scope is shadowed.
    manager = _make_manager(tmp_path)
    plugin_root = _fixture_path("frontend")
    manager.link_plugin(
        local_plugin_root=str(plugin_root),
        scope=PluginScope.workspace,
        enable=True,
        force=True,
    )
    linked_shadowed = manager.link_plugin(
        local_plugin_root=str(plugin_root),
        scope=PluginScope.setta_files,
        enable=True,
        force=True,
    )
    assert linked_shadowed.sourceScope == PluginScope.setta_files
    assert linked_shadowed.state == PluginRuntimeState.shadowed

    removed = manager.uninstall_plugin(
        plugin_id="setta-fixture-frontend",
        scope=PluginScope.setta_files,
    )
    assert removed.pluginId == "setta-fixture-frontend"
    assert removed.removedFromScope == PluginScope.setta_files

    remaining_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-frontend"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(remaining_entries) == 1
    assert remaining_entries[0].state == PluginRuntimeState.active


def test_update_plugin_preserves_disabled_state(tmp_path: Path) -> None:
    # Updating a disabled plugin should not re-enable it.
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
            installer=PluginInstallerBackend.pip,
            scope=PluginScope.workspace,
            enable=True,
            force=False,
        )
        manager.disable_plugin(plugin_id=package_name)

        update_result = manager.update_plugin(
            plugin_id=package_name,
            scope=PluginScope.workspace,
        )
        assert update_result.pluginId == package_name
    finally:
        if old_no_index is None:
            os.environ.pop("PIP_NO_INDEX", None)
        else:
            os.environ["PIP_NO_INDEX"] = old_no_index
        if old_find_links is None:
            os.environ.pop("PIP_FIND_LINKS", None)
        else:
            os.environ["PIP_FIND_LINKS"] = old_find_links

    entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == package_name
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(entries) == 1
    assert entries[0].state == PluginRuntimeState.disabled


def test_backup_existing_plugin_uses_collision_proof_history_paths(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # History snapshots should not collide when multiple backups share the same timestamp.
    manager = _make_manager(tmp_path)
    plugin_id = "setta-fixture-frontend"
    scope = PluginScope.workspace
    target_path = _scope_root(manager, scope) / plugin_id
    target_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(_fixture_path("frontend"), target_path)
    frozen_now = datetime(2026, 1, 1, tzinfo=UTC)

    class _FrozenDateTime:
        @staticmethod
        def now(_tz: object = None) -> datetime:
            return frozen_now

    monkeypatch.setattr("setta.plugins.manager.datetime", _FrozenDateTime)

    manager._backup_existing_plugin(plugin_id, scope, target_path)
    manager._backup_existing_plugin(plugin_id, scope, target_path)

    metadata = manager._load_install_metadata()
    entry = metadata.entries[manager._metadata_key(plugin_id, scope)]
    assert len(entry.history) == 2
    assert entry.history[0].snapshotPath != entry.history[1].snapshotPath
    assert Path(entry.history[0].snapshotPath).exists()
    assert Path(entry.history[1].snapshotPath).exists()


def test_apply_lockfile_rejects_duplicate_scope_plugin_entries(tmp_path: Path) -> None:
    # Duplicate (scope, pluginId) lockfile entries should fail validation.
    manager = _make_manager(tmp_path)
    lockfile_path = manager.workspace_root / ".setta_plugins" / "plugins.lock.json"
    lockfile_path.parent.mkdir(parents=True, exist_ok=True)
    lockfile_path.write_text(
        json.dumps(
            {
                "plugins": [
                    {
                        "pluginId": "setta-fixture-frontend",
                        "version": "0.1.0",
                        "canonicalSourceKey": "local:/tmp/a",
                        "scope": "workspace",
                    },
                    {
                        "pluginId": "setta-fixture-frontend",
                        "version": "0.2.0",
                        "canonicalSourceKey": "local:/tmp/b",
                        "scope": "workspace",
                    },
                ]
            }
        ),
        encoding="utf-8",
    )

    with pytest.raises(PluginManagerError) as exc_info:
        manager.apply_lockfile(check=False)
    assert exc_info.value.code == "PLUGIN_LOCKFILE_INVALID"
    assert "workspace:setta-fixture-frontend" in exc_info.value.message


def test_backend_language_server_registration_rejects_missing_command_binary(
    tmp_path: Path,
) -> None:
    # Language-server registration should fail when command is not launchable.
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
        "            'command': 'setta-missing-language-server-bin',\n"
        "            'args': ['--stdio'],\n"
        "        }\n"
        "    )\n",
        encoding="utf-8",
    )
    manager.rescan()
    manager.load_backend_plugins(app=FastAPI())

    status_entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend-language-server"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    ]
    assert len(status_entries) == 1
    assert status_entries[0].state == PluginRuntimeState.invalid
    assert any(
        error.code == "PLUGIN_BACKEND_REGISTER_FAILED"
        and "not available on PATH" in error.message
        for error in status_entries[0].errors
    )


def test_scope_specific_plugin_config_persists_across_shadowing_lifecycle(
    tmp_path: Path,
) -> None:
    # Config storage should be scoped so workspace/global variants do not overwrite each other.
    manager = _make_manager(tmp_path)
    plugin_id = "setta-fixture-full"
    manager.link_plugin(
        local_plugin_root=str(_fixture_path("full")),
        scope=PluginScope.global_scope,
        enable=True,
        force=False,
    )
    manager.write_plugin_config(
        plugin_id=plugin_id,
        config={"enabled": True, "label": "global-config"},
    )

    manager.link_plugin(
        local_plugin_root=str(_fixture_path("full")),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    manager.write_plugin_config(
        plugin_id=plugin_id,
        config={"enabled": True, "label": "workspace-config"},
    )

    manager.uninstall_plugin(plugin_id=plugin_id, scope=PluginScope.workspace)

    list_entry = next(
        plugin
        for plugin in manager.get_runtime_response().list.plugins
        if plugin.pluginId == plugin_id
    )
    assert list_entry.sourceScope == PluginScope.global_scope
    assert list_entry.config.currentConfig == {
        "enabled": True,
        "label": "global-config",
    }


def test_shadowed_status_entries_do_not_report_active_backend_registrations(
    tmp_path: Path,
) -> None:
    # Shadowed status rows should report only their own registrations, not the active row's.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-language-server",
        scope=PluginScope.workspace,
    )
    setta_files_path = _copy_fixture_to_scope(
        manager=manager,
        fixture_name="backend-language-server",
        scope=PluginScope.setta_files,
    )
    manager.rescan()
    manager.load_backend_plugins(app=FastAPI())

    entries = [
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-backend-language-server"
    ]
    assert len(entries) == 2

    active_entry = next(
        entry for entry in entries if entry.sourceScope == PluginScope.workspace
    )
    shadowed_entry = next(
        entry for entry in entries if entry.sourceScope == PluginScope.setta_files
    )
    assert active_entry.shadowedBySourcePath is None
    assert len(active_entry.registeredLanguageServers) == 1
    assert shadowed_entry.state == PluginRuntimeState.shadowed
    assert shadowed_entry.shadowedBySourcePath == str(active_entry.sourcePath)
    assert str(shadowed_entry.sourcePath) == str(setta_files_path)
    assert shadowed_entry.registeredLanguageServers == []
    assert shadowed_entry.registeredExternalAgentAdapters == []
    assert shadowed_entry.registeredCodegenTargets == []


def test_backend_registration_failure_rolls_back_partial_runtime_side_effects(
    tmp_path: Path,
) -> None:
    # Failed register(plugin) calls should not leak routes/tools/adapters/servers/targets.
    manager = _make_manager(tmp_path)
    plugin_root = tmp_path / "partial-registration-fixture"
    static_dir = plugin_root / "backend" / "static"
    static_dir.mkdir(parents=True, exist_ok=True)
    (static_dir / "hello.txt").write_text("hello", encoding="utf-8")
    (plugin_root / "setta.plugin.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "id": "setta-fixture-partial-registration",
                "name": "Partial Registration Fixture",
                "version": "0.1.0",
                "enabledByDefault": True,
                "capabilities": [
                    "registerRouter",
                    "registerStaticDir",
                    "registerMcpTools",
                    "registerExternalAgentAdapter",
                    "registerLanguageServer",
                    "registerCodegenTarget",
                    "registerListenerEndpoint",
                ],
                "backend": {
                    "entrypoint": "backend/entrypoint.py",
                },
            }
        ),
        encoding="utf-8",
    )
    (plugin_root / "backend" / "entrypoint.py").write_text(
        "import sys\n"
        "from fastapi import APIRouter\n\n"
        "def register(plugin):\n"
        "    router = APIRouter()\n\n"
        "    @router.get('/health')\n"
        "    def fixture_listener() -> dict[str, str]:\n"
        "        return {'status': 'ok'}\n\n"
        "    plugin.register_router(router)\n"
        "    plugin.register_listener_endpoint('fixture_listener')\n"
        "    plugin.register_static_dir('assets', 'backend/static')\n"
        "    plugin.register_mcp_tool(lambda: 'ok', name='setta_partial_tool')\n"
        "    plugin.register_external_agent_adapter(\n"
        "        {\n"
        "            'id': 'mini',\n"
        "            'name': 'Mini Adapter',\n"
        "            'runModes': ['workspace'],\n"
        "            'command': sys.executable,\n"
        "            'args': ['--version'],\n"
        "        }\n"
        "    )\n"
        "    plugin.register_language_server(\n"
        "        {\n"
        "            'language': 'typescript',\n"
        "            'command': sys.executable,\n"
        "            'args': ['--version'],\n"
        "        }\n"
        "    )\n"
        "    plugin.register_codegen_target(\n"
        "        {\n"
        "            'id': 'fixture',\n"
        "            'name': 'Fixture',\n"
        "            'language': 'typescript',\n"
        "            'defaultFileName': 'fixture.txt',\n"
        "            'generate': lambda *_args, **_kwargs: [],\n"
        "        }\n"
        "    )\n"
        "    raise RuntimeError('register boom')\n",
        encoding="utf-8",
    )

    manager.link_plugin(
        local_plugin_root=str(plugin_root),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    app = FastAPI()
    with TestClient(app) as client:
        manager.load_backend_plugins(app=app)
        route_response = client.get(
            "/api/plugins/setta-fixture-partial-registration/health"
        )
        assert route_response.status_code == 404
        static_response = client.get(
            "/plugin-static/setta-fixture-partial-registration/assets/hello.txt"
        )
        assert static_response.status_code == 404

    status_entry = next(
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-partial-registration"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    )
    assert status_entry.state == PluginRuntimeState.invalid
    assert status_entry.registeredLanguageServers == []
    assert status_entry.registeredExternalAgentAdapters == []
    assert status_entry.registeredCodegenTargets == []
    assert manager.get_backend_external_agent_adapters() == []
    assert manager.get_backend_language_servers() == []
    assert manager.get_backend_codegen_targets() == []
    assert all(tool.__name__ != "setta_partial_tool" for tool in SETTA_MCP_TOOLS)


def test_backend_ui_setting_registration_and_handler_invocation(
    tmp_path: Path,
) -> None:
    # Backend workers should register plugin ui settings and support read/write handler calls.
    manager = _make_manager(tmp_path)
    plugin_root = tmp_path / "backend-ui-setting-fixture"
    backend_root = plugin_root / "backend"
    backend_root.mkdir(parents=True, exist_ok=True)
    (plugin_root / "setta.plugin.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "id": "setta-fixture-backend-ui-setting",
                "name": "Backend UI Setting Fixture",
                "version": "0.1.0",
                "enabledByDefault": True,
                "capabilities": ["registerPane"],
                "backend": {
                    "entrypoint": "backend/entrypoint.py",
                },
            }
        ),
        encoding="utf-8",
    )
    (backend_root / "entrypoint.py").write_text(
        "_STATE = {'enabled': False}\n\n"
        "def _read_enabled(*, project_config_id: str):\n"
        "    return _STATE['enabled']\n\n"
        "def _write_enabled(*, project_config_id: str, value):\n"
        "    _STATE['enabled'] = bool(value)\n"
        "    return {'ok': True}\n\n"
        "def register(plugin):\n"
        "    plugin.register_ui_setting(\n"
        "        {\n"
        "            'id': 'backend_enabled',\n"
        "            'title': 'Backend Enabled',\n"
        "            'description': 'Enable backend behavior.',\n"
        "            'paneId': 'backend-pane',\n"
        "            'revealKey': 'backend-pane',\n"
        "            'synonyms': ['backend enabled'],\n"
        "            'mutability': 'writable',\n"
        "            'valueSchema': {'type': 'boolean'},\n"
        "            'read': _read_enabled,\n"
        "            'write': _write_enabled,\n"
        "        }\n"
        "    )\n",
        encoding="utf-8",
    )

    manager.link_plugin(
        local_plugin_root=str(plugin_root),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    manager.load_backend_plugins(app=FastAPI())

    registrations = manager.get_backend_ui_settings(
        plugin_id="setta-fixture-backend-ui-setting"
    )
    assert len(registrations) == 1
    registration = registrations[0]
    assert registration.localSettingId == "backend_enabled"
    assert registration.mutability == "writable"
    assert registration.readHandlerId == "backend_enabled"
    assert registration.writeHandlerId == "backend_enabled"
    write_handler_id = registration.writeHandlerId
    assert write_handler_id is not None

    initial_value = manager.read_backend_ui_setting_value(
        plugin_id="setta-fixture-backend-ui-setting",
        read_handler_id=registration.readHandlerId,
        project_config_id="project-1",
    )
    assert initial_value is False

    observed_old_value, observed_new_value = (
        manager.compare_and_write_backend_ui_setting_value(
            plugin_id="setta-fixture-backend-ui-setting",
            setting_id="plugin::setta-fixture-backend-ui-setting::backend_enabled",
            read_handler_id=registration.readHandlerId,
            write_handler_id=write_handler_id,
            project_config_id="project-1",
            value=True,
            expected_old_value=False,
        )
    )
    assert observed_old_value is False
    assert observed_new_value is True

    updated_value = manager.read_backend_ui_setting_value(
        plugin_id="setta-fixture-backend-ui-setting",
        read_handler_id=registration.readHandlerId,
        project_config_id="project-1",
    )
    assert updated_value is True


def test_backend_ui_setting_write_allows_non_serializable_handler_return(
    tmp_path: Path,
) -> None:
    manager = _make_manager(tmp_path)
    plugin_root = tmp_path / "backend-ui-setting-non-serializable-write"
    backend_root = plugin_root / "backend"
    backend_root.mkdir(parents=True, exist_ok=True)
    plugin_id = "setta-fixture-backend-ui-setting-non-serializable-write"
    (plugin_root / "setta.plugin.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "id": plugin_id,
                "name": "Backend UI Setting Non-Serializable Write Fixture",
                "version": "0.1.0",
                "enabledByDefault": True,
                "capabilities": ["registerPane"],
                "backend": {
                    "entrypoint": "backend/entrypoint.py",
                },
            }
        ),
        encoding="utf-8",
    )
    (backend_root / "entrypoint.py").write_text(
        "_STATE = {'enabled': False}\n\n"
        "def _read_enabled(*, project_config_id: str):\n"
        "    return _STATE['enabled']\n\n"
        "def _write_enabled(*, project_config_id: str, value):\n"
        "    _STATE['enabled'] = bool(value)\n"
        "    return object()\n\n"
        "def register(plugin):\n"
        "    plugin.register_ui_setting(\n"
        "        {\n"
        "            'id': 'backend_enabled',\n"
        "            'title': 'Backend Enabled',\n"
        "            'description': 'Enable backend behavior.',\n"
        "            'paneId': 'backend-pane',\n"
        "            'revealKey': 'backend-pane',\n"
        "            'mutability': 'writable',\n"
        "            'valueSchema': {'type': 'boolean'},\n"
        "            'read': _read_enabled,\n"
        "            'write': _write_enabled,\n"
        "        }\n"
        "    )\n",
        encoding="utf-8",
    )

    manager.link_plugin(
        local_plugin_root=str(plugin_root),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    manager.load_backend_plugins(app=FastAPI())
    registration = manager.get_backend_ui_settings(plugin_id=plugin_id)[0]
    write_handler_id = registration.writeHandlerId
    assert write_handler_id is not None

    observed_old_value, observed_new_value = (
        manager.compare_and_write_backend_ui_setting_value(
            plugin_id=plugin_id,
            setting_id=f"plugin::{plugin_id}::backend_enabled",
            read_handler_id=registration.readHandlerId,
            write_handler_id=write_handler_id,
            project_config_id="project-1",
            value=True,
            expected_old_value=False,
        )
    )
    assert observed_old_value is False
    assert observed_new_value is True
    persisted_value = manager.read_backend_ui_setting_value(
        plugin_id=plugin_id,
        read_handler_id=registration.readHandlerId,
        project_config_id="project-1",
    )
    assert persisted_value is True


def test_backend_ui_setting_compare_and_write_rolls_back_when_validation_fails_with_non_serializable_write_return(
    tmp_path: Path,
) -> None:
    manager = _make_manager(tmp_path)
    plugin_root = tmp_path / "backend-ui-setting-invalid-non-serializable"
    backend_root = plugin_root / "backend"
    backend_root.mkdir(parents=True, exist_ok=True)
    plugin_id = "setta-fixture-backend-ui-setting-invalid-non-serializable"
    (plugin_root / "setta.plugin.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "id": plugin_id,
                "name": "Backend UI Setting Invalid Non-Serializable Fixture",
                "version": "0.1.0",
                "enabledByDefault": True,
                "capabilities": ["registerPane"],
                "backend": {
                    "entrypoint": "backend/entrypoint.py",
                },
            }
        ),
        encoding="utf-8",
    )
    (backend_root / "entrypoint.py").write_text(
        "_STATE = {'enabled': False}\n\n"
        "def _read_enabled(*, project_config_id: str):\n"
        "    return _STATE['enabled']\n\n"
        "def _write_enabled(*, project_config_id: str, value):\n"
        "    if value is True:\n"
        "        _STATE['enabled'] = 'invalid-value'\n"
        "        return object()\n"
        "    _STATE['enabled'] = bool(value)\n"
        "    return object()\n\n"
        "def register(plugin):\n"
        "    plugin.register_ui_setting(\n"
        "        {\n"
        "            'id': 'backend_enabled',\n"
        "            'title': 'Backend Enabled',\n"
        "            'description': 'Enable backend behavior.',\n"
        "            'paneId': 'backend-pane',\n"
        "            'revealKey': 'backend-pane',\n"
        "            'mutability': 'writable',\n"
        "            'valueSchema': {'type': 'boolean'},\n"
        "            'read': _read_enabled,\n"
        "            'write': _write_enabled,\n"
        "        }\n"
        "    )\n",
        encoding="utf-8",
    )

    manager.link_plugin(
        local_plugin_root=str(plugin_root),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    manager.load_backend_plugins(app=FastAPI())
    registration = manager.get_backend_ui_settings(plugin_id=plugin_id)[0]
    write_handler_id = registration.writeHandlerId
    assert write_handler_id is not None

    def _validate_boolean(value: object) -> None:
        if not isinstance(value, bool):
            raise ValueError("Expected boolean value.")

    with pytest.raises(PluginManagerError) as post_write_error:
        manager.compare_and_write_backend_ui_setting_value(
            plugin_id=plugin_id,
            setting_id=f"plugin.{plugin_id}.backend_enabled",
            read_handler_id=registration.readHandlerId,
            write_handler_id=write_handler_id,
            project_config_id="project-1",
            value=True,
            expected_old_value=False,
            validate_old_value=_validate_boolean,
            validate_new_value=_validate_boolean,
        )
    assert (
        post_write_error.value.code
        == "PLUGIN_BACKEND_UI_SETTING_POST_WRITE_VALIDATION_FAILED"
    )
    assert "Rollback restored the previous value." in post_write_error.value.message

    rolled_back_value = manager.read_backend_ui_setting_value(
        plugin_id=plugin_id,
        read_handler_id=registration.readHandlerId,
        project_config_id="project-1",
    )
    assert rolled_back_value is False


def test_backend_ui_setting_compare_and_write_rejects_stale_expected_old_value(
    tmp_path: Path,
) -> None:
    # Compare-and-write must reject stale expected values before mutation.
    manager = _make_manager(tmp_path)
    plugin_root = tmp_path / "backend-ui-setting-cas-fixture"
    backend_root = plugin_root / "backend"
    backend_root.mkdir(parents=True, exist_ok=True)
    (plugin_root / "setta.plugin.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "id": "setta-fixture-backend-ui-setting-cas",
                "name": "Backend UI Setting CAS Fixture",
                "version": "0.1.0",
                "enabledByDefault": True,
                "capabilities": ["registerPane"],
                "backend": {
                    "entrypoint": "backend/entrypoint.py",
                },
            }
        ),
        encoding="utf-8",
    )
    (backend_root / "entrypoint.py").write_text(
        "_STATE = {'enabled': False}\n\n"
        "def _read_enabled(*, project_config_id: str):\n"
        "    return _STATE['enabled']\n\n"
        "def _write_enabled(*, project_config_id: str, value):\n"
        "    _STATE['enabled'] = bool(value)\n"
        "    return {'ok': True}\n\n"
        "def register(plugin):\n"
        "    plugin.register_ui_setting(\n"
        "        {\n"
        "            'id': 'backend_enabled',\n"
        "            'title': 'Backend Enabled',\n"
        "            'description': 'Enable backend behavior.',\n"
        "            'paneId': 'backend-pane',\n"
        "            'revealKey': 'backend-pane',\n"
        "            'synonyms': ['backend enabled'],\n"
        "            'mutability': 'writable',\n"
        "            'valueSchema': {'type': 'boolean'},\n"
        "            'read': _read_enabled,\n"
        "            'write': _write_enabled,\n"
        "        }\n"
        "    )\n",
        encoding="utf-8",
    )

    manager.link_plugin(
        local_plugin_root=str(plugin_root),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    manager.load_backend_plugins(app=FastAPI())
    registrations = manager.get_backend_ui_settings(
        plugin_id="setta-fixture-backend-ui-setting-cas"
    )
    assert len(registrations) == 1
    registration = registrations[0]
    write_handler_id = registration.writeHandlerId
    assert write_handler_id is not None

    with pytest.raises(PluginManagerError) as stale_write_error:
        manager.compare_and_write_backend_ui_setting_value(
            plugin_id="setta-fixture-backend-ui-setting-cas",
            setting_id="plugin.setta-fixture-backend-ui-setting-cas.backend_enabled",
            read_handler_id=registration.readHandlerId,
            write_handler_id=write_handler_id,
            project_config_id="project-1",
            value=True,
            expected_old_value=True,
        )
    assert (
        stale_write_error.value.code
        == "PLUGIN_BACKEND_UI_SETTING_EXPECTED_OLD_VALUE_MISMATCH"
    )
    assert "changed since pre-write validation" in stale_write_error.value.message

    unchanged_value = manager.read_backend_ui_setting_value(
        plugin_id="setta-fixture-backend-ui-setting-cas",
        read_handler_id=registration.readHandlerId,
        project_config_id="project-1",
    )
    assert unchanged_value is False

    observed_old_value, observed_new_value = (
        manager.compare_and_write_backend_ui_setting_value(
            plugin_id="setta-fixture-backend-ui-setting-cas",
            setting_id="plugin.setta-fixture-backend-ui-setting-cas.backend_enabled",
            read_handler_id=registration.readHandlerId,
            write_handler_id=write_handler_id,
            project_config_id="project-1",
            value=True,
            expected_old_value=False,
        )
    )
    assert observed_old_value is False
    assert observed_new_value is True


def test_backend_ui_setting_compare_and_write_same_value_skips_write_handler(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    manager = _make_manager(tmp_path)
    plugin_root = tmp_path / "backend-ui-setting-cas-noop-fixture"
    backend_root = plugin_root / "backend"
    backend_root.mkdir(parents=True, exist_ok=True)
    (plugin_root / "setta.plugin.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "id": "setta-fixture-backend-ui-setting-cas-noop",
                "name": "Backend UI Setting CAS Noop Fixture",
                "version": "0.1.0",
                "enabledByDefault": True,
                "capabilities": ["registerPane"],
                "backend": {
                    "entrypoint": "backend/entrypoint.py",
                },
            }
        ),
        encoding="utf-8",
    )
    (backend_root / "entrypoint.py").write_text(
        "_STATE = {'enabled': False}\n\n"
        "def _read_enabled(*, project_config_id: str):\n"
        "    return _STATE['enabled']\n\n"
        "def _write_enabled(*, project_config_id: str, value):\n"
        "    _STATE['enabled'] = bool(value)\n"
        "    return {'ok': True}\n\n"
        "def register(plugin):\n"
        "    plugin.register_ui_setting(\n"
        "        {\n"
        "            'id': 'backend_enabled',\n"
        "            'title': 'Backend Enabled',\n"
        "            'description': 'Enable backend behavior.',\n"
        "            'paneId': 'backend-pane',\n"
        "            'revealKey': 'backend-pane',\n"
        "            'synonyms': ['backend enabled'],\n"
        "            'mutability': 'writable',\n"
        "            'valueSchema': {'type': 'boolean'},\n"
        "            'read': _read_enabled,\n"
        "            'write': _write_enabled,\n"
        "        }\n"
        "    )\n",
        encoding="utf-8",
    )

    manager.link_plugin(
        local_plugin_root=str(plugin_root),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    manager.load_backend_plugins(app=FastAPI())
    registration = manager.get_backend_ui_settings(
        plugin_id="setta-fixture-backend-ui-setting-cas-noop"
    )[0]
    write_handler_id = registration.writeHandlerId
    assert write_handler_id is not None

    write_handler_calls = 0
    original_invoke_handler = manager._invoke_backend_ui_setting_handler

    def _count_write_handler_invocations(
        *,
        plugin_id: str,
        handler_id: str,
        operation: Literal["read", "write"],
        project_config_id: str,
        value: Any,
    ) -> Any:
        nonlocal write_handler_calls
        if operation == "write":
            write_handler_calls += 1
        return original_invoke_handler(
            plugin_id=plugin_id,
            handler_id=handler_id,
            operation=operation,
            project_config_id=project_config_id,
            value=value,
        )

    monkeypatch.setattr(
        manager,
        "_invoke_backend_ui_setting_handler",
        _count_write_handler_invocations,
    )

    # Same-value CAS writes should return unchanged without invoking write handlers.
    observed_old_value, observed_new_value = (
        manager.compare_and_write_backend_ui_setting_value(
            plugin_id="setta-fixture-backend-ui-setting-cas-noop",
            setting_id=(
                "plugin.setta-fixture-backend-ui-setting-cas-noop.backend_enabled"
            ),
            read_handler_id=registration.readHandlerId,
            write_handler_id=write_handler_id,
            project_config_id="project-1",
            value=False,
            expected_old_value=False,
        )
    )
    assert observed_old_value is False
    assert observed_new_value is False
    assert write_handler_calls == 0


def test_backend_ui_setting_compare_and_write_rolls_back_when_post_write_validation_fails(
    tmp_path: Path,
) -> None:
    manager = _make_manager(tmp_path)
    plugin_root = tmp_path / "backend-ui-setting-invalid-new-value-fixture"
    backend_root = plugin_root / "backend"
    backend_root.mkdir(parents=True, exist_ok=True)
    plugin_id = "setta-fixture-backend-ui-setting-invalid-new"
    (plugin_root / "setta.plugin.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "id": plugin_id,
                "name": "Backend UI Setting Invalid New Value Fixture",
                "version": "0.1.0",
                "enabledByDefault": True,
                "capabilities": ["registerPane"],
                "backend": {
                    "entrypoint": "backend/entrypoint.py",
                },
            }
        ),
        encoding="utf-8",
    )
    (backend_root / "entrypoint.py").write_text(
        "_STATE = {'enabled': False}\n\n"
        "def _read_enabled(*, project_config_id: str):\n"
        "    return _STATE['enabled']\n\n"
        "def _write_enabled(*, project_config_id: str, value):\n"
        "    if value is True:\n"
        "        _STATE['enabled'] = 'invalid-value'\n"
        "    else:\n"
        "        _STATE['enabled'] = bool(value)\n"
        "    return {'ok': True}\n\n"
        "def register(plugin):\n"
        "    plugin.register_ui_setting(\n"
        "        {\n"
        "            'id': 'backend_enabled',\n"
        "            'title': 'Backend Enabled',\n"
        "            'description': 'Enable backend behavior.',\n"
        "            'paneId': 'backend-pane',\n"
        "            'revealKey': 'backend-pane',\n"
        "            'synonyms': ['backend enabled'],\n"
        "            'mutability': 'writable',\n"
        "            'valueSchema': {'type': 'boolean'},\n"
        "            'read': _read_enabled,\n"
        "            'write': _write_enabled,\n"
        "        }\n"
        "    )\n",
        encoding="utf-8",
    )

    manager.link_plugin(
        local_plugin_root=str(plugin_root),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    manager.load_backend_plugins(app=FastAPI())
    registration = manager.get_backend_ui_settings(plugin_id=plugin_id)[0]
    write_handler_id = registration.writeHandlerId
    assert write_handler_id is not None

    def _validate_boolean(value: object) -> None:
        if not isinstance(value, bool):
            raise ValueError("Expected boolean value.")

    with pytest.raises(PluginManagerError) as post_write_error:
        manager.compare_and_write_backend_ui_setting_value(
            plugin_id=plugin_id,
            setting_id=f"plugin.{plugin_id}.backend_enabled",
            read_handler_id=registration.readHandlerId,
            write_handler_id=write_handler_id,
            project_config_id="project-1",
            value=True,
            expected_old_value=False,
            validate_old_value=_validate_boolean,
            validate_new_value=_validate_boolean,
        )
    assert (
        post_write_error.value.code
        == "PLUGIN_BACKEND_UI_SETTING_POST_WRITE_VALIDATION_FAILED"
    )
    assert "Rollback restored the previous value." in post_write_error.value.message

    rolled_back_value = manager.read_backend_ui_setting_value(
        plugin_id=plugin_id,
        read_handler_id=registration.readHandlerId,
        project_config_id="project-1",
    )
    assert rolled_back_value is False


def test_backend_ui_setting_compare_and_write_reports_rollback_failure_after_invalid_post_write_value(
    tmp_path: Path,
) -> None:
    manager = _make_manager(tmp_path)
    plugin_root = tmp_path / "backend-ui-setting-rollback-failure-fixture"
    backend_root = plugin_root / "backend"
    backend_root.mkdir(parents=True, exist_ok=True)
    plugin_id = "setta-fixture-backend-ui-setting-rollback-failure"
    (plugin_root / "setta.plugin.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "id": plugin_id,
                "name": "Backend UI Setting Rollback Failure Fixture",
                "version": "0.1.0",
                "enabledByDefault": True,
                "capabilities": ["registerPane"],
                "backend": {
                    "entrypoint": "backend/entrypoint.py",
                },
            }
        ),
        encoding="utf-8",
    )
    (backend_root / "entrypoint.py").write_text(
        "_STATE = {'enabled': False}\n\n"
        "def _read_enabled(*, project_config_id: str):\n"
        "    return _STATE['enabled']\n\n"
        "def _write_enabled(*, project_config_id: str, value):\n"
        "    if value is True:\n"
        "        _STATE['enabled'] = 'invalid-value'\n"
        "        return {'ok': True}\n"
        "    if value is False:\n"
        "        raise RuntimeError('rollback write failed')\n"
        "    _STATE['enabled'] = bool(value)\n"
        "    return {'ok': True}\n\n"
        "def register(plugin):\n"
        "    plugin.register_ui_setting(\n"
        "        {\n"
        "            'id': 'backend_enabled',\n"
        "            'title': 'Backend Enabled',\n"
        "            'description': 'Enable backend behavior.',\n"
        "            'paneId': 'backend-pane',\n"
        "            'revealKey': 'backend-pane',\n"
        "            'synonyms': ['backend enabled'],\n"
        "            'mutability': 'writable',\n"
        "            'valueSchema': {'type': 'boolean'},\n"
        "            'read': _read_enabled,\n"
        "            'write': _write_enabled,\n"
        "        }\n"
        "    )\n",
        encoding="utf-8",
    )

    manager.link_plugin(
        local_plugin_root=str(plugin_root),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    manager.load_backend_plugins(app=FastAPI())
    registration = manager.get_backend_ui_settings(plugin_id=plugin_id)[0]
    write_handler_id = registration.writeHandlerId
    assert write_handler_id is not None

    def _validate_boolean(value: object) -> None:
        if not isinstance(value, bool):
            raise ValueError("Expected boolean value.")

    with pytest.raises(PluginManagerError) as rollback_failure_error:
        manager.compare_and_write_backend_ui_setting_value(
            plugin_id=plugin_id,
            setting_id=f"plugin.{plugin_id}.backend_enabled",
            read_handler_id=registration.readHandlerId,
            write_handler_id=write_handler_id,
            project_config_id="project-1",
            value=True,
            expected_old_value=False,
            validate_old_value=_validate_boolean,
            validate_new_value=_validate_boolean,
        )
    assert (
        rollback_failure_error.value.code
        == "PLUGIN_BACKEND_UI_SETTING_POST_WRITE_VALIDATION_ROLLBACK_FAILED"
    )
    assert "Rollback failed" in rollback_failure_error.value.message

    persisted_value = manager.read_backend_ui_setting_value(
        plugin_id=plugin_id,
        read_handler_id=registration.readHandlerId,
        project_config_id="project-1",
    )
    assert persisted_value == "invalid-value"


def test_plugin_config_path_compare_and_write_enforces_precondition_and_preserves_keys(
    tmp_path: Path,
) -> None:
    # Schema-backed compare-and-write should reject stale expected values and avoid key loss.
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="full",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    manager.write_plugin_config(
        plugin_id="setta-fixture-full",
        config={"enabled": False, "label": "unset"},
    )

    with pytest.raises(PluginManagerError) as stale_write_error:
        manager.compare_and_write_plugin_config_path_value(
            plugin_id="setta-fixture-full",
            setting_id="plugin::setta-fixture-full::enabled",
            config_path=["enabled"],
            default_value=False,
            value=True,
            expected_old_value=True,
        )
    assert (
        stale_write_error.value.code
        == "PLUGIN_SCHEMA_UI_SETTING_EXPECTED_OLD_VALUE_MISMATCH"
    )
    assert "changed since pre-write validation" in stale_write_error.value.message

    first_old_value, first_new_value = (
        manager.compare_and_write_plugin_config_path_value(
            plugin_id="setta-fixture-full",
            setting_id="plugin::setta-fixture-full::enabled",
            config_path=["enabled"],
            default_value=False,
            value=True,
            expected_old_value=False,
        )
    )
    assert first_old_value is False
    assert first_new_value is True

    second_old_value, second_new_value = (
        manager.compare_and_write_plugin_config_path_value(
            plugin_id="setta-fixture-full",
            setting_id="plugin::setta-fixture-full::label",
            config_path=["label"],
            default_value="",
            value="updated",
            expected_old_value="unset",
        )
    )
    assert second_old_value == "unset"
    assert second_new_value == "updated"

    plugin_entry = next(
        plugin
        for plugin in manager.get_runtime_response().list.plugins
        if plugin.pluginId == "setta-fixture-full"
    )
    assert plugin_entry.config.currentConfig["enabled"] is True
    assert plugin_entry.config.currentConfig["label"] == "updated"


def test_plugin_config_path_compare_and_write_same_value_skips_save_and_rescan(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="full",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    manager.write_plugin_config(
        plugin_id="setta-fixture-full",
        config={"enabled": False, "label": "unset"},
    )

    save_state_calls = 0
    rescan_calls = 0
    original_save_plugins_state = manager._save_plugins_state
    original_rescan = manager.rescan

    def _count_save_plugins_state_calls(state_file) -> None:
        nonlocal save_state_calls
        save_state_calls += 1
        original_save_plugins_state(state_file)

    def _count_rescan_calls() -> None:
        nonlocal rescan_calls
        rescan_calls += 1
        original_rescan()

    monkeypatch.setattr(
        manager,
        "_save_plugins_state",
        _count_save_plugins_state_calls,
    )
    monkeypatch.setattr(manager, "rescan", _count_rescan_calls)

    # No-op schema CAS should return unchanged without persistence or rescan.
    observed_old_value, observed_new_value = (
        manager.compare_and_write_plugin_config_path_value(
            plugin_id="setta-fixture-full",
            setting_id="plugin::setta-fixture-full::enabled",
            config_path=["enabled"],
            default_value=False,
            value=False,
            expected_old_value=False,
        )
    )
    assert observed_old_value is False
    assert observed_new_value is False
    assert save_state_calls == 0
    assert rescan_calls == 0


def test_plugin_config_path_compare_and_write_rejects_non_object_root_without_rewrite(
    tmp_path: Path,
) -> None:
    manager = _make_manager(tmp_path)
    _copy_fixture_to_scope(
        manager=manager,
        fixture_name="full",
        scope=PluginScope.workspace,
    )
    manager.rescan()
    manager.write_plugin_config(
        plugin_id="setta-fixture-full",
        config={"enabled": False, "label": "unset"},
    )
    plugins_state = manager._load_plugins_state()
    config_key = manager._plugin_config_key(
        plugin_id="setta-fixture-full",
        scope=PluginScope.workspace,
    )
    plugins_state.pluginConfigById[config_key] = "invalid-root"
    manager._save_plugins_state(plugins_state)

    with pytest.raises(PluginManagerError) as invalid_root_error:
        manager.compare_and_write_plugin_config_path_value(
            plugin_id="setta-fixture-full",
            setting_id="plugin::setta-fixture-full::enabled",
            config_path=["enabled"],
            default_value=False,
            value=True,
            expected_old_value=False,
        )
    assert invalid_root_error.value.code == "PLUGIN_CONFIG_INVALID"
    assert "non-object node at <root>" in invalid_root_error.value.message

    reloaded_plugins_state = manager._load_plugins_state()
    assert reloaded_plugins_state.pluginConfigById[config_key] == "invalid-root"


def test_plugin_rescan_marks_non_object_config_root_invalid_even_without_required_keys(
    tmp_path: Path,
) -> None:
    manager = _make_manager(tmp_path)
    plugin_root = _copy_fixture_to_scope(
        manager=manager,
        fixture_name="full",
        scope=PluginScope.workspace,
    )
    schema_path = plugin_root / "content" / "config" / "schema.json"
    schema_payload = json.loads(schema_path.read_text(encoding="utf-8"))
    schema_payload["required"] = []
    schema_path.write_text(
        json.dumps(schema_payload, indent=2) + "\n",
        encoding="utf-8",
    )

    manager.rescan()
    manager.write_plugin_config(
        plugin_id="setta-fixture-full",
        config={"label": "unset"},
    )
    config_key = manager._plugin_config_key(
        plugin_id="setta-fixture-full",
        scope=PluginScope.workspace,
    )
    plugins_state = manager._load_plugins_state()
    plugins_state.pluginConfigById[config_key] = "invalid-root"
    manager._save_plugins_state(plugins_state)

    manager.rescan()

    status_entry = next(
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == "setta-fixture-full"
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    )
    assert status_entry.state == PluginRuntimeState.invalid
    assert any(
        error.code == "PLUGIN_CONFIG_INVALID"
        and "non-object node at <root>" in error.message
        for error in status_entry.errors
    )


def test_backend_ui_setting_registration_rejects_invalid_value_schema(
    tmp_path: Path,
) -> None:
    # Invalid backend UI setting schemas should fail registration immediately.
    manager = _make_manager(tmp_path)
    plugin_root = tmp_path / "backend-ui-setting-invalid-schema"
    backend_root = plugin_root / "backend"
    backend_root.mkdir(parents=True, exist_ok=True)
    plugin_id = "setta-fixture-backend-ui-setting-invalid-schema"
    (plugin_root / "setta.plugin.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "id": plugin_id,
                "name": "Backend UI Setting Invalid Schema Fixture",
                "version": "0.1.0",
                "enabledByDefault": True,
                "capabilities": ["registerPane"],
                "backend": {
                    "entrypoint": "backend/entrypoint.py",
                },
            }
        ),
        encoding="utf-8",
    )
    (backend_root / "entrypoint.py").write_text(
        "def _read_enabled(*, project_config_id: str):\n"
        "    return False\n\n"
        "def _write_enabled(*, project_config_id: str, value):\n"
        "    return {'ok': True, 'value': value}\n\n"
        "def register(plugin):\n"
        "    plugin.register_ui_setting(\n"
        "        {\n"
        "            'id': 'backend_enabled',\n"
        "            'title': 'Backend Enabled',\n"
        "            'description': 'Enable backend behavior.',\n"
        "            'paneId': 'backend-pane',\n"
        "            'revealKey': 'backend-pane',\n"
        "            'mutability': 'writable',\n"
        "            'valueSchema': {'type': 'totally_invalid'},\n"
        "            'read': _read_enabled,\n"
        "            'write': _write_enabled,\n"
        "        }\n"
        "    )\n",
        encoding="utf-8",
    )

    manager.link_plugin(
        local_plugin_root=str(plugin_root),
        scope=PluginScope.workspace,
        enable=True,
        force=False,
    )
    manager.load_backend_plugins(app=FastAPI())

    status_entry = next(
        entry
        for entry in manager.get_status_response().plugins
        if entry.pluginId == plugin_id
        and entry.sourceScope == PluginScope.workspace
        and entry.shadowedBySourcePath is None
    )
    assert status_entry.state == PluginRuntimeState.invalid
    assert any(
        error.code == "PLUGIN_BACKEND_REGISTER_FAILED"
        and "valueSchema is invalid" in error.message
        for error in status_entry.errors
    )
    assert manager.get_backend_ui_settings(plugin_id=plugin_id) == []


def test_stderr_pipe_reader_keeps_bounded_tail(tmp_path: Path) -> None:
    # Stderr reader buffering should keep only a bounded tail of lines.
    manager = _make_manager(tmp_path)

    class _LineStream:
        def __init__(self, lines: list[str]) -> None:
            self._lines = lines

        def readline(self) -> str:
            if len(self._lines) == 0:
                return ""
            return self._lines.pop(0)

    stream = _LineStream([f"stderr-{idx}\n" for idx in range(300)] + [""])
    reader = manager._register_worker_pipe_reader(stream, max_buffered_lines=6)
    reader.join(timeout_seconds=1.0)

    buffered: list[str] = []
    while True:
        line = reader.read_line(timeout_seconds=0.0)
        if line is None:
            break
        buffered.append(line)

    assert buffered == [f"stderr-{idx}\n" for idx in range(295, 300)] + [""]


def test_plugin_manager_destructor_skips_shutdown_while_python_finalizes(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # __del__ should avoid shutdown work during interpreter finalization.
    manager = _make_manager(tmp_path)
    shutdown_calls: list[bool] = []

    def _record_shutdown() -> None:
        shutdown_calls.append(True)

    monkeypatch.setattr(manager, "shutdown_backend_plugins", _record_shutdown)
    monkeypatch.setattr("setta.plugins.manager.sys.is_finalizing", lambda: True)

    PluginManager.__del__(manager)
    assert shutdown_calls == []
