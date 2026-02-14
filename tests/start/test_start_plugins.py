import json
import os
from pathlib import Path
from typing import Callable
import zipfile

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


def test_plugins_lock_write_and_apply_cli_json_roundtrip(
    tmp_path: Path,
    monkeypatch,
) -> None:
    manager = _build_manager(tmp_path)
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
            installer="pip",
            scope="workspace",
            enable=True,
            force=False,
        )

        monkeypatch.setattr(
            start_module,
            "_build_plugin_manager_for_cli",
            lambda: manager,
        )
        runner = CliRunner()

        write_result = runner.invoke(plugins, ["lock", "write", "--json"])
        assert write_result.exit_code == 0, write_result.output
        write_payload = json.loads(write_result.output)
        assert write_payload["pluginCount"] == 1
        assert Path(write_payload["lockfilePath"]).exists()

        manager.uninstall_plugin(
            plugin_id="setta-fixture-frontend",
            scope="workspace",
        )

        check_result = runner.invoke(plugins, ["lock", "apply", "--check", "--json"])
        assert check_result.exit_code == 0, check_result.output
        check_payload = json.loads(check_result.output)
        assert check_payload["applied"] is False
        assert any(
            "install setta-fixture-frontend in workspace" in item
            for item in check_payload["plannedChanges"]
        )

        apply_result = runner.invoke(plugins, ["lock", "apply", "--json"])
        assert apply_result.exit_code == 0, apply_result.output
        apply_payload = json.loads(apply_result.output)
        assert apply_payload["applied"] is True
    finally:
        if old_no_index is None:
            os.environ.pop("PIP_NO_INDEX", None)
        else:
            os.environ["PIP_NO_INDEX"] = old_no_index
        if old_find_links is None:
            os.environ.pop("PIP_FIND_LINKS", None)
        else:
            os.environ["PIP_FIND_LINKS"] = old_find_links
