import json
import re
import time
from contextlib import contextmanager
from pathlib import Path
from threading import Lock
from typing import Iterator

from setta.utils.constants import C
from setta.utils.launcher_origin_handoff import normalize_launcher_origin
from setta.utils.process_file_lock import (
    ProcessFileLockError,
    acquire_process_file_lock,
)

_LOCK_TIMEOUT_SECONDS = 5.0


class TrustedFrontendOriginStoreError(RuntimeError):
    pass


class TrustedFrontendOriginStoreUnavailableError(TrustedFrontendOriginStoreError):
    pass


class TrustedFrontendOriginStoreStateError(TrustedFrontendOriginStoreError):
    pass


class TrustedFrontendOriginStore:
    def __init__(self, storage_path: Path | None = None) -> None:
        self._lock = Lock()
        self._storage_path = (
            storage_path or C.RUNTIME_FOLDER / "trusted_frontend_origins.json"
        )
        self._lock_path = self._storage_path.with_name(
            f"{self._storage_path.name}.lock"
        )

    def trust_origin(self, *, session_id: str, origin: str, exp: int, now: int) -> None:
        with self._lock, self._store_lock():
            store = self._read_store_locked()
            self._prune_locked(store=store, now=now)
            if session_id not in store:
                store[session_id] = {}
            store[session_id][origin] = exp
            self._write_store_locked(store)

    def refresh_session_expiry(self, *, session_id: str, exp: int, now: int) -> None:
        with self._lock, self._store_lock():
            store = self._read_store_locked()
            was_pruned = self._prune_locked(store=store, now=now)
            if session_id not in store:
                if was_pruned:
                    self._write_store_locked(store)
                return
            updated = False
            session_origins = store[session_id]
            for origin in session_origins:
                if session_origins[origin] >= exp:
                    continue
                session_origins[origin] = exp
                updated = True
            if was_pruned or updated:
                self._write_store_locked(store)

    def is_trusted(self, *, session_id: str, origin: str, now: int) -> bool:
        with self._lock, self._store_lock():
            store = self._read_store_locked()
            was_pruned = self._prune_locked(store=store, now=now)
            trusted = session_id in store and origin in store[session_id]
            if was_pruned:
                self._write_store_locked(store)
            return trusted

    def clear(self) -> None:
        with self._lock, self._store_lock():
            self._write_store_locked({})

    @contextmanager
    def _store_lock(self) -> Iterator[None]:
        try:
            with acquire_process_file_lock(
                self._lock_path, timeout_seconds=_LOCK_TIMEOUT_SECONDS
            ):
                yield
        except ProcessFileLockError as exc:
            raise TrustedFrontendOriginStoreUnavailableError(
                f"Failed acquiring trusted frontend origins store lock: {self._lock_path}"
            ) from exc

    def _read_store_locked(self) -> dict[str, dict[str, int]]:
        if not self._storage_path.exists():
            return {}
        try:
            raw_text = self._storage_path.read_text(encoding="utf-8")
        except OSError as exc:
            raise TrustedFrontendOriginStoreUnavailableError(
                f"Failed reading trusted frontend origins store: {self._storage_path}"
            ) from exc
        if not raw_text.strip():
            return {}
        try:
            raw = json.loads(raw_text)
        except json.JSONDecodeError as exc:
            raise TrustedFrontendOriginStoreStateError(
                "Trusted frontend origins store contains invalid JSON."
            ) from exc
        if not isinstance(raw, dict):
            raise TrustedFrontendOriginStoreStateError(
                "Trusted frontend origins store must be an object."
            )
        store: dict[str, dict[str, int]] = {}
        for session_id, session_origins_raw in raw.items():
            if not isinstance(session_id, str):
                raise TrustedFrontendOriginStoreStateError(
                    "Trusted frontend origin session keys must be strings."
                )
            if not isinstance(session_origins_raw, dict):
                raise TrustedFrontendOriginStoreStateError(
                    "Trusted frontend origin session entries must be objects."
                )
            session_origins: dict[str, int] = {}
            for origin, exp in session_origins_raw.items():
                if not isinstance(origin, str):
                    raise TrustedFrontendOriginStoreStateError(
                        "Trusted frontend origin keys must be strings."
                    )
                if not isinstance(exp, int):
                    raise TrustedFrontendOriginStoreStateError(
                        "Trusted frontend origin expiry values must be ints."
                    )
                session_origins[origin] = exp
            store[session_id] = session_origins
        return store

    def _write_store_locked(self, store: dict[str, dict[str, int]]) -> None:
        try:
            self._storage_path.parent.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise TrustedFrontendOriginStoreUnavailableError(
                "Failed creating trusted frontend origins store directory."
            ) from exc
        if not store:
            if self._storage_path.exists():
                try:
                    self._storage_path.unlink()
                except OSError as exc:
                    raise TrustedFrontendOriginStoreUnavailableError(
                        f"Failed clearing trusted frontend origins store: {self._storage_path}"
                    ) from exc
            return
        tmp_path = self._storage_path.with_name(f"{self._storage_path.name}.tmp")
        try:
            tmp_path.write_text(
                json.dumps(store, sort_keys=True),
                encoding="utf-8",
            )
            tmp_path.replace(self._storage_path)
        except OSError as exc:
            raise TrustedFrontendOriginStoreUnavailableError(
                f"Failed writing trusted frontend origins store: {self._storage_path}"
            ) from exc

    def _prune_locked(self, *, store: dict[str, dict[str, int]], now: int) -> bool:
        was_pruned = False
        expired_sessions: list[str] = []
        for session_id, session_origins in store.items():
            expired_origins = [
                origin for origin, exp in session_origins.items() if exp <= now
            ]
            if not expired_origins:
                if session_origins:
                    continue
                expired_sessions.append(session_id)
                was_pruned = True
                continue
            for origin in expired_origins:
                session_origins.pop(origin, None)
            was_pruned = True
            if session_origins:
                continue
            expired_sessions.append(session_id)
        for session_id in expired_sessions:
            store.pop(session_id, None)
        return was_pruned


