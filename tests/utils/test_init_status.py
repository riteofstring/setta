from setta.utils.constants import C
from setta.utils.init_status import (
    BackendInitWorktreeOption,
    BackendInitializationStatus,
    get_auth_refresh_status,
)
from setta.utils.worktree import DevWorktreeOption


def test_snapshot_includes_auth_refresh_window() -> None:
    status = BackendInitializationStatus()
    snapshot = status.snapshot()

    assert (
        snapshot.authCookieRefreshWindowSeconds
        == C.AUTH_COOKIE_REFRESH_WINDOW_SECONDS
    )
    assert isinstance(snapshot.worktreeOptionDetails, list)


def test_snapshot_uses_single_worktree_lookup_and_omits_paths(monkeypatch) -> None:
    status = BackendInitializationStatus()
    calls = 0

    def fake_list_dev_worktree_options() -> list[DevWorktreeOption]:
        nonlocal calls
        calls += 1
        return [
            DevWorktreeOption(
                name="feature-a",
                path="/tmp/setta.feature-a",
                isActive=True,
            )
        ]

    monkeypatch.setattr(
        "setta.utils.init_status.list_dev_worktree_options",
        fake_list_dev_worktree_options,
    )

    snapshot = status.snapshot()

    assert calls == 1
    assert snapshot.worktreeName == "feature-a"
    assert snapshot.worktreeOptionDetails == [
        BackendInitWorktreeOption(name="feature-a", isActive=True)
    ]


def test_auth_refresh_status_includes_refresh_window() -> None:
    status = get_auth_refresh_status()
    assert (
        status.authCookieRefreshWindowSeconds == C.AUTH_COOKIE_REFRESH_WINDOW_SECONDS
    )
