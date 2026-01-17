import asyncio
import inspect
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from setta.logging.tasks import spawn_background_task

CallbackExecutor = Callable[[dict[str, Any], list[Any]], Awaitable[None] | None]


def _normalize_ms(value: int | None) -> float | None:
    if value is None:
        return None
    if value <= 0:
        return None
    return value / 1000.0


@dataclass(slots=True)
class _CallbackEntry:
    callback_id: str
    executor: CallbackExecutor
    debounce_seconds: float | None
    throttle_seconds: float | None
    pending_payload: dict[str, Any] = field(default_factory=dict)
    pending_events: list[Any] = field(default_factory=list)
    timer_handle: asyncio.TimerHandle | None = None
    next_scheduled_time: float | None = None
    last_invoked: float | None = None
    is_running: bool = False


class ListenerCallbackScheduler:
    """Coordinates debounce/throttle timing for listener callbacks."""

    def __init__(self) -> None:
        self._loop: asyncio.AbstractEventLoop | None = None
        self._callbacks: dict[str, _CallbackEntry] = {}

    def register_callback(
        self,
        callback_id: str,
        *,
        executor: CallbackExecutor,
        debounce_ms: int | None,
        throttle_ms: int | None,
    ) -> None:
        if callback_id in self._callbacks:
            raise ValueError(f"callback {callback_id!r} already registered")
        entry = _CallbackEntry(
            callback_id=callback_id,
            executor=executor,
            debounce_seconds=_normalize_ms(debounce_ms),
            throttle_seconds=_normalize_ms(throttle_ms),
        )
        self._callbacks[callback_id] = entry

    def unregister_callback(self, callback_id: str) -> None:
        entry = self._callbacks.pop(callback_id, None)
        if entry is None:
            return
        if entry.timer_handle is not None:
            entry.timer_handle.cancel()
        entry.pending_payload.clear()
        entry.pending_events.clear()

    def submit(
        self,
        callback_id: str,
        *,
        changed: dict[str, Any] | None = None,
        events: list[Any] | None = None,
    ) -> None:
        if not changed and not events:
            return
        entry = self._callbacks.get(callback_id)
        if entry is None:
            raise KeyError(f"callback {callback_id!r} is not registered")
        if changed:
            entry.pending_payload.update(changed)
        if events:
            entry.pending_events.extend(events)
        loop = self._get_loop()
        now = loop.time()
        self._plan_execution(entry, now)

    async def flush(self, callback_id: str) -> None:
        entry = self._callbacks.get(callback_id)
        if entry is None:
            raise KeyError(f"callback {callback_id!r} is not registered")
        if entry.is_running or (not entry.pending_payload and not entry.pending_events):
            return
        if entry.timer_handle is not None:
            entry.timer_handle.cancel()
            entry.timer_handle = None
        entry.next_scheduled_time = None
        await self._execute_callback(callback_id)

    def reset(self, callback_id: str) -> None:
        entry = self._callbacks.get(callback_id)
        if entry is None:
            return
        if entry.timer_handle is not None:
            entry.timer_handle.cancel()
            entry.timer_handle = None
        entry.next_scheduled_time = None
        entry.pending_payload.clear()
        entry.pending_events.clear()

    def _plan_execution(self, entry: _CallbackEntry, now: float) -> None:
        target_time = now
        if entry.debounce_seconds is not None:
            target_time = max(target_time, now + entry.debounce_seconds)
        if entry.throttle_seconds is not None and entry.last_invoked is not None:
            target_time = max(target_time, entry.last_invoked + entry.throttle_seconds)
        entry.next_scheduled_time = target_time
        if entry.is_running:
            if entry.timer_handle is not None:
                entry.timer_handle.cancel()
                entry.timer_handle = None
            return
        self._ensure_timer(entry, now)

    def _ensure_timer(self, entry: _CallbackEntry, now: float) -> None:
        target_time = entry.next_scheduled_time
        if target_time is None:
            return
        loop = self._get_loop()
        delay = target_time - now
        if delay <= 0:
            entry.next_scheduled_time = None
            if entry.timer_handle is not None:
                entry.timer_handle.cancel()
                entry.timer_handle = None
            spawn_background_task(
                self._execute_callback(entry.callback_id),
                loop=loop,
                label="listener-callback-execute",
                extra_values={"callback_id": entry.callback_id},
            )
            return
        if entry.timer_handle is not None:
            entry.timer_handle.cancel()
        entry.timer_handle = loop.call_later(
            delay, self._on_timer_fired, entry.callback_id
        )

    def _on_timer_fired(self, callback_id: str) -> None:
        entry = self._callbacks.get(callback_id)
        if entry is None:
            return
        entry.timer_handle = None
        entry.next_scheduled_time = None
        if entry.is_running:
            now = self._get_loop().time()
            self._plan_execution(entry, now)
            return
        loop = self._get_loop()
        spawn_background_task(
            self._execute_callback(callback_id),
            loop=loop,
            label="listener-callback-execute",
            extra_values={"callback_id": callback_id},
        )

    async def _execute_callback(self, callback_id: str) -> None:
        entry = self._callbacks.get(callback_id)
        if entry is None:
            return
        if entry.is_running:
            return
        if not entry.pending_payload and not entry.pending_events:
            return
        loop = self._get_loop()
        entry.is_running = True
        payload = dict(entry.pending_payload)
        events = list(entry.pending_events)
        entry.pending_payload.clear()
        entry.pending_events.clear()
        try:
            result = entry.executor(payload, events)
            if inspect.isawaitable(result):
                await result
        finally:
            entry.is_running = False
            entry.timer_handle = None
            entry.next_scheduled_time = None
            entry.last_invoked = loop.time()
            if entry.pending_payload or entry.pending_events:
                self._plan_execution(entry, entry.last_invoked)

    def _get_loop(self) -> asyncio.AbstractEventLoop:
        loop = self._loop
        if loop is None:
            self._loop = asyncio.get_running_loop()
            return self._loop
        return loop
