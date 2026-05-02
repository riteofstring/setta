import platform
import subprocess
from pathlib import Path

from tests.start.dev_script_wiring_helpers import repo_root, write_stub_executable


def _copy_repo_file(*, sandbox_root: Path, relative_path: str) -> Path:
    src = repo_root() / relative_path
    dst = sandbox_root / relative_path
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    dst.chmod(0o755)
    return dst


def _platform_tag() -> str:
    system = platform.system()
    machine = platform.machine().lower()

    os_tag = {
        "darwin": "darwin",
        "linux": "linux",
        "windows": "windows",
    }.get(system.lower())
    if os_tag is None:
        raise AssertionError(f"unsupported test OS: {system}")

    arch_tag = {
        "x86_64": "amd64",
        "amd64": "amd64",
        "arm64": "arm64",
        "aarch64": "arm64",
    }.get(machine)
    if arch_tag is None:
        raise AssertionError(f"unsupported test arch: {machine}")

    return f"{os_tag}-{arch_tag}"


def test_go_sh_exports_selected_go_bin_on_path(tmp_path: Path) -> None:
    sandbox_root = tmp_path / "go_sh_sandbox"
    scripts_dir = sandbox_root / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    found_go_path = sandbox_root / "found-go-path.txt"
    command_args = sandbox_root / "command-args.txt"

    _copy_repo_file(sandbox_root=sandbox_root, relative_path="scripts/go.sh")
    _copy_repo_file(
        sandbox_root=sandbox_root,
        relative_path="scripts/go_version.txt",
    )

    platform_tag = _platform_tag()
    local_go_bin = (
        sandbox_root / ".tools" / "go" / platform_tag / "go" / "bin" / "go"
    )
    write_stub_executable(
        local_go_bin,
        f"""#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "version" ]]; then
  echo "go version go1.26.2 {platform.system().lower()}/{platform.machine().lower()}"
  exit 0
fi
command -v go > "{found_go_path}"
printf '%s\\n' "$@" > "{command_args}"
""",
    )

    result = subprocess.run(
        ["bash", str(sandbox_root / "scripts" / "go.sh"), "doc", "fmt.Printf"],
        cwd=sandbox_root,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert found_go_path.read_text(encoding="utf-8").strip() == str(local_go_bin)
    assert command_args.read_text(encoding="utf-8").splitlines() == [
        "doc",
        "fmt.Printf",
    ]
