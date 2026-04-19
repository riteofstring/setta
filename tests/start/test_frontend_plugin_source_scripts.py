import os
import subprocess
from pathlib import Path

from tests.start.dev_script_wiring_helpers import repo_root, write_stub_executable


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


def _build_frontend_source_script_sandbox(tmp_path: Path) -> Path:
    root = repo_root()
    sandbox_root = tmp_path / "frontend_source_scripts_sandbox"
    frontend_scripts_dir = sandbox_root / "frontend" / "scripts"
    frontend_src_dir = sandbox_root / "frontend" / "src"
    plugin_frontend_dir = sandbox_root / "plugins" / "demo" / "frontend" / "src"
    bin_dir = sandbox_root / "bin"

    frontend_scripts_dir.mkdir(parents=True, exist_ok=True)
    frontend_src_dir.mkdir(parents=True, exist_ok=True)
    plugin_frontend_dir.mkdir(parents=True, exist_ok=True)
    bin_dir.mkdir(parents=True, exist_ok=True)
    (sandbox_root / "scripts" / "lib").mkdir(parents=True, exist_ok=True)

    for rel_path in (
        "frontend/scripts/eslint_sources.sh",
        "frontend/scripts/format_sources.sh",
    ):
        src = root / rel_path
        dst = sandbox_root / rel_path
        dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        dst.chmod(0o755)
    quality_paths_dst = sandbox_root / "scripts" / "lib" / "quality_paths.sh"
    quality_paths_dst.write_text(
        (root / "scripts" / "lib" / "quality_paths.sh").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    quality_paths_dst.chmod(0o755)

    write_stub_executable(
        bin_dir / "pnpm",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '__CALL__\\n' >> "{sandbox_root / 'pnpm_calls.txt'}"
printf '%s\\n' "$@" >> "{sandbox_root / 'pnpm_calls.txt'}"
""",
    )

    return sandbox_root


def _build_frontend_gcf_sandbox(tmp_path: Path) -> Path:
    root = repo_root()
    sandbox_root = tmp_path / "frontend_gcf_sandbox"
    frontend_scripts_dir = sandbox_root / "frontend" / "scripts"
    scripts_dir = sandbox_root / "scripts"
    frontend_dir = sandbox_root / "frontend"
    bin_dir = sandbox_root / "bin"
    goroot_bin_dir = sandbox_root / "fake-goroot" / "bin"

    frontend_scripts_dir.mkdir(parents=True, exist_ok=True)
    scripts_dir.mkdir(parents=True, exist_ok=True)
    frontend_dir.mkdir(parents=True, exist_ok=True)
    (sandbox_root / "cmd" / "demo").mkdir(parents=True, exist_ok=True)
    (sandbox_root / "internal").mkdir(parents=True, exist_ok=True)
    (sandbox_root / "plugins" / "demo" / "backend").mkdir(parents=True, exist_ok=True)
    bin_dir.mkdir(parents=True, exist_ok=True)
    goroot_bin_dir.mkdir(parents=True, exist_ok=True)

    for rel_path in ("frontend/scripts/gcf.sh", "scripts/progress.sh"):
        src = root / rel_path
        dst = sandbox_root / rel_path
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        dst.chmod(0o755)

    (sandbox_root / "activate.sh").write_text(
        "#!/usr/bin/env bash\nexport FRONTEND_GCF_ACTIVATED=1\n",
        encoding="utf-8",
    )
    (sandbox_root / "activate.sh").chmod(0o755)

    (sandbox_root / "cmd" / "demo" / "main.go").write_text(
        "package main\n\nfunc main() {}\n",
        encoding="utf-8",
    )
    (sandbox_root / "plugins" / "demo" / "backend" / "main.go").write_text(
        "package main\n\nfunc main() {}\n",
        encoding="utf-8",
    )

    write_stub_executable(
        scripts_dir / "go.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [[ "${{1-}}" == "env" && "${{2-}}" == "GOROOT" ]]; then
  printf '%s\\n' "{sandbox_root / 'fake-goroot'}"
  exit 0
fi
echo "unexpected go.sh invocation: $*" >&2
exit 1
""",
    )
    write_stub_executable(
        goroot_bin_dir / "gofmt",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$@" > "{sandbox_root / 'gofmt_args.txt'}"
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

    return sandbox_root


def test_frontend_source_scripts_include_plugin_frontend_roots(
    tmp_path: Path,
) -> None:
    sandbox_root = _build_frontend_source_script_sandbox(tmp_path)

    prettier_result = subprocess.run(
        ["bash", str(sandbox_root / "frontend" / "scripts" / "format_sources.sh")],
        cwd=sandbox_root / "frontend",
        env=_script_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )
    assert prettier_result.returncode == 0, (
        f"{prettier_result.stdout}\n{prettier_result.stderr}"
    )

    eslint_result = subprocess.run(
        ["bash", str(sandbox_root / "frontend" / "scripts" / "eslint_sources.sh")],
        cwd=sandbox_root / "frontend",
        env=_script_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )
    assert eslint_result.returncode == 0, f"{eslint_result.stdout}\n{eslint_result.stderr}"

    pnpm_calls = _split_calls(sandbox_root / "pnpm_calls.txt")
    assert pnpm_calls == [
        ["exec", "prettier", "--write", "src", "../plugins/demo/frontend/src"],
        [
            "exec",
            "eslint",
            "--ext",
            ".js,.jsx,.ts,.tsx",
            "--fix",
            "--",
            "src",
            "../plugins/demo/frontend/src",
        ],
    ]


def test_frontend_gcf_formats_plugin_go_files(tmp_path: Path) -> None:
    sandbox_root = _build_frontend_gcf_sandbox(tmp_path)

    result = subprocess.run(
        ["bash", str(sandbox_root / "frontend" / "scripts" / "gcf.sh")],
        cwd=sandbox_root / "frontend",
        env=_script_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"

    pnpm_calls = _split_calls(sandbox_root / "pnpm_calls.txt")
    assert pnpm_calls == [["generate"], ["full-cleanup"], ["f"]]

    gofmt_args = (sandbox_root / "gofmt_args.txt").read_text(encoding="utf-8").splitlines()
    assert gofmt_args[0] == "-w"
    assert str(sandbox_root / "cmd" / "demo" / "main.go") in gofmt_args
    assert str(sandbox_root / "plugins" / "demo" / "backend" / "main.go") in gofmt_args
