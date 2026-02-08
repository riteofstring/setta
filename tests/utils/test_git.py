import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

import setta.utils.git as git_utils
from setta.utils.git import run_git


def _git(cwd: Path, args: list[str]) -> None:
    subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        check=True,
        capture_output=True,
        text=True,
    )


def test_run_git_truncates_stdout_at_requested_cap() -> None:
    # Create enough status output that the stdout cap is exercised.
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        _git(root, ["init"])
        _git(root, ["config", "user.email", "a@example.com"])
        _git(root, ["config", "user.name", "A"])
        (root / ".gitignore").write_text("ignored/\n", encoding="utf-8")
        _git(root, ["add", ".gitignore"])
        _git(root, ["commit", "-m", "init"])
        for idx in range(200):
            (root / f"untracked-{idx:03d}.txt").write_text("x\n", encoding="utf-8")

        res = run_git(
            ["status", "--porcelain", "--untracked-files=all"],
            cwd=root,
            timeout_s=2.0,
            max_stdout_bytes=64,
            max_stderr_bytes=64_000,
        )

    assert res.stdout_truncated is True
    assert len(res.stdout.encode("utf-8")) <= 64
    assert res.timed_out is False


def test_run_git_truncates_stderr_at_requested_cap() -> None:
    # Invalid git subcommands produce stderr output that should also be capped.
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        _git(root, ["init"])

        res = run_git(
            ["definitely-not-a-command"],
            cwd=root,
            timeout_s=2.0,
            max_stdout_bytes=64,
            max_stderr_bytes=24,
        )

    assert res.stderr_truncated is True
    assert len(res.stderr.encode("utf-8")) <= 24
    assert res.timed_out is False


def test_git_binary_lookup_is_cached(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0

    def fake_which(binary: str) -> str | None:
        nonlocal calls
        calls += 1
        if binary != "git":
            return None
        return "/usr/bin/git"

    git_utils._get_git_binary_path.cache_clear()
    monkeypatch.setattr(git_utils.shutil, "which", fake_which)

    assert git_utils._get_git_binary_path() == "/usr/bin/git"
    assert git_utils._get_git_binary_path() == "/usr/bin/git"
    assert calls == 1

    git_utils._get_git_binary_path.cache_clear()
