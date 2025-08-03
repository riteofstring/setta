import copy
from typing import Generic, List, TypeVar

T = TypeVar("T")


class History(Generic[T]):
    def __init__(self, state: T | None = None) -> None:
        self._history: List[T] = []
        self._current: int = -1
        self._copy_func = copy.deepcopy
        if state:
            self.add(state)

    def add(self, state: T) -> None:
        # Truncate history after current position when adding new state
        self._history = self._history[: self._current + 1]
        self._history.append(state)
        self._current = len(self._history) - 1

    def add_current_copy(self) -> T:
        current = self.get_current()
        new_state = self._copy_func(current)
        self.add(new_state)
        return new_state

    def copy_current(self) -> T:
        current = self.get_current()
        return self._copy_func(current)

    def undo(self, steps: int = 1) -> T:
        if steps <= 0:
            return self._history[self._current]

        # Clamp to valid range
        self._current = max(0, self._current - steps)
        print("\n\n\nself._current", self._current)
        return self._history[self._current]

    def redo(self, steps: int = 1) -> T:
        if steps <= 0:
            return self._history[self._current]

        # Clamp to valid range
        self._current = min(len(self._history) - 1, self._current + steps)
        return self._history[self._current]

    def get_current(self) -> T:
        return self._history[self._current]

    def set_current(self, x: T):
        self._history[self._current] = x

    def can_undo(self, steps: int = 1) -> bool:
        return self._current - steps >= 0

    def can_redo(self, steps: int = 1) -> bool:
        return self._current + steps < len(self._history)
