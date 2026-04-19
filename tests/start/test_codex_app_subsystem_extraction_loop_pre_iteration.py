import subprocess
from pathlib import Path

from tests.start.dev_script_wiring_helpers import repo_root


def _run(
    args: list[str],
    *,
    cwd: Path,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=cwd,
        check=False,
        capture_output=True,
        text=True,
    )


def _create_git_repo(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    root.mkdir(parents=True, exist_ok=True)
    _run(["git", "init"], cwd=root)
    _run(["git", "config", "user.name", "Test User"], cwd=root)
    _run(["git", "config", "user.email", "test@example.com"], cwd=root)
    (root / "README.md").write_text("sandbox\n", encoding="utf-8")
    _run(["git", "add", "README.md"], cwd=root)
    commit = _run(["git", "commit", "-m", "init"], cwd=root)
    assert commit.returncode == 0, commit.stderr
    return root


def _current_head(repo_dir: Path) -> str:
    result = _run(["git", "rev-parse", "HEAD"], cwd=repo_dir)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def test_pre_iteration_helper_returns_completion_code_for_clean_stop(
    tmp_path: Path,
) -> None:
    repo_dir = _create_git_repo(tmp_path)
    output_dir = tmp_path / "loop-output"
    state_dir = output_dir / "state"
    run_dir = output_dir / "run-001"
    script_path = (
        repo_root()
        / "scripts"
        / "codex-app-subsystem-extraction-loop-pre-iteration.sh"
    )
    sentinel = "CODEX_LOOP_STOP: APP_SUBSYSTEM_EXTRACTION_COMPLETE"

    run_dir.mkdir(parents=True, exist_ok=True)
    state_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / "last-observed-head.txt").write_text(
        _current_head(repo_dir),
        encoding="utf-8",
    )
    (run_dir / "status.txt").write_text("success\n", encoding="utf-8")
    (run_dir / "last-message.txt").write_text(
        f"{sentinel}\n",
        encoding="utf-8",
    )

    result = _run(
        [
            "bash",
            str(script_path),
            "--root-dir",
            str(repo_dir),
            "--output-dir",
            str(output_dir),
            "--state-dir",
            str(state_dir),
            "--complete-exit-code",
            "42",
            "--sentinel",
            sentinel,
            "--allow-clean-failures",
            "3",
        ],
        cwd=repo_dir,
    )

    assert result.returncode == 42, result.stderr
    assert (
        state_dir / "status.txt"
    ).read_text(encoding="utf-8").strip() == f"complete:{sentinel}"
    assert "Stop sentinel detected with a clean repo and no new commit" in result.stdout
