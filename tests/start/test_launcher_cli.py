import json
import os
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


def test_launcher_json_uses_fallback_workspace_and_requests_switcher(
    monkeypatch,
) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    captured: dict[str, object] = {}

    def fake_launch_workspace_session(**kwargs):
        workspace_root = kwargs["workspace_root"]
        captured["workspace_root"] = workspace_root
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
    assert payload["bootstrapUrl"].endswith("#token=tok&osw=1")

    expected_workspace = (setta_home / "launcher" / "workspace").resolve(strict=False)
    assert payload["workspaceRoot"] == str(expected_workspace)
    assert Path(str(captured["workspace_root"])).resolve(strict=False) == expected_workspace


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
        setta_version="1.2.3",
        open_mode="chrome-app",
        last_used_workspace=last_used_workspace,
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=metadata)

    def fake_launch_workspace_session(**kwargs):
        workspace_root = kwargs["workspace_root"]
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
    assert payload["workspaceRoot"] == str(last_used_workspace.resolve(strict=False))
    assert payload["openMode"] == "chrome-app"


def test_launcher_json_reports_missing_bound_target(
    tmp_path: Path,
) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    metadata = build_launcher_install_metadata(
        target_command=[str(tmp_path / "missing-python"), "-m", "setta"],
        channel="manual",
        setta_version="1.2.3",
        open_mode="browser",
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=metadata)

    runner = CliRunner()
    result = runner.invoke(cli, ["launcher", "--json"])

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "LauncherTargetMissing"


def test_launcher_install_and_uninstall_roundtrip(tmp_path: Path) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    artifact_path = tmp_path / "Applications" / "Setta.app"

    runner = CliRunner()
    install_result = runner.invoke(
        cli,
        [
            "launcher",
            "install",
            "--json",
            "--channel",
            "uv-tool",
            "--open-mode",
            "chrome-app",
            "--managed-artifact",
            f"macosApp={artifact_path}",
        ],
    )

    assert install_result.exit_code == 0, install_result.output
    install_payload = json.loads(install_result.output)
    assert install_payload["ok"] is True
    assert install_payload["openMode"] == "chrome-app"
    metadata_path = resolve_launcher_metadata_path(setta_home=setta_home)
    assert metadata_path.exists()

    artifact_path.mkdir(parents=True, exist_ok=True)
    uninstall_result = runner.invoke(cli, ["launcher", "uninstall", "--json"])

    assert uninstall_result.exit_code == 0, uninstall_result.output
    uninstall_payload = json.loads(uninstall_result.output)
    assert uninstall_payload["ok"] is True
    assert uninstall_payload["metadataRemoved"] is True
    assert str(artifact_path.resolve(strict=False)) in uninstall_payload["removedPaths"]
    assert not metadata_path.exists()
    assert not artifact_path.exists()


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
