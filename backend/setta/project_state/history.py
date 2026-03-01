import copy
import time
from collections.abc import Callable
from typing import Generic, List, TypeVar

T = TypeVar("T")


class History(Generic[T]):
    def __init__(
        self,
        state: T | None = None,
        max_size: int | None = 1000,
    ) -> None:
        self._history: List[T] = []
        self._current: int = -1
        self._copy_func = copy.deepcopy
        self._max_size = max_size
        self._last_entry_key: str | None = None
        self._last_entry_ts: float | None = None
        # Monotonic revision that changes whenever the "current" state may have
        # changed. This is used for cache invalidation when history coalescing
        # returns the existing object (mutated in place) rather than adding a
        # new history entry.
        self.revision: int = 0
        if state:
            self.add(state)

    def _reset_last_entry(self) -> None:
        self._last_entry_key = None
        self._last_entry_ts = None

    def _bump_revision(self) -> None:
        self.revision += 1

    def add(self, state: T) -> None:
        # Truncate history after current position when adding new state
        self._history = self._history[: self._current + 1]
        self._history.append(state)
        self._current = len(self._history) - 1
        self._reset_last_entry()
        self._bump_revision()

        # Enforce max size by removing oldest entries
        if self._max_size and len(self._history) > self._max_size:
            items_to_remove = len(self._history) - self._max_size
            self._history = self._history[items_to_remove:]
            self._current -= items_to_remove

    def add_current_copy(
        self,
        coalesce_key: str | None = None,
        coalesce_window_s: float | None = None,
        copy_func: Callable[[T], T] | None = None,
    ) -> T:
        current = self.get_current()
        resolved_copy_func = copy_func or self._copy_func
        if coalesce_key and coalesce_window_s:
            now = time.monotonic()
            if (
                self._last_entry_key == coalesce_key
                and self._last_entry_ts is not None
                and now - self._last_entry_ts <= coalesce_window_s
            ):
                self._last_entry_ts = now
                self._bump_revision()
                return current
            new_state = resolved_copy_func(current)
            self.add(new_state)
            self._last_entry_key = coalesce_key
            self._last_entry_ts = now
            return new_state
        new_state = resolved_copy_func(current)
        self.add(new_state)
        return new_state

    def copy_current(self) -> T:
        current = self.get_current()
        return self._copy_func(current)

    def undo(self, steps: int = 1) -> T:
        if steps <= 0:
            return self._history[self._current]

        # Clamp to valid range
        next_current = max(0, self._current - steps)
        if next_current != self._current:
            self._current = next_current
            self._bump_revision()
        self._reset_last_entry()
        return self._history[self._current]

    def redo(self, steps: int = 1) -> T:
        if steps <= 0:
            return self._history[self._current]

        # Clamp to valid range
        next_current = min(len(self._history) - 1, self._current + steps)
        if next_current != self._current:
            self._current = next_current
            self._bump_revision()
        self._reset_last_entry()
        return self._history[self._current]

    def get_current(self) -> T:
        return self._history[self._current]

    def set_current(self, x: T):
        self._history[self._current] = x
        self._bump_revision()

    def can_undo(self, steps: int = 1) -> bool:
        return self._current - steps >= 0

    def can_redo(self, steps: int = 1) -> bool:
        return self._current + steps < len(self._history)
