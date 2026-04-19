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


def _pre_iteration_script() -> Path:
    return (
        repo_root()
        / "scripts"
        / "codex-app-subsystem-extraction-loop-pre-iteration.sh"
    )


def _post_iteration_script() -> Path:
    return (
        repo_root()
        / "scripts"
        / "codex-app-subsystem-extraction-loop-post-iteration.sh"
    )


def test_pre_iteration_recovery_resets_invalid_repo_state(tmp_path: Path) -> None:
    repo_dir = _create_git_repo(tmp_path)
    output_dir = tmp_path / "loop-output"
    state_dir = output_dir / "state"
    checklist_file = state_dir / "checklist.md"
    phase_review_file = state_dir / "phase-review.md"
    output_dir.mkdir()
    state_dir.mkdir()
    checklist_file.write_text("checklist\n", encoding="utf-8")
    phase_review_file.write_text("phase review\n", encoding="utf-8")

    sentinel = "CODEX_LOOP_STOP: APP_SUBSYSTEM_EXTRACTION_COMPLETE"

    initial = _run(
        [
            "bash",
            str(_pre_iteration_script()),
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
            "--progress-file",
            str(checklist_file),
            "--progress-file",
            str(phase_review_file),
            "--allow-clean-failures",
            "3",
        ],
        cwd=tmp_path,
    )
    assert initial.returncode == 0, initial.stderr

    run_dir = output_dir / "run-001"
    run_dir.mkdir()
    (run_dir / "status.txt").write_text("failure:1\n", encoding="utf-8")
    (run_dir / "last-message.txt").write_text("iteration failed\n", encoding="utf-8")
    (repo_dir / "README.md").write_text("dirty\n", encoding="utf-8")
    (repo_dir / "scratch.txt").write_text("untracked\n", encoding="utf-8")

    result = _run(
        [
            "bash",
            str(_pre_iteration_script()),
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
            "--progress-file",
            str(checklist_file),
            "--progress-file",
            str(phase_review_file),
            "--allow-clean-failures",
            "0",
        ],
        cwd=tmp_path,
    )

    assert result.returncode == 0, result.stderr
    assert (repo_dir / "README.md").read_text(encoding="utf-8") == "sandbox\n"
    assert not (repo_dir / "scratch.txt").exists()
    assert _run(["git", "status", "--short"], cwd=repo_dir).stdout.strip() == ""
    recovery_state = (state_dir / "recovery-state.txt").read_text(encoding="utf-8")
    assert "count=1" in recovery_state
    assert "last_phase=pre-iteration" in recovery_state
    assert "last_failure=error:clean-failure-dirty-worktree" in recovery_state


def test_post_iteration_recovery_sanitizes_stop_sentinel_for_next_iteration(
    tmp_path: Path,
) -> None:
    repo_dir = _create_git_repo(tmp_path)
    output_dir = tmp_path / "loop-output"
    state_dir = output_dir / "state"
    checklist_file = state_dir / "checklist.md"
    phase_review_file = state_dir / "phase-review.md"
    output_dir.mkdir()
    state_dir.mkdir()
    checklist_file.write_text("checklist\n", encoding="utf-8")
    phase_review_file.write_text("phase review\n", encoding="utf-8")

    sentinel = "CODEX_LOOP_STOP: APP_SUBSYSTEM_EXTRACTION_COMPLETE"

    initial = _run(
        [
            "bash",
            str(_pre_iteration_script()),
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
            "--progress-file",
            str(checklist_file),
            "--progress-file",
            str(phase_review_file),
            "--allow-clean-failures",
            "3",
        ],
        cwd=tmp_path,
    )
    assert initial.returncode == 0, initial.stderr
    assert (state_dir / "last-observed-head.txt").read_text(encoding="utf-8").strip() == _current_head(repo_dir)

    run_dir = output_dir / "run-001"
    run_dir.mkdir()
    (run_dir / "last-message.txt").write_text(f"{sentinel}\n", encoding="utf-8")
    (repo_dir / "README.md").write_text("dirty\n", encoding="utf-8")

    post_result = _run(
        [
            "bash",
            str(_post_iteration_script()),
            "--root-dir",
            str(repo_dir),
            "--state-dir",
            str(state_dir),
            "--settle-seconds",
            "0",
        ],
        cwd=tmp_path,
    )

    assert post_result.returncode == 0, post_result.stderr
    assert (repo_dir / "README.md").read_text(encoding="utf-8") == "sandbox\n"
    assert (
        run_dir / "last-message.recovered.txt"
    ).read_text(encoding="utf-8") == f"{sentinel}\n"
    assert "Recovered after a post-iteration validation failure." in (
        run_dir / "last-message.txt"
    ).read_text(encoding="utf-8")

    (run_dir / "status.txt").write_text("success\n", encoding="utf-8")

    next_pre = _run(
        [
            "bash",
            str(_pre_iteration_script()),
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
            "--progress-file",
            str(checklist_file),
            "--progress-file",
            str(phase_review_file),
            "--allow-clean-failures",
            "3",
        ],
        cwd=tmp_path,
    )

    assert next_pre.returncode == 0, next_pre.stderr
    assert "Stop sentinel detected" not in next_pre.stdout
