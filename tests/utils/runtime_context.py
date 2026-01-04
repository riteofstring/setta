from contextlib import contextmanager
from typing import Iterator

from setta.runtime.context import RuntimeContext
from setta.server_state import SettaFastAPIState
from setta.share.session_context import reset_share_session_id, set_share_session_id


@contextmanager
def runtime_context(
    state: SettaFastAPIState, share_session_id: str | None = None
) -> Iterator[RuntimeContext]:
    token = set_share_session_id(share_session_id)
    try:
        yield RuntimeContext(state, share_session_id=share_session_id)
    finally:
        reset_share_session_id(token)
