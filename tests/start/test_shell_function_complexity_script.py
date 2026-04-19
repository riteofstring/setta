import subprocess
import sys
from pathlib import Path

from tests.start.dev_script_wiring_helpers import repo_root


def _script_path() -> Path:
    return repo_root() / "scripts" / "shell_function_complexity.py"


def test_shell_function_complexity_fails_when_a_function_exceeds_threshold(
    tmp_path: Path,
) -> None:
    shell_file = tmp_path / "complex.sh"
    shell_file.write_text(
        """#!/usr/bin/env bash
simple_fn() {
  return 0
}

complex_fn() {
  if true; then
    echo ok
  fi
  for value in one; do
    echo "$value"
  done
  while false; do
    break
  done
  case "${1:-}" in
    one) ;;
  esac
}
""",
        encoding="utf-8",
    )

    result = subprocess.run(
        [sys.executable, str(_script_path()), "--max", "4", str(shell_file)],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1
    assert "complex_fn has a complexity of 5." in result.stderr
    assert "simple_fn" not in result.stderr


def test_shell_function_complexity_ignores_quoted_and_heredoc_content(
    tmp_path: Path,
) -> None:
    shell_file = tmp_path / "heredoc.sh"
    shell_file.write_text(
        """#!/usr/bin/env bash
ignore_noise() {
  printf '%s\\n' "if while case"
  cat <<'EOF'
if false; then
  while true; do
    break
  done
fi
case "$value" in
  one) ;;
esac
EOF
  if true; then
    return 0
  fi
}
""",
        encoding="utf-8",
    )

    result = subprocess.run(
        [sys.executable, str(_script_path()), "--max", "2", str(shell_file)],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert result.stderr == ""


def test_shell_function_complexity_report_prioritizes_highest_hotspots(
    tmp_path: Path,
) -> None:
    shell_file = tmp_path / "report.sh"
    shell_file.write_text(
        """#!/usr/bin/env bash
lower_fn() {
  if true; then
    return 0
  fi
}

higher_fn() {
  if true; then
    echo one
  fi
  if true; then
    echo two
  fi
  if true; then
    echo three
  fi
}
""",
        encoding="utf-8",
    )

    result = subprocess.run(
        [
            sys.executable,
            str(_script_path()),
            "--report",
            "--top",
            "1",
            "--min",
            "2",
            str(shell_file),
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "higher_fn" in result.stdout
    assert "lower_fn" not in result.stdout
