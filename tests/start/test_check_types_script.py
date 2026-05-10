import os
import subprocess
from pathlib import Path

from tests.start.dev_script_wiring_helpers import repo_root, write_stub_executable


def _build_check_types_sandbox(tmp_path: Path) -> Path:
    root = repo_root()
    sandbox_root = tmp_path / "check_types_sandbox"
    scripts_dir = sandbox_root / "scripts"
    typecheck_scripts_dir = scripts_dir / "typecheck"
    frontend_dir = sandbox_root / "frontend"
    frontend_src_dir = frontend_dir / "src"
    sdk_frontend_dir = frontend_dir / "plugin-sdk" / "app-subsystem"
    plugin_frontend_dir = sandbox_root / "plugins" / "demo" / "frontend"
    plugin_frontend_src_dir = plugin_frontend_dir / "src"
    bin_dir = sandbox_root / "bin"

    scripts_dir.mkdir(parents=True, exist_ok=True)
    typecheck_scripts_dir.mkdir(parents=True, exist_ok=True)
    frontend_dir.mkdir(parents=True, exist_ok=True)
    frontend_src_dir.mkdir(parents=True, exist_ok=True)
    sdk_frontend_dir.mkdir(parents=True, exist_ok=True)
    plugin_frontend_dir.mkdir(parents=True, exist_ok=True)
    plugin_frontend_src_dir.mkdir(parents=True, exist_ok=True)
    bin_dir.mkdir(parents=True, exist_ok=True)

    script_src = root / "scripts/typecheck/report.sh"
    script_dst = sandbox_root / "scripts/typecheck/report.sh"
    script_dst.write_text(script_src.read_text(encoding="utf-8"), encoding="utf-8")
    script_dst.chmod(0o755)
    check_script_src = root / "scripts/typecheck/check.sh"
    check_script_dst = sandbox_root / "scripts/typecheck/check.sh"
    check_script_dst.write_text(
        check_script_src.read_text(encoding="utf-8"), encoding="utf-8"
    )
    check_script_dst.chmod(0o755)

    (sandbox_root / "activate.sh").write_text(
        "#!/usr/bin/env bash\nexport CHECK_TYPES_ACTIVATED=1\n",
        encoding="utf-8",
    )
    (sandbox_root / "activate.sh").chmod(0o755)

    (frontend_dir / "package.json").write_text(
        '{"name":"sandbox-frontend","version":"1.0.0","scripts":{"typecheck":"tsc --noEmit"}}\n',
        encoding="utf-8",
    )
    (sdk_frontend_dir / "package.json").write_text(
        '{"name":"sandbox-sdk","version":"1.0.0","scripts":{"typecheck":"tsc --noEmit"}}\n',
        encoding="utf-8",
    )
    (plugin_frontend_dir / "package.json").write_text(
        '{"name":"sandbox-plugin","version":"1.0.0","scripts":{"typecheck":"tsc --noEmit"}}\n',
        encoding="utf-8",
    )

    (sandbox_root / "backend" / "setta").mkdir(parents=True, exist_ok=True)
    (sandbox_root / "internal" / "demo").mkdir(parents=True, exist_ok=True)
    (sandbox_root / "tests").mkdir(parents=True, exist_ok=True)
    (sandbox_root / "backend" / "setta" / "example.py").write_text(
        "def example() -> None:\n    return None\n",
        encoding="utf-8",
    )
    (sandbox_root / "internal" / "demo" / "demo.go").write_text(
        "package demo\n\nfunc Example() {}\n",
        encoding="utf-8",
    )
    (frontend_src_dir / "app.ts").write_text(
        "export const app = true;\n",
        encoding="utf-8",
    )
    (plugin_frontend_src_dir / "index.ts").write_text(
        "export const plugin = true;\n",
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
echo "$*" > "{sandbox_root / "go_args.txt"}"
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
echo "$*" > "{sandbox_root / "ty_args.txt"}"
echo "${{CHECK_TYPES_ACTIVATED:-}}" > "{sandbox_root / "ty_activation.txt"}"
""",
    )
    write_stub_executable(
        bin_dir / "pnpm",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '__CALL__\\n' >> "{sandbox_root / "pnpm_args.txt"}"
printf '%s\\n' "$@" >> "{sandbox_root / "pnpm_args.txt"}"
""",
    )

    return sandbox_root


