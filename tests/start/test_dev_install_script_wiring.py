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


def test_activate_requires_sourcing(tmp_path: Path) -> None:
    sandbox_root = tmp_path / "activate_requires_sourcing_sandbox"
    sandbox_root.mkdir(parents=True, exist_ok=True)

    _copy_repo_file(sandbox_root=sandbox_root, relative_path="activate.sh")

    result = subprocess.run(
        ["bash", str(sandbox_root / "activate.sh")],
        cwd=sandbox_root,
        env=_sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1
    assert "must be sourced" in result.stderr


def test_activate_reports_missing_repo_venv_when_sourced(tmp_path: Path) -> None:
    sandbox_root = tmp_path / "activate_missing_venv_sandbox"
    sandbox_root.mkdir(parents=True, exist_ok=True)

    _copy_repo_file(sandbox_root=sandbox_root, relative_path="activate.sh")

    result = subprocess.run(
        ["bash", "-lc", ". ./activate.sh"],
        cwd=sandbox_root,
        env=_sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1
    assert "Python environment not found at:" in result.stderr
    assert ". ./init_env.sh" in result.stderr
    assert ". ./dev_install_python.sh" in result.stderr


def test_activate_sources_repo_venv_when_present(tmp_path: Path) -> None:
    sandbox_root = tmp_path / "activate_sources_venv_sandbox"
    venv_bin_dir = sandbox_root / ".venv" / "bin"
    activation_log = sandbox_root / "activation-log.txt"
    sandbox_root.mkdir(parents=True, exist_ok=True)
    venv_bin_dir.mkdir(parents=True, exist_ok=True)

    _copy_repo_file(sandbox_root=sandbox_root, relative_path="activate.sh")
    (venv_bin_dir / "activate").write_text(
        f'echo repo-venv-activated > "{activation_log}"\nexport SETTA_ACTIVATE_TEST_VALUE="ready"\n',
        encoding="utf-8",
    )
    (venv_bin_dir / "activate").chmod(0o755)

    result = subprocess.run(
        [
            "bash",
            "-lc",
            'if . ./activate.sh; then printf "%s" "${SETTA_ACTIVATE_TEST_VALUE:-}"; fi',
        ],
        cwd=sandbox_root,
        env=_sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout == "ready"
    assert activation_log.read_text(encoding="utf-8").strip() == "repo-venv-activated"


def test_init_env_installs_explicit_source_and_dev_extras(
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
        "uv lock --check",
        "uv sync --frozen --extra source --extra dev --python 3.13",
        "activate",
    ]


def test_init_env_applies_release_age_cutoff_when_repo_policy_exists(
    tmp_path: Path,
) -> None:
    sandbox_root = tmp_path / "init_env_policy_sandbox"
    bin_dir = sandbox_root / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    command_log = sandbox_root / "command-log.txt"

    _copy_repo_file(sandbox_root=sandbox_root, relative_path="init_env.sh")
    _copy_repo_file(
        sandbox_root=sandbox_root, relative_path="scripts/check_uv_lock_release_age.py"
    )
    (sandbox_root / "supply_chain_policy.env").write_text(
        "SETTA_MIN_RELEASE_AGE_DAYS=7\n",
        encoding="utf-8",
    )
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
    write_stub_executable(
        bin_dir / "python3",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "python3 $*" >> "{command_log}"
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
        "uv lock --check",
        "python3 ./scripts/check_uv_lock_release_age.py --days 7 --lockfile ./uv.lock",
        "uv sync --frozen --extra source --extra dev --python 3.13",
        "activate",
    ]


def test_dev_install_bootstraps_go_before_frontend_and_sidecars(
    tmp_path: Path,
) -> None:
    # The default dev installer should ensure the pinned Go toolchain exists,
    # then install frontend deps, sidecars, and cleanup without pulling Python.
    sandbox_root = tmp_path / "dev_install_sandbox"
    frontend_dir = sandbox_root / "frontend"
    scripts_dir = sandbox_root / "scripts"
    bin_dir = sandbox_root / "bin"
    frontend_dir.mkdir(parents=True, exist_ok=True)
    scripts_dir.mkdir(parents=True, exist_ok=True)
    bin_dir.mkdir(parents=True, exist_ok=True)
    command_log = sandbox_root / "command-log.txt"
    toolchain_ready = sandbox_root / "toolchain-ready"

    _copy_repo_file(sandbox_root=sandbox_root, relative_path="dev_install.sh")
    write_stub_executable(
        scripts_dir / "go.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "go $*" >> "{command_log}"
if [[ "$1" == "version" && ! -f "{toolchain_ready}" ]]; then
  exit 1
fi
""",
    )
    write_stub_executable(
        scripts_dir / "install_go_toolchain.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo install-go-toolchain >> "{command_log}"
touch "{toolchain_ready}"
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
        "go version",
        "install-go-toolchain",
        "go version",
        "pnpm install --frozen-lockfile",
        "install-sidecars",
        "cleanup",
    ]


def test_dev_install_python_runs_init_env_before_default_dev_install(
    tmp_path: Path,
) -> None:
    sandbox_root = tmp_path / "dev_install_python_sandbox"
    scripts_dir = sandbox_root / "scripts"
    sandbox_root.mkdir(parents=True, exist_ok=True)
    scripts_dir.mkdir(parents=True, exist_ok=True)
    command_log = sandbox_root / "command-log.txt"

    _copy_repo_file(sandbox_root=sandbox_root, relative_path="dev_install_python.sh")
    write_stub_executable(
        sandbox_root / "init_env.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo init-env >> "{command_log}"
""",
    )
    write_stub_executable(
        sandbox_root / "dev_install.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo dev-install >> "{command_log}"
""",
    )

    result = subprocess.run(
        ["bash", str(sandbox_root / "dev_install_python.sh")],
        cwd=sandbox_root,
        env=_sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert command_log.read_text(encoding="utf-8").splitlines() == [
        "init-env",
        "dev-install",
    ]
