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


def test_install_gopls_script_installs_repo_local_binary_and_links(
    tmp_path: Path,
) -> None:
    sandbox_root = tmp_path / "install_gopls_sandbox"
    scripts_dir = sandbox_root / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    (sandbox_root / ".venv" / "bin").mkdir(parents=True, exist_ok=True)
    command_log = sandbox_root / "command-log.txt"

    _copy_repo_file(
        sandbox_root=sandbox_root,
        relative_path="scripts/install_gopls.sh",
    )
    _copy_repo_file(
        sandbox_root=sandbox_root,
        relative_path="scripts/gopls_version.txt",
    )

    write_stub_executable(
        scripts_dir / "go.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "{command_log}"
if [[ "$1" == "version" ]]; then
  exit 0
fi
if [[ "$1" != "install" ]]; then
  echo "unexpected go.sh invocation: $*" >&2
  exit 1
fi
if [[ -z "${{GOBIN:-}}" ]]; then
  echo "missing GOBIN" >&2
  exit 1
fi
cat > "${{GOBIN}}/gopls" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${{1:-}}" == "version" ]]; then
  echo "golang.org/x/tools/gopls v0.21.1"
  exit 0
fi
EOF
chmod +x "${{GOBIN}}/gopls"
""",
    )

    result = subprocess.run(
        ["bash", str(sandbox_root / "scripts" / "install_gopls.sh")],
        cwd=sandbox_root,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    platform_tag = _platform_tag()
    installed_bin = sandbox_root / ".tools" / "gopls" / platform_tag / "bin" / "gopls"
    assert installed_bin.is_file()
    assert (
        sandbox_root / ".tools" / "gopls" / platform_tag / "version.txt"
    ).read_text(encoding="utf-8") == "v0.21.1\n"
    assert (
        sandbox_root / ".tools" / "bin" / "gopls"
    ).resolve() == installed_bin.resolve()
    assert (
        sandbox_root / ".venv" / "bin" / "gopls"
    ).resolve() == installed_bin.resolve()
    assert command_log.read_text(encoding="utf-8").splitlines() == [
        "version",
        "install golang.org/x/tools/gopls@v0.21.1",
    ]


def test_gopls_wrapper_uses_repo_local_binary(tmp_path: Path) -> None:
    sandbox_root = tmp_path / "gopls_wrapper_sandbox"
    scripts_dir = sandbox_root / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    command_log = sandbox_root / "command-log.txt"

    _copy_repo_file(sandbox_root=sandbox_root, relative_path="scripts/gopls.sh")
    _copy_repo_file(
        sandbox_root=sandbox_root,
        relative_path="scripts/gopls_version.txt",
    )

    platform_tag = _platform_tag()
    write_stub_executable(
        sandbox_root / ".tools" / "gopls" / platform_tag / "bin" / "gopls",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [[ "${{1:-}}" == "version" ]]; then
  echo "golang.org/x/tools/gopls v0.21.1"
  exit 0
fi
echo "$*" > "{command_log}"
""",
    )

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "scripts" / "gopls.sh"),
            "references",
            "./internal/app/service.go:17:3",
        ],
        cwd=sandbox_root,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert (
        command_log.read_text(encoding="utf-8").strip()
        == "references ./internal/app/service.go:17:3"
    )
