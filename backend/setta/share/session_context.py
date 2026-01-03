from contextvars import ContextVar, Token

_share_session_id: ContextVar[str | None] = ContextVar(
    "share_session_id",
    default=None,
)


def get_share_session_id() -> str | None:
    return _share_session_id.get()


def require_share_session_id() -> str:
    session_id = _share_session_id.get()
    if session_id is None:
        raise KeyError("Missing share session id")
    return session_id


def set_share_session_id(session_id: str | None) -> Token:
    return _share_session_id.set(session_id)


def reset_share_session_id(token: Token) -> None:
    _share_session_id.reset(token)
