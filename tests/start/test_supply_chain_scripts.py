import json
import os
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from tests.start.dev_script_wiring_helpers import repo_root, write_stub_executable


def copy_repo_file(*, sandbox_root: Path, relative_path: str) -> Path:
    src = repo_root() / relative_path
    dst = sandbox_root / relative_path
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    dst.chmod(0o755)
    return dst


def sandbox_env(sandbox_root: Path) -> dict[str, str]:
    env = os.environ.copy()
    env["PATH"] = f"{sandbox_root / 'bin'}:{env.get('PATH', '')}"
    return env


def test_configure_supply_chain_local_only_updates_repo_policy_and_npmrc_files(
    tmp_path: Path,
) -> None:
    # Local configuration should update the repo policy file plus both pnpm projects.
    sandbox_root = tmp_path / "configure_supply_chain_local"
    scripts_dir = sandbox_root / "scripts"
    frontend_dir = sandbox_root / "frontend"
    sidecar_dir = (
        sandbox_root
        / "backend"
        / "setta"
        / "agentic"
        / "external_adapters"
        / "sidecars"
    )
    scripts_dir.mkdir(parents=True, exist_ok=True)
    frontend_dir.mkdir(parents=True, exist_ok=True)
    sidecar_dir.mkdir(parents=True, exist_ok=True)

    copy_repo_file(sandbox_root=sandbox_root, relative_path="configure_supply_chain.sh")
    copy_repo_file(
        sandbox_root=sandbox_root, relative_path="scripts/configure_supply_chain.py"
    )
    (frontend_dir / ".npmrc").write_text(
        "legacy-peer-deps=true\nsave-exact=true\n",
        encoding="utf-8",
    )

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "configure_supply_chain.sh"),
            "--local-only",
            "--days",
            "11",
        ],
        cwd=sandbox_root,
        env=sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert (sandbox_root / "supply_chain_policy.env").read_text(encoding="utf-8") == (
        "# Repo-local dependency install policy.\nSETTA_MIN_RELEASE_AGE_DAYS=11\n"
    )
    assert (frontend_dir / ".npmrc").read_text(encoding="utf-8") == (
        "legacy-peer-deps=true\nsave-exact=true\nminimum-release-age=15840\n"
    )
    assert (sidecar_dir / ".npmrc").read_text(encoding="utf-8") == (
        "minimum-release-age=15840\n"
    )


