import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

from click.testing import CliRunner

from setta.launcher_metadata import (
    build_launcher_install_metadata,
    resolve_launcher_metadata_path,
    write_launcher_install_metadata,
)
from setta.start import _open_url_with_launcher_mode, cli


def _fake_launch_result(*, workspace_root: Path, setta_home: Path) -> SimpleNamespace:
    resolved_workspace = workspace_root.resolve(strict=False)
    session = SimpleNamespace(
        id="session-1",
        workspacePath=str(resolved_workspace),
        workspacePathCanonical=str(resolved_workspace),
        host="127.0.0.1",
        port=61234,
        pid=12345,
        startedAt=datetime.now(timezone.utc),
    )
    paths = SimpleNamespace(
        workspace_root=resolved_workspace,
        setta_files_location="local",
        setta_files_root=(resolved_workspace / "setta_files").resolve(strict=False),
        runtime_root=(resolved_workspace / "setta_files" / "runtime").resolve(
            strict=False
        ),
        setta_home=setta_home.resolve(strict=False),
        profile_name=None,
    )
    registry = SimpleNamespace(load_secret=lambda _session: b"secret")
    return SimpleNamespace(
        session=session,
        registry=registry,
        paths=paths,
        started_new=False,
    )


def test_launcher_json_uses_home_fallback_workspace_and_requests_switcher(
    monkeypatch,
) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    captured: dict[str, object] = {}

    def fake_launch_workspace_session(**kwargs):
        workspace_root = kwargs["workspace_root"]
        captured["workspace_root"] = workspace_root
        captured["setta_files_location"] = kwargs["setta_files_location"]
        captured["server_mode"] = kwargs["server_mode"]
        return _fake_launch_result(
            workspace_root=workspace_root,
            setta_home=setta_home,
        )

    monkeypatch.setattr("setta.start.launch_workspace_session", fake_launch_workspace_session)
    monkeypatch.setattr("setta.start.BOOTSTRAP_TOKEN_MANAGER.mint", lambda *_a, **_k: "tok")
    monkeypatch.setattr(
        "setta.start.build_bootstrap_urls",
        lambda host, port, token: (
            f"http://{host}:{port}/__setta__/bootstrap#token={token}",
            f"http://{host}:{port}/__setta__/bootstrap",
        ),
    )

    runner = CliRunner()
    result = runner.invoke(cli, ["launcher", "--json"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["ok"] is True
    assert payload["openWorkspaceSwitcher"] is True
    assert payload["sessionServerMode"] == "launcher"
    assert payload["openMode"] == "chrome-app"
    assert payload["bootstrapUrl"].endswith("#token=tok&osw=1")

    expected_workspace = Path.home().resolve(strict=False)
    assert payload["workspaceRoot"] == str(expected_workspace)
    assert Path(str(captured["workspace_root"])).resolve(strict=False) == expected_workspace
    assert captured["setta_files_location"] == "global"
    assert captured["server_mode"] == "launcher"


def test_launcher_json_prefers_last_used_workspace_from_metadata(
    tmp_path: Path,
    monkeypatch,
) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    target_executable = tmp_path / "python"
    target_executable.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    target_executable.chmod(0o755)
    last_used_workspace = tmp_path / "workspace-a"
    last_used_workspace.mkdir(parents=True, exist_ok=True)
    metadata = build_launcher_install_metadata(
        target_command=[str(target_executable), "-m", "setta"],
        channel="manual",
        install_source="unsupported",
        artifact_ownership_token="last-used-token",
        setta_version="1.2.3",
        setta_home=setta_home,
        open_mode="chrome-app",
        last_used_workspace=last_used_workspace,
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=metadata)

    captured: dict[str, object] = {}

    def fake_launch_workspace_session(**kwargs):
        workspace_root = kwargs["workspace_root"]
        captured["server_mode"] = kwargs["server_mode"]
        return _fake_launch_result(
            workspace_root=workspace_root,
            setta_home=setta_home,
        )

    monkeypatch.setattr("setta.start.launch_workspace_session", fake_launch_workspace_session)
    monkeypatch.setattr("setta.start.BOOTSTRAP_TOKEN_MANAGER.mint", lambda *_a, **_k: "tok")
    monkeypatch.setattr(
        "setta.start.build_bootstrap_urls",
        lambda host, port, token: (
            f"http://{host}:{port}/__setta__/bootstrap#token={token}",
            f"http://{host}:{port}/__setta__/bootstrap",
        ),
    )

    runner = CliRunner()
    result = runner.invoke(cli, ["launcher", "--json"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["ok"] is True
    assert payload["openWorkspaceSwitcher"] is False
    assert payload["sessionServerMode"] == "ide"
    assert payload["workspaceRoot"] == str(last_used_workspace.resolve(strict=False))
    assert payload["openMode"] == "chrome-app"
    assert captured["server_mode"] == "ide"


def test_launcher_json_honors_always_prompt_workspace_behavior(
    tmp_path: Path,
    monkeypatch,
) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    target_executable = tmp_path / "python"
    target_executable.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    target_executable.chmod(0o755)
    last_used_workspace = tmp_path / "workspace-a"
    last_used_workspace.mkdir(parents=True, exist_ok=True)
    metadata = build_launcher_install_metadata(
        target_command=[str(target_executable), "-m", "setta"],
        channel="manual",
        install_source="unsupported",
        artifact_ownership_token="always-prompt-token",
        setta_version="1.2.3",
        setta_home=setta_home,
        open_mode="browser",
        workspace_behavior="always_prompt",
        last_used_workspace=last_used_workspace,
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=metadata)

    captured: dict[str, object] = {}

    def fake_launch_workspace_session(**kwargs):
        workspace_root = kwargs["workspace_root"]
        captured["setta_files_location"] = kwargs["setta_files_location"]
        captured["server_mode"] = kwargs["server_mode"]
        return _fake_launch_result(
            workspace_root=workspace_root,
            setta_home=setta_home,
        )

    monkeypatch.setattr("setta.start.launch_workspace_session", fake_launch_workspace_session)
    monkeypatch.setattr("setta.start.BOOTSTRAP_TOKEN_MANAGER.mint", lambda *_a, **_k: "tok")
    monkeypatch.setattr(
        "setta.start.build_bootstrap_urls",
        lambda host, port, token: (
            f"http://{host}:{port}/__setta__/bootstrap#token={token}",
            f"http://{host}:{port}/__setta__/bootstrap",
        ),
    )

    runner = CliRunner()
    result = runner.invoke(cli, ["launcher", "--json"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["ok"] is True
    assert payload["workspaceBehavior"] == "always_prompt"
    assert payload["openWorkspaceSwitcher"] is True
    assert payload["sessionServerMode"] == "launcher"
    assert payload["workspaceRoot"] == str(Path.home().resolve(strict=False))
    assert captured["setta_files_location"] == "global"
    assert captured["server_mode"] == "launcher"


def test_launcher_json_reports_missing_bound_target(
    tmp_path: Path,
) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    metadata = build_launcher_install_metadata(
        target_command=[str(tmp_path / "missing-python"), "-m", "setta"],
        channel="manual",
        install_source="unsupported",
        artifact_ownership_token="missing-target-token",
        setta_version="1.2.3",
        setta_home=setta_home,
        open_mode="browser",
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=metadata)

    runner = CliRunner()
    result = runner.invoke(cli, ["launcher", "--json"])

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "LauncherTargetMissing"


def test_launcher_json_reports_internal_error_for_unexpected_failures(
    tmp_path: Path,
    monkeypatch,
) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir(parents=True, exist_ok=True)

    def fake_launch_workspace_session(**kwargs):
        workspace = kwargs["workspace_root"]
        return _fake_launch_result(
            workspace_root=workspace,
            setta_home=setta_home,
        )

    monkeypatch.setattr("setta.start.launch_workspace_session", fake_launch_workspace_session)
    monkeypatch.setattr(
        "setta.start.BOOTSTRAP_TOKEN_MANAGER.mint",
        lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("boom")),
    )

    runner = CliRunner()
    result = runner.invoke(
        cli,
        ["launcher", "--json", "--workspace", str(workspace_root)],
    )

    assert result.exit_code == 1
    payload = json.loads(result.output)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "InternalError"
    assert payload["error"]["message"] == "Unexpected launcher failure. Check logs for details."


def test_launcher_json_ignores_metadata_persistence_os_errors(
    tmp_path: Path,
    monkeypatch,
) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir(parents=True, exist_ok=True)

    def fake_launch_workspace_session(**kwargs):
        workspace = kwargs["workspace_root"]
        return _fake_launch_result(
            workspace_root=workspace,
            setta_home=setta_home,
        )

    monkeypatch.setattr("setta.start.launch_workspace_session", fake_launch_workspace_session)
    monkeypatch.setattr("setta.start.BOOTSTRAP_TOKEN_MANAGER.mint", lambda *_a, **_k: "tok")
    monkeypatch.setattr(
        "setta.start.build_bootstrap_urls",
        lambda host, port, token: (
            f"http://{host}:{port}/__setta__/bootstrap#token={token}",
            f"http://{host}:{port}/__setta__/bootstrap",
        ),
    )
    monkeypatch.setattr(
        "setta.start.update_launcher_last_used_workspace_if_installed",
        lambda **_kwargs: (_ for _ in ()).throw(OSError("disk full")),
    )

    runner = CliRunner()
    result = runner.invoke(
        cli,
        ["launcher", "--json", "--workspace", str(workspace_root)],
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["ok"] is True
    assert payload["workspaceRoot"] == str(workspace_root.resolve(strict=False))


def test_launcher_legacy_install_and_uninstall_commands_are_removed() -> None:
    runner = CliRunner()
    install_result = runner.invoke(cli, ["launcher", "install", "--json"])
    remove_result = runner.invoke(cli, ["launcher", "uninstall", "--json"])

    assert install_result.exit_code != 0
    assert "No such command 'install'" in install_result.output
    assert remove_result.exit_code != 0
    assert "No such command 'uninstall'" in remove_result.output


def test_open_url_with_launcher_mode_falls_back_to_browser(monkeypatch) -> None:
    opened_urls: list[str] = []
    monkeypatch.setattr("setta.start._open_url_in_chrome_app", lambda _url: False)

    def fake_open(url: str, new: int = 0) -> None:
        assert new == 0
        opened_urls.append(url)

    monkeypatch.setattr(
        "setta.start.webbrowser.open",
        fake_open,
    )

    resolved_mode = _open_url_with_launcher_mode(
        "http://127.0.0.1:61234/__setta__/bootstrap#token=tok",
        "chrome-app",
    )

    assert resolved_mode == "browser"
    assert opened_urls == ["http://127.0.0.1:61234/__setta__/bootstrap#token=tok"]


def test_open_url_in_chrome_app_macos_retries_with_new_instance(monkeypatch) -> None:
    import setta.start as start_module
    from setta.start import _open_url_in_chrome_app

    monkeypatch.setattr(sys, "platform", "darwin")
    monkeypatch.setattr(start_module.time, "sleep", lambda _seconds: None)

    ps_calls = 0
    open_calls: list[list[str]] = []

    def fake_run(cmd: list[str], **kwargs):
        nonlocal ps_calls
        assert kwargs.get("check") is False
        if cmd[:3] == ["ps", "ax", "-o"]:
            ps_calls += 1
            if ps_calls >= 11:
                return subprocess.CompletedProcess(
                    cmd,
                    0,
                    stdout=(
                        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome "
                        "--app=https://example.com\n"
                    ),
                    stderr="",
                )
            return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
        if cmd[0] == "open":
            open_calls.append(cmd)
            return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
        raise AssertionError(f"Unexpected command: {cmd}")

    monkeypatch.setattr("setta.start.subprocess.run", fake_run)

    opened = _open_url_in_chrome_app("https://example.com")

    assert opened is True
    assert open_calls[0] == [
        "open",
        "-a",
        "Google Chrome",
        "--args",
        "--app=https://example.com",
    ]
    assert open_calls[1] == [
        "open",
        "-n",
        "-a",
        "Google Chrome",
        "--args",
        "--app=https://example.com",
    ]


def test_open_url_in_chrome_app_macos_returns_false_when_not_visible(
    monkeypatch,
) -> None:
    import setta.start as start_module
    from setta.start import _open_url_in_chrome_app

    monkeypatch.setattr(sys, "platform", "darwin")
    monkeypatch.setattr(start_module.time, "sleep", lambda _seconds: None)

    def fake_run(cmd: list[str], **kwargs):
        assert kwargs.get("check") is False
        if cmd[:3] == ["ps", "ax", "-o"]:
            return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
        if cmd[0] == "open":
            return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
        raise AssertionError(f"Unexpected command: {cmd}")

    monkeypatch.setattr("setta.start.subprocess.run", fake_run)

    opened = _open_url_in_chrome_app("https://example.com")
    assert opened is False


def test_open_url_in_chrome_app_macos_accepts_relocated_binary_paths(
    monkeypatch,
) -> None:
    import setta.start as start_module
    from setta.start import _open_url_in_chrome_app

    monkeypatch.setattr(sys, "platform", "darwin")
    monkeypatch.setattr(start_module.time, "sleep", lambda _seconds: None)

    def fake_run(cmd: list[str], **kwargs):
        assert kwargs.get("check") is False
        if cmd[:3] == ["ps", "ax", "-o"]:
            return subprocess.CompletedProcess(
                cmd,
                0,
                stdout=(
                    "/Volumes/Apps/Google Chrome.app/Contents/MacOS/Google Chrome "
                    "--app=https://example.com\n"
                ),
                stderr="",
            )
        if cmd[0] == "open":
            return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
        raise AssertionError(f"Unexpected command: {cmd}")

    monkeypatch.setattr("setta.start.subprocess.run", fake_run)

    opened = _open_url_in_chrome_app("https://example.com")
    assert opened is True


def test_launcher_setup_status_and_remove_roundtrip() -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)

    runner = CliRunner()
    setup_result = runner.invoke(
        cli,
        [
            "launcher",
            "setup",
            "--json",
            "--channel",
            "uv-tool",
            "--install-source",
            "uv-tool",
            "--open-mode",
            "chrome-app",
            "--workspace-behavior",
            "always-prompt",
            "--no-install-artifacts",
        ],
    )

    assert setup_result.exit_code == 0, setup_result.output
    setup_payload = json.loads(setup_result.output)
    assert setup_payload["ok"] is True
    assert setup_payload["openMode"] == "chrome-app"
    assert setup_payload["workspaceBehavior"] == "always_prompt"

    status_result = runner.invoke(cli, ["launcher", "status", "--json"])
    assert status_result.exit_code == 0, status_result.output
    status_payload = json.loads(status_result.output)
    assert status_payload["ok"] is True
    assert status_payload["installed"] is True
    assert status_payload["metadataPath"] == str(
        resolve_launcher_metadata_path(setta_home=setta_home)
    )
    assert status_payload["channel"] == "uv-tool"
    assert status_payload["updateCapability"] == "in_app"

    remove_result = runner.invoke(cli, ["launcher", "remove", "--json"])
    assert remove_result.exit_code == 0, remove_result.output
    remove_payload = json.loads(remove_result.output)
    assert remove_payload["ok"] is True
    assert remove_payload["metadataRemoved"] is True
    assert remove_payload["removedPaths"] == []
    assert not resolve_launcher_metadata_path(setta_home=setta_home).exists()


def test_launcher_setup_rerun_preserves_existing_identity_fields() -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    target = Path(sys.executable).resolve(strict=False)
    metadata = build_launcher_install_metadata(
        target_command=[str(target), "-m", "setta"],
        channel="uv-tool",
        install_source="uv_tool",
        artifact_ownership_token="preserve-identity-token",
        setta_version="1.2.3",
        setta_home=setta_home,
        open_mode="browser",
        managed_artifacts={},
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=metadata)

    runner = CliRunner()
    setup_result = runner.invoke(
        cli,
        [
            "launcher",
            "setup",
            "--json",
            "--no-install-artifacts",
        ],
    )

    assert setup_result.exit_code == 0, setup_result.output
    setup_payload = json.loads(setup_result.output)
    assert setup_payload["ok"] is True
    assert setup_payload["channel"] == "uv-tool"
    assert setup_payload["openMode"] == "browser"

    status_result = runner.invoke(cli, ["launcher", "status", "--json"])
    assert status_result.exit_code == 0, status_result.output
    status_payload = json.loads(status_result.output)
    assert status_payload["ok"] is True
    assert status_payload["channel"] == "uv-tool"
    assert status_payload["updateCapability"] == "in_app"


def test_launcher_setup_preserves_artifact_options_when_option_is_omitted() -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    target = Path(sys.executable).resolve(strict=False)
    metadata = build_launcher_install_metadata(
        target_command=[str(target), "-m", "setta"],
        channel="manual",
        install_source="unsupported",
        artifact_ownership_token="preserve-cli-artifact-options-token",
        setta_version="1.2.3",
        setta_home=setta_home,
        open_mode="browser",
        artifact_options={"app_name": "Setta Custom"},
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=metadata)

    runner = CliRunner()
    setup_result = runner.invoke(
        cli,
        ["launcher", "setup", "--json", "--no-install-artifacts"],
    )

    assert setup_result.exit_code == 0, setup_result.output
    setup_payload = json.loads(setup_result.output)
    assert setup_payload["ok"] is True
    assert setup_payload["artifactOptions"] == {"app_name": "Setta Custom"}


def test_launcher_setup_preserves_no_artifact_mode_when_install_flag_is_omitted(
    monkeypatch,
) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    target = Path(sys.executable).resolve(strict=False)
    metadata = build_launcher_install_metadata(
        target_command=[str(target), "-m", "setta"],
        channel="manual",
        install_source="unsupported",
        artifact_ownership_token="preserve-cli-no-artifacts-token",
        setta_version="1.2.3",
        setta_home=setta_home,
        open_mode="browser",
        managed_artifacts={},
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=metadata)
    monkeypatch.setattr(
        "setta.launcher_setup.install_current_platform_artifacts",
        lambda **_kwargs: (_ for _ in ()).throw(
            AssertionError(
                "install_current_platform_artifacts should not run when install mode is omitted and preserved as disabled."
            )
        ),
    )

    runner = CliRunner()
    setup_result = runner.invoke(cli, ["launcher", "setup", "--json"])

    assert setup_result.exit_code == 0, setup_result.output
    setup_payload = json.loads(setup_result.output)
    assert setup_payload["ok"] is True
    assert setup_payload["managedArtifacts"] == {}


def test_launcher_setup_clear_artifact_options_flag_clears_existing_values() -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    target = Path(sys.executable).resolve(strict=False)
    metadata = build_launcher_install_metadata(
        target_command=[str(target), "-m", "setta"],
        channel="manual",
        install_source="unsupported",
        artifact_ownership_token="clear-cli-artifact-options-token",
        setta_version="1.2.3",
        setta_home=setta_home,
        open_mode="browser",
        artifact_options={"app_name": "Setta Custom"},
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=metadata)

    runner = CliRunner()
    setup_result = runner.invoke(
        cli,
        [
            "launcher",
            "setup",
            "--json",
            "--no-install-artifacts",
            "--clear-artifact-options",
        ],
    )

    assert setup_result.exit_code == 0, setup_result.output
    setup_payload = json.loads(setup_result.output)
    assert setup_payload["ok"] is True
    assert setup_payload["artifactOptions"] == {}


def test_launcher_setup_rejects_combining_artifact_option_with_clear_flag() -> None:
    runner = CliRunner()
    result = runner.invoke(
        cli,
        [
            "launcher",
            "setup",
            "--json",
            "--artifact-option",
            "app_name=Setta Custom",
            "--clear-artifact-options",
        ],
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "BadRequest"
    assert "Use either --artifact-option or --clear-artifact-options" in payload[
        "error"
    ]["message"]


def test_launcher_setup_no_longer_accepts_managed_artifact_option(
    tmp_path: Path,
) -> None:
    runner = CliRunner()
    result = runner.invoke(
        cli,
        [
            "launcher",
            "setup",
            "--json",
            "--no-install-artifacts",
            "--managed-artifact",
            f"manual={tmp_path / 'artifact'}",
        ],
    )

    assert result.exit_code == 2
    assert "No such option: --managed-artifact" in result.output


def test_launcher_update_reports_not_installed() -> None:
    runner = CliRunner()
    result = runner.invoke(cli, ["launcher", "update", "--json"])

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "LauncherNotInstalled"


def test_launcher_repair_rebinds_missing_target(tmp_path: Path) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    metadata = build_launcher_install_metadata(
        target_command=[str(tmp_path / "missing-python"), "-m", "setta"],
        channel="manual",
        install_source="unsupported",
        artifact_ownership_token="repair-cli-token",
        setta_version="1.2.3",
        setta_home=setta_home,
        open_mode="browser",
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=metadata)

    runner = CliRunner()
    result = runner.invoke(cli, ["launcher", "repair", "--json"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["ok"] is True
    status = payload["status"]
    assert status["ok"] is True
    assert status["targetValid"] is True
    assert status["targetCommand"][0] == str(Path(sys.executable).expanduser())