def _script_env(sandbox_root: Path) -> dict[str, str]:
    env = os.environ.copy()
    env["PATH"] = f"{sandbox_root / 'bin'}:{env.get('PATH', '')}"
    return env


def _split_calls(calls_path: Path) -> list[list[str]]:
    calls: list[list[str]] = []
    current: list[str] = []
    for line in calls_path.read_text(encoding="utf-8").splitlines():
        if line == "__CALL__":
            if current:
                calls.append(current)
            current = []
            continue
        current.append(line)
    if current:
        calls.append(current)
    return calls


def test_check_types_help(tmp_path: Path) -> None:
    sandbox_root = _build_check_types_sandbox(tmp_path)

    result = subprocess.run(
        ["bash", str(sandbox_root / "scripts/typecheck/report.sh"), "--help"],
        cwd=sandbox_root,
        env=_script_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0
    assert (
        "Run full-repo type checks across Go, Python, and frontend TypeScript packages."
        in result.stdout
    )


def test_check_types_runs_all_languages_by_default(tmp_path: Path) -> None:
    sandbox_root = _build_check_types_sandbox(tmp_path)

    result = subprocess.run(
        ["bash", str(sandbox_root / "scripts/typecheck/report.sh")],
        cwd=sandbox_root,
        env=_script_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    assert (sandbox_root / "go_args.txt").read_text(
        encoding="utf-8"
    ).strip() == "test -run ^$ -count=1 ./..."
    assert (sandbox_root / "ty_args.txt").read_text(encoding="utf-8").strip() == (
        "check --output-format concise backend/setta/example.py tests/test_example.py"
    )
    assert (sandbox_root / "ty_activation.txt").read_text(
        encoding="utf-8"
    ).strip() == "1"
    assert _split_calls(sandbox_root / "pnpm_args.txt") == [
        ["-C", "frontend", "typecheck"],
        ["-C", "frontend/plugin-sdk/app-subsystem", "typecheck"],
        ["-C", "plugins/demo/frontend", "typecheck"],
    ]


def test_check_types_selection_flags_limit_the_run(tmp_path: Path) -> None:
    sandbox_root = _build_check_types_sandbox(tmp_path)

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "scripts/typecheck/report.sh"),
            "--python",
            "--frontend",
        ],
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
    assert _split_calls(sandbox_root / "pnpm_args.txt") == [
        ["-C", "frontend", "typecheck"],
        ["-C", "frontend/plugin-sdk/app-subsystem", "typecheck"],
        ["-C", "plugins/demo/frontend", "typecheck"],
    ]


def test_check_types_changed_scope_uses_selected_files(tmp_path: Path) -> None:
    sandbox_root = _build_check_types_sandbox(tmp_path)

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "scripts/typecheck/check.sh"),
            "--files",
            "backend/setta/example.py",
            "internal/demo/demo.go",
            "frontend/src/app.ts",
            "plugins/demo/frontend/src/index.ts",
        ],
        cwd=sandbox_root,
        env=_script_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    assert (sandbox_root / "go_args.txt").read_text(
        encoding="utf-8"
    ).strip() == "test -run ^$ -count=1 ./internal/demo"
    assert (sandbox_root / "ty_args.txt").read_text(encoding="utf-8").strip() == (
        "check --output-format concise backend/setta/example.py"
    )
    assert _split_calls(sandbox_root / "pnpm_args.txt") == [
        ["-C", "frontend", "typecheck"],
        ["-C", "plugins/demo/frontend", "typecheck"],
    ]
