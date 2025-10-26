import json
import logging
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Awaitable, Callable, Iterable

import websockets
from pydantic import ValidationError
from websockets.client import WebSocketClientProtocol

from setta.types.routes import Route
from setta.types.websocket import (
    ListenerRegisterCallback,
    ListenerRegisterContent,
    WebsocketMsgListenerAck,
    WebsocketMsgListenerRegister,
)
from setta.utils.constants import C

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
        listener_id: str | None = None,
    ) -> None:
        self._project_id = project_id
        self._feed = self._normalize_feed(default_feed)
        self._callbacks: list[ListenerCallbackSpec] = []
        self._listener_id = listener_id or uuid.uuid4().hex
        self._websocket: WebSocketClientProtocol | None = None
        self._last_ack: WebsocketMsgListenerAck | None = None

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

    async def start(self) -> None:
        if self._websocket is not None:
            raise RuntimeError("Listener is already connected.")
        if not self._callbacks:
            raise RuntimeError(
                "Listener.start() requires at least one registered callback."
            )
        websocket_url = self._build_websocket_url()
        logger.debug("Connecting SettaListener websocket at %s", websocket_url)
        websocket = await websockets.connect(websocket_url)
        try:
            register_message = self._build_register_message()
            await websocket.send(register_message.model_dump_json())
            ack = await self._await_ack(websocket)
        except Exception:
            await websocket.close()
            raise
        self._websocket = websocket
        self._last_ack = ack
        logger.debug(
            "Listener %s registered successfully (heartbeat=%s)",
            self._listener_id,
            ack.content.heartbeatIntervalSec,
        )

    def build_registration_message(self) -> WebsocketMsgListenerRegister:
        return self._build_register_message()

    def _build_websocket_url(self) -> str:
        route = Route.WEBSOCKET_PYTHON_SCRIPT.value.format(id=self._listener_id)
        return f"{C.WEBSOCKET}{route}"

    def _build_register_message(self) -> WebsocketMsgListenerRegister:
        callbacks = tuple(self._serialize_callback(spec) for spec in self._callbacks)
        content = ListenerRegisterContent(
            project_config_id=self._project_id,
            callbacks=callbacks,
        )
        return WebsocketMsgListenerRegister(content=content)

    async def _await_ack(
        self, websocket: WebSocketClientProtocol
    ) -> WebsocketMsgListenerAck:
        raw = await websocket.recv()
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as error:
            raise RuntimeError("Listener expected JSON ack payload.") from error
        try:
            ack = WebsocketMsgListenerAck.model_validate(payload)
        except ValidationError as error:
            raise RuntimeError("Listener received malformed ack payload.") from error
        return ack

    def _serialize_callback(
        self,
        spec: ListenerCallbackSpec,
    ) -> ListenerRegisterCallback:
        dependencies = tuple(self._serialize_dependency(dep) for dep in spec.dependencies)
        return ListenerRegisterCallback(
            callback_id=self._callback_identifier(spec.function),
            dependencies=dependencies,
            feed=spec.feed.value,
            debounce_ms=spec.debounce_ms,
            throttle_ms=spec.throttle_ms,
            run_on_refresh=spec.run_on_refresh,
        )

    @staticmethod
    def _callback_identifier(func: ListenerCallback) -> str:
        module = getattr(func, "__module__", "")
        qualname = getattr(func, "__qualname__", repr(func))
        return f"{module}.{qualname}" if module else qualname

    @staticmethod
    def _serialize_dependency(dependency: Any) -> Any:
        if hasattr(dependency, "to_dict"):
            return dependency.to_dict()
        if hasattr(dependency, "dict"):
            return dependency.dict()
        if hasattr(dependency, "model_dump"):
            return dependency.model_dump()
        return str(dependency)
