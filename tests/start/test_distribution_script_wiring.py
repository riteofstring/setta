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


def _build_distribution_sandbox(tmp_path: Path) -> tuple[Path, Path, Path]:
    sandbox_root = tmp_path / "distribution_sandbox"
    bin_dir = sandbox_root / "bin"
    scripts_dir = sandbox_root / "scripts"
    frontend_dir = sandbox_root / "frontend"
    backend_setta_dir = sandbox_root / "backend" / "setta"
    bin_dir.mkdir(parents=True, exist_ok=True)
    scripts_dir.mkdir(parents=True, exist_ok=True)
    frontend_dir.mkdir(parents=True, exist_ok=True)
    backend_setta_dir.mkdir(parents=True, exist_ok=True)

    _copy_repo_file(sandbox_root=sandbox_root, relative_path="build.sh")
    _copy_repo_file(
        sandbox_root=sandbox_root,
        relative_path="scripts/build_python_distribution_with_go_binaries.sh",
    )

    command_log = sandbox_root / "command-log.txt"
    cleanup_count = sandbox_root / "cleanup-count.txt"

    write_stub_executable(
        sandbox_root / "activate.sh",
        "#!/usr/bin/env bash\nexport VIRTUAL_ENV='distribution-sandbox'\n",
    )
    write_stub_executable(
        sandbox_root / "cleanup.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
count=0
if [[ -f "{cleanup_count}" ]]; then
  count="$(<"{cleanup_count}")"
fi
echo "$((count + 1))" > "{cleanup_count}"
echo cleanup >> "{command_log}"
""",
    )
    write_stub_executable(
        scripts_dir / "build_packaged_go_binaries.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo go-binaries >> "{command_log}"
""",
    )
    write_stub_executable(
        scripts_dir / "bundle_node_runtime.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo bundle-node >> "{command_log}"
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
        bin_dir / "pnpm",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "pnpm $*" >> "{command_log}"
if [[ "$1" == "build" ]]; then
  mkdir -p dist
  printf '%s\\n' '<html>dist</html>' > dist/index.html
fi
""",
    )
    write_stub_executable(
        bin_dir / "python",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "python $*" >> "{command_log}"
""",
    )

    return sandbox_root, command_log, cleanup_count


def _build_verify_install_sandbox(tmp_path: Path) -> tuple[Path, Path]:
    sandbox_root = tmp_path / "verify_install_sandbox"
    bin_dir = sandbox_root / "bin"
    lib_dir = sandbox_root / "scripts" / "lib"
    dist_dir = sandbox_root / "dist"
    bin_dir.mkdir(parents=True, exist_ok=True)
    lib_dir.mkdir(parents=True, exist_ok=True)
    dist_dir.mkdir(parents=True, exist_ok=True)

    _copy_repo_file(sandbox_root=sandbox_root, relative_path="verify_install.sh")
    _copy_repo_file(
        sandbox_root=sandbox_root,
        relative_path="scripts/lib/distribution_artifact_path.sh",
    )

    command_log = sandbox_root / "command-log.txt"

    write_stub_executable(
        sandbox_root / "init_env.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo init-env >> "{command_log}"
""",
    )
    write_stub_executable(
        sandbox_root / "build.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo build >> "{command_log}"
mkdir -p dist
printf '%s\\n' 'sdist' > dist/setta-0.0.0.tar.gz
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

    return sandbox_root, command_log


def _build_build_and_upload_sandbox(tmp_path: Path) -> tuple[Path, Path]:
    sandbox_root = tmp_path / "build_and_upload_sandbox"
    bin_dir = sandbox_root / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)

    _copy_repo_file(sandbox_root=sandbox_root, relative_path="build_and_upload.sh")

    command_log = sandbox_root / "command-log.txt"

    write_stub_executable(
        sandbox_root / "init_env.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo init-env >> "{command_log}"
""",
    )
    write_stub_executable(
        sandbox_root / "build.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo build >> "{command_log}"
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
        bin_dir / "python",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "python $*" >> "{command_log}"
""",
    )

    return sandbox_root, command_log


def _build_install_built_setta_sandbox(tmp_path: Path) -> tuple[Path, Path]:
    sandbox_root = tmp_path / "install_built_setta_sandbox"
    bin_dir = sandbox_root / "bin"
    lib_dir = sandbox_root / "scripts" / "lib"
    dist_dir = sandbox_root / "dist"
    bin_dir.mkdir(parents=True, exist_ok=True)
    lib_dir.mkdir(parents=True, exist_ok=True)
    dist_dir.mkdir(parents=True, exist_ok=True)

    _copy_repo_file(sandbox_root=sandbox_root, relative_path="install_built_setta.sh")
    _copy_repo_file(
        sandbox_root=sandbox_root,
        relative_path="scripts/lib/install_root_path.sh",
    )
    _copy_repo_file(
        sandbox_root=sandbox_root,
        relative_path="scripts/lib/distribution_artifact_path.sh",
    )

    command_log = sandbox_root / "command-log.txt"

    write_stub_executable(
        sandbox_root / "build.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo build >> "{command_log}"
mkdir -p dist
printf '%s\\n' 'wheel' > dist/setta-0.0.0-py3-none-macosx_14_0_arm64.whl
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
if [[ "$1" == "venv" ]]; then
  install_root="${{@: -1}}"
  mkdir -p "${{install_root}}/bin"
  printf '%s\\n' '#!/usr/bin/env bash' > "${{install_root}}/bin/python"
  chmod +x "${{install_root}}/bin/python"
fi
""",
    )

    return sandbox_root, command_log