def test_configure_supply_chain_global_updates_user_npm_and_pnpm_config(
    tmp_path: Path,
) -> None:
    # Global mode should only delegate to npm/pnpm config commands.
    sandbox_root = tmp_path / "configure_supply_chain_global"
    scripts_dir = sandbox_root / "scripts"
    bin_dir = sandbox_root / "bin"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    bin_dir.mkdir(parents=True, exist_ok=True)
    command_log = sandbox_root / "command-log.txt"

    copy_repo_file(sandbox_root=sandbox_root, relative_path="configure_supply_chain.sh")
    copy_repo_file(
        sandbox_root=sandbox_root, relative_path="scripts/configure_supply_chain.py"
    )
    write_stub_executable(
        bin_dir / "npm",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "npm $*" >> "{command_log}"
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
        [
            "bash",
            str(sandbox_root / "configure_supply_chain.sh"),
            "--global",
            "--days",
            "13",
        ],
        cwd=sandbox_root,
        env=sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert command_log.read_text(encoding="utf-8").splitlines() == [
        "npm config set minimum-release-age 18720 --location=user",
        "pnpm config set minimum-release-age 18720 --global",
    ]


def test_check_uv_lock_release_age_reports_packages_that_are_too_new(
    tmp_path: Path,
) -> None:
    # The uv lock checker should fail on packages published after the allowed cutoff.
    sandbox_root = tmp_path / "uv_release_age"
    scripts_dir = sandbox_root / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)

    copy_repo_file(
        sandbox_root=sandbox_root, relative_path="scripts/check_uv_lock_release_age.py"
    )
    (sandbox_root / "uv.lock").write_text(
        """version = 1
revision = 3
requires-python = ">=3.12, <3.14"

[[package]]
name = "oldpkg"
version = "1.0.0"
sdist = { url = "https://example.com/oldpkg-1.0.0.tar.gz", hash = "sha256:old", size = 1, upload-time = "2024-01-01T00:00:00Z" }

[[package]]
name = "newpkg"
version = "1.0.0"
sdist = { url = "https://example.com/newpkg-1.0.0.tar.gz", hash = "sha256:new", size = 1, upload-time = "2099-01-01T00:00:00Z" }
""",
        encoding="utf-8",
    )

    result = subprocess.run(
        [
            "python3",
            str(sandbox_root / "scripts" / "check_uv_lock_release_age.py"),
            "--days",
            "7",
            "--lockfile",
            str(sandbox_root / "uv.lock"),
        ],
        cwd=sandbox_root,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1
    assert "newpkg==1.0.0" in result.stdout


def test_check_pnpm_lock_release_age_reports_packages_that_are_too_new(
    tmp_path: Path,
) -> None:
    # The pnpm lock checker should resolve aliases and scoped packages against registry metadata.
    sandbox_root = tmp_path / "pnpm_release_age"
    scripts_dir = sandbox_root / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)

    copy_repo_file(
        sandbox_root=sandbox_root,
        relative_path="scripts/check_pnpm_lock_release_age.py",
    )
    (sandbox_root / "pnpm-lock.yaml").write_text(
        """lockfileVersion: '9.0'

packages:

  oldpkg@1.0.0:
    resolution: {integrity: sha512-old}
  '@scope/newpkg@2.0.0(peer@1.0.0)':
    resolution: {integrity: sha512-new}
  aliaspkg@npm:realpkg@3.0.0:
    resolution: {integrity: sha512-real}
""",
        encoding="utf-8",
    )

    metadata_by_path = {
        "/oldpkg": {"time": {"1.0.0": "2024-01-01T00:00:00Z"}},
        "/%40scope%2Fnewpkg": {"time": {"2.0.0": "2099-01-01T00:00:00Z"}},
        "/realpkg": {"time": {"3.0.0": "2024-01-01T00:00:00Z"}},
    }

    class RegistryHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            payload = metadata_by_path.get(self.path)
            if payload is None:
                self.send_response(404)
                self.end_headers()
                return
            body = json.dumps(payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, _format: str, *_args: object) -> None:
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), RegistryHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    try:
        result = subprocess.run(
            [
                "python3",
                str(sandbox_root / "scripts" / "check_pnpm_lock_release_age.py"),
                "--days",
                "7",
                "--lockfile",
                str(sandbox_root / "pnpm-lock.yaml"),
                "--registry-url",
                f"http://127.0.0.1:{server.server_port}",
            ],
            cwd=sandbox_root,
            check=False,
            capture_output=True,
            text=True,
        )
    finally:
        server.shutdown()
        server.server_close()
        server_thread.join(timeout=5)

    assert result.returncode == 1
    assert "@scope/newpkg@2.0.0" in result.stdout


