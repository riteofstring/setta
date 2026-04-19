import os
import sys
from pathlib import Path

from tests.start.dev_script_wiring_helpers import repo_root, run_script, script_env


def build_run_playwright_e2e_sandbox(tmp_path: Path) -> tuple[Path, Path, Path]:
    root = repo_root()
    sandbox_root = tmp_path / "run_playwright_e2e_sandbox"
    scripts_dir = sandbox_root / "scripts"
    plugin_fixture_dir = scripts_dir / "plugin-fixtures"
    frontend_bin_dir = sandbox_root / "frontend" / "node_modules" / ".bin"
    venv_bin_dir = sandbox_root / ".venv" / "bin"
    capture_cwd = sandbox_root / "playwright_cwd.txt"
    capture_args = sandbox_root / "playwright_args.txt"

    frontend_bin_dir.mkdir(parents=True, exist_ok=True)
    plugin_fixture_dir.mkdir(parents=True, exist_ok=True)
    venv_bin_dir.mkdir(parents=True, exist_ok=True)
    (sandbox_root / "tests" / "fixtures" / "plugins").mkdir(parents=True, exist_ok=True)

    runner_src = root / "scripts" / "run-playwright-e2e.sh"
    runner_dst = scripts_dir / "run-playwright-e2e.sh"
    runner_dst.write_text(runner_src.read_text(encoding="utf-8"), encoding="utf-8")
    runner_dst.chmod(0o755)

    cache_src = root / "scripts" / "plugin-fixtures" / "cache.sh"
    cache_dst = plugin_fixture_dir / "cache.sh"
    cache_dst.write_text(cache_src.read_text(encoding="utf-8"), encoding="utf-8")
    cache_dst.chmod(0o755)

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

    playwright_bin = frontend_bin_dir / "playwright"
    playwright_bin.write_text(
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$PWD" > "{capture_cwd}"
printf '%s\\n' "$@" > "{capture_args}"
""",
        encoding="utf-8",
    )
    playwright_bin.chmod(0o755)

    return sandbox_root, capture_cwd, capture_args


def test_run_playwright_codegen_runs_from_repo_root_without_frontend_config(
    tmp_path: Path,
) -> None:
    sandbox_root, capture_cwd, capture_args = build_run_playwright_e2e_sandbox(tmp_path)
    stub_dir = tmp_path / "bin"
    home_dir = tmp_path / "home"
    workspace_root = tmp_path / "workspace"
    log_dir = tmp_path / "logs"
    storage_state_path = tmp_path / "bootstrap-storage-state.json"
    final_storage_path = tmp_path / "final-storage-state.json"
    output_file = tmp_path / "recording.spec.ts"
    har_file = tmp_path / "network.har"
    metadata_file = tmp_path / "session.json"
    backend_stub = tmp_path / "setta-cli-stub.sh"

    stub_dir.mkdir(parents=True, exist_ok=True)
    home_dir.mkdir(parents=True, exist_ok=True)
    workspace_root.mkdir(parents=True, exist_ok=True)
    log_dir.mkdir(parents=True, exist_ok=True)

    (stub_dir / "pnpm").write_text(
        """#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "exec" && "${2:-}" == "vite" ]]; then
  exec python3 -m http.server "${SETTA_DEV_FRONTEND_PORT}" --bind 127.0.0.1 >/dev/null 2>&1
fi
if [[ "${1:-}" == "exec" && "${2:-}" == "node" ]]; then
  cat >/dev/null
  python3 - <<'PY'
import json
import os
from pathlib import Path

output = Path(os.environ["SETTA_RECORD_STORAGE_STATE_FILE"])
output.write_text(json.dumps({"cookies": [], "origins": []}), encoding="utf-8")
PY
  exit 0
fi
echo "unexpected pnpm args: $*" >&2
exit 1
""",
        encoding="utf-8",
    )
    (stub_dir / "pnpm").chmod(0o755)

    backend_stub.write_text(
        """#!/usr/bin/env bash
set -euo pipefail
port=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      port="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
echo "Setta running (session test123)"
echo "Bind: 127.0.0.1:${port} (remote only)"
echo "  Open in browser (recommended):"
echo "    http://127.0.0.1:${port}/__setta__/bootstrap#token=test-token"
while true; do
  sleep 60
done
""",
        encoding="utf-8",
    )
    backend_stub.chmod(0o755)

    env = script_env(stub_dir, home_dir)
    env["SETTA_GO_CLI_BIN"] = str(backend_stub)
    env["SETTA_SERVER_BIN"] = str(backend_stub)
    env["SETTA_E2E_PLAYWRIGHT_SUBCOMMAND"] = "codegen"
    env["SETTA_E2E_SEED_WORKSPACE"] = "0"
    env["SETTA_E2E_BUILD_PLUGIN_FIXTURES"] = "0"
    env["SETTA_E2E_SEED_PLUGIN_FIXTURES"] = "0"
    env["SETTA_E2E_SEED_PLUGIN_ARTIFACTS"] = "0"
    env["SETTA_HOME"] = str(home_dir / ".setta")
    env["SETTA_WORKSPACE_ROOT"] = str(workspace_root)
    env["SETTA_PROJECT_PATH"] = "/home"
    env["SETTA_E2E_LOG_DIR"] = str(log_dir)
    env["SETTA_E2E_RECORD_ARTIFACT_DIR"] = str(tmp_path / "artifacts")
    env["SETTA_E2E_RECORD_AUTH_STORAGE_STATE"] = str(storage_state_path)
    env["SETTA_E2E_RECORD_FINAL_STORAGE_STATE"] = str(final_storage_path)
    env["SETTA_E2E_RECORD_OUTPUT_FILE"] = str(output_file)
    env["SETTA_E2E_RECORD_HAR_FILE"] = str(har_file)
    env["SETTA_E2E_RECORD_METADATA_FILE"] = str(metadata_file)

    result = run_script(
        ["bash", str(sandbox_root / "scripts" / "run-playwright-e2e.sh")],
        cwd=sandbox_root,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert capture_cwd.read_text(encoding="utf-8").strip() == str(sandbox_root)
    assert capture_args.read_text(encoding="utf-8").splitlines()[0] == "codegen"
    assert storage_state_path.is_file()
    assert metadata_file.is_file()
