import json
import os
import re
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
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


def test_configure_supply_chain_local_only_updates_repo_policy_and_npmrc_files(
    tmp_path: Path,
) -> None:
    # Local policy updates should write the repo policy file and both pnpm
    # project .npmrc files without disturbing unrelated settings.
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

    _copy_repo_file(
        sandbox_root=sandbox_root, relative_path="configure_supply_chain.sh"
    )
    _copy_repo_file(
        sandbox_root=sandbox_root, relative_path="scripts/configure_supply_chain.py"
    )
    (frontend_dir / ".npmrc").write_text("legacy-peer-deps=true\n", encoding="utf-8")

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "configure_supply_chain.sh"),
            "--local-only",
            "--days",
            "11",
        ],
        cwd=sandbox_root,
        env=_sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert (sandbox_root / "supply_chain_policy.env").read_text(encoding="utf-8") == (
        "# Repo-local dependency install policy.\nSETTA_MIN_RELEASE_AGE_DAYS=11\n"
    )
    assert (frontend_dir / ".npmrc").read_text(encoding="utf-8") == (
        "legacy-peer-deps=true\nminimum-release-age=15840\n"
    )
    assert (sidecar_dir / ".npmrc").read_text(encoding="utf-8") == (
        "minimum-release-age=15840\n"
    )


