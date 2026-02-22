import json
import os
import subprocess
import sys
from pathlib import Path

from setta.launcher_metadata import (
    build_launcher_install_metadata,
    write_launcher_install_metadata,
)
from setta.launcher_setup import (
    LauncherSetupError,
    collect_launcher_status,
    remove_launcher_installation,
    repair_launcher_installation,
    setup_launcher_installation,
    update_launcher_installation,
)


def test_collect_launcher_status_reports_not_installed() -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)

    status = collect_launcher_status(setta_home=setta_home)

    assert status.installed is False
    assert status.update_capability == "unsupported"
    assert status.update_guidance is not None


def test_setup_launcher_installation_merges_managed_artifacts(tmp_path: Path) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    artifact_a = tmp_path / "a.txt"
    artifact_b = tmp_path / "b.txt"

    setup_launcher_installation(
        setta_home=setta_home,
        channel="manual",
        open_mode="browser",
        workspace_behavior=None,
        install_artifacts=False,
        managed_artifacts={"a": artifact_a},
    )
    second_setup = setup_launcher_installation(
        setta_home=setta_home,
        channel="manual",
        open_mode="browser",
        workspace_behavior=None,
        install_artifacts=False,
        managed_artifacts={"b": artifact_b},
    )

    assert second_setup.metadata_path.exists()
    assert second_setup.metadata.managedArtifacts == {
        "a": str(artifact_a.resolve(strict=False)),
        "b": str(artifact_b.resolve(strict=False)),
    }


def test_repair_launcher_installation_rebinds_missing_target(tmp_path: Path) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    missing_target = tmp_path / "missing-python"
    metadata = build_launcher_install_metadata(
        target_command=[str(missing_target), "-m", "setta"],
        channel="manual",
        setta_version="1.2.3",
        open_mode="browser",
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=metadata)

    repair_result = repair_launcher_installation(setta_home=setta_home)

    assert repair_result.setup.metadata.targetCommand[0] == str(
        Path(sys.executable).resolve(strict=False)
    )
    assert repair_result.status.target_valid is True
    assert repair_result.status.target_error is None


def test_repair_launcher_installation_preserves_preferences_and_non_platform_artifacts(
    tmp_path: Path,
    monkeypatch,
) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    target = tmp_path / "python"
    target.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    target.chmod(0o755)
    previous_workspace = tmp_path / "workspace-prev"
    previous_workspace.mkdir(parents=True, exist_ok=True)
    custom_artifact = tmp_path / "custom-artifact"
    metadata = build_launcher_install_metadata(
        target_command=[str(target), "-m", "setta"],
        channel="manual",
        setta_version="1.2.3",
        open_mode="chrome-app",
        workspace_behavior="always_prompt",
        last_used_workspace=previous_workspace,
        managed_artifacts={
            "linuxWrapper": str((tmp_path / "old-wrapper").resolve(strict=False)),
            "custom": str(custom_artifact.resolve(strict=False)),
        },
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=metadata)

    new_wrapper = str((tmp_path / "new-wrapper").resolve(strict=False))
    def fake_install_current_platform_artifacts(*, context: object) -> dict[str, str]:
        assert context is not None
        return {"linuxWrapper": new_wrapper}

    monkeypatch.setattr(
        "setta.launcher_setup.install_current_platform_artifacts",
        fake_install_current_platform_artifacts,
    )
    monkeypatch.setattr(
        "setta.launcher_setup.current_platform_artifact_keys",
        lambda: {"linuxWrapper"},
    )

    repair_result = repair_launcher_installation(setta_home=setta_home)

    assert repair_result.setup.metadata.openMode == "chrome-app"
    assert repair_result.setup.metadata.workspaceBehavior == "always_prompt"
    assert repair_result.setup.metadata.lastUsedWorkspace == str(
        previous_workspace.resolve(strict=False)
    )
    assert repair_result.setup.metadata.managedArtifacts["linuxWrapper"] == new_wrapper
    assert repair_result.setup.metadata.managedArtifacts["custom"] == str(
        custom_artifact.resolve(strict=False)
    )