_TRUSTED_FRONTEND_ORIGIN_STORE = TrustedFrontendOriginStore()


def trust_frontend_origin(
    origin: str,
    *,
    session_id: str,
    exp: int,
    now: int | None = None,
) -> str:
    normalized_origin = normalize_launcher_origin(origin)
    if normalized_origin is None:
        raise ValueError("Trusted frontend origin must be an absolute http(s) origin.")
    normalized_session_id = _normalize_session_id(session_id)
    if _is_configured_frontend_origin(normalized_origin):
        return normalized_origin
    effective_now = int(time.time()) if now is None else now
    _TRUSTED_FRONTEND_ORIGIN_STORE.trust_origin(
        session_id=normalized_session_id,
        origin=normalized_origin,
        exp=exp,
        now=effective_now,
    )
    return normalized_origin


def refresh_trusted_frontend_origins_for_session(
    *,
    session_id: str,
    exp: int,
    now: int | None = None,
) -> None:
    normalized_session_id = _normalize_session_id(session_id)
    effective_now = int(time.time()) if now is None else now
    _TRUSTED_FRONTEND_ORIGIN_STORE.refresh_session_expiry(
        session_id=normalized_session_id,
        exp=exp,
        now=effective_now,
    )


def is_trusted_frontend_origin(origin: str | None, *, session_id: str | None) -> bool:
    normalized_origin = normalize_launcher_origin(origin)
    if normalized_origin is None:
        return False
    if _is_configured_frontend_origin(normalized_origin):
        return True
    origin_regex = C.FRONTEND_ORIGIN_REGEX
    if origin_regex is not None and re.fullmatch(origin_regex, normalized_origin):
        return True
    if session_id is None:
        return False
    normalized_session_id = session_id.strip()
    if not normalized_session_id:
        return False
    try:
        return _TRUSTED_FRONTEND_ORIGIN_STORE.is_trusted(
            session_id=normalized_session_id,
            origin=normalized_origin,
            now=int(time.time()),
        )
    except TrustedFrontendOriginStoreError:
        return False


def _is_configured_frontend_origin(origin: str) -> bool:
    for configured_origin in C.FRONTEND_ORIGINS:
        normalized_configured_origin = normalize_launcher_origin(configured_origin)
        if normalized_configured_origin == origin:
            return True
    return False


def _normalize_session_id(session_id: str) -> str:
    normalized_session_id = session_id.strip()
    if not normalized_session_id:
        raise ValueError("Trusted frontend origin session id must not be blank.")
    return normalized_session_id
