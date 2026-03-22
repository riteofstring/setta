import os
import subprocess
from pathlib import Path

from tests.start.dev_script_wiring_helpers import repo_root, write_stub_executable


def _build_preflight_sandbox(tmp_path: Path) -> Path:
    root = repo_root()
    sandbox_root = tmp_path / "backend_gap_hunt_preflight_sandbox"
    scripts_dir = sandbox_root / "scripts"

    scripts_dir.mkdir(parents=True, exist_ok=True)

    preflight_src = root / "scripts" / "run-backend-gap-hunt-preflight.sh"
    preflight_dst = scripts_dir / "run-backend-gap-hunt-preflight.sh"
    preflight_dst.write_text(preflight_src.read_text(encoding="utf-8"), encoding="utf-8")
    preflight_dst.chmod(0o755)

    activate_script = sandbox_root / "activate.sh"
    activate_script.write_text(
        "#!/usr/bin/env bash\nexport GAP_HUNT_PREFLIGHT_SANDBOX=1\n",
        encoding="utf-8",
    )
    activate_script.chmod(0o755)

    write_stub_executable(
        scripts_dir / "run-backend-gap-hunt-candidate-miner.sh",
        """#!/usr/bin/env bash
set -euo pipefail

output_path=""
remaining=("$@")
while [[ "${#remaining[@]}" -gt 0 ]]; do
  if [[ "${remaining[0]}" == "--output" ]]; then
    output_path="${remaining[1]}"
    break
  fi
  remaining=("${remaining[@]:1}")
done

if [[ -z "${output_path}" ]]; then
  echo "missing --output" >&2
  exit 1
fi

mkdir -p "$(dirname "${output_path}")"
cat > "${output_path}" <<'EOF'
# Backend Gap Hunt Candidates

## Source Tests Missing Explicit Parity Disposition

EOF

exit "${MINER_EXIT_CODE:-10}"
""",
    )

    write_stub_executable(
        scripts_dir / "go.sh",
        """#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "test" ]]; then
  exit "${GO_TEST_EXIT_CODE:-0}"
fi
echo "unexpected go.sh args: $*" >&2
exit 1
""",
    )

    write_stub_executable(
        scripts_dir / "run-backend-differential-parity.sh",
        """#!/usr/bin/env bash
set -euo pipefail

if printf '%s\n' "$@" | grep -q -- '--manifest'; then
  exit "${CORPUS_PARITY_EXIT_CODE:-0}"
fi
exit "${DEFAULT_PARITY_EXIT_CODE:-0}"
""",
    )

    return sandbox_root


def test_preflight_stops_only_when_backlog_and_parity_gates_are_green(
    tmp_path: Path,
) -> None:
    sandbox_root = _build_preflight_sandbox(tmp_path)

    env = os.environ.copy()
    env["MINER_EXIT_CODE"] = "10"
    env["GO_TEST_EXIT_CODE"] = "0"
    env["DEFAULT_PARITY_EXIT_CODE"] = "0"
    env["CORPUS_PARITY_EXIT_CODE"] = "0"

    result = subprocess.run(
        ["bash", str(sandbox_root / "scripts" / "run-backend-gap-hunt-preflight.sh")],
        cwd=sandbox_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 10, result.stderr
    report_text = (
        sandbox_root / "tmp" / "backend-gap-hunt-candidates.md"
    ).read_text(encoding="utf-8")
    assert "Critical Differential Parity Failures" not in report_text
    assert "Critical Backend Suite Failures" not in report_text


def test_preflight_keeps_loop_running_when_differential_parity_fails(
    tmp_path: Path,
) -> None:
    sandbox_root = _build_preflight_sandbox(tmp_path)

    env = os.environ.copy()
    env["MINER_EXIT_CODE"] = "10"
    env["GO_TEST_EXIT_CODE"] = "0"
    env["DEFAULT_PARITY_EXIT_CODE"] = "1"
    env["CORPUS_PARITY_EXIT_CODE"] = "0"

    result = subprocess.run(
        ["bash", str(sandbox_root / "scripts" / "run-backend-gap-hunt-preflight.sh")],
        cwd=sandbox_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    report_text = (
        sandbox_root / "tmp" / "backend-gap-hunt-candidates.md"
    ).read_text(encoding="utf-8")
    assert "## Critical Differential Parity Failures" in report_text
    assert "critical_differential_parity::default_manifest" in report_text
    assert (
        "Run: `./scripts/run-backend-differential-parity.sh --baseline-ref main`"
        in report_text
    )
