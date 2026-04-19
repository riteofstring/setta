import os
import subprocess
from pathlib import Path

from tests.start.dev_script_wiring_helpers import repo_root, write_stub_executable


def _build_check_quality_sandbox(tmp_path: Path) -> Path:
    root = repo_root()
    sandbox_root = tmp_path / "check_quality_sandbox"
    frontend_dir = sandbox_root / "frontend" / "src"
    plugin_frontend_dir = sandbox_root / "plugins" / "demo" / "frontend" / "src"
    plugin_backend_dir = sandbox_root / "plugins" / "demo" / "backend"
    scripts_dir = sandbox_root / "scripts"
    bin_dir = sandbox_root / "bin"

    frontend_dir.mkdir(parents=True, exist_ok=True)
    plugin_frontend_dir.mkdir(parents=True, exist_ok=True)
    plugin_backend_dir.mkdir(parents=True, exist_ok=True)
    scripts_dir.mkdir(parents=True, exist_ok=True)
    bin_dir.mkdir(parents=True, exist_ok=True)

    script_dst = sandbox_root / "check_quality.sh"
    script_dst.write_text(
        (root / "check_quality.sh").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    script_dst.chmod(0o755)
    (scripts_dir / "lib").mkdir(parents=True, exist_ok=True)
    quality_paths_dst = scripts_dir / "lib" / "quality_paths.sh"
    quality_paths_dst.write_text(
        (root / "scripts" / "lib" / "quality_paths.sh").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    quality_paths_dst.chmod(0o755)

    (sandbox_root / "activate.sh").write_text(
        "#!/usr/bin/env bash\nexport CHECK_QUALITY_ACTIVATED=1\n",
        encoding="utf-8",
    )
    (sandbox_root / "activate.sh").chmod(0o755)

    (frontend_dir / "app.ts").write_text("export const app = true;\n", encoding="utf-8")
    (plugin_frontend_dir / "index.ts").write_text(
        "export const plugin = true;\n",
        encoding="utf-8",
    )
    (plugin_backend_dir / "main.go").write_text(
        "package main\n\nfunc main() {}\n",
        encoding="utf-8",
    )
    (plugin_backend_dir / "main.py").write_text(
        "def main() -> None:\n    return None\n",
        encoding="utf-8",
    )

    write_stub_executable(
        bin_dir / "ruff",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '__CALL__\\n' >> "{sandbox_root / 'ruff_calls.txt'}"
printf '%s\\n' "$@" >> "{sandbox_root / 'ruff_calls.txt'}"
""",
    )
    write_stub_executable(
        bin_dir / "pnpm",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '__CALL__\\n' >> "{sandbox_root / 'pnpm_calls.txt'}"
printf '%s\\n' "$@" >> "{sandbox_root / 'pnpm_calls.txt'}"
""",
    )
    write_stub_executable(
        bin_dir / "node",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '__CALL__\\n' >> "{sandbox_root / 'node_calls.txt'}"
printf '%s\\n' "$@" >> "{sandbox_root / 'node_calls.txt'}"
""",
    )
    write_stub_executable(
        scripts_dir / "go.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '__CALL__\\n' >> "{sandbox_root / 'go_calls.txt'}"
printf '%s\\n' "$@" >> "{sandbox_root / 'go_calls.txt'}"
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


def test_check_quality_includes_plugin_frontend_and_go_sources(tmp_path: Path) -> None:
    sandbox_root = _build_check_quality_sandbox(tmp_path)

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "check_quality.sh"),
            "--files",
            "frontend/src/app.ts",
            "plugins/demo/frontend/src/index.ts",
            "plugins/demo/backend/main.go",
            "plugins/demo/backend/main.py",
        ],
        cwd=sandbox_root,
        env=_script_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"

    ruff_calls = _split_calls(sandbox_root / "ruff_calls.txt")
    assert len(ruff_calls) == 2
    assert ruff_calls[0] == ["check", "plugins/demo/backend/main.py"]
    assert ruff_calls[1] == [
        "check",
        "--select",
        "C901",
        "--output-format=concise",
        "--config",
        "lint.mccabe.max-complexity = 9",
        "plugins/demo/backend/main.py",
    ]

    pnpm_calls = _split_calls(sandbox_root / "pnpm_calls.txt")
    assert pnpm_calls == [
        [
            "-C",
            "frontend",
            "exec",
            "eslint",
            "--no-warn-ignored",
            '--rule',
            'complexity:["error",9]',
            '--rule',
            'max-depth:["error",4]',
            '--rule',
            'max-params:["error",5]',
            "--",
            "src/app.ts",
            "../plugins/demo/frontend/src/index.ts",
        ]
    ]

    node_calls = _split_calls(sandbox_root / "node_calls.txt")
    assert node_calls == [
        [
            "./frontend/scripts/check_import_boundaries.mjs",
            "--",
            "frontend/src/app.ts",
            "plugins/demo/frontend/src/index.ts",
        ]
    ]

    go_calls = _split_calls(sandbox_root / "go_calls.txt")
    assert go_calls == [
        ["vet", "./plugins/demo/backend"],
        [
            "run",
            "github.com/fzipp/gocyclo/cmd/gocyclo@v0.6.0",
            "-over",
            "11",
            "plugins/demo/backend/main.go",
        ],
    ]
