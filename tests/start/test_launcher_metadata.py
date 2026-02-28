from pathlib import Path

import setta.launcher_metadata as launcher_metadata
from setta.launcher_metadata import (
    LAUNCHER_METADATA_SCHEMA_VERSION,
    LauncherMetadataError,
    build_launcher_install_metadata,
    launcher_target_validation_error,
    load_launcher_install_metadata,
    resolve_launcher_metadata_path,
    update_launcher_last_used_workspace_if_installed,
    write_launcher_install_metadata,
)


def test_launcher_metadata_roundtrip_preserves_fields(tmp_path: Path) -> None:
    setta_home = tmp_path / ".setta"
    target_executable = tmp_path / "python"
    target_executable.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    target_executable.chmod(0o755)

    metadata = build_launcher_install_metadata(
        target_command=[str(target_executable), "-m", "setta"],
        channel="uv-tool",
        install_source="uv_tool",
        artifact_ownership_token="roundtrip-token",
        setta_version="1.2.3",
        setta_home=setta_home,
        open_mode="browser",
        last_used_workspace=tmp_path / "workspace",
        artifact_options={"app_name": "Setta"},
        managed_artifacts={"macosApp": tmp_path / "Applications" / "Setta.app"},
    )
    metadata_path = write_launcher_install_metadata(
        setta_home=setta_home,
        metadata=metadata,
    )

    assert metadata_path == resolve_launcher_metadata_path(setta_home=setta_home)
    reloaded = load_launcher_install_metadata(setta_home=setta_home)
    assert reloaded is not None
    assert reloaded.schemaVersion == LAUNCHER_METADATA_SCHEMA_VERSION
    assert reloaded.targetCommand == [str(target_executable.resolve(strict=False)), "-m", "setta"]
    assert reloaded.channel == "uv-tool"
    assert reloaded.installSource == "uv_tool"
    assert reloaded.artifactOwnershipToken == "roundtrip-token"
    assert reloaded.settaVersion == "1.2.3"
    assert reloaded.settaHome == str(setta_home.resolve(strict=False))
    assert reloaded.openMode == "browser"
    assert reloaded.lastUsedWorkspace == str((tmp_path / "workspace").resolve(strict=False))
    assert reloaded.artifactOptions == {"app_name": "Setta"}
    assert reloaded.managedArtifacts["macosApp"] == str(
        (tmp_path / "Applications" / "Setta.app").resolve(strict=False)
    )


def test_launcher_target_validation_reports_missing_executable(
    tmp_path: Path,
) -> None:
    setta_home = tmp_path / ".setta"
    metadata = build_launcher_install_metadata(
        target_command=[str(tmp_path / "missing-python"), "-m", "setta"],
        channel="manual",
        install_source="unsupported",
        artifact_ownership_token="validation-token",
        setta_version="1.2.3",
        setta_home=setta_home,
        open_mode="browser",
    )

    error_message = launcher_target_validation_error(metadata)
    assert error_message is not None
    assert "missing" in error_message


def test_launcher_target_validation_reports_non_executable_file(
    tmp_path: Path,
) -> None:
    setta_home = tmp_path / ".setta"
    target_executable = tmp_path / "python"
    target_executable.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    target_executable.chmod(0o644)
    metadata = build_launcher_install_metadata(
        target_command=[str(target_executable), "-m", "setta"],
        channel="manual",
        install_source="unsupported",
        artifact_ownership_token="validation-token-no-exec",
        setta_version="1.2.3",
        setta_home=setta_home,
        open_mode="browser",
    )

    error_message = launcher_target_validation_error(metadata)
    assert error_message is not None
    assert "not executable" in error_message


def test_windows_executable_extension_check_uses_pathext(monkeypatch) -> None:
    monkeypatch.setenv("PATHEXT", ".EXE;.CMD")
    assert (
        launcher_metadata._has_windows_executable_extension(Path("/tmp/setta-tool.EXE"))
        is True
    )
    assert (
        launcher_metadata._has_windows_executable_extension(Path("/tmp/setta-tool.py"))
        is False
    )


