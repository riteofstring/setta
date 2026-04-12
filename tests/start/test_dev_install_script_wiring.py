import os
import subprocess
from pathlib import Path

from tests.start.dev_script_wiring_helpers import (
    parse_env_snapshot,
    repo_root,
    without_path_dirs_containing,
    write_stub_executable,
)


def _copy_repo_file(*, sandbox_root: Path, relative_path: str) -> Path:
    src = repo_root() / relative_path
    dst = sandbox_root / relative_path
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    dst.chmod(0o755)
    return dst


def _sandbox_env(sandbox_root: Path) -> dict[str, str]:
    env = os.environ.copy()
    env.pop("NVM_DIR", None)
    filtered_path = without_path_dirs_containing("corepack", env.get("PATH", ""))
    filtered_path = without_path_dirs_containing("pnpm", filtered_path)
    env["PATH"] = f"{sandbox_root / 'bin'}:{filtered_path}"
    return env


def test_init_env_installs_explicit_dev_extra(
    tmp_path: Path,
) -> None:
    # Repo-local setup should name the checked-in dev extra explicitly instead
    # of relying on an implicit all-extras sync.
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
        "uv sync --frozen --extra dev --python 3.13",
        "activate",
    ]


def test_init_env_applies_release_age_cutoff_when_repo_policy_exists(
    tmp_path: Path,
) -> None:
    # Repo-local policy should enforce the checked-in Python release-age guard
    # before syncing the environment.
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
        "uv sync --frozen --extra dev --python 3.13",
        "activate",
    ]


def test_init_env_allows_explicit_release_age_override(
    tmp_path: Path,
) -> None:
    # An explicit environment override should beat the checked-in repo policy
    # so one-off bootstrap flows can lower the cutoff without editing the file.
    sandbox_root = tmp_path / "init_env_override_sandbox"
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

    env = _sandbox_env(sandbox_root)
    env["SETTA_MIN_RELEASE_AGE_DAYS"] = "0"

    result = subprocess.run(
        ["bash", str(sandbox_root / "init_env.sh")],
        cwd=sandbox_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert command_log.read_text(encoding="utf-8").splitlines() == [
        "uv lock --check",
        "uv sync --frozen --extra dev --python 3.13",
        "activate",
    ]


def test_dev_install_runs_python_bootstrap_before_frozen_frontend_and_sidecars(
    tmp_path: Path,
) -> None:
    # The default dev installer should bootstrap Python first, then keep the
    # frontend and sidecar dependency installs frozen.
    sandbox_root = tmp_path / "dev_install_sandbox"
    frontend_dir = sandbox_root / "frontend"
    scripts_dir = sandbox_root / "scripts"
    bin_dir = sandbox_root / "bin"
    frontend_dir.mkdir(parents=True, exist_ok=True)
    scripts_dir.mkdir(parents=True, exist_ok=True)
    bin_dir.mkdir(parents=True, exist_ok=True)
    command_log = sandbox_root / "command-log.txt"
    pnpm_env = sandbox_root / "pnpm-env.txt"

    _copy_repo_file(sandbox_root=sandbox_root, relative_path="dev_install.sh")
    _copy_repo_file(
        sandbox_root=sandbox_root, relative_path="scripts/lib/node_tooling.sh"
    )
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
env | sort > "{pnpm_env}"
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
        "pnpm install --frozen-lockfile",
        "install-sidecars",
        "cleanup",
    ]
    assert parse_env_snapshot(pnpm_env.read_text(encoding="utf-8")).get(
        "COREPACK_ENABLE_AUTO_PIN"
    ) == "0"


def test_dev_install_prefers_corepack_and_disables_auto_pin(tmp_path: Path) -> None:
    # When corepack is available, dev_install.sh should use the repo-pinned pnpm
    # entrypoint instead of a plain pnpm executable from PATH.
    sandbox_root = tmp_path / "dev_install_corepack_sandbox"
    frontend_dir = sandbox_root / "frontend"
    scripts_dir = sandbox_root / "scripts"
    bin_dir = sandbox_root / "bin"
    frontend_dir.mkdir(parents=True, exist_ok=True)
    scripts_dir.mkdir(parents=True, exist_ok=True)
    bin_dir.mkdir(parents=True, exist_ok=True)
    command_log = sandbox_root / "command-log.txt"
    corepack_cmd = sandbox_root / "corepack-cmd.txt"
    corepack_env = sandbox_root / "corepack-env.txt"
    pnpm_cmd = sandbox_root / "pnpm-cmd.txt"

    _copy_repo_file(sandbox_root=sandbox_root, relative_path="dev_install.sh")
    _copy_repo_file(
        sandbox_root=sandbox_root, relative_path="scripts/lib/node_tooling.sh"
    )
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
        bin_dir / "corepack",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{corepack_cmd}"
env | sort > "{corepack_env}"
""",
    )
    write_stub_executable(
        bin_dir / "pnpm",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{pnpm_cmd}"
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
        "install-sidecars",
        "cleanup",
    ]
    assert corepack_cmd.read_text(encoding="utf-8").strip() == (
        "pnpm install --frozen-lockfile"
    )
    assert parse_env_snapshot(corepack_env.read_text(encoding="utf-8")).get(
        "COREPACK_ENABLE_AUTO_PIN"
    ) == "0"
    assert not pnpm_cmd.exists()