def _sandbox_env(sandbox_root: Path) -> dict[str, str]:
    env = os.environ.copy()
    env["PATH"] = f"{sandbox_root / 'bin'}:{env.get('PATH', '')}"
    return env


def test_distribution_helper_runs_cleanup_by_default(tmp_path: Path) -> None:
    # The shared helper should keep its standalone fail-fast cleanup behavior.
    sandbox_root, command_log, cleanup_count = _build_distribution_sandbox(tmp_path)

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "scripts" / "build_python_distribution_with_go_binaries.sh"),
            "--sdist",
        ],
        cwd=sandbox_root,
        env=_sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert cleanup_count.read_text(encoding="utf-8").strip() == "1"
    assert command_log.read_text(encoding="utf-8").splitlines() == [
        "cleanup",
        "go-binaries",
        "python -m build --sdist",
    ]


def test_distribution_helper_skip_cleanup_preserves_prepared_inputs(tmp_path: Path) -> None:
    # Callers that already prepared assets should be able to reuse the helper without a second cleanup.
    sandbox_root, command_log, cleanup_count = _build_distribution_sandbox(tmp_path)

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "scripts" / "build_python_distribution_with_go_binaries.sh"),
            "--skip-cleanup",
            "--wheel",
        ],
        cwd=sandbox_root,
        env=_sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert not cleanup_count.exists()
    assert command_log.read_text(encoding="utf-8").splitlines() == [
        "go-binaries",
        "python -m build --wheel",
    ]


