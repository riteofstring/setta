import subprocess

from tests.start.dev_script_wiring_helpers import repo_root


def test_authority_sequenced_loop_help_mentions_backlog_burn_phase3() -> None:
    script = repo_root() / "scripts" / "run-codex-authority-sequenced-loop.sh"

    result = subprocess.run(
        ["bash", str(script), "--help"],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "Phase 3 escalates to broader backlog-burn refactors" in result.stdout
    assert "Phase 3 hotspot thresholds: Python `10`, frontend `10`, Go `12`" in result.stdout
    assert "--post-commit-settle-seconds N" in result.stdout
