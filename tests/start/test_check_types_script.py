import os
import subprocess
from pathlib import Path

from tests.start.dev_script_wiring_helpers import repo_root, write_stub_executable


def _build_check_types_sandbox(tmp_path: Path) -> Path:
    root = repo_root()
    sandbox_root = tmp_path / "check_types_sandbox"
    scripts_dir = sandbox_root / "scripts"
    frontend_dir = sandbox_root / "frontend"
    bin_dir = sandbox_root / "bin"

    scripts_dir.mkdir(parents=True, exist_ok=True)
    frontend_dir.mkdir(parents=True, exist_ok=True)
    bin_dir.mkdir(parents=True, exist_ok=True)

    script_src = root / "check_types.sh"
    script_dst = sandbox_root / "check_types.sh"
    script_dst.write_text(script_src.read_text(encoding="utf-8"), encoding="utf-8")
    script_dst.chmod(0o755)

    (sandbox_root / "activate.sh").write_text(
        "#!/usr/bin/env bash\nexport CHECK_TYPES_ACTIVATED=1\n",
        encoding="utf-8",
    )
    (sandbox_root / "activate.sh").chmod(0o755)

    (frontend_dir / "package.json").write_text(
        '{"name":"sandbox-frontend","version":"1.0.0","scripts":{"typecheck":"tsc --noEmit"}}\n',
        encoding="utf-8",
    )

    (sandbox_root / "backend" / "setta").mkdir(parents=True, exist_ok=True)
    (sandbox_root / "tests").mkdir(parents=True, exist_ok=True)
    (sandbox_root / "backend" / "setta" / "example.py").write_text(
        "def example() -> None:\n    return None\n",
        encoding="utf-8",
    )
    (sandbox_root / "tests" / "test_example.py").write_text(
        "def test_example() -> None:\n    assert True\n",
        encoding="utf-8",
    )

    write_stub_executable(
        scripts_dir / "go.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{sandbox_root / 'go_args.txt'}"
""",
    )
    write_stub_executable(
        bin_dir / "git",
        """#!/usr/bin/env bash
set -euo pipefail
if [[ "${1-}" == "ls-files" && "${2-}" == "*.py" ]]; then
  printf '%s\n' "backend/setta/example.py" "tests/test_example.py"
  exit 0
fi
echo "unexpected git invocation: $*" >&2
exit 1
""",
    )
    write_stub_executable(
        bin_dir / "ty",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{sandbox_root / 'ty_args.txt'}"
echo "${{CHECK_TYPES_ACTIVATED:-}}" > "{sandbox_root / 'ty_activation.txt'}"
""",
    )
    write_stub_executable(
        bin_dir / "pnpm",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "{sandbox_root / 'pnpm_args.txt'}"
""",
    )

    return sandbox_root


def _script_env(sandbox_root: Path) -> dict[str, str]:
    env = os.environ.copy()
    env["PATH"] = f"{sandbox_root / 'bin'}:{env.get('PATH', '')}"
    return env


def test_check_types_help(tmp_path: Path) -> None:
    sandbox_root = _build_check_types_sandbox(tmp_path)

    result = subprocess.run(
        ["bash", str(sandbox_root / "check_types.sh"), "--help"],
        cwd=sandbox_root,
        env=_script_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0
    assert "Run full-repo type checks across Go, Python, and frontend TypeScript." in result.stdout


def test_check_types_runs_all_languages_by_default(tmp_path: Path) -> None:
    sandbox_root = _build_check_types_sandbox(tmp_path)

    result = subprocess.run(
        ["bash", str(sandbox_root / "check_types.sh")],
        cwd=sandbox_root,
        env=_script_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    assert (sandbox_root / "go_args.txt").read_text(encoding="utf-8").strip() == "test -run ^$ -count=1 ./..."
    assert (sandbox_root / "ty_args.txt").read_text(encoding="utf-8").strip() == (
        "check --output-format concise backend/setta/example.py tests/test_example.py"
    )
    assert (sandbox_root / "ty_activation.txt").read_text(encoding="utf-8").strip() == "1"
    assert (sandbox_root / "pnpm_args.txt").read_text(encoding="utf-8").strip() == (
        "-C frontend typecheck"
    )


def test_check_types_selection_flags_limit_the_run(tmp_path: Path) -> None:
    sandbox_root = _build_check_types_sandbox(tmp_path)

    result = subprocess.run(
        ["bash", str(sandbox_root / "check_types.sh"), "--python", "--frontend"],
        cwd=sandbox_root,
        env=_script_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    assert not (sandbox_root / "go_args.txt").exists()
    assert (sandbox_root / "ty_args.txt").read_text(encoding="utf-8").strip() == (
        "check --output-format concise backend/setta/example.py tests/test_example.py"
    )
    assert (sandbox_root / "pnpm_args.txt").read_text(encoding="utf-8").strip() == (
        "-C frontend typecheck"
    )