def test_build_script_uses_shared_distribution_helper_without_second_cleanup(
    tmp_path: Path,
) -> None:
    # The repo-root build wrapper should prepare assets once, then package through the shared helper.
    sandbox_root, command_log, cleanup_count = _build_distribution_sandbox(tmp_path)

    result = subprocess.run(
        ["bash", str(sandbox_root / "build.sh")],
        cwd=sandbox_root,
        env=_sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert cleanup_count.read_text(encoding="utf-8").strip() == "1"
    assert (sandbox_root / "backend" / "setta" / "static" / "frontend" / "index.html").exists()
    assert command_log.read_text(encoding="utf-8").splitlines() == [
        "cleanup",
        "bundle-node",
        "install-sidecars",
        "pnpm build",
        "go-binaries",
        "python -m build",
    ]


def test_verify_install_still_smokes_the_built_sdist_through_build_sh() -> None:
    # The install smoke script should stay above build.sh rather than forking its own packaging path.
    script = (repo_root() / "verify_install.sh").read_text(encoding="utf-8")

    assert "./build.sh" in script
    assert 'uv pip install --force-reinstall "$filepath"' in script


def test_build_and_upload_still_reuses_build_sh_before_publish() -> None:
    # The publish wrapper should inherit the shared build contract from build.sh.
    script = (repo_root() / "build_and_upload.sh").read_text(encoding="utf-8")

    assert "./build.sh" in script
    assert "python -m twine upload dist/*" in script


def test_install_built_setta_still_reuses_build_sh_before_wheel_install() -> None:
    # The isolated built-install helper should keep build ownership in build.sh.
    script = (repo_root() / "install_built_setta.sh").read_text(encoding="utf-8")

    assert "./build.sh" in script
    assert 'uv pip install --python "$install_root_abs/bin/python" --force-reinstall "$wheel_path"' in script


def test_verify_install_uses_shared_artifact_helper_for_sdist_selection(
    tmp_path: Path,
) -> None:
    # The packaging smoke wrapper should install the one built sdist via the shared helper.
    sandbox_root, command_log = _build_verify_install_sandbox(tmp_path)

    result = subprocess.run(
        ["bash", str(sandbox_root / "verify_install.sh")],
        cwd=sandbox_root,
        env=_sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert command_log.read_text(encoding="utf-8").splitlines() == [
        "init-env",
        "build",
        f"uv pip install --force-reinstall {(sandbox_root / 'dist' / 'setta-0.0.0.tar.gz').resolve(strict=False)}",
        "cleanup",
    ]


def test_verify_install_runs_cleanup_even_when_install_fails(tmp_path: Path) -> None:
    # The install smoke wrapper should not leave build artifacts behind when uv install fails.
    sandbox_root, command_log = _build_verify_install_sandbox(tmp_path)
    write_stub_executable(
        sandbox_root / "bin" / "uv",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "uv $*" >> "{command_log}"
exit 9
""",
    )

    result = subprocess.run(
        ["bash", str(sandbox_root / "verify_install.sh")],
        cwd=sandbox_root,
        env=_sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 9
    assert command_log.read_text(encoding="utf-8").splitlines() == [
        "init-env",
        "build",
        f"uv pip install --force-reinstall {(sandbox_root / 'dist' / 'setta-0.0.0.tar.gz').resolve(strict=False)}",
        "cleanup",
    ]


def test_install_built_setta_uses_shared_artifact_helper_for_wheel_selection(
    tmp_path: Path,
) -> None:
    # The isolated built-install wrapper should install the one built wheel via the shared helper.
    sandbox_root, command_log = _build_install_built_setta_sandbox(tmp_path)
    install_root = sandbox_root / "built-venv"

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "install_built_setta.sh"),
            "--install-root",
            str(install_root),
        ],
        cwd=sandbox_root,
        env=_sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert command_log.read_text(encoding="utf-8").splitlines() == [
        "build",
        f"uv venv --clear --python 3.12 {install_root.resolve(strict=False)}",
        (
            "uv pip install --python "
            f"{install_root.resolve(strict=False) / 'bin' / 'python'} "
            "--force-reinstall "
            f"{(sandbox_root / 'dist' / 'setta-0.0.0-py3-none-macosx_14_0_arm64.whl').resolve(strict=False)}"
        ),
        "cleanup",
    ]


def test_build_and_upload_runs_cleanup_after_successful_publish(
    tmp_path: Path,
) -> None:
    # The upload wrapper should clean build artifacts after a successful publish.
    sandbox_root, command_log = _build_build_and_upload_sandbox(tmp_path)

    result = subprocess.run(
        ["bash", str(sandbox_root / "build_and_upload.sh")],
        cwd=sandbox_root,
        env=_sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert command_log.read_text(encoding="utf-8").splitlines() == [
        "init-env",
        "build",
        "python -m twine upload dist/*",
        "cleanup",
    ]


def test_build_and_upload_preserves_publish_failure_and_still_cleans(
    tmp_path: Path,
) -> None:
    # Cleanup should run after upload failure without overwriting the publish exit status.
    sandbox_root, command_log = _build_build_and_upload_sandbox(tmp_path)
    write_stub_executable(
        sandbox_root / "bin" / "python",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "python $*" >> "{command_log}"
exit 7
""",
    )

    result = subprocess.run(
        ["bash", str(sandbox_root / "build_and_upload.sh")],
        cwd=sandbox_root,
        env=_sandbox_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 7
    assert command_log.read_text(encoding="utf-8").splitlines() == [
        "init-env",
        "build",
        "python -m twine upload dist/*",
        "cleanup",
    ]
