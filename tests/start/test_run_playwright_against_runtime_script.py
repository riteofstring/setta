import os
import sys
from pathlib import Path

from tests.start.dev_script_wiring_helpers import (
    parse_env_snapshot,
    repo_root,
    run_script,
    script_env,
)


def _write_executable(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def _build_runtime_playwright_sandbox(tmp_path: Path) -> Path:
    root = repo_root()
    sandbox_root = tmp_path / "runtime_playwright_sandbox"
    scripts_dir = sandbox_root / "scripts"
    lib_dir = scripts_dir / "lib"
    venv_bin_dir = sandbox_root / ".venv" / "bin"

    lib_dir.mkdir(parents=True, exist_ok=True)
    venv_bin_dir.mkdir(parents=True, exist_ok=True)
    (sandbox_root / "frontend").mkdir(parents=True, exist_ok=True)

    runner_src = root / "scripts" / "run-playwright-against-runtime.sh"
    runner_dst = scripts_dir / "run-playwright-against-runtime.sh"
    runner_dst.write_text(runner_src.read_text(encoding="utf-8"), encoding="utf-8")
    runner_dst.chmod(0o755)

    activate_path = sandbox_root / "activate.sh"
    activate_path.write_text(
        """#!/usr/bin/env bash
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.venv/bin/activate"
""",
        encoding="utf-8",
    )
    activate_path.chmod(0o755)

    python_path = venv_bin_dir / "python"
    python_path.symlink_to(sys.executable)
    activate_stub = venv_bin_dir / "activate"
    activate_stub.write_text(
        f"""#!/usr/bin/env bash
export VIRTUAL_ENV="{sandbox_root / '.venv'}"
export PATH="{venv_bin_dir}:$PATH"
""",
        encoding="utf-8",
    )
    activate_stub.chmod(0o755)

    _write_executable(
        lib_dir / "node_tooling.sh",
        """#!/usr/bin/env bash
setta_run_pnpm() {
  local root_dir="$1"
  shift
  pnpm "$@"
}
""",
    )

    return sandbox_root


def test_run_playwright_against_runtime_refreshes_runtime_info_each_invocation(
    tmp_path: Path,
) -> None:
    sandbox_root = _build_runtime_playwright_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    home_dir = tmp_path / "home"
    calls_file = tmp_path / "runtime_calls.txt"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir.mkdir(parents=True, exist_ok=True)

    _write_executable(
        sandbox_root / "scripts" / "dev-runtime-info.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
calls_file="{calls_file}"
count="0"
if [[ -f "${{calls_file}}" ]]; then
  count="$(cat "${{calls_file}}")"
fi
count="$((count + 1))"
printf '%s\\n' "${{count}}" > "${{calls_file}}"
if [[ "${{count}}" == "1" ]]; then
  cat <<'EOF'
{{"workspaceRoot":"{sandbox_root}","frontendUrl":"http://127.0.0.1:4101","backendUrl":"http://127.0.0.1:8101","bootstrapUrl":"http://127.0.0.1:8101/__setta__/bootstrap#token=token-one"}}
EOF
else
  cat <<'EOF'
{{"workspaceRoot":"{sandbox_root}","frontendUrl":"http://127.0.0.1:4102","backendUrl":"http://127.0.0.1:8102","bootstrapUrl":"http://127.0.0.1:8102/__setta__/bootstrap#token=token-two"}}
EOF
fi
""",
    )

    _write_executable(
        stub_dir / "pnpm",
        f"""#!/usr/bin/env bash
set -euo pipefail
count="$(cat "{calls_file}")"
env | sort > "{tmp_path}/env-${{count}}.txt"
printf '%s\\n' "$PWD" > "{tmp_path}/cwd-${{count}}.txt"
printf '%s\\n' "$@" > "{tmp_path}/args-${{count}}.txt"
""",
    )

    env = script_env(stub_dir, home_dir)
    first_result = run_script(
        [
            "bash",
            str(sandbox_root / "scripts" / "run-playwright-against-runtime.sh"),
            "--workspace",
            str(sandbox_root),
            "--runtime-log",
            "tmp/runtime.log",
            "--",
            "tests/e2e/settings.spec.ts",
            "--reporter=line",
        ],
        cwd=sandbox_root,
        env=env,
    )
    second_result = run_script(
        [
            "bash",
            str(sandbox_root / "scripts" / "run-playwright-against-runtime.sh"),
            "--workspace",
            str(sandbox_root),
            "--runtime-log",
            "tmp/runtime.log",
            "--",
            "tests/e2e/settings.spec.ts",
            "--reporter=line",
        ],
        cwd=sandbox_root,
        env=env,
    )

    assert first_result.returncode == 0, first_result.stderr
    assert second_result.returncode == 0, second_result.stderr
    assert calls_file.read_text(encoding="utf-8").strip() == "2"

    first_env = parse_env_snapshot((tmp_path / "env-1.txt").read_text(encoding="utf-8"))
    second_env = parse_env_snapshot((tmp_path / "env-2.txt").read_text(encoding="utf-8"))
    assert first_env["PLAYWRIGHT_BASE_URL"] == "http://127.0.0.1:4101"
    assert second_env["PLAYWRIGHT_BASE_URL"] == "http://127.0.0.1:4102"
    assert first_env["SETTA_BACKEND_ORIGIN"] == "http://127.0.0.1:8101"
    assert second_env["SETTA_BACKEND_ORIGIN"] == "http://127.0.0.1:8102"
    assert first_env["SETTA_BOOTSTRAP_TOKEN"] == "token-one"
    assert second_env["SETTA_BOOTSTRAP_TOKEN"] == "token-two"
    assert first_env["SETTA_AUTH_COOKIE_NAME"] == "setta_auth_runtime_playwright_sandbox"
    assert second_env["SETTA_AUTH_COOKIE_NAME"] == "setta_auth_runtime_playwright_sandbox"
    assert (tmp_path / "cwd-1.txt").read_text(encoding="utf-8").strip() == str(
        sandbox_root
    )
    assert (tmp_path / "cwd-2.txt").read_text(encoding="utf-8").strip() == str(
        sandbox_root
    )
    assert (tmp_path / "args-1.txt").read_text(encoding="utf-8").splitlines() == [
        "-C",
        "frontend",
        "exec",
        "playwright",
        "test",
        "tests/e2e/settings.spec.ts",
        "--reporter=line",
    ]
    assert (tmp_path / "args-2.txt").read_text(encoding="utf-8").splitlines() == [
        "-C",
        "frontend",
        "exec",
        "playwright",
        "test",
        "tests/e2e/settings.spec.ts",
        "--reporter=line",
    ]


def test_run_playwright_against_runtime_rejects_bootstrap_url_without_token(
    tmp_path: Path,
) -> None:
    sandbox_root = _build_runtime_playwright_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    home_dir = tmp_path / "home"
    invoked_file = tmp_path / "pnpm_invoked.txt"
    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir.mkdir(parents=True, exist_ok=True)

    _write_executable(
        sandbox_root / "scripts" / "dev-runtime-info.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
python3 - <<'PY'
import json

print(
    json.dumps(
        {{
            "workspaceRoot": "{sandbox_root}",
            "frontendUrl": "http://127.0.0.1:4200",
            "backendUrl": "http://127.0.0.1:8200",
            "bootstrapUrl": "http://127.0.0.1:8200/__setta__/bootstrap",
        }}
    )
)
PY
""",
    )

    _write_executable(
        stub_dir / "pnpm",
        f"""#!/usr/bin/env bash
set -euo pipefail
echo invoked > "{invoked_file}"
""",
    )

    env = script_env(stub_dir, home_dir)
    result = run_script(
        [
            "bash",
            str(sandbox_root / "scripts" / "run-playwright-against-runtime.sh"),
            "--workspace",
            str(sandbox_root),
            "--",
            "tests/e2e/settings.spec.ts",
        ],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode != 0
    assert "bootstrap token" in result.stderr
    assert not invoked_file.exists()
