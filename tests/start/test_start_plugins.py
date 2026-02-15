import json
import os
from pathlib import Path
from typing import Callable
import zipfile

from click.testing import CliRunner
from fastapi import FastAPI

import setta.start as start_module
from setta.plugins.errors import PluginManagerError
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
    monkeypatch.setattr(
        start_module,
        "_build_plugin_manager_for_cli_without_rescan",
        lambda: manager,
    )

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


def test_plugins_install_cli_rejects_scope_and_shortcut_conflicts(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Install CLI should reject combining --scope with shortcut scope flags.
    manager = _build_manager(tmp_path)
    monkeypatch.setattr(start_module, "_build_plugin_manager_for_cli", lambda: manager)
    runner = CliRunner()

    result = runner.invoke(
        plugins,
        [
            "install",
            "pypi:setta-fixture-frontend==0.1.0",
            "--scope",
            "workspace",
            "--global",
        ],
    )

    assert result.exit_code != 0
    assert "Use either --scope or scope shortcut flags, not both." in result.output


def test_plugins_uninstall_cli_rejects_multiple_scope_shortcuts(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Uninstall CLI should reject conflicting shortcut scope flags.
    manager = _build_manager(tmp_path)
    monkeypatch.setattr(start_module, "_build_plugin_manager_for_cli", lambda: manager)
    runner = CliRunner()

    result = runner.invoke(
        plugins,
        [
            "uninstall",
            "setta-fixture-frontend",
            "--global",
            "--setta-files",
        ],
    )

    assert result.exit_code != 0
    assert "Use only one of --global or --setta-files." in result.output


def test_plugins_install_cli_rejects_removed_environment_flag(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Install CLI should reject removed legacy scope flags.
    manager = _build_manager(tmp_path)
    monkeypatch.setattr(start_module, "_build_plugin_manager_for_cli", lambda: manager)
    runner = CliRunner()

    result = runner.invoke(
        plugins,
        [
            "install",
            "pypi:setta-fixture-frontend==0.1.0",
            "--environment",
        ],
    )

    assert result.exit_code != 0
    assert "No such option: --environment" in result.output


def test_plugins_install_cli_rejects_removed_environment_scope_value(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Install CLI should reject legacy scope values and point to canonical choices.
    manager = _build_manager(tmp_path)
    monkeypatch.setattr(start_module, "_build_plugin_manager_for_cli", lambda: manager)
    runner = CliRunner()

    result = runner.invoke(
        plugins,
        [
            "install",
            "pypi:setta-fixture-frontend==0.1.0",
            "--scope",
            "environment",
        ],
    )

    assert result.exit_code != 0
    assert "Invalid value for '--scope'" in result.output
    assert "setta_files" in result.output


def test_plugins_list_cli_text_reports_no_plugins(tmp_path: Path, monkeypatch) -> None:
    # Text-mode plugin list should emit an explicit empty-state message.
    manager = _build_manager(tmp_path)
    monkeypatch.setattr(start_module, "_build_plugin_manager_for_cli", lambda: manager)
    runner = CliRunner()

    result = runner.invoke(plugins, ["list"])
    assert result.exit_code == 0, result.output
    assert "No plugins discovered." in result.output


def test_plugins_list_cli_text_includes_restart_shadowed_and_errors(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Text-mode list should include restart markers, shadowed suffixes, and error detail lines.
    manager = _build_manager(tmp_path)
    manager.link_plugin(
        local_plugin_root=str(FIXTURE_PLUGIN_ROOT / "backend"),
        scope="workspace",
        enable=True,
        force=False,
    )
    manager.link_plugin(
        local_plugin_root=str(FIXTURE_PLUGIN_ROOT / "frontend"),
        scope="global",
        enable=True,
        force=True,
    )
    manager.link_plugin(
        local_plugin_root=str(FIXTURE_PLUGIN_ROOT / "frontend"),
        scope="workspace",
        enable=True,
        force=True,
    )
    broken_root = manager.setta_files_root / "plugins" / "broken-plugin"
    broken_root.mkdir(parents=True, exist_ok=True)
    (broken_root / "setta.plugin.json").write_text("{not-json", encoding="utf-8")
    manager.rescan()

    monkeypatch.setattr(start_module, "_build_plugin_manager_for_cli", lambda: manager)
    runner = CliRunner()
    result = runner.invoke(plugins, ["list"])

    assert result.exit_code == 0, result.output
    assert "(restart required)" in result.output
    assert "shadowed_by=" in result.output
    assert "PLUGIN_MANIFEST_INVALID" in result.output


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


def test_plugins_link_enable_disable_rescan_unlink_and_restart_cli_json(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # CLI should support link/unlink, state toggles, rescan, list, and restart JSON flows.
    manager = _build_manager(tmp_path, restart_callback=lambda: True)
    monkeypatch.setattr(start_module, "_build_plugin_manager_for_cli", lambda: manager)
    monkeypatch.setattr(
        start_module,
        "_build_plugin_manager_for_cli_without_rescan",
        lambda: manager,
    )
    runner = CliRunner()
    fixture_root = FIXTURE_PLUGIN_ROOT / "frontend"

    link_result = runner.invoke(
        plugins,
        [
            "link",
            str(fixture_root),
            "--scope",
            "workspace",
            "--json",
        ],
    )
    assert link_result.exit_code == 0, link_result.output
    link_payload = json.loads(link_result.output)
    assert link_payload["pluginId"] == "setta-fixture-frontend"

    list_result = runner.invoke(plugins, ["list", "--json"])
    assert list_result.exit_code == 0, list_result.output
    list_payload = json.loads(list_result.output)
    assert any(
        entry["pluginId"] == "setta-fixture-frontend"
        for entry in list_payload["plugins"]
    )

    disable_result = runner.invoke(
        plugins,
        ["disable", "setta-fixture-frontend", "--json"],
    )
    assert disable_result.exit_code == 0, disable_result.output
    assert json.loads(disable_result.output)["state"] == "disabled"

    enable_result = runner.invoke(
        plugins,
        ["enable", "setta-fixture-frontend", "--json"],
    )
    assert enable_result.exit_code == 0, enable_result.output
    assert json.loads(enable_result.output)["state"] == "active"

    rescan_result = runner.invoke(plugins, ["rescan", "--json"])
    assert rescan_result.exit_code == 0, rescan_result.output
    rescan_payload = json.loads(rescan_result.output)
    assert rescan_payload["installedPlugins"] == 1
    assert rescan_payload["activePlugins"] == 1

    restart_result = runner.invoke(plugins, ["restart", "--json"])
    assert restart_result.exit_code == 0, restart_result.output
    assert json.loads(restart_result.output) == {
        "accepted": True,
        "mode": "programmatic",
        "command": None,
        "reason": None,
    }

    unlink_result = runner.invoke(
        plugins,
        ["unlink", "setta-fixture-frontend", "--scope", "workspace", "--json"],
    )
    assert unlink_result.exit_code == 0, unlink_result.output
    unlink_payload = json.loads(unlink_result.output)
    assert unlink_payload["pluginId"] == "setta-fixture-frontend"


def test_plugins_restart_cli_surfaces_plugin_manager_errors(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Restart CLI should map PluginManagerError values to ClickException output.
    manager = _build_manager(tmp_path)

    def _raise_restart_error() -> dict[str, object]:
        raise PluginManagerError(
            "PLUGIN_RESTART_FAILED",
            "Programmatic restart callback failed: boom",
        )

    monkeypatch.setattr(manager, "restart_backend", _raise_restart_error)
    monkeypatch.setattr(start_module, "_build_plugin_manager_for_cli", lambda: manager)
    monkeypatch.setattr(
        start_module,
        "_build_plugin_manager_for_cli_without_rescan",
        lambda: manager,
    )
    runner = CliRunner()

    result = runner.invoke(plugins, ["restart"])
    assert result.exit_code != 0
    assert "PLUGIN_RESTART_FAILED: Programmatic restart callback failed: boom" in result.output


def test_plugins_init_and_validate_cli_flow(tmp_path: Path, monkeypatch) -> None:
    # CLI init/validate should scaffold and validate a plugin template end-to-end.
    manager = _build_manager(tmp_path)
    monkeypatch.setattr(start_module, "_build_plugin_manager_for_cli", lambda: manager)
    runner = CliRunner()

    init_result = runner.invoke(
        plugins,
        [
            "init",
            "setta-cli-init-fixture",
            "--template",
            "frontend",
            "--out",
            str(tmp_path),
        ],
    )
    assert init_result.exit_code == 0, init_result.output
    plugin_root = tmp_path / "setta-cli-init-fixture"
    assert plugin_root.exists()
    assert (plugin_root / "setta.plugin.json").exists()

    validate_result = runner.invoke(
        plugins,
        ["validate", str(plugin_root)],
    )
    assert validate_result.exit_code == 0, validate_result.output
    assert "Plugin manifest is valid" in validate_result.output


def test_plugins_validate_cli_reports_plugin_manager_errors(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # Validate should surface PluginManagerError payloads through Click exceptions.
    manager = _build_manager(tmp_path)
    monkeypatch.setattr(start_module, "_build_plugin_manager_for_cli", lambda: manager)
    runner = CliRunner()
    invalid_plugin_root = tmp_path / "invalid-plugin-root"
    invalid_plugin_root.mkdir(parents=True, exist_ok=True)

    validate_result = runner.invoke(
        plugins,
        ["validate", str(invalid_plugin_root)],
    )
    assert validate_result.exit_code != 0
    assert "PLUGIN_SOURCE_MANIFEST_NOT_FOUND" in validate_result.output


def test_plugins_install_update_pin_rollback_and_uninstall_cli_json(
    tmp_path: Path,
    monkeypatch,
) -> None:
    # CLI lifecycle commands should roundtrip install/update/pin/rollback/uninstall JSON payloads.
    manager = _build_manager(tmp_path)
    package_name = "setta-fixture-frontend"
    version = "0.1.0"
    artifact = _build_local_pypi_wheel_from_fixture(
        tmp_path=tmp_path,
        fixture_name="frontend",
        package_name=package_name,
        version=version,
    )
    monkeypatch.setattr(start_module, "_build_plugin_manager_for_cli", lambda: manager)
    runner = CliRunner()

    old_no_index = os.environ.get("PIP_NO_INDEX")
    old_find_links = os.environ.get("PIP_FIND_LINKS")
    os.environ["PIP_NO_INDEX"] = "1"
    os.environ["PIP_FIND_LINKS"] = str(artifact.parent)
    try:
        install_result = runner.invoke(
            plugins,
            [
                "install",
                f"pypi:{package_name}=={version}",
                "--scope",
                "workspace",
                "--installer",
                "pip",
                "--json",
            ],
        )
        assert install_result.exit_code == 0, install_result.output
        install_payload = json.loads(install_result.output)
        assert install_payload["pluginId"] == package_name

        update_result = runner.invoke(
            plugins,
            ["update", package_name, "--scope", "workspace", "--json"],
        )
        assert update_result.exit_code == 0, update_result.output
        update_payload = json.loads(update_result.output)
        assert update_payload["pluginId"] == package_name
        assert update_payload["fromVersion"] == version
        assert update_payload["toVersion"] == version

        pin_result = runner.invoke(
            plugins,
            ["pin", package_name, version, "--scope", "workspace", "--json"],
        )
        assert pin_result.exit_code == 0, pin_result.output
        pin_payload = json.loads(pin_result.output)
        assert pin_payload["pluginId"] == package_name
        assert pin_payload["toVersion"] == version

        rollback_result = runner.invoke(
            plugins,
            ["rollback", package_name, "--scope", "workspace", "--json"],
        )
        assert rollback_result.exit_code == 0, rollback_result.output
        rollback_payload = json.loads(rollback_result.output)
        assert rollback_payload["pluginId"] == package_name
        assert rollback_payload["restoredVersion"] == version

        uninstall_result = runner.invoke(
            plugins,
            ["uninstall", package_name, "--scope", "workspace", "--json"],
        )
        assert uninstall_result.exit_code == 0, uninstall_result.output
        uninstall_payload = json.loads(uninstall_result.output)
        assert uninstall_payload["pluginId"] == package_name
        assert uninstall_payload["removedFromScope"] == "workspace"
    finally:
        if old_no_index is None:
            os.environ.pop("PIP_NO_INDEX", None)
        else:
            os.environ["PIP_NO_INDEX"] = old_no_index
        if old_find_links is None:
            os.environ.pop("PIP_FIND_LINKS", None)
        else:
            os.environ["PIP_FIND_LINKS"] = old_find_links