def test_update_launcher_last_used_workspace_if_installed(tmp_path: Path) -> None:
    setta_home = tmp_path / ".setta"
    target_executable = tmp_path / "python"
    target_executable.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    target_executable.chmod(0o755)
    metadata = build_launcher_install_metadata(
        target_command=[str(target_executable), "-m", "setta"],
        channel="manual",
        install_source="unsupported",
        artifact_ownership_token="last-used-token",
        setta_version="1.2.3",
        setta_home=setta_home,
        open_mode="browser",
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=metadata)

    updated = update_launcher_last_used_workspace_if_installed(
        setta_home=setta_home,
        workspace_root=tmp_path / "workspace-a",
    )
    assert updated is True
    reloaded = load_launcher_install_metadata(setta_home=setta_home)
    assert reloaded is not None
    assert reloaded.lastUsedWorkspace == str((tmp_path / "workspace-a").resolve(strict=False))


def test_update_launcher_last_used_workspace_if_installed_is_fail_soft_on_write_errors(
    tmp_path: Path,
    monkeypatch,
) -> None:
    setta_home = tmp_path / ".setta"
    target_executable = tmp_path / "python"
    target_executable.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    target_executable.chmod(0o755)
    metadata = build_launcher_install_metadata(
        target_command=[str(target_executable), "-m", "setta"],
        channel="manual",
        install_source="unsupported",
        artifact_ownership_token="last-used-fail-soft-token",
        setta_version="1.2.3",
        setta_home=setta_home,
        open_mode="browser",
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=metadata)

    monkeypatch.setattr(
        "setta.launcher_metadata.write_launcher_install_metadata",
        lambda **_kwargs: (_ for _ in ()).throw(OSError("read-only filesystem")),
    )

    updated = update_launcher_last_used_workspace_if_installed(
        setta_home=setta_home,
        workspace_root=tmp_path / "workspace-a",
    )
    assert updated is False


def test_update_launcher_last_used_workspace_if_installed_is_fail_soft_on_bad_metadata(
    tmp_path: Path,
) -> None:
    setta_home = tmp_path / ".setta"
    metadata_path = resolve_launcher_metadata_path(setta_home=setta_home)
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.write_text("[]", encoding="utf-8")

    updated = update_launcher_last_used_workspace_if_installed(
        setta_home=setta_home,
        workspace_root=tmp_path / "workspace-a",
    )
    assert updated is False


def test_load_launcher_metadata_rejects_non_object_payload(tmp_path: Path) -> None:
    setta_home = tmp_path / ".setta"
    metadata_path = resolve_launcher_metadata_path(setta_home=setta_home)
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.write_text("[]", encoding="utf-8")

    try:
        load_launcher_install_metadata(setta_home=setta_home)
    except LauncherMetadataError as exc:
        assert "JSON object" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("Expected LauncherMetadataError for invalid metadata payload.")


def test_build_launcher_metadata_rejects_invalid_workspace_behavior(
    tmp_path: Path,
) -> None:
    setta_home = tmp_path / ".setta"
    target_executable = tmp_path / "python"
    target_executable.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    target_executable.chmod(0o755)

    try:
        build_launcher_install_metadata(
            target_command=[str(target_executable), "-m", "setta"],
            channel="manual",
            install_source="unsupported",
            artifact_ownership_token="workspace-behavior-token",
            setta_version="1.2.3",
            setta_home=setta_home,
            open_mode="browser",
            workspace_behavior="unexpected_behavior",
        )
    except LauncherMetadataError as exc:
        assert "workspaceBehavior" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("Expected LauncherMetadataError for invalid workspace behavior.")


def test_load_launcher_metadata_rejects_missing_setta_home(tmp_path: Path) -> None:
    setta_home = tmp_path / ".setta"
    metadata_path = resolve_launcher_metadata_path(setta_home=setta_home)
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.write_text(
        """{
  "schemaVersion": 3,
  "targetCommand": ["/usr/bin/python3", "-m", "setta"],
  "channel": "manual",
  "installSource": "unsupported",
  "artifactOwnershipToken": "missing-setta-home-token",
  "settaVersion": "1.2.3",
  "openMode": "browser",
  "workspaceBehavior": "last_used_or_prompt",
  "artifactOptions": {},
  "managedArtifacts": {}
}
""",
        encoding="utf-8",
    )

    try:
        load_launcher_install_metadata(setta_home=setta_home)
    except LauncherMetadataError as exc:
        assert "settaHome" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("Expected LauncherMetadataError for missing settaHome.")
