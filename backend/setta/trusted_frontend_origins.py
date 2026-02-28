import json
import os
import re
import time
from contextlib import contextmanager
from pathlib import Path
from threading import Lock
from typing import Iterator

from setta.utils.constants import C
from setta.utils.launcher_origin_handoff import normalize_launcher_origin

_LOCK_SLEEP_SECONDS = 0.01
_LOCK_TIMEOUT_SECONDS = 5.0


class TrustedFrontendOriginStore:
    def __init__(self, storage_path: Path | None = None) -> None:
        self._lock = Lock()
        self._storage_path = (
            storage_path or C.RUNTIME_FOLDER / "trusted_frontend_origins.json"
        )
        self._lock_path = self._storage_path.with_name(
            f"{self._storage_path.name}.lock"
        )

    def trust_origin(self, *, origin: str, exp: int, now: int) -> None:
        with self._lock, _file_lock(self._lock_path):
            store = self._read_store_locked()
            self._prune_locked(store=store, now=now)
            store[origin] = exp
            self._write_store_locked(store)

    def is_trusted(self, *, origin: str, now: int) -> bool:
        with self._lock, _file_lock(self._lock_path):
            store = self._read_store_locked()
            was_pruned = self._prune_locked(store=store, now=now)
            trusted = origin in store
            if was_pruned:
                self._write_store_locked(store)
            return trusted

    def clear(self) -> None:
        with self._lock, _file_lock(self._lock_path):
            self._write_store_locked({})

    def _read_store_locked(self) -> dict[str, int]:
        if not self._storage_path.exists():
            return {}
        raw_text = self._storage_path.read_text(encoding="utf-8")
        if not raw_text.strip():
            return {}
        raw = json.loads(raw_text)
        if not isinstance(raw, dict):
            raise ValueError("Trusted frontend origins store must be an object.")
        store: dict[str, int] = {}
        for origin, exp in raw.items():
            if not isinstance(origin, str):
                raise ValueError("Trusted frontend origin keys must be strings.")
            if not isinstance(exp, int):
                raise ValueError("Trusted frontend origin expiry values must be ints.")
            store[origin] = exp
        return store

    def _write_store_locked(self, store: dict[str, int]) -> None:
        self._storage_path.parent.mkdir(parents=True, exist_ok=True)
        if not store:
            if self._storage_path.exists():
                self._storage_path.unlink()
            return
        tmp_path = self._storage_path.with_name(f"{self._storage_path.name}.tmp")
        tmp_path.write_text(
            json.dumps(store, sort_keys=True),
            encoding="utf-8",
        )
        tmp_path.replace(self._storage_path)

    def _prune_locked(self, *, store: dict[str, int], now: int) -> bool:
        expired = [origin for origin, exp in store.items() if exp <= now]
        if not expired:
            return False
        for origin in expired:
            store.pop(origin, None)
        return True


_TRUSTED_FRONTEND_ORIGIN_STORE = TrustedFrontendOriginStore()


def trust_frontend_origin(
    origin: str,
    *,
    now: int | None = None,
    ttl_seconds: int | None = None,
) -> str:
    normalized_origin = normalize_launcher_origin(origin)
    if normalized_origin is None:
        raise ValueError("Trusted frontend origin must be an absolute http(s) origin.")
    if _is_configured_frontend_origin(normalized_origin):
        return normalized_origin
    effective_now = int(time.time()) if now is None else now
    effective_ttl_seconds = (
        C.AUTH_COOKIE_MAX_AGE_SECONDS if ttl_seconds is None else ttl_seconds
    )
    _TRUSTED_FRONTEND_ORIGIN_STORE.trust_origin(
        origin=normalized_origin,
        exp=effective_now + effective_ttl_seconds,
        now=effective_now,
    )
    return normalized_origin


def is_trusted_frontend_origin(origin: str | None) -> bool:
    normalized_origin = normalize_launcher_origin(origin)
    if normalized_origin is None:
        return False
    if _is_configured_frontend_origin(normalized_origin):
        return True
    origin_regex = C.FRONTEND_ORIGIN_REGEX
    if origin_regex is not None and re.fullmatch(origin_regex, normalized_origin):
        return True
    return _TRUSTED_FRONTEND_ORIGIN_STORE.is_trusted(
        origin=normalized_origin,
        now=int(time.time()),
    )


def _is_configured_frontend_origin(origin: str) -> bool:
    for configured_origin in C.FRONTEND_ORIGINS:
        normalized_configured_origin = normalize_launcher_origin(configured_origin)
        if normalized_configured_origin == origin:
            return True
    return False


@contextmanager
def _file_lock(lock_path: Path) -> Iterator[None]:
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    start_time = time.monotonic()
    lock_fd: int | None = None
    while lock_fd is None:
        try:
            lock_fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_RDWR)
        except FileExistsError:
            if (time.monotonic() - start_time) >= _LOCK_TIMEOUT_SECONDS:
                raise TimeoutError(
                    f"Timed out waiting for trusted frontend origins lock: {lock_path}"
                )
            time.sleep(_LOCK_SLEEP_SECONDS)
    try:
        yield
    finally:
        os.close(lock_fd)
        try:
            lock_path.unlink()
        except FileNotFoundError:
            pass
