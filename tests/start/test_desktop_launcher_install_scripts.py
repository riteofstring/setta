import os
import subprocess
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def test_install_desktop_launcher_script_installs_and_binds_uv_tool_target(
    tmp_path: Path,
) -> None:
    script_path = _repo_root() / "scripts" / "install_desktop_launcher.sh"
    stub_bin_dir = tmp_path / "stub-bin"
    uv_tool_bin_dir = tmp_path / "uv-tool-bin"
    stub_bin_dir.mkdir(parents=True, exist_ok=True)
    uv_tool_bin_dir.mkdir(parents=True, exist_ok=True)

    uv_args_capture = tmp_path / "uv-args.txt"
    setta_args_capture = tmp_path / "setta-args.txt"
    decoy_args_capture = tmp_path / "decoy-setta-args.txt"
    setta_home = tmp_path / "setta-home"

    uv_stub = stub_bin_dir / "uv"
    uv_stub.write_text(
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "{uv_args_capture}"
if [[ "$1" == "tool" && "$2" == "install" ]]; then
  exit 0
fi
if [[ "$1" == "tool" && "$2" == "dir" && "$3" == "--bin" ]]; then
  echo "{uv_tool_bin_dir}"
  exit 0
fi
echo "Unexpected uv invocation: $*" >&2
exit 1
""",
        encoding="utf-8",
    )
    uv_stub.chmod(0o755)

    decoy_setta = stub_bin_dir / "setta"
    decoy_setta.write_text(
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "{decoy_args_capture}"
exit 1
""",
        encoding="utf-8",
    )
    decoy_setta.chmod(0o755)

    setta_stub = uv_tool_bin_dir / "setta"
    setta_stub.write_text(
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "{setta_args_capture}"
cat <<'JSON'
{{"ok":true,"metadataPath":"/tmp/launcher-install.json","targetCommand":["{uv_tool_bin_dir / "python"}","-m","setta"]}}
JSON
""",
        encoding="utf-8",
    )
    setta_stub.chmod(0o755)

    env = os.environ.copy()
    env["HOME"] = str(tmp_path / "home")
    env["PATH"] = f"{stub_bin_dir}:{env.get('PATH', '')}"

    result = subprocess.run(
        [
            "/bin/bash",
            str(script_path),
            "--channel",
            "phase2-test",
            "--open-mode",
            "chrome-app",
            "--setta-home",
            str(setta_home),
        ],
        cwd=_repo_root(),
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    uv_calls = uv_args_capture.read_text(encoding="utf-8")
    assert "tool install --upgrade setta" in uv_calls
    assert "tool dir --bin" in uv_calls

    setta_call = setta_args_capture.read_text(encoding="utf-8")
    assert f"--setta-home {setta_home}" in setta_call
    assert (
        "launcher setup --json --channel phase2-test --install-source uv-tool --open-mode chrome-app"
        in setta_call
    )
    assert not decoy_args_capture.exists()


def test_install_desktop_launcher_script_requires_uv(tmp_path: Path) -> None:
    script_path = _repo_root() / "scripts" / "install_desktop_launcher.sh"
    empty_bin_dir = tmp_path / "empty-bin"
    empty_bin_dir.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["HOME"] = str(tmp_path / "home")
    env["PATH"] = str(empty_bin_dir)

    result = subprocess.run(
        ["/bin/bash", str(script_path)],
        cwd=_repo_root(),
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert "uv is required but was not found on PATH." in result.stderr
    assert "docs.astral.sh/uv/getting-started/installation/" in result.stderr


def test_install_desktop_launcher_powershell_script_contains_phase2_contract() -> None:
    script_path = _repo_root() / "scripts" / "install_desktop_launcher.ps1"
    script_content = script_path.read_text(encoding="utf-8")

    assert "Get-Command uv" in script_content
    assert "tool install --upgrade" in script_content
    assert "tool dir --bin" in script_content
    assert "launcher" in script_content
    assert "setup" in script_content
    assert "--json" in script_content
    assert "--install-source" in script_content


def test_build_windows_installer_script_uses_fail_fast_native_wrapper() -> None:
    script_path = _repo_root() / "scripts" / "release" / "build_windows_installer.ps1"
    script_content = script_path.read_text(encoding="utf-8")

    assert "function Invoke-NativeOrFail" in script_content
    assert "& $CommandPath @Arguments" in script_content
    assert "if ($LASTEXITCODE -ne 0)" in script_content
    assert '-ToolName "candle"' in script_content
    assert '-ToolName "light"' in script_content
    assert '-ToolName "signtool"' in script_content
    assert "& $candle.Source @candleArgs" not in script_content
    assert "& $light.Source @lightArgs" not in script_content


def test_macos_installer_script_runs_postinstall_bootstrap() -> None:
    script_path = _repo_root() / "scripts" / "release" / "build_macos_installer.sh"
    script_content = script_path.read_text(encoding="utf-8")

    assert 'cat > "${installer_scripts_root}/postinstall"' in script_content
    assert "--scripts \"${installer_scripts_root}\"" in script_content
    assert (
        "--channel native-installer --install-source installer-managed --open-mode chrome-app"
        in script_content
    )


def test_windows_installer_script_runs_custom_action_bootstrap() -> None:
    script_path = _repo_root() / "scripts" / "release" / "build_windows_installer.ps1"
    script_content = script_path.read_text(encoding="utf-8")

    assert 'Id="RunDesktopBootstrap"' in script_content
    assert 'After="InstallFiles">NOT Installed</Custom>' in script_content
    assert "setta-install-desktop.ps1" in script_content
    assert (
        "-Channel native-installer -InstallSource installer-managed -OpenMode chrome-app"
        in script_content
    )


def test_launcher_smoke_script_uses_explicit_launcher_mode_for_stop() -> None:
    script_path = _repo_root() / "scripts" / "release" / "smoke_test_launcher_pipeline.sh"
    script_content = script_path.read_text(encoding="utf-8")

    assert "--server-mode launcher" in script_content
    assert "status --list-sessions --json --server-mode launcher" in script_content


def test_release_workflow_uses_single_installer_version_source() -> None:
    workflow_path = (
        _repo_root() / ".github" / "workflows" / "release-desktop-launcher.yml"
    )
    workflow_content = workflow_path.read_text(encoding="utf-8")

    assert "resolve_installer_version:" in workflow_content
    assert (
        "installer_version: ${{ steps.resolve.outputs.installer_version }}"
        in workflow_content
    )
    assert (
        "SETTA_DESKTOP_INSTALLER_VERSION: ${{ needs.resolve_installer_version.outputs.installer_version }}"
        in workflow_content
    )
    assert 'SETTA_DESKTOP_INSTALLER_RELEASE_MODE: "1"' in workflow_content
    assert "macos-installer-smoke:" in workflow_content
    assert "windows-installer-smoke:" in workflow_content
    assert "publish-release-assets:" in workflow_content
    assert "./scripts/release/smoke_test_native_installer_macos.sh --pkg" in workflow_content
    assert (
        "./scripts/release/smoke_test_native_installer_windows.ps1 -MsiPath $msiPath.FullName"
        in workflow_content
    )
    assert "name: Publish release assets" in workflow_content


def test_release_workflow_publishes_assets_only_after_all_smoke_gates() -> None:
    workflow_path = (
        _repo_root() / ".github" / "workflows" / "release-desktop-launcher.yml"
    )
    workflow_content = workflow_path.read_text(encoding="utf-8")

    assert "publish-release-assets:" in workflow_content
    assert "- launcher-smoke" in workflow_content
    assert "- macos-installer-smoke" in workflow_content
    assert "- windows-installer-smoke" in workflow_content
    assert "- bootstrap-assets" in workflow_content
    assert workflow_content.count("softprops/action-gh-release@v2") == 1


def test_native_installer_smoke_scripts_assert_launcher_status() -> None:
    macos_script = (
        _repo_root() / "scripts" / "release" / "smoke_test_native_installer_macos.sh"
    ).read_text(encoding="utf-8")
    windows_script = (
        _repo_root() / "scripts" / "release" / "smoke_test_native_installer_windows.ps1"
    ).read_text(encoding="utf-8")

    assert "sudo installer -pkg" in macos_script
    assert "launcher status --json" in macos_script
    assert "msiexec.exe" in windows_script
    assert "launcher status --json" in windows_script


def test_macos_installer_script_release_mode_requires_explicit_version() -> None:
    script_path = _repo_root() / "scripts" / "release" / "build_macos_installer.sh"
    script_content = script_path.read_text(encoding="utf-8")

    assert 'release_mode="${SETTA_DESKTOP_INSTALLER_RELEASE_MODE:-0}"' in script_content
    assert (
        "SETTA_DESKTOP_INSTALLER_VERSION is required when release mode is enabled."
        in script_content
    )
    assert "Installer version must use major.minor.patch format" in script_content


def test_windows_installer_script_release_mode_requires_explicit_version() -> None:
    script_path = _repo_root() / "scripts" / "release" / "build_windows_installer.ps1"
    script_content = script_path.read_text(encoding="utf-8")

    assert '$env:SETTA_DESKTOP_INSTALLER_RELEASE_MODE -eq "1"' in script_content
    assert (
        "SETTA_DESKTOP_INSTALLER_VERSION is required when release mode is enabled."
        in script_content
    )


def test_smoke_test_launcher_pipeline_breaks_post_update_artifact(
    tmp_path: Path,
) -> None:
    script_path = (
        _repo_root() / "scripts" / "release" / "smoke_test_launcher_pipeline.sh"
    )
    bootstrap_script = tmp_path / "bootstrap.sh"
    bootstrap_script.write_text(
        "#!/usr/bin/env bash\nset -euo pipefail\nexit 0\n",
        encoding="utf-8",
    )
    bootstrap_script.chmod(0o755)

    stub_bin_dir = tmp_path / "stub-bin"
    uv_tool_bin_dir = tmp_path / "uv-tool-bin"
    artifact_dir = tmp_path / "artifacts"
    stub_bin_dir.mkdir(parents=True, exist_ok=True)
    uv_tool_bin_dir.mkdir(parents=True, exist_ok=True)
    artifact_dir.mkdir(parents=True, exist_ok=True)

    old_artifact = (artifact_dir / "old-artifact").resolve(strict=False)
    new_artifact = (artifact_dir / "new-artifact").resolve(strict=False)
    old_artifact.write_text("old", encoding="utf-8")
    new_artifact.write_text("new", encoding="utf-8")

    status_counter = tmp_path / "status-counter.txt"
    status_counter.write_text("0\n", encoding="utf-8")
    setta_calls = tmp_path / "setta-calls.txt"

    uv_stub = stub_bin_dir / "uv"
    uv_stub.write_text(
        f"""#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "tool" && "$2" == "install" ]]; then
  exit 0
fi
if [[ "$1" == "tool" && "$2" == "dir" && "$3" == "--bin" ]]; then
  echo "{uv_tool_bin_dir}"
  exit 0
fi
echo "Unexpected uv invocation: $*" >&2
exit 1
""",
        encoding="utf-8",
    )
    uv_stub.chmod(0o755)

    setta_stub = uv_tool_bin_dir / "setta"
    setta_stub.write_text(
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "{setta_calls}"

if [[ "${{1:-}}" == "--setta-home" ]]; then
  shift 2
fi

if [[ "${{1:-}}" == "launcher" && "${{2:-}}" == "status" && "${{3:-}}" == "--json" ]]; then
  count="$(cat "{status_counter}")"
  if [[ "$count" == "0" ]]; then
    cat <<'JSON'
{{"ok":true,"installed":true,"managedArtifacts":{{"artifact":"{old_artifact}"}},"existingManagedArtifacts":["{old_artifact}"]}}
JSON
    echo "1" > "{status_counter}"
    exit 0
  fi
  if [[ "$count" == "1" ]]; then
    cat <<'JSON'
{{"ok":true,"installed":true,"managedArtifacts":{{"artifact":"{new_artifact}"}},"existingManagedArtifacts":["{new_artifact}"]}}
JSON
    echo "2" > "{status_counter}"
    exit 0
  fi
  cat <<'JSON'
{{"ok":true,"installed":false}}
JSON
  exit 0
fi

if [[ "${{1:-}}" == "status" && "${{2:-}}" == "--list-sessions" && "${{3:-}}" == "--json" ]]; then
  echo "__SETTA_JSON_B64__eyJzZXNzaW9ucyI6W119"
  exit 0
fi

if [[ "${{1:-}}" == "launcher" && "${{2:-}}" == "--json" ]]; then
  cat <<'JSON'
{{"ok":true,"bootstrapUrl":"http://127.0.0.1:61234/__setta__/bootstrap#token=tok","openWorkspaceSwitcher":false}}
JSON
  exit 0
fi

if [[ "${{1:-}}" == "launcher" && "${{2:-}}" == "update" && "${{3:-}}" == "--json" ]]; then
  cat <<'JSON'
{{"ok":true,"status":{{"installed":true}}}}
JSON
  exit 0
fi

if [[ "${{1:-}}" == "launcher" && "${{2:-}}" == "repair" && "${{3:-}}" == "--json" ]]; then
  cat <<'JSON'
{{"ok":true,"status":{{"missingManagedArtifacts":[]}}}}
JSON
  exit 0
fi

if [[ "${{1:-}}" == "launcher" && "${{2:-}}" == "remove" && "${{3:-}}" == "--json" ]]; then
  cat <<'JSON'
{{"ok":true,"metadataRemoved":true}}
JSON
  exit 0
fi

if [[ "${{1:-}}" == "stop" ]]; then
  exit 0
fi

echo "Unexpected setta invocation: $*" >&2
exit 1
""",
        encoding="utf-8",
    )
    setta_stub.chmod(0o755)

    setta_home = tmp_path / "setta-home"
    workspace_root = tmp_path / "workspace"

    env = os.environ.copy()
    env["PATH"] = f"{stub_bin_dir}:{env.get('PATH', '')}"

    result = subprocess.run(
        [
            "/bin/bash",
            str(script_path),
            "--bootstrap-script",
            str(bootstrap_script),
            "--setta-home",
            str(setta_home),
            "--workspace",
            str(workspace_root),
        ],
        cwd=_repo_root(),
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert old_artifact.exists()
    assert not new_artifact.exists()

    setta_invocations = setta_calls.read_text(encoding="utf-8")
    assert setta_invocations.count("launcher status --json") >= 3
