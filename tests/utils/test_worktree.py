import subprocess
from pathlib import Path

from setta.utils.worktree import (
    _parse_git_worktree_list_porcelain,
    derive_dev_worktree_name,
    get_dev_worktree_name,
    get_repo_root_dir,
    list_dev_worktree_options,
)


def test_derive_dev_worktree_name_supports_main_and_prefixed_names() -> None:
    # `setta` is the canonical root worktree name and should be displayed as "main".
    assert derive_dev_worktree_name(Path("/tmp/setta")) == "main"
    # Dev worktrees use the `setta.<name>` convention.
    assert derive_dev_worktree_name(Path("/tmp/setta.feature-x")) == "feature-x"
    # Unknown layouts should still produce a stable fallback label.
    assert derive_dev_worktree_name(Path("/tmp/custom-repo")) == "custom-repo"


def test_parse_git_worktree_list_porcelain_marks_active_entry() -> None:
    # The parser should read every `worktree` block and tag the active path.
    raw = "\n".join(
        [
            "worktree /tmp/setta.main",
            "HEAD abc",
            "branch refs/heads/main",
            "",
            "worktree /tmp/setta.feature-a",
            "HEAD def",
            "branch refs/heads/feature-a",
            "",
        ]
    )
    options = _parse_git_worktree_list_porcelain(
        raw, active_path=Path("/tmp/setta.feature-a")
    )
    assert [option.name for option in options] == ["feature-a", "main"]
    assert options[0].isActive is True
    assert options[1].isActive is False


def test_list_dev_worktree_options_falls_back_to_repo_root_when_git_fails(
    monkeypatch,
) -> None:
    # If `git worktree list` fails, the current repo root should still be surfaced
    # so the UI can render a deterministic active option.
    repo_root = Path("/tmp/setta.feature-b")
    get_repo_root_dir.cache_clear()
    monkeypatch.setattr("setta.utils.worktree.get_repo_root_dir", lambda: repo_root)

    def raise_called_process_error(*args, **kwargs):
        raise subprocess.CalledProcessError(1, args[0])

    monkeypatch.setattr(
        "setta.utils.worktree.subprocess.check_output",
        raise_called_process_error,
    )
    options = list_dev_worktree_options()
    assert len(options) == 1
    assert options[0].name == "feature-b"
    assert options[0].isActive is True
    assert Path(options[0].path) == repo_root.resolve(strict=False)


def test_get_dev_worktree_name_returns_active_option(monkeypatch) -> None:
    # The active worktree label should come from the active option, not list order.
    monkeypatch.setattr(
        "setta.utils.worktree.list_dev_worktree_options",
        lambda: [
            type("Option", (), {"name": "beta", "isActive": False})(),
            type("Option", (), {"name": "alpha", "isActive": True})(),
        ],
    )
    assert get_dev_worktree_name() == "alpha"
