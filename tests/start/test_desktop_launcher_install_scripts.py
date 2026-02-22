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
    assert "launcher install --json --channel phase2-test --open-mode chrome-app" in setta_call
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
    assert "install" in script_content
    assert "--json" in script_content