def test_configure_supply_chain_global_updates_user_npm_and_pnpm_config(
    tmp_path: Path,
) -> None:
    # Global mode should delegate to npm/pnpm user config instead of writing
    # repo-local files.
    sandbox_root = tmp_path / "configure_supply_chain_global"
    scripts_dir = sandbox_root / "scripts"
    bin_dir = sandbox_root / "bin"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    bin_dir.mkdir(parents=True, exist_ok=True)
    command_log = sandbox_root / "command-log.txt"

    _copy_repo_file(
        sandbox_root=sandbox_root, relative_path="configure_supply_chain.sh"
    )
    _copy_repo_file(
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
        env=_sandbox_env(sandbox_root),
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
    # The uv lock checker should fail on a package whose newest artifact is
    # younger than the requested cutoff.
    sandbox_root = tmp_path / "uv_release_age"
    scripts_dir = sandbox_root / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)

    _copy_repo_file(
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
    # The pnpm lock checker should resolve normal, scoped, and aliased packages
    # and then fail if any published version is too new.
    sandbox_root = tmp_path / "pnpm_release_age"
    scripts_dir = sandbox_root / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)

    _copy_repo_file(
        sandbox_root=sandbox_root, relative_path="scripts/check_pnpm_lock_release_age.py"
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


def test_compute_release_age_cutoff_emits_utc_rfc3339_timestamp(
    tmp_path: Path,
) -> None:
    # The cutoff helper should emit a whole-second UTC timestamp that uv can
    # consume for exclude-newer.
    sandbox_root = tmp_path / "compute_release_age_cutoff"
    scripts_dir = sandbox_root / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)

    _copy_repo_file(
        sandbox_root=sandbox_root, relative_path="scripts/compute_release_age_cutoff.py"
    )

    result = subprocess.run(
        [
            "python3",
            str(sandbox_root / "scripts" / "compute_release_age_cutoff.py"),
            "7",
        ],
        cwd=sandbox_root,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", result.stdout.strip())


def test_normalize_uv_lock_strips_exclude_newer_options_block(
    tmp_path: Path,
) -> None:
    # The normalizer should keep the committed lockfile stable by dropping the
    # transient exclude-newer block.
    sandbox_root = tmp_path / "normalize_uv_lock"
    scripts_dir = sandbox_root / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)

    _copy_repo_file(
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


def test_audit_supply_chain_wires_python_and_pnpm_audits(
    tmp_path: Path,
) -> None:
    # The top-level audit runner should sequence the Python and pnpm checks
    # through the repo-managed toolchain.
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

    _copy_repo_file(sandbox_root=sandbox_root, relative_path="audit_supply_chain.sh")
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
        env=_sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert command_log.read_text(encoding="utf-8").splitlines() == [
        "uv lock --check",
        "python3 ./scripts/check_uv_lock_release_age.py --days 9 --lockfile ./uv.lock",
        "uv run --frozen --python 3.13 --extra dev pip-audit",
        "uv run --frozen --python 3.13 --extra dev python ./scripts/check_pnpm_lock_release_age.py --days 9 --lockfile ./frontend/pnpm-lock.yaml",
        "uv run --frozen --python 3.13 --extra dev python ./scripts/check_pnpm_lock_release_age.py --days 9 --lockfile ./backend/setta/agentic/external_adapters/sidecars/pnpm-lock.yaml",
        "pnpm audit",
        "pnpm audit",
    ]


def test_audit_supply_chain_continues_running_checks_after_failure(
    tmp_path: Path,
) -> None:
    # One failing step should not suppress the rest of the audit surface; the
    # script should collect every failure before exiting non-zero.
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

    _copy_repo_file(sandbox_root=sandbox_root, relative_path="audit_supply_chain.sh")
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
        env=_sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1
    assert command_log.read_text(encoding="utf-8").splitlines() == [
        "uv lock --check",
        "python3 ./scripts/check_uv_lock_release_age.py --days 9 --lockfile ./uv.lock",
        "uv run --frozen --python 3.13 --extra dev pip-audit",
        "uv run --frozen --python 3.13 --extra dev python ./scripts/check_pnpm_lock_release_age.py --days 9 --lockfile ./frontend/pnpm-lock.yaml",
        "uv run --frozen --python 3.13 --extra dev python ./scripts/check_pnpm_lock_release_age.py --days 9 --lockfile ./backend/setta/agentic/external_adapters/sidecars/pnpm-lock.yaml",
        "pnpm audit",
        "pnpm audit",
    ]


def test_install_sidecars_uses_frozen_lockfile(tmp_path: Path) -> None:
    # Sidecar installs should stay pinned to the checked-in lockfile.
    sandbox_root = tmp_path / "install_sidecars"
    sidecar_dir = (
        sandbox_root
        / "backend"
        / "setta"
        / "agentic"
        / "external_adapters"
        / "sidecars"
    )
    bin_dir = sandbox_root / "bin"
    sidecar_dir.mkdir(parents=True, exist_ok=True)
    bin_dir.mkdir(parents=True, exist_ok=True)
    command_log = sandbox_root / "command-log.txt"
    pnpm_env = sandbox_root / "pnpm-env.txt"

    _copy_repo_file(
        sandbox_root=sandbox_root, relative_path="scripts/install_sidecars.sh"
    )
    _copy_repo_file(
        sandbox_root=sandbox_root, relative_path="scripts/lib/node_tooling.sh"
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
        ["bash", str(sandbox_root / "scripts" / "install_sidecars.sh")],
        cwd=sandbox_root,
        env=_sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert command_log.read_text(encoding="utf-8").splitlines() == [
        "pnpm install --frozen-lockfile --prefer-offline",
    ]
    assert parse_env_snapshot(pnpm_env.read_text(encoding="utf-8")).get(
        "COREPACK_ENABLE_AUTO_PIN"
    ) == "0"


def test_install_sidecars_prefers_corepack_and_disables_auto_pin(
    tmp_path: Path,
) -> None:
    # Sidecar installs should use corepack when it is available so the repo's
    # pinned pnpm version is honored on the devbox too.
    sandbox_root = tmp_path / "install_sidecars_corepack"
    sidecar_dir = (
        sandbox_root
        / "backend"
        / "setta"
        / "agentic"
        / "external_adapters"
        / "sidecars"
    )
    bin_dir = sandbox_root / "bin"
    sidecar_dir.mkdir(parents=True, exist_ok=True)
    bin_dir.mkdir(parents=True, exist_ok=True)
    corepack_cmd = sandbox_root / "corepack-cmd.txt"
    corepack_env = sandbox_root / "corepack-env.txt"
    pnpm_cmd = sandbox_root / "pnpm-cmd.txt"

    _copy_repo_file(
        sandbox_root=sandbox_root, relative_path="scripts/install_sidecars.sh"
    )
    _copy_repo_file(
        sandbox_root=sandbox_root, relative_path="scripts/lib/node_tooling.sh"
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
        ["bash", str(sandbox_root / "scripts" / "install_sidecars.sh")],
        cwd=sandbox_root,
        env=_sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert corepack_cmd.read_text(encoding="utf-8").strip() == (
        "pnpm install --frozen-lockfile --prefer-offline"
    )
    assert parse_env_snapshot(corepack_env.read_text(encoding="utf-8")).get(
        "COREPACK_ENABLE_AUTO_PIN"
    ) == "0"
    assert not pnpm_cmd.exists()


def test_update_dependencies_refreshes_python_and_pnpm_lockfiles(
    tmp_path: Path,
) -> None:
    # The dependency refresh path should intentionally update lockfiles, apply
    # the release-age cutoff, then reinstall from the frozen outputs.
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

    _copy_repo_file(
        sandbox_root=sandbox_root, relative_path="update_dependencies.sh"
    )
    _copy_repo_file(sandbox_root=sandbox_root, relative_path="init_env.sh")
    _copy_repo_file(
        sandbox_root=sandbox_root,
        relative_path="scripts/compute_release_age_cutoff.py",
    )
    _copy_repo_file(
        sandbox_root=sandbox_root, relative_path="scripts/normalize_uv_lock.py"
    )
    _copy_repo_file(
        sandbox_root=sandbox_root, relative_path="scripts/check_uv_lock_release_age.py"
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
        env=_sandbox_env(sandbox_root),
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
        "uv sync --frozen --extra dev --python 3.13",
        "activate",
        "pnpm -C frontend install --lockfile-only",
        "uv run --frozen --python 3.13 --extra dev python ./scripts/check_pnpm_lock_release_age.py --days 7 --lockfile ./frontend/pnpm-lock.yaml",
        "pnpm -C frontend install --frozen-lockfile",
        "pnpm -C backend/setta/agentic/external_adapters/sidecars install --lockfile-only",
        "uv run --frozen --python 3.13 --extra dev python ./scripts/check_pnpm_lock_release_age.py --days 7 --lockfile ./backend/setta/agentic/external_adapters/sidecars/pnpm-lock.yaml",
        "pnpm -C backend/setta/agentic/external_adapters/sidecars install --frozen-lockfile --prefer-offline",
    ]
