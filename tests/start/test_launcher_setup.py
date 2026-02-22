import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from setta.launcher_artifacts import current_platform_artifact_keys
from setta.launcher_metadata import (
    build_launcher_install_metadata,
    resolve_launcher_dir,
    resolve_launcher_metadata_path,
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


def _platform_artifact_key() -> str:
    keys = sorted(current_platform_artifact_keys())
    if not keys:
        raise AssertionError("Expected at least one platform artifact key.")
    return keys[0]


def _artifact_path_for_key(*, setta_home: Path, artifact_key: str, label: str) -> Path:
    base = resolve_launcher_dir(setta_home=setta_home) / "artifacts"
    if artifact_key == "macosApp":
        return (base / f"{label}-Setta.app").resolve(strict=False)
    return (base / f"{label}-{artifact_key}").resolve(strict=False)


def _materialize_artifact(path: Path, *, artifact_key: str) -> None:
    if artifact_key == "macosApp":
        path.mkdir(parents=True, exist_ok=True)
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("artifact", encoding="utf-8")


def _ownership_marker_path(artifact_path: Path) -> Path:
    if artifact_path.is_dir() and not artifact_path.is_symlink():
        return artifact_path / ".setta-launcher-owned"
    return artifact_path.parent / f".{artifact_path.name}.setta-launcher-owned"


def _write_ownership_marker(
    *, artifact_key: str, artifact_path: Path, ownership_token: str
) -> None:
    marker_path = _ownership_marker_path(artifact_path)
    marker_path.parent.mkdir(parents=True, exist_ok=True)
    marker_path.write_text(f"{artifact_key}:{ownership_token}\n", encoding="utf-8")


def test_collect_launcher_status_reports_not_installed() -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)

    status = collect_launcher_status(setta_home=setta_home)

    assert status.installed is False
    assert status.update_capability == "unsupported"
    assert status.update_guidance is not None


def test_setup_launcher_installation_rejects_manual_managed_artifacts(
    tmp_path: Path,
) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)

    with pytest.raises(LauncherSetupError) as excinfo:
        setup_launcher_installation(
            setta_home=setta_home,
            channel="manual",
            open_mode="browser",
            workspace_behavior=None,
            install_artifacts=False,
            managed_artifacts={"manual": str(tmp_path / "artifact")},
        )

    assert excinfo.value.code == "BadRequest"
    assert "Manual managed artifacts are not supported" in str(excinfo.value)


def test_setup_launcher_installation_rejects_metadata_outside_trusted_roots(
    tmp_path: Path,
) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    artifact_key = _platform_artifact_key()
    outside_artifact = (tmp_path / "outside-artifact").resolve(strict=False)
    metadata = build_launcher_install_metadata(
        target_command=[str(Path(sys.executable).resolve(strict=False)), "-m", "setta"],
        channel="manual",
        install_source="unsupported",
        artifact_ownership_token="setup-outside-token",
        setta_version="1.2.3",
        open_mode="browser",
        managed_artifacts={artifact_key: outside_artifact},
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=metadata)

    with pytest.raises(LauncherSetupError) as excinfo:
        setup_launcher_installation(
            setta_home=setta_home,
            channel="manual",
            open_mode="browser",
            workspace_behavior=None,
            install_artifacts=False,
        )

    assert excinfo.value.code == "LauncherMetadata"


def test_setup_launcher_installation_validates_planned_paths_before_install(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    outside_artifact = (tmp_path / "outside" / "artifact").resolve(strict=False)
    install_called = False

    def fake_plan_current_platform_artifact_paths(*, context: object) -> dict[str, Path]:
        assert context is not None
        return {"plannedArtifact": outside_artifact}

    def fake_install_current_platform_artifacts(*, context: object) -> dict[str, str]:
        nonlocal install_called
        assert context is not None
        install_called = True
        return {}

    monkeypatch.setattr(
        "setta.launcher_setup.plan_current_platform_artifact_paths",
        fake_plan_current_platform_artifact_paths,
    )
    monkeypatch.setattr(
        "setta.launcher_setup.install_current_platform_artifacts",
        fake_install_current_platform_artifacts,
    )

    with pytest.raises(LauncherSetupError) as excinfo:
        setup_launcher_installation(
            setta_home=setta_home,
            channel="manual",
            open_mode="browser",
            workspace_behavior=None,
            install_artifacts=True,
        )

    assert excinfo.value.code == "BadRequest"
    assert "outside trusted roots" in str(excinfo.value)
    assert install_called is False


def test_setup_launcher_installation_defaults_to_chrome_app_mode() -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)

    setup_result = setup_launcher_installation(
        setta_home=setta_home,
        channel="manual",
        open_mode=None,
        workspace_behavior=None,
        install_artifacts=False,
    )

    assert setup_result.metadata.openMode == "chrome-app"
    assert setup_result.metadata.installSource == "unsupported"