def test_remove_launcher_installation_removes_metadata_and_artifacts(
    tmp_path: Path,
) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    artifact_path = tmp_path / "Applications" / "Setta.app"
    artifact_path.mkdir(parents=True, exist_ok=True)

    metadata = build_launcher_install_metadata(
        target_command=[str(Path(sys.executable).resolve(strict=False)), "-m", "setta"],
        channel="manual",
        setta_version="1.2.3",
        open_mode="browser",
        managed_artifacts={"macosApp": artifact_path},
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=metadata)

    remove_result = remove_launcher_installation(setta_home=setta_home)

    assert remove_result.metadata_removed is True
    assert str(artifact_path.resolve(strict=False)) in remove_result.removed_paths
    assert not artifact_path.exists()
    assert not remove_result.metadata_path.exists()


def test_update_launcher_installation_rejects_installer_managed_channel(
    tmp_path: Path,
) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    target = tmp_path / "python"
    target.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    target.chmod(0o755)
    metadata = build_launcher_install_metadata(
        target_command=[str(target), "-m", "setta"],
        channel="macos-script",
        setta_version="1.2.3",
        open_mode="browser",
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=metadata)

    try:
        update_launcher_installation(setta_home=setta_home)
    except LauncherSetupError as exc:
        assert exc.code == "UpdateUnavailable"
    else:  # pragma: no cover
        raise AssertionError("Expected LauncherSetupError for installer-managed channel.")


def test_update_launcher_installation_runs_uv_and_rebinds(
    tmp_path: Path,
    monkeypatch,
) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    bound_target = tmp_path / "python"
    bound_target.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    bound_target.chmod(0o755)

    metadata = build_launcher_install_metadata(
        target_command=[str(bound_target), "-m", "setta"],
        channel="uv-tool",
        setta_version="1.2.3",
        open_mode="browser",
        managed_artifacts={"wrapper": tmp_path / "wrapper.sh"},
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=metadata)

    uv_bin = str((tmp_path / "bin" / "uv").resolve(strict=False))
    uv_tool_bin = (tmp_path / "uv-tools").resolve(strict=False)
    uv_tool_bin.mkdir(parents=True, exist_ok=True)
    setta_bin = uv_tool_bin / "setta"
    setta_bin.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    setta_bin.chmod(0o755)

    calls: list[list[str]] = []

    def fake_run(
        args: list[str],
        *,
        check: bool,
        capture_output: bool,
        text: bool,
    ) -> subprocess.CompletedProcess[str]:
        assert check is False
        assert capture_output is True
        assert text is True
        calls.append(list(args))
        if args == [uv_bin, "tool", "install", "--upgrade", "setta"]:
            return subprocess.CompletedProcess(args, 0, stdout="", stderr="")
        if args == [uv_bin, "tool", "dir", "--bin"]:
            return subprocess.CompletedProcess(
                args,
                0,
                stdout=f"{uv_tool_bin}\n",
                stderr="",
            )
        if args[0] == str(setta_bin):
            return subprocess.CompletedProcess(
                args,
                0,
                stdout=json.dumps({"ok": True}) + "\n",
                stderr="",
            )
        raise AssertionError(f"Unexpected subprocess call: {args}")

    monkeypatch.setattr(
        "setta.launcher_setup.shutil.which",
        lambda executable: uv_bin if executable == "uv" else None,
    )
    monkeypatch.setattr("setta.launcher_setup.subprocess.run", fake_run)

    update_result = update_launcher_installation(setta_home=setta_home)

    assert update_result.package_spec == "setta"
    assert update_result.from_version == "1.2.3"
    assert update_result.status.installed is True
    assert calls[0] == [uv_bin, "tool", "install", "--upgrade", "setta"]
    assert calls[1] == [uv_bin, "tool", "dir", "--bin"]
    assert "launcher" in calls[2]
    assert "setup" in calls[2]
    assert "--json" in calls[2]
