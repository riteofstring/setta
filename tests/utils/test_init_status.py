from setta.utils.constants import C
from setta.utils.init_status import (
    BackendInitializationStatus,
    get_auth_refresh_status,
)


def test_snapshot_includes_auth_refresh_window() -> None:
    status = BackendInitializationStatus()
    snapshot = status.snapshot()

    assert (
        snapshot.authCookieRefreshWindowSeconds
        == C.AUTH_COOKIE_REFRESH_WINDOW_SECONDS
    )


def test_snapshot_reads_active_worktree_name(monkeypatch) -> None:
    status = BackendInitializationStatus()

    def fake_get_active_worktree_name() -> str:
        return "feature-a"

    monkeypatch.setattr(
        "setta.utils.init_status.get_active_dev_worktree_name",
        fake_get_active_worktree_name,
    )

    snapshot = status.snapshot()

    assert snapshot.worktreeName == "feature-a"


def test_auth_refresh_status_includes_refresh_window() -> None:
    status = get_auth_refresh_status()
    assert (
        status.authCookieRefreshWindowSeconds == C.AUTH_COOKIE_REFRESH_WINDOW_SECONDS
    )
