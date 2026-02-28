from dataclasses import dataclass
from threading import Lock


@dataclass(frozen=True)
class StoredWorkspaceLaunchIntent:
    session_id: str
    launch_request_payload: dict[str, object]
    return_url: str
    exp: int


class WorkspaceLaunchIntentStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self._store: dict[str, StoredWorkspaceLaunchIntent] = {}

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
        with self._lock:
            self._prune_locked(now=now)
            self._store[token] = StoredWorkspaceLaunchIntent(
                session_id=session_id,
                launch_request_payload=launch_request_payload,
                return_url=return_url,
                exp=exp,
            )

    def consume_once(
        self,
        *,
        token: str,
        session_id: str,
        now: int,
    ) -> StoredWorkspaceLaunchIntent:
        with self._lock:
            self._prune_locked(now=now)
            stored = self._store.pop(token, None)
            if stored is None:
                raise ValueError("Launch intent token is missing or already consumed.")
            if stored.exp <= now:
                raise ValueError("Launch intent token has expired.")
            if stored.session_id != session_id:
                raise ValueError("Launch intent token is bound to a different session.")
            return stored

    def prune(self, *, now: int) -> None:
        with self._lock:
            self._prune_locked(now=now)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    def contains(self, token: str) -> bool:
        with self._lock:
            return token in self._store

    def _prune_locked(self, *, now: int) -> None:
        expired_tokens = [
            token for token, stored in self._store.items() if stored.exp <= now
        ]
        for token in expired_tokens:
            self._store.pop(token, None)
