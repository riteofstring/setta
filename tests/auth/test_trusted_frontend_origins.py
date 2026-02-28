import time
from pathlib import Path

import pytest

from setta import trusted_frontend_origins as trusted_frontend_origins_module
from setta.trusted_frontend_origins import (
    TrustedFrontendOriginStore,
    TrustedFrontendOriginStoreUnavailableError,
    is_trusted_frontend_origin,
    refresh_trusted_frontend_origins_for_session,
    trust_frontend_origin,
)


def _build_store(tmp_path: Path) -> TrustedFrontendOriginStore:
    return TrustedFrontendOriginStore(
        storage_path=tmp_path / "trusted_frontend_origins.json"
    )


def test_trusted_frontend_origin_store_prunes_expired_entries(tmp_path: Path) -> None:
    store = _build_store(tmp_path)
    session_id = "session-1"
    origin = "http://127.0.0.1:61234"
    store.trust_origin(session_id=session_id, origin=origin, exp=105, now=100)

    assert store.is_trusted(session_id=session_id, origin=origin, now=104) is True
    assert store.is_trusted(session_id=session_id, origin=origin, now=106) is False


def test_trust_frontend_origin_normalizes_input(tmp_path: Path, monkeypatch) -> None:
    store = _build_store(tmp_path)
    monkeypatch.setattr(
        trusted_frontend_origins_module,
        "_TRUSTED_FRONTEND_ORIGIN_STORE",
        store,
    )

    normalized = trust_frontend_origin(
        "http://127.0.0.1:61234/",
        session_id="session-1",
        exp=120,
        now=100,
    )

    assert normalized == "http://127.0.0.1:61234"
    assert (
        store.is_trusted(session_id="session-1", origin=normalized, now=119) is True
    )


def test_is_trusted_frontend_origin_checks_dynamic_store(
    tmp_path: Path,
    monkeypatch,
) -> None:
    store = _build_store(tmp_path)
    monkeypatch.setattr(
        trusted_frontend_origins_module,
        "_TRUSTED_FRONTEND_ORIGIN_STORE",
        store,
    )
    origin = "http://127.0.0.1:62222"
    now = int(time.time())
    store.trust_origin(session_id="session-1", origin=origin, exp=now + 30, now=now)

    assert is_trusted_frontend_origin(origin, session_id="session-1") is True


def test_is_trusted_frontend_origin_is_session_scoped(
    tmp_path: Path,
    monkeypatch,
) -> None:
    store = _build_store(tmp_path)
    monkeypatch.setattr(
        trusted_frontend_origins_module,
        "_TRUSTED_FRONTEND_ORIGIN_STORE",
        store,
    )
    origin = "http://127.0.0.1:62222"
    now = int(time.time())
    store.trust_origin(session_id="session-a", origin=origin, exp=now + 30, now=now)

    assert is_trusted_frontend_origin(origin, session_id="session-a") is True
    assert is_trusted_frontend_origin(origin, session_id="session-b") is False


def test_refresh_trusted_frontend_origin_expiry_updates_session_entries(
    tmp_path: Path,
    monkeypatch,
) -> None:
    store = _build_store(tmp_path)
    monkeypatch.setattr(
        trusted_frontend_origins_module,
        "_TRUSTED_FRONTEND_ORIGIN_STORE",
        store,
    )
    origin = "http://127.0.0.1:62222"
    store.trust_origin(session_id="session-a", origin=origin, exp=110, now=100)

    refresh_trusted_frontend_origins_for_session(
        session_id="session-a",
        exp=220,
        now=101,
    )

    assert store.is_trusted(session_id="session-a", origin=origin, now=180) is True


def test_trusted_frontend_origin_store_ignores_stale_lock_file(
    tmp_path: Path,
) -> None:
    store = _build_store(tmp_path)
    lock_path = (tmp_path / "trusted_frontend_origins.json").with_name(
        "trusted_frontend_origins.json.lock"
    )
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    lock_path.write_text("stale", encoding="utf-8")
    origin = "http://127.0.0.1:62222"

    store.trust_origin(session_id="session-1", origin=origin, exp=150, now=100)

    assert store.is_trusted(session_id="session-1", origin=origin, now=120) is True


def test_trusted_frontend_origin_store_maps_lock_parent_failures_to_unavailable_error(
    tmp_path: Path,
) -> None:
    lock_parent = tmp_path / "lock-parent-as-file"
    lock_parent.write_text("not-a-directory", encoding="utf-8")
    store = TrustedFrontendOriginStore(
        storage_path=lock_parent / "trusted_frontend_origins.json"
    )

    # A broken lock parent must be normalized into a typed store-unavailable error.
    with pytest.raises(
        TrustedFrontendOriginStoreUnavailableError,
        match="Failed acquiring trusted frontend origins store lock",
    ):
        store.clear()


def test_is_trusted_frontend_origin_denies_expired_session_entry(
    tmp_path: Path,
    monkeypatch,
) -> None:
    store = _build_store(tmp_path)
    monkeypatch.setattr(
        trusted_frontend_origins_module,
        "_TRUSTED_FRONTEND_ORIGIN_STORE",
        store,
    )
    origin = "http://127.0.0.1:62222"
    store.trust_origin(session_id="session-1", origin=origin, exp=110, now=100)

    monkeypatch.setattr(trusted_frontend_origins_module.time, "time", lambda: 109.0)
    assert is_trusted_frontend_origin(origin, session_id="session-1") is True

    monkeypatch.setattr(trusted_frontend_origins_module.time, "time", lambda: 111.0)
    assert is_trusted_frontend_origin(origin, session_id="session-1") is False
