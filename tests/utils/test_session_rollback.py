import pytest

from setta.utils import session_rollback


def test_rollback_started_local_session_stops_then_deletes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    steps: list[str] = []

    monkeypatch.setattr(
        session_rollback,
        "stop_local_session_process",
        lambda **kwargs: steps.append(f"stop:{kwargs['session_id']}"),
    )

    class _Registry:
        def delete_session(self, session_id: str) -> None:
            steps.append(f"delete:{session_id}")

    session_rollback.rollback_started_local_session(
        session_id="session-1",
        pid=12345,
        registry=_Registry(),
    )

    assert steps == ["stop:session-1", "delete:session-1"]


def test_rollback_started_local_session_raises_when_delete_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        session_rollback,
        "stop_local_session_process",
        lambda **_kwargs: None,
    )

    class _Registry:
        def delete_session(self, _session_id: str) -> None:
            raise OSError("disk full")

    with pytest.raises(session_rollback.LocalSessionRollbackError) as excinfo:
        session_rollback.rollback_started_local_session(
            session_id="session-1",
            pid=12345,
            registry=_Registry(),
        )

    assert "Failed deleting session metadata for session-1" in str(excinfo.value)
