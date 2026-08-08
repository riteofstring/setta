from pathlib import Path

from setta.utils.worktree import (
    derive_dev_worktree_name,
    get_active_dev_worktree_name,
)


def test_derive_dev_worktree_name_supports_main_and_prefixed_names() -> None:
    # `setta` is the canonical root worktree name and should be displayed as "main".
    assert derive_dev_worktree_name(Path("/tmp/setta")) == "main"
    # Dev worktrees use the `setta.<name>` convention.
    assert derive_dev_worktree_name(Path("/tmp/setta.feature-x")) == "feature-x"
    # Unknown layouts should still produce a stable fallback label.
    assert derive_dev_worktree_name(Path("/tmp/custom-repo")) == "custom-repo"


def test_get_active_dev_worktree_name_returns_none_when_repo_root_missing(
    monkeypatch,
) -> None:
    monkeypatch.setattr("setta.utils.worktree.get_repo_root_dir", lambda: None)
    assert get_active_dev_worktree_name() is None


def test_get_active_dev_worktree_name_derives_name_from_repo_root(
    monkeypatch,
) -> None:
    repo_root = Path("/tmp/setta.feature-c")
    monkeypatch.setattr("setta.utils.worktree.get_repo_root_dir", lambda: repo_root)
    assert get_active_dev_worktree_name() == "feature-c"
