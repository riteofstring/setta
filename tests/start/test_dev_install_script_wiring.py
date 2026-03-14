import os
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


def _sandbox_env(sandbox_root: Path) -> dict[str, str]:
    env = os.environ.copy()
    env["PATH"] = f"{sandbox_root / 'bin'}:{env.get('PATH', '')}"
    return env


def test_init_env_installs_explicit_source_dev_and_gemini_extras(
    tmp_path: Path,
) -> None:
    # Repo-local setup should name the broader source/dev extras explicitly
    # instead of relying on an implicit all-extras sync.
    sandbox_root = tmp_path / "init_env_sandbox"
    bin_dir = sandbox_root / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    command_log = sandbox_root / "command-log.txt"

    _copy_repo_file(sandbox_root=sandbox_root, relative_path="init_env.sh")
    write_stub_executable(
        sandbox_root / "activate.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo activate >> "{command_log}"
""",
    )
    write_stub_executable(
        bin_dir / "uv",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "uv $*" >> "{command_log}"
""",
    )

    result = subprocess.run(
        ["bash", str(sandbox_root / "init_env.sh")],
        cwd=sandbox_root,
        env=_sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert command_log.read_text(encoding="utf-8").splitlines() == [
        "uv sync --extra source --extra dev --extra gemini --python 3.13",
        "activate",
    ]


def test_dev_install_reuses_init_env_before_frontend_and_sidecars(
    tmp_path: Path,
) -> None:
    # The one-shot dev installer should keep init_env as the single Python
    # bootstrap owner, then layer frontend deps, sidecars, and cleanup.
    sandbox_root = tmp_path / "dev_install_sandbox"
    frontend_dir = sandbox_root / "frontend"
    scripts_dir = sandbox_root / "scripts"
    bin_dir = sandbox_root / "bin"
    frontend_dir.mkdir(parents=True, exist_ok=True)
    scripts_dir.mkdir(parents=True, exist_ok=True)
    bin_dir.mkdir(parents=True, exist_ok=True)
    command_log = sandbox_root / "command-log.txt"

    _copy_repo_file(sandbox_root=sandbox_root, relative_path="dev_install.sh")
    write_stub_executable(
        sandbox_root / "init_env.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo init-env >> "{command_log}"
""",
    )
    write_stub_executable(
        scripts_dir / "install_sidecars.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo install-sidecars >> "{command_log}"
""",
    )
    write_stub_executable(
        sandbox_root / "cleanup.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo cleanup >> "{command_log}"
""",
    )
    write_stub_executable(
        bin_dir / "pnpm",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "pnpm $*" >> "{command_log}"
""",
    )

    result = subprocess.run(
        ["bash", str(sandbox_root / "dev_install.sh")],
        cwd=sandbox_root,
        env=_sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert command_log.read_text(encoding="utf-8").splitlines() == [
        "init-env",
        "pnpm install",
        "install-sidecars",
        "cleanup",
    ]
