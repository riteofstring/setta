from contextlib import contextmanager
from typing import Iterator

from setta.runtime.context import RuntimeContext
from setta.server_state import SettaFastAPIState


@contextmanager
def runtime_context(
    state: SettaFastAPIState, share_session_id: str | None = None
) -> Iterator[RuntimeContext]:
    yield RuntimeContext(state, share_session_id=share_session_id)
