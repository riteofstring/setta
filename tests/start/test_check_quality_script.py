import os
import subprocess
from pathlib import Path

from tests.start.dev_script_wiring_helpers import repo_root, write_stub_executable


def _build_check_quality_sandbox(tmp_path: Path) -> Path:
    root = repo_root()
    sandbox_root = tmp_path / "check_quality_sandbox"
    scripts_dir = sandbox_root / "scripts"
    frontend_src_dir = sandbox_root / "frontend" / "src"
    backend_dir = sandbox_root / "backend" / "setta"
    internal_dir = sandbox_root / "internal"
    bin_dir = sandbox_root / "bin"

    scripts_dir.mkdir(parents=True, exist_ok=True)
    frontend_src_dir.mkdir(parents=True, exist_ok=True)
    backend_dir.mkdir(parents=True, exist_ok=True)
    internal_dir.mkdir(parents=True, exist_ok=True)
    bin_dir.mkdir(parents=True, exist_ok=True)

    script_src = root / "check_quality.sh"
    script_dst = sandbox_root / "check_quality.sh"
    script_dst.write_text(script_src.read_text(encoding="utf-8"), encoding="utf-8")
    script_dst.chmod(0o755)

    (sandbox_root / "activate.sh").write_text(
        "#!/usr/bin/env bash\nexport CHECK_QUALITY_ACTIVATED=1\n",
        encoding="utf-8",
    )
    (sandbox_root / "activate.sh").chmod(0o755)

    (backend_dir / "example.py").write_text(
        "def example() -> None:\n    return None\n",
        encoding="utf-8",
    )
    (frontend_src_dir / "example.ts").write_text(
        "export const example = 1;\n",
        encoding="utf-8",
    )
    (internal_dir / "example.go").write_text(
        "package internal\n\nfunc Example() {}\n",
        encoding="utf-8",
    )

    write_stub_executable(
        bin_dir / "ruff",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "{sandbox_root / 'ruff_args.txt'}"
""",
    )
    write_stub_executable(
        bin_dir / "pnpm",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "{sandbox_root / 'pnpm_args.txt'}"
""",
    )
    write_stub_executable(
        scripts_dir / "go.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "{sandbox_root / 'go_args.txt'}"
""",
    )

    return sandbox_root


def _script_env(sandbox_root: Path) -> dict[str, str]:
    env = os.environ.copy()
    env["PATH"] = f"{sandbox_root / 'bin'}:{env.get('PATH', '')}"
    return env


def test_check_quality_uses_strict_default_complexity_thresholds(tmp_path: Path) -> None:
    sandbox_root = _build_check_quality_sandbox(tmp_path)

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "check_quality.sh"),
            "--files",
            "backend/setta/example.py",
            "frontend/src/example.ts",
            "internal/example.go",
        ],
        cwd=sandbox_root,
        env=_script_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"

    ruff_args = (sandbox_root / "ruff_args.txt").read_text(encoding="utf-8").splitlines()
    pnpm_args = (sandbox_root / "pnpm_args.txt").read_text(encoding="utf-8").splitlines()
    go_args = (sandbox_root / "go_args.txt").read_text(encoding="utf-8").splitlines()

    assert ruff_args == [
        "check backend/setta/example.py",
        "check --select C901 --output-format=concise --config lint.mccabe.max-complexity = 9 backend/setta/example.py",
    ]
    assert pnpm_args == [
        '-C frontend exec eslint --rule complexity:["error",9] --rule max-depth:["error",4] --rule max-params:["error",5] -- src/example.ts',
    ]
    assert go_args == [
        "vet ./internal",
        "run github.com/fzipp/gocyclo/cmd/gocyclo@v0.6.0 -over 9 internal/example.go",
    ]


def test_check_quality_passes_explicit_threshold_overrides_to_each_tool(
    tmp_path: Path,
) -> None:
    sandbox_root = _build_check_quality_sandbox(tmp_path)

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "check_quality.sh"),
            "--python-max",
            "7",
            "--frontend-max",
            "6",
            "--go-max",
            "5",
            "--files",
            "backend/setta/example.py",
            "frontend/src/example.ts",
            "internal/example.go",
        ],
        cwd=sandbox_root,
        env=_script_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"

    ruff_args = (sandbox_root / "ruff_args.txt").read_text(encoding="utf-8").splitlines()
    pnpm_args = (sandbox_root / "pnpm_args.txt").read_text(encoding="utf-8").splitlines()
    go_args = (sandbox_root / "go_args.txt").read_text(encoding="utf-8").splitlines()

    assert ruff_args[-1] == (
        "check --select C901 --output-format=concise --config "
        "lint.mccabe.max-complexity = 7 backend/setta/example.py"
    )
    assert pnpm_args[-1] == (
        '-C frontend exec eslint --rule complexity:["error",6] '
        '--rule max-depth:["error",4] --rule max-params:["error",5] -- src/example.ts'
    )
    assert go_args[-1] == (
        "run github.com/fzipp/gocyclo/cmd/gocyclo@v0.6.0 -over 5 internal/example.go"
    )
