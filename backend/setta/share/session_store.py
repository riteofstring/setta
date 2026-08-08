import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from setta.utils.timestamps import get_now_timestamp


@dataclass
class ShareSession:
    id: str
    created_at: datetime
    last_accessed_at: datetime


class ShareSessionStore:
    def create_session(self) -> ShareSession:
        raise NotImplementedError("ShareSessionStore.create_session is not implemented")

    def get_session(self, session_id: str) -> ShareSession:
        raise NotImplementedError("ShareSessionStore.get_session is not implemented")

    def has_session(self, session_id: str) -> bool:
        raise NotImplementedError("ShareSessionStore.has_session is not implemented")

    def update_session(self, session_id: str, session: ShareSession) -> None:
        raise NotImplementedError("ShareSessionStore.update_session is not implemented")

    def touch_session(self, session_id: str) -> None:
        raise NotImplementedError("ShareSessionStore.touch_session is not implemented")

    def delete_session(self, session_id: str) -> None:
        raise NotImplementedError("ShareSessionStore.delete_session is not implemented")

    def cleanup_expired(self) -> list[str]:
        raise NotImplementedError(
            "ShareSessionStore.cleanup_expired is not implemented"
        )


class MemorySessionStore(ShareSessionStore):
    def __init__(self, ttl_seconds: int = 60 * 30) -> None:
        self._ttl = timedelta(seconds=ttl_seconds)
        self._sessions: dict[str, ShareSession] = {}

    def create_session(self) -> ShareSession:
        session_id = uuid.uuid4().hex
        now = get_now_timestamp()
        session = ShareSession(
            id=session_id,
            created_at=now,
            last_accessed_at=now,
        )
        self._sessions[session_id] = session
        return session

    def get_session(self, session_id: str) -> ShareSession:
        if session_id not in self._sessions:
            raise KeyError(f"Unknown share session id: {session_id}")
        self.touch_session(session_id)
        return self._sessions[session_id]

    def has_session(self, session_id: str) -> bool:
        return session_id in self._sessions

    def update_session(self, session_id: str, session: ShareSession) -> None:
        if session_id not in self._sessions:
            raise KeyError(f"Unknown share session id: {session_id}")
        self._sessions[session_id] = session

    def touch_session(self, session_id: str) -> None:
        if session_id not in self._sessions:
            raise KeyError(f"Unknown share session id: {session_id}")
        session = self._sessions[session_id]
        session.last_accessed_at = get_now_timestamp()

    def delete_session(self, session_id: str) -> None:
        if session_id not in self._sessions:
            raise KeyError(f"Unknown share session id: {session_id}")
        del self._sessions[session_id]

    def cleanup_expired(self) -> list[str]:
        now = get_now_timestamp()
        expired_ids: list[str] = []
        for session_id, session in self._sessions.items():
            if now - session.last_accessed_at > self._ttl:
                expired_ids.append(session_id)
        for session_id in expired_ids:
            del self._sessions[session_id]
        return expired_ids
