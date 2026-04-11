import os
import subprocess
from pathlib import Path

from tests.start.dev_script_wiring_helpers import repo_root


def _run(
    args: list[str],
    *,
    cwd: Path,
    env: dict[str, str],
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=cwd,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )


def _write_executable(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def _runner_script() -> Path:
    return repo_root() / "scripts" / "run-codex-loop.sh"


def test_run_codex_loop_marks_inactivity_timeout_failure(tmp_path: Path) -> None:
    workdir = tmp_path / "workdir"
    output_dir = tmp_path / "output"
    prompt_file = tmp_path / "prompt.md"
    bin_dir = tmp_path / "bin"

    workdir.mkdir()
    output_dir.mkdir()
    bin_dir.mkdir()
    prompt_file.write_text("test prompt\n", encoding="utf-8")

    _write_executable(
        bin_dir / "codex",
        """#!/usr/bin/env bash
set -euo pipefail
sleep 3
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

    result = _run(
        [
            "bash",
            str(_runner_script()),
            "--prompt-file",
            str(prompt_file),
            "--iterations",
            "1",
            "--output-dir",
            str(output_dir),
            "--workdir",
            str(workdir),
            "--inactivity-timeout-seconds",
            "1",
            "--watchdog-interval-seconds",
            "1",
        ],
        cwd=tmp_path,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert (
        output_dir / "run-001" / "status.txt"
    ).read_text(encoding="utf-8").strip() == "failure:inactivity-timeout:124"
    assert "Iteration timed out after 1s without transcript updates" in result.stderr


def test_run_codex_loop_can_continue_after_inactivity_timeout(tmp_path: Path) -> None:
    workdir = tmp_path / "workdir"
    output_dir = tmp_path / "output"
    prompt_file = tmp_path / "prompt.md"
    bin_dir = tmp_path / "bin"
    calls_file = tmp_path / "calls.txt"

    workdir.mkdir()
    output_dir.mkdir()
    bin_dir.mkdir()
    prompt_file.write_text("test prompt\n", encoding="utf-8")

    _write_executable(
        bin_dir / "codex",
        f"""#!/usr/bin/env bash
set -euo pipefail
calls_file="{calls_file}"
count="0"
if [[ -f "${{calls_file}}" ]]; then
  count="$(cat "${{calls_file}}")"
fi
count="$((count + 1))"
printf '%s\\n' "${{count}}" > "${{calls_file}}"

response_file=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--output-last-message" ]]; then
    response_file="$2"
    shift 2
    continue
  fi
  shift
done

if [[ "${{count}}" == "1" ]]; then
  sleep 3
  exit 0
fi

if [[ -n "${{response_file}}" ]]; then
  printf 'second pass\\n' > "${{response_file}}"
fi
printf 'second pass\\n'
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

    result = _run(
        [
            "bash",
            str(_runner_script()),
            "--prompt-file",
            str(prompt_file),
            "--iterations",
            "2",
            "--output-dir",
            str(output_dir),
            "--workdir",
            str(workdir),
            "--inactivity-timeout-seconds",
            "1",
            "--watchdog-interval-seconds",
            "1",
            "--continue-on-inactivity-timeout",
            "--stop-on-error",
        ],
        cwd=tmp_path,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert (
        output_dir / "run-001" / "status.txt"
    ).read_text(encoding="utf-8").strip() == "failure:inactivity-timeout:124"
    assert (output_dir / "run-002" / "status.txt").read_text(
        encoding="utf-8",
    ).strip() == "success"
    assert calls_file.read_text(encoding="utf-8").strip() == "2"
