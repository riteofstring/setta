import hashlib
import json
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Iterator

from setta.utils.constants import C
from setta.utils.process_file_lock import (
    ProcessFileLockError,
    acquire_process_file_lock,
)

_LOCK_TIMEOUT_SECONDS = 5.0
_DEFAULT_MAX_INTENTS_PER_SESSION = 64
_DEFAULT_MAX_TOTAL_INTENTS = 2048


@dataclass(frozen=True)
class StoredWorkspaceLaunchIntent:
    session_id: str
    launch_request_payload: dict[str, object]
    return_url: str
    exp: int


class WorkspaceLaunchIntentStoreError(RuntimeError):
    pass


class WorkspaceLaunchIntentStoreUnavailableError(WorkspaceLaunchIntentStoreError):
    pass


class WorkspaceLaunchIntentStoreStateError(WorkspaceLaunchIntentStoreError):
    pass


class WorkspaceLaunchIntentStoreCapacityError(WorkspaceLaunchIntentStoreError):
    pass


class WorkspaceLaunchIntentStore:
    def __init__(
        self,
        storage_path: Path | None = None,
        *,
        max_intents_per_session: int = _DEFAULT_MAX_INTENTS_PER_SESSION,
        max_total_intents: int = _DEFAULT_MAX_TOTAL_INTENTS,
    ) -> None:
        if max_intents_per_session < 1:
            raise ValueError("max_intents_per_session must be >= 1.")
        if max_total_intents < max_intents_per_session:
            raise ValueError("max_total_intents must be >= max_intents_per_session.")
        self._lock = Lock()
        self._storage_path = (
            storage_path or C.RUNTIME_FOLDER / "workspace_launch_intents.json"
        )
        self._lock_path = self._storage_path.with_name(
            f"{self._storage_path.name}.lock"
        )
        self._max_intents_per_session = max_intents_per_session
        self._max_total_intents = max_total_intents

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
        with self._lock, self._store_lock():
            store = self._read_store_locked()
            self._prune_locked(store=store, now=now)
            self._enforce_capacity_locked(
                store=store,
                token_hash=token_hash,
                session_id=session_id,
            )
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
        with self._lock, self._store_lock():
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
        with self._lock, self._store_lock():
            store = self._read_store_locked()
            if self._prune_locked(store=store, now=now):
                self._write_store_locked(store)

    def clear(self) -> None:
        with self._lock, self._store_lock():
            self._write_store_locked({})

    def contains(self, token: str) -> bool:
        token_hash = self._token_hash(token)
        with self._lock, self._store_lock():
            store = self._read_store_locked()
            return token_hash in store

    def _token_hash(self, token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    @contextmanager
    def _store_lock(self) -> Iterator[None]:
        try:
            with acquire_process_file_lock(
                self._lock_path, timeout_seconds=_LOCK_TIMEOUT_SECONDS
            ):
                yield
        except ProcessFileLockError as exc:
            raise WorkspaceLaunchIntentStoreUnavailableError(
                f"Failed acquiring launch-intent store lock: {self._lock_path}"
            ) from exc

    def _read_store_locked(self) -> dict[str, StoredWorkspaceLaunchIntent]:
        if not self._storage_path.exists():
            return {}
        try:
            raw_text = self._storage_path.read_text(encoding="utf-8")
        except OSError as exc:
            raise WorkspaceLaunchIntentStoreUnavailableError(
                f"Failed reading launch-intent store: {self._storage_path}"
            ) from exc
        if not raw_text.strip():
            return {}
        try:
            raw = json.loads(raw_text)
        except json.JSONDecodeError as exc:
            raise WorkspaceLaunchIntentStoreStateError(
                "Launch intent store contains invalid JSON."
            ) from exc
        if not isinstance(raw, dict):
            raise WorkspaceLaunchIntentStoreStateError(
                "Launch intent store payload must be an object."
            )
        store: dict[str, StoredWorkspaceLaunchIntent] = {}
        for token_hash, stored_raw in raw.items():
            if not isinstance(token_hash, str):
                raise WorkspaceLaunchIntentStoreStateError(
                    "Launch intent store token keys must be strings."
                )
            if not isinstance(stored_raw, dict):
                raise WorkspaceLaunchIntentStoreStateError(
                    "Launch intent store entries must be objects."
                )
            session_id = stored_raw.get("session_id")
            launch_request_payload = stored_raw.get("launch_request_payload")
            return_url = stored_raw.get("return_url")
            exp = stored_raw.get("exp")
            if not isinstance(session_id, str):
                raise WorkspaceLaunchIntentStoreStateError(
                    "Launch intent store session ids must be strings."
                )
            if not isinstance(launch_request_payload, dict):
                raise WorkspaceLaunchIntentStoreStateError(
                    "Launch intent store launch_request_payload must be an object."
                )
            if not isinstance(return_url, str):
                raise WorkspaceLaunchIntentStoreStateError(
                    "Launch intent store return URLs must be strings."
                )
            if not isinstance(exp, int):
                raise WorkspaceLaunchIntentStoreStateError(
                    "Launch intent store expiry values must be integers."
                )
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
        try:
            self._storage_path.parent.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise WorkspaceLaunchIntentStoreUnavailableError(
                f"Failed creating launch-intent store directory: {self._storage_path.parent}"
            ) from exc
        if not store:
            if self._storage_path.exists():
                try:
                    self._storage_path.unlink()
                except OSError as exc:
                    raise WorkspaceLaunchIntentStoreUnavailableError(
                        f"Failed clearing launch-intent store: {self._storage_path}"
                    ) from exc
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
        try:
            tmp_path.write_text(
                json.dumps(payload, sort_keys=True),
                encoding="utf-8",
            )
            tmp_path.replace(self._storage_path)
        except OSError as exc:
            raise WorkspaceLaunchIntentStoreUnavailableError(
                f"Failed writing launch-intent store: {self._storage_path}"
            ) from exc

    def _prune_locked(
        self, *, store: dict[str, StoredWorkspaceLaunchIntent], now: int
    ) -> bool:
        expired_tokens = [token for token, stored in store.items() if stored.exp <= now]
        if not expired_tokens:
            return False
        for token in expired_tokens:
            store.pop(token, None)
        return True

    def _enforce_capacity_locked(
        self,
        *,
        store: dict[str, StoredWorkspaceLaunchIntent],
        token_hash: str,
        session_id: str,
    ) -> None:
        if token_hash in store:
            return
        session_intent_count = sum(
            1
            for stored_intent in store.values()
            if stored_intent.session_id == session_id
        )
        if session_intent_count >= self._max_intents_per_session:
            raise WorkspaceLaunchIntentStoreCapacityError(
                "Launch intent session capacity exceeded."
            )
        if len(store) >= self._max_total_intents:
            raise WorkspaceLaunchIntentStoreCapacityError(
                "Launch intent global capacity exceeded."
            )