def test_collect_launcher_status_treats_manual_channel_as_unsupported_update() -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)

    setup_launcher_installation(
        setta_home=setta_home,
        channel="manual",
        open_mode="browser",
        workspace_behavior=None,
        install_artifacts=False,
    )

    status = collect_launcher_status(setta_home=setta_home)

    assert status.installed is True
    assert status.update_capability == "unsupported"


def test_repair_launcher_installation_rebinds_missing_target(tmp_path: Path) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    missing_target = tmp_path / "missing-python"
    metadata = build_launcher_install_metadata(
        target_command=[str(missing_target), "-m", "setta"],
        channel="manual",
        install_source="unsupported",
        artifact_ownership_token="repair-token",
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


def test_repair_launcher_installation_preserves_preferences_and_rewrites_platform_artifacts(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    target = tmp_path / "python"
    target.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    target.chmod(0o755)
    previous_workspace = tmp_path / "workspace-prev"
    previous_workspace.mkdir(parents=True, exist_ok=True)
    artifact_key = _platform_artifact_key()
    old_artifact = _artifact_path_for_key(
        setta_home=setta_home,
        artifact_key=artifact_key,
        label="old",
    )
    _materialize_artifact(old_artifact, artifact_key=artifact_key)

    ownership_token = "repair-ownership-token"
    _write_ownership_marker(
        artifact_key=artifact_key,
        artifact_path=old_artifact,
        ownership_token=ownership_token,
    )

    metadata = build_launcher_install_metadata(
        target_command=[str(target), "-m", "setta"],
        channel="manual",
        install_source="unsupported",
        artifact_ownership_token=ownership_token,
        setta_version="1.2.3",
        open_mode="chrome-app",
        workspace_behavior="always_prompt",
        last_used_workspace=previous_workspace,
        managed_artifacts={artifact_key: old_artifact},
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=metadata)

    new_artifact = _artifact_path_for_key(
        setta_home=setta_home,
        artifact_key=artifact_key,
        label="new",
    )

    def fake_install_current_platform_artifacts(*, context: object) -> dict[str, str]:
        assert context is not None
        _materialize_artifact(new_artifact, artifact_key=artifact_key)
        return {artifact_key: str(new_artifact)}

    monkeypatch.setattr(
        "setta.launcher_setup.install_current_platform_artifacts",
        fake_install_current_platform_artifacts,
    )
    monkeypatch.setattr(
        "setta.launcher_setup.current_platform_artifact_keys",
        lambda: {artifact_key},
    )

    repair_result = repair_launcher_installation(setta_home=setta_home)

    assert repair_result.setup.metadata.openMode == "chrome-app"
    assert repair_result.setup.metadata.workspaceBehavior == "always_prompt"
    assert repair_result.setup.metadata.lastUsedWorkspace == str(
        previous_workspace.resolve(strict=False)
    )
    assert repair_result.setup.metadata.managedArtifacts[artifact_key] == str(
        new_artifact.resolve(strict=False)
    )


def test_remove_launcher_installation_removes_metadata_and_artifacts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    artifact_key = _platform_artifact_key()
    artifact_path = _artifact_path_for_key(
        setta_home=setta_home,
        artifact_key=artifact_key,
        label="remove",
    )

    def fake_install_current_platform_artifacts(*, context: object) -> dict[str, str]:
        assert context is not None
        _materialize_artifact(artifact_path, artifact_key=artifact_key)
        return {artifact_key: str(artifact_path)}

    monkeypatch.setattr(
        "setta.launcher_setup.install_current_platform_artifacts",
        fake_install_current_platform_artifacts,
    )
    monkeypatch.setattr(
        "setta.launcher_setup.current_platform_artifact_keys",
        lambda: {artifact_key},
    )

    setup_launcher_installation(
        setta_home=setta_home,
        channel="uv-tool",
        open_mode="browser",
        workspace_behavior=None,
        install_artifacts=True,
    )

    remove_result = remove_launcher_installation(setta_home=setta_home)

    assert remove_result.metadata_removed is True
    assert str(artifact_path.resolve(strict=False)) in remove_result.removed_paths
    assert not artifact_path.exists()
    assert not remove_result.metadata_path.exists()


def test_remove_launcher_installation_preserves_metadata_when_artifact_removal_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    artifact_key = _platform_artifact_key()
    artifact_path = _artifact_path_for_key(
        setta_home=setta_home,
        artifact_key=artifact_key,
        label="removal-failure",
    )

    def fake_install_current_platform_artifacts(*, context: object) -> dict[str, str]:
        assert context is not None
        _materialize_artifact(artifact_path, artifact_key=artifact_key)
        return {artifact_key: str(artifact_path)}

    monkeypatch.setattr(
        "setta.launcher_setup.install_current_platform_artifacts",
        fake_install_current_platform_artifacts,
    )
    monkeypatch.setattr(
        "setta.launcher_setup.current_platform_artifact_keys",
        lambda: {artifact_key},
    )

    setup_launcher_installation(
        setta_home=setta_home,
        channel="uv-tool",
        open_mode="browser",
        workspace_behavior=None,
        install_artifacts=True,
    )

    metadata_path = resolve_launcher_metadata_path(setta_home=setta_home)
    original_unlink = Path.unlink
    original_rmtree = shutil.rmtree

    def fail_unlink(path: Path, *args, **kwargs) -> None:
        if path.resolve(strict=False) == artifact_path.resolve(strict=False):
            raise OSError("permission denied")
        original_unlink(path, *args, **kwargs)

    def fail_rmtree(path: Path, *args, **kwargs) -> None:
        if path.resolve(strict=False) == artifact_path.resolve(strict=False):
            raise OSError("permission denied")
        original_rmtree(path, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", fail_unlink)
    monkeypatch.setattr("setta.launcher_setup.shutil.rmtree", fail_rmtree)

    with pytest.raises(LauncherSetupError) as excinfo:
        remove_launcher_installation(setta_home=setta_home)

    assert excinfo.value.code == "ArtifactRemovalFailed"
    assert metadata_path.exists()


def test_remove_launcher_installation_rejects_metadata_outside_trusted_roots(
    tmp_path: Path,
) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    artifact_key = _platform_artifact_key()
    outside_artifact = (tmp_path / "outside-artifact").resolve(strict=False)

    metadata = build_launcher_install_metadata(
        target_command=[str(Path(sys.executable).resolve(strict=False)), "-m", "setta"],
        channel="uv-tool",
        install_source="uv_tool",
        artifact_ownership_token="outside-token",
        setta_version="1.2.3",
        open_mode="browser",
        managed_artifacts={artifact_key: outside_artifact},
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=metadata)

    with pytest.raises(LauncherSetupError) as excinfo:
        remove_launcher_installation(setta_home=setta_home)

    assert excinfo.value.code == "LauncherMetadata"
    assert resolve_launcher_metadata_path(setta_home=setta_home).exists()


def test_remove_launcher_installation_requires_ownership_markers() -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    artifact_key = _platform_artifact_key()
    artifact_path = _artifact_path_for_key(
        setta_home=setta_home,
        artifact_key=artifact_key,
        label="missing-marker",
    )
    _materialize_artifact(artifact_path, artifact_key=artifact_key)

    metadata = build_launcher_install_metadata(
        target_command=[str(Path(sys.executable).resolve(strict=False)), "-m", "setta"],
        channel="uv-tool",
        install_source="uv_tool",
        artifact_ownership_token="missing-marker-token",
        setta_version="1.2.3",
        open_mode="browser",
        managed_artifacts={artifact_key: artifact_path},
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=metadata)

    with pytest.raises(LauncherSetupError) as excinfo:
        remove_launcher_installation(setta_home=setta_home)

    assert excinfo.value.code == "ArtifactRemovalFailed"
    assert artifact_path.exists()
    assert resolve_launcher_metadata_path(setta_home=setta_home).exists()


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
        install_source="installer_managed",
        artifact_ownership_token="installer-managed-token",
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
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    bound_target = tmp_path / "python"
    bound_target.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    bound_target.chmod(0o755)

    metadata = build_launcher_install_metadata(
        target_command=[str(bound_target), "-m", "setta"],
        channel="uv-tool",
        install_source="uv_tool",
        artifact_ownership_token="uv-tool-token",
        setta_version="1.2.3",
        open_mode="browser",
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
