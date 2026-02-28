import time
from pathlib import Path

from setta import trusted_frontend_origins as trusted_frontend_origins_module
from setta.trusted_frontend_origins import (
    TrustedFrontendOriginStore,
    is_trusted_frontend_origin,
    trust_frontend_origin,
)


def _build_store(tmp_path: Path) -> TrustedFrontendOriginStore:
    return TrustedFrontendOriginStore(
        storage_path=tmp_path / "trusted_frontend_origins.json"
    )


def test_trusted_frontend_origin_store_prunes_expired_entries(tmp_path: Path) -> None:
    store = _build_store(tmp_path)
    origin = "http://127.0.0.1:61234"
    store.trust_origin(origin=origin, exp=105, now=100)

    assert store.is_trusted(origin=origin, now=104) is True
    assert store.is_trusted(origin=origin, now=106) is False


def test_trust_frontend_origin_normalizes_input(tmp_path: Path, monkeypatch) -> None:
    store = _build_store(tmp_path)
    monkeypatch.setattr(
        trusted_frontend_origins_module,
        "_TRUSTED_FRONTEND_ORIGIN_STORE",
        store,
    )

    normalized = trust_frontend_origin(
        "http://127.0.0.1:61234/",
        now=100,
        ttl_seconds=20,
    )

    assert normalized == "http://127.0.0.1:61234"
    assert store.is_trusted(origin=normalized, now=119) is True


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
    store.trust_origin(origin=origin, exp=now + 30, now=now)

    assert is_trusted_frontend_origin(origin) is True
