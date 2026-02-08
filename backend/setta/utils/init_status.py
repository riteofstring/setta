from datetime import datetime

from pydantic import BaseModel, Field

from setta.utils.constants import C
from setta.utils.timestamps import get_now_timestamp
from setta.utils.worktree import get_dev_worktree_name


class BackendInitEvent(BaseModel):
    message: str
    timestamp: datetime = Field(default_factory=get_now_timestamp)


class BackendInitStatusResponse(BaseModel):
    events: list[BackendInitEvent]
    isReady: bool
    error: str | None
    authCookieRefreshWindowSeconds: int
    worktreeName: str | None


class AuthRefreshStatusResponse(BaseModel):
    authCookieRefreshWindowSeconds: int


class BackendInitializationStatus:
    def __init__(self) -> None:
        self._events: list[BackendInitEvent] = []
        self._is_ready: bool = False
        self._error: str | None = None

    def record(self, message: str) -> None:
        self._events.append(BackendInitEvent(message=message))

    def mark_ready(self) -> None:
        self._is_ready = True

    def mark_error(self, message: str) -> None:
        self._error = message

    def snapshot(self) -> BackendInitStatusResponse:
        return BackendInitStatusResponse(
            events=list(self._events),
            isReady=self._is_ready,
            error=self._error,
            authCookieRefreshWindowSeconds=C.AUTH_COOKIE_REFRESH_WINDOW_SECONDS,
            worktreeName=get_dev_worktree_name(),
        )


def get_auth_refresh_status() -> AuthRefreshStatusResponse:
    return AuthRefreshStatusResponse(
        authCookieRefreshWindowSeconds=C.AUTH_COOKIE_REFRESH_WINDOW_SECONDS,
    )