def test_normalize_uv_lock_strips_exclude_newer_options_block(tmp_path: Path) -> None:
    # The transient uv exclude-newer state should never remain committed in uv.lock.
    sandbox_root = tmp_path / "normalize_uv_lock"
    scripts_dir = sandbox_root / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)

    copy_repo_file(
        sandbox_root=sandbox_root, relative_path="scripts/normalize_uv_lock.py"
    )
    lockfile = sandbox_root / "uv.lock"
    lockfile.write_text(
        """version = 1
revision = 3
requires-python = ">=3.12, <3.14"

[options]
exclude-newer = "2026-03-24T12:00:00Z"

[[package]]
name = "demo"
version = "1.0.0"
""",
        encoding="utf-8",
    )

    result = subprocess.run(
        [
            "python3",
            str(sandbox_root / "scripts" / "normalize_uv_lock.py"),
            str(lockfile),
        ],
        cwd=sandbox_root,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert lockfile.read_text(encoding="utf-8") == (
        'version = 1\nrevision = 3\nrequires-python = ">=3.12, <3.14"\n\n[[package]]\nname = "demo"\nversion = "1.0.0"\n'
    )


def test_init_env_uses_frozen_sync_and_activate(tmp_path: Path) -> None:
    # Normal bootstrap should verify the lockfile, sync from it, and activate the venv.
    sandbox_root = tmp_path / "init_env_default"
    bin_dir = sandbox_root / "bin"
    scripts_dir = sandbox_root / "scripts"
    bin_dir.mkdir(parents=True, exist_ok=True)
    scripts_dir.mkdir(parents=True, exist_ok=True)
    command_log = sandbox_root / "command-log.txt"

    copy_repo_file(sandbox_root=sandbox_root, relative_path="init_env.sh")
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
        env=sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert command_log.read_text(encoding="utf-8").splitlines() == [
        "uv lock --check",
        "uv sync --frozen --all-extras --python 3.13",
        "activate",
    ]


def test_init_env_applies_release_age_cutoff_when_repo_policy_exists(
    tmp_path: Path,
) -> None:
    # When the repo policy is present, bootstrap should also verify uv artifact ages.
    sandbox_root = tmp_path / "init_env_policy"
    bin_dir = sandbox_root / "bin"
    scripts_dir = sandbox_root / "scripts"
    bin_dir.mkdir(parents=True, exist_ok=True)
    scripts_dir.mkdir(parents=True, exist_ok=True)
    command_log = sandbox_root / "command-log.txt"

    copy_repo_file(sandbox_root=sandbox_root, relative_path="init_env.sh")
    copy_repo_file(
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
        env=sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert command_log.read_text(encoding="utf-8").splitlines() == [
        "uv lock --check",
        "python3 ./scripts/check_uv_lock_release_age.py --days 7 --lockfile ./uv.lock",
        "uv sync --frozen --all-extras --python 3.13",
        "activate",
    ]


def test_dev_install_uses_frozen_installs(tmp_path: Path) -> None:
    # The high-level dev install path should be read-only with respect to lockfiles.
    sandbox_root = tmp_path / "dev_install"
    frontend_dir = sandbox_root / "frontend"
    scripts_dir = sandbox_root / "scripts"
    bin_dir = sandbox_root / "bin"
    frontend_dir.mkdir(parents=True, exist_ok=True)
    scripts_dir.mkdir(parents=True, exist_ok=True)
    bin_dir.mkdir(parents=True, exist_ok=True)
    command_log = sandbox_root / "command-log.txt"

    copy_repo_file(sandbox_root=sandbox_root, relative_path="dev_install.sh")
    copy_repo_file(sandbox_root=sandbox_root, relative_path="init_env.sh")
    copy_repo_file(
        sandbox_root=sandbox_root, relative_path="scripts/install_sidecars.sh"
    )
    write_stub_executable(
        sandbox_root / "activate.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo activate >> "{command_log}"
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
        bin_dir / "uv",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "uv $*" >> "{command_log}"
""",
    )
    write_stub_executable(
        bin_dir / "pnpm",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "pnpm $*" >> "{command_log}"
""",
    )
    (
        sandbox_root
        / "backend"
        / "setta"
        / "agentic"
        / "external_adapters"
        / "sidecars"
    ).mkdir(parents=True, exist_ok=True)

    result = subprocess.run(
        ["bash", str(sandbox_root / "dev_install.sh")],
        cwd=sandbox_root,
        env=sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert command_log.read_text(encoding="utf-8").splitlines() == [
        "uv lock --check",
        "uv sync --frozen --all-extras --python 3.13",
        "activate",
        "pnpm install --frozen-lockfile",
        "pnpm install --frozen-lockfile --prefer-offline",
        "cleanup",
    ]


def test_audit_supply_chain_wires_python_and_pnpm_audits(tmp_path: Path) -> None:
    # The audit entrypoint should run the full Python/pnpm visibility pass.
    sandbox_root = tmp_path / "audit_supply_chain"
    scripts_dir = sandbox_root / "scripts"
    frontend_dir = sandbox_root / "frontend"
    sidecar_dir = (
        sandbox_root
        / "backend"
        / "setta"
        / "agentic"
        / "external_adapters"
        / "sidecars"
    )
    bin_dir = sandbox_root / "bin"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    frontend_dir.mkdir(parents=True, exist_ok=True)
    sidecar_dir.mkdir(parents=True, exist_ok=True)
    bin_dir.mkdir(parents=True, exist_ok=True)
    command_log = sandbox_root / "command-log.txt"

    copy_repo_file(sandbox_root=sandbox_root, relative_path="audit_supply_chain.sh")
    (sandbox_root / "supply_chain_policy.env").write_text(
        "SETTA_MIN_RELEASE_AGE_DAYS=9\n",
        encoding="utf-8",
    )
    write_stub_executable(
        bin_dir / "python3",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "python3 $*" >> "{command_log}"
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
        bin_dir / "pnpm",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "pnpm $*" >> "{command_log}"
""",
    )

    result = subprocess.run(
        ["bash", str(sandbox_root / "audit_supply_chain.sh")],
        cwd=sandbox_root,
        env=sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert command_log.read_text(encoding="utf-8").splitlines() == [
        "uv lock --check",
        "python3 ./scripts/check_uv_lock_release_age.py --days 9 --lockfile ./uv.lock",
        "uv run --frozen --python 3.13 --all-extras pip-audit",
        "uv run --frozen --python 3.13 --all-extras python ./scripts/check_pnpm_lock_release_age.py --days 9 --lockfile ./frontend/pnpm-lock.yaml",
        "uv run --frozen --python 3.13 --all-extras python ./scripts/check_pnpm_lock_release_age.py --days 9 --lockfile ./backend/setta/agentic/external_adapters/sidecars/pnpm-lock.yaml",
        "pnpm audit",
        "pnpm audit",
    ]


def test_audit_supply_chain_continues_running_checks_after_failure(
    tmp_path: Path,
) -> None:
    # A failed audit step should not prevent later checks from running.
    sandbox_root = tmp_path / "audit_supply_chain_failure"
    scripts_dir = sandbox_root / "scripts"
    frontend_dir = sandbox_root / "frontend"
    sidecar_dir = (
        sandbox_root
        / "backend"
        / "setta"
        / "agentic"
        / "external_adapters"
        / "sidecars"
    )
    bin_dir = sandbox_root / "bin"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    frontend_dir.mkdir(parents=True, exist_ok=True)
    sidecar_dir.mkdir(parents=True, exist_ok=True)
    bin_dir.mkdir(parents=True, exist_ok=True)
    command_log = sandbox_root / "command-log.txt"

    copy_repo_file(sandbox_root=sandbox_root, relative_path="audit_supply_chain.sh")
    (sandbox_root / "supply_chain_policy.env").write_text(
        "SETTA_MIN_RELEASE_AGE_DAYS=9\n",
        encoding="utf-8",
    )
    write_stub_executable(
        bin_dir / "python3",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "python3 $*" >> "{command_log}"
""",
    )
    write_stub_executable(
        bin_dir / "uv",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "uv $*" >> "{command_log}"
if [[ "$1" == "lock" ]]; then
  exit 1
fi
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
        ["bash", str(sandbox_root / "audit_supply_chain.sh")],
        cwd=sandbox_root,
        env=sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1
    assert command_log.read_text(encoding="utf-8").splitlines() == [
        "uv lock --check",
        "python3 ./scripts/check_uv_lock_release_age.py --days 9 --lockfile ./uv.lock",
        "uv run --frozen --python 3.13 --all-extras pip-audit",
        "uv run --frozen --python 3.13 --all-extras python ./scripts/check_pnpm_lock_release_age.py --days 9 --lockfile ./frontend/pnpm-lock.yaml",
        "uv run --frozen --python 3.13 --all-extras python ./scripts/check_pnpm_lock_release_age.py --days 9 --lockfile ./backend/setta/agentic/external_adapters/sidecars/pnpm-lock.yaml",
        "pnpm audit",
        "pnpm audit",
    ]


def test_update_dependencies_refreshes_python_and_pnpm_lockfiles(
    tmp_path: Path,
) -> None:
    # The explicit refresh path should update lockfiles, validate ages, then reinstall from them.
    sandbox_root = tmp_path / "update_dependencies"
    scripts_dir = sandbox_root / "scripts"
    frontend_dir = sandbox_root / "frontend"
    sidecar_dir = (
        sandbox_root
        / "backend"
        / "setta"
        / "agentic"
        / "external_adapters"
        / "sidecars"
    )
    bin_dir = sandbox_root / "bin"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    frontend_dir.mkdir(parents=True, exist_ok=True)
    sidecar_dir.mkdir(parents=True, exist_ok=True)
    bin_dir.mkdir(parents=True, exist_ok=True)
    command_log = sandbox_root / "command-log.txt"

    copy_repo_file(sandbox_root=sandbox_root, relative_path="update_dependencies.sh")
    copy_repo_file(sandbox_root=sandbox_root, relative_path="init_env.sh")
    copy_repo_file(
        sandbox_root=sandbox_root, relative_path="scripts/compute_release_age_cutoff.py"
    )
    copy_repo_file(
        sandbox_root=sandbox_root, relative_path="scripts/normalize_uv_lock.py"
    )
    copy_repo_file(
        sandbox_root=sandbox_root, relative_path="scripts/check_uv_lock_release_age.py"
    )
    copy_repo_file(
        sandbox_root=sandbox_root,
        relative_path="scripts/check_pnpm_lock_release_age.py",
    )
    write_stub_executable(
        sandbox_root / "activate.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo activate >> "{command_log}"
""",
    )
    (sandbox_root / "supply_chain_policy.env").write_text(
        "SETTA_MIN_RELEASE_AGE_DAYS=7\n",
        encoding="utf-8",
    )
    write_stub_executable(
        bin_dir / "uv",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "uv $*" >> "{command_log}"
""",
    )
    write_stub_executable(
        bin_dir / "pnpm",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "pnpm $*" >> "{command_log}"
""",
    )
    write_stub_executable(
        bin_dir / "python3",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == *"compute_release_age_cutoff.py" ]]; then
  echo "2026-03-24"
  exit 0
fi
echo "python3 $*" >> "{command_log}"
""",
    )

    result = subprocess.run(
        ["bash", str(sandbox_root / "update_dependencies.sh")],
        cwd=sandbox_root,
        env=sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert command_log.read_text(encoding="utf-8").splitlines() == [
        "uv lock --upgrade --exclude-newer 2026-03-24",
        "python3 ./scripts/normalize_uv_lock.py ./uv.lock",
        "uv lock --check",
        "python3 ./scripts/check_uv_lock_release_age.py --days 7 --lockfile ./uv.lock",
        "uv sync --frozen --all-extras --python 3.13",
        "activate",
        "pnpm -C frontend install --lockfile-only",
        "uv run --frozen --python 3.13 --all-extras python ./scripts/check_pnpm_lock_release_age.py --days 7 --lockfile ./frontend/pnpm-lock.yaml",
        "pnpm -C frontend install --frozen-lockfile",
        "pnpm -C backend/setta/agentic/external_adapters/sidecars install --lockfile-only",
        "uv run --frozen --python 3.13 --all-extras python ./scripts/check_pnpm_lock_release_age.py --days 7 --lockfile ./backend/setta/agentic/external_adapters/sidecars/pnpm-lock.yaml",
        "pnpm -C backend/setta/agentic/external_adapters/sidecars install --frozen-lockfile --prefer-offline",
    ]
