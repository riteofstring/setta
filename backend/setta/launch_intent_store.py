import hashlib
import json
import os
import time
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Iterator

from setta.utils.constants import C

_LOCK_SLEEP_SECONDS = 0.01
_LOCK_TIMEOUT_SECONDS = 5.0


@dataclass(frozen=True)
class StoredWorkspaceLaunchIntent:
    session_id: str
    launch_request_payload: dict[str, object]
    return_url: str
    exp: int


class WorkspaceLaunchIntentStore:
    def __init__(self, storage_path: Path | None = None) -> None:
        self._lock = Lock()
        self._storage_path = (
            storage_path or C.RUNTIME_FOLDER / "workspace_launch_intents.json"
        )
        self._lock_path = self._storage_path.with_name(
            f"{self._storage_path.name}.lock"
        )

    def create(
        self,
        *,
        token: str,
        session_id: str,
        launch_request_payload: dict[str, object],
        return_url: str,
        exp: int,
        now: int,
    ) -> None:
        token_hash = self._token_hash(token)
        with self._lock, _file_lock(self._lock_path):
            store = self._read_store_locked()
            self._prune_locked(store=store, now=now)
            store[token_hash] = StoredWorkspaceLaunchIntent(
                session_id=session_id,
                launch_request_payload=launch_request_payload,
                return_url=return_url,
                exp=exp,
            )
            self._write_store_locked(store)

    def consume_once(
        self,
        *,
        token: str,
        session_id: str,
        now: int,
    ) -> StoredWorkspaceLaunchIntent:
        token_hash = self._token_hash(token)
        with self._lock, _file_lock(self._lock_path):
            store = self._read_store_locked()
            pruned = self._prune_locked(store=store, now=now)
            stored = store.pop(token_hash, None)
            if stored is None:
                if pruned:
                    self._write_store_locked(store)
                raise ValueError("Launch intent token is missing or already consumed.")
            if stored.exp <= now:
                self._write_store_locked(store)
                raise ValueError("Launch intent token has expired.")
            if stored.session_id != session_id:
                self._write_store_locked(store)
                raise ValueError("Launch intent token is bound to a different session.")
            self._write_store_locked(store)
            return stored

    def prune(self, *, now: int) -> None:
        with self._lock, _file_lock(self._lock_path):
            store = self._read_store_locked()
            if self._prune_locked(store=store, now=now):
                self._write_store_locked(store)

    def clear(self) -> None:
        with self._lock, _file_lock(self._lock_path):
            self._write_store_locked({})

    def contains(self, token: str) -> bool:
        token_hash = self._token_hash(token)
        with self._lock, _file_lock(self._lock_path):
            store = self._read_store_locked()
            return token_hash in store

    def _token_hash(self, token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def _read_store_locked(self) -> dict[str, StoredWorkspaceLaunchIntent]:
        if not self._storage_path.exists():
            return {}
        raw_text = self._storage_path.read_text(encoding="utf-8")
        if not raw_text.strip():
            return {}
        raw = json.loads(raw_text)
        if not isinstance(raw, dict):
            raise ValueError("Launch intent store payload must be an object.")
        store: dict[str, StoredWorkspaceLaunchIntent] = {}
        for token_hash, stored_raw in raw.items():
            if not isinstance(token_hash, str):
                raise ValueError("Launch intent store token keys must be strings.")
            if not isinstance(stored_raw, dict):
                raise ValueError("Launch intent store entries must be objects.")
            session_id = stored_raw.get("session_id")
            launch_request_payload = stored_raw.get("launch_request_payload")
            return_url = stored_raw.get("return_url")
            exp = stored_raw.get("exp")
            if not isinstance(session_id, str):
                raise ValueError("Launch intent store session ids must be strings.")
            if not isinstance(launch_request_payload, dict):
                raise ValueError(
                    "Launch intent store launch_request_payload must be an object."
                )
            if not isinstance(return_url, str):
                raise ValueError("Launch intent store return URLs must be strings.")
            if not isinstance(exp, int):
                raise ValueError("Launch intent store expiry values must be integers.")
            store[token_hash] = StoredWorkspaceLaunchIntent(
                session_id=session_id,
                launch_request_payload=launch_request_payload,
                return_url=return_url,
                exp=exp,
            )
        return store

    def _write_store_locked(
        self, store: dict[str, StoredWorkspaceLaunchIntent]
    ) -> None:
        self._storage_path.parent.mkdir(parents=True, exist_ok=True)
        if not store:
            if self._storage_path.exists():
                self._storage_path.unlink()
            return
        payload = {
            token_hash: {
                "session_id": stored.session_id,
                "launch_request_payload": stored.launch_request_payload,
                "return_url": stored.return_url,
                "exp": stored.exp,
            }
            for token_hash, stored in store.items()
        }
        tmp_path = self._storage_path.with_name(f"{self._storage_path.name}.tmp")
        tmp_path.write_text(
            json.dumps(payload, sort_keys=True),
            encoding="utf-8",
        )
        tmp_path.replace(self._storage_path)

    def _prune_locked(
        self, *, store: dict[str, StoredWorkspaceLaunchIntent], now: int
    ) -> bool:
        expired_tokens = [token for token, stored in store.items() if stored.exp <= now]
        if not expired_tokens:
            return False
        for token in expired_tokens:
            store.pop(token, None)
        return True


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
                    f"Timed out waiting for launch-intent lock: {lock_path}"
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
