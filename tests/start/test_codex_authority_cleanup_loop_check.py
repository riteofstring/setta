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


def _run_checker(
    repo_dir: Path,
    output_dir: Path,
    state_dir: Path,
) -> subprocess.CompletedProcess[str]:
    script_path = repo_root() / "scripts" / "codex-authority-cleanup-loop-check.sh"
    return _run(
        [
            "bash",
            str(script_path),
            "--root-dir",
            str(repo_dir),
            "--output-dir",
            str(output_dir),
            "--state-dir",
            str(state_dir),
        ],
        cwd=repo_dir,
    )


def _current_head(repo_dir: Path) -> str:
    result = _run(["git", "rev-parse", "HEAD"], cwd=repo_dir)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def test_checker_ignores_current_placeholder_run_before_first_iteration(
    tmp_path: Path,
) -> None:
    repo_dir = _create_git_repo(tmp_path)
    output_dir = tmp_path / "loop-output"
    state_dir = output_dir / "state"
    run_dir = output_dir / "run-001"
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "pre-iteration.log").write_text("", encoding="utf-8")
    state_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / "last-observed-head.txt").write_text(
        _current_head(repo_dir),
        encoding="utf-8",
    )

    result = _run_checker(repo_dir, output_dir, state_dir)

    assert result.returncode == 0, result.stderr
    assert "No completed loop runs found yet." in result.stdout
    assert (state_dir / "status.txt").read_text(encoding="utf-8").strip() == "pending"


def test_checker_uses_latest_completed_run_not_current_placeholder(
    tmp_path: Path,
) -> None:
    repo_dir = _create_git_repo(tmp_path)
    output_dir = tmp_path / "loop-output"
    state_dir = output_dir / "state"
    run_one_dir = output_dir / "run-001"
    run_two_dir = output_dir / "run-002"
    run_one_dir.mkdir(parents=True, exist_ok=True)
    run_two_dir.mkdir(parents=True, exist_ok=True)
    state_dir.mkdir(parents=True, exist_ok=True)

    initial_head = _current_head(repo_dir)
    (state_dir / "last-observed-head.txt").write_text(
        initial_head,
        encoding="utf-8",
    )
    (run_one_dir / "status.txt").write_text("success\n", encoding="utf-8")
    (run_one_dir / "last-message.txt").write_text(
        "iteration complete\n",
        encoding="utf-8",
    )
    (run_two_dir / "pre-iteration.log").write_text("", encoding="utf-8")

    (repo_dir / "README.md").write_text("sandbox updated\n", encoding="utf-8")
    _run(["git", "add", "README.md"], cwd=repo_dir)
    commit = _run(["git", "commit", "-m", "advance"], cwd=repo_dir)
    assert commit.returncode == 0, commit.stderr

    result = _run_checker(repo_dir, output_dir, state_dir)

    assert result.returncode == 0, result.stderr
    assert "Detected a new clean commit from the latest iteration." in result.stdout
    assert (state_dir / "status.txt").read_text(encoding="utf-8").strip().startswith(
        "advanced:",
    )
    assert (state_dir / "last-observed-head.txt").read_text(
        encoding="utf-8",
    ).strip() == _current_head(repo_dir)


def test_checker_accepts_stop_sentinel_after_final_clean_commit(
    tmp_path: Path,
) -> None:
    repo_dir = _create_git_repo(tmp_path)
    output_dir = tmp_path / "loop-output"
    state_dir = output_dir / "state"
    run_dir = output_dir / "run-001"
    sentinel = "CODEX_LOOP_STOP: APP_SUBSYSTEM_EXTRACTION_COMPLETE"

    run_dir.mkdir(parents=True, exist_ok=True)
    state_dir.mkdir(parents=True, exist_ok=True)
    initial_head = _current_head(repo_dir)
    (state_dir / "last-observed-head.txt").write_text(
        initial_head,
        encoding="utf-8",
    )
    (run_dir / "status.txt").write_text("success\n", encoding="utf-8")

    (repo_dir / "README.md").write_text("sandbox updated\n", encoding="utf-8")
    _run(["git", "add", "README.md"], cwd=repo_dir)
    commit = _run(["git", "commit", "-m", "advance"], cwd=repo_dir)
    assert commit.returncode == 0, commit.stderr
    current_head = _current_head(repo_dir)

    (run_dir / "last-message.txt").write_text(
        f"{sentinel}\n",
        encoding="utf-8",
    )

    script_path = repo_root() / "scripts" / "codex-authority-cleanup-loop-check.sh"
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
        ],
        cwd=repo_dir,
    )

    assert result.returncode == 42, result.stderr
    assert "Stop sentinel detected with a clean repo" in result.stdout
    assert (
        state_dir / "status.txt"
    ).read_text(encoding="utf-8").strip() == f"complete:{sentinel}"
    assert (state_dir / "last-observed-head.txt").read_text(
        encoding="utf-8",
    ).strip() == current_head
