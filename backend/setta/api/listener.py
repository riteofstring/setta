import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Awaitable, Callable, Iterable

logger = logging.getLogger(__name__)


# Listener callbacks may either complete synchronously or return an awaitable.
ListenerCallback = Callable[[Any, Any], Awaitable[None] | None]


class ListenerFeed(str, Enum):
    PERSISTED = "persisted"
    REALTIME = "realtime"
    BOTH = "both"


@dataclass(slots=True)
class ListenerCallbackSpec:
    function: ListenerCallback
    dependencies: tuple[Any, ...] = field(default_factory=tuple)
    feed: ListenerFeed = ListenerFeed.PERSISTED
    debounce_ms: int | None = None
    throttle_ms: int | None = None
    run_on_refresh: bool = False


class SettaListener:
    def __init__(
        self,
        *,
        project_id: str,
        default_feed: ListenerFeed = ListenerFeed.PERSISTED,
    ) -> None:
        self._project_id = project_id
        self._feed = self._normalize_feed(default_feed)
        self._callbacks: list[ListenerCallbackSpec] = []

    def listen(
        self,
        *,
        deps: Iterable[Any] | None = None,
        feed: ListenerFeed | str | None = None,
        debounce_ms: int | None = None,
        throttle_ms: int | None = None,
        run_on_refresh: bool = False,
    ) -> Callable[[ListenerCallback], ListenerCallback]:
        selection = self._normalize_feed(feed if feed is not None else self._feed)

        def decorator(func: ListenerCallback) -> ListenerCallback:
            spec = ListenerCallbackSpec(
                function=func,
                dependencies=tuple(deps) if deps is not None else (),
                feed=selection,
                debounce_ms=debounce_ms,
                throttle_ms=throttle_ms,
                run_on_refresh=run_on_refresh,
            )
            self._callbacks.append(spec)
            return func

        return decorator

    @staticmethod
    def _normalize_feed(
        value: ListenerFeed | str,
    ) -> ListenerFeed:
        try:
            return ListenerFeed(value)
        except ValueError as error:
            msg = "Unknown feed selection %r. Expected one of %s."
            choices = tuple(member.value for member in ListenerFeed)
            raise ValueError(msg % (value, choices)) from error
