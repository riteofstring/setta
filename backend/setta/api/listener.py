import asyncio
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Awaitable, Callable, Iterable
from uuid import uuid4

import websockets
from pydantic import ValidationError
from websockets.exceptions import ConnectionClosedError

from setta.types.routes import Route
from setta.types.websocket import WebsocketMsg
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
        host: str = C.HOST,
        port: int = C.PORT,
        reconnect_delay: float = 5.0,
    ) -> None:
        self._project_id = project_id
        self._feed = self._normalize_feed(default_feed)
        self._callbacks: list[ListenerCallbackSpec] = []
        self._host = host
        self._port = port
        self._reconnect_delay = reconnect_delay
        self._stop_event = asyncio.Event()
        self._socket_id = uuid4().hex

    @property
    def websocket_endpoint(self) -> str:
        """Compute the websocket endpoint for the current listener configuration."""
        if self._host == C.HOST and self._port == C.PORT:
            base = C.WEBSOCKET
        else:
            base = f"ws://{self._host}:{self._port}{Route.PREFIX.value}"
        route = Route.WEBSOCKET_PYTHON_SCRIPT.value.format(id=self._socket_id)
        return f"{base}{route}"

    async def run_forever(self) -> None:
        """Maintain a websocket connection, reconnecting when needed."""
        if self._stop_event.is_set():
            self._stop_event = asyncio.Event()
        while not self._stop_event.is_set():
            try:
                await self._connect_once()
            except ConnectionRefusedError:
                logger.warning(
                    "Listener %s connection refused at %s", self._project_id, self.websocket_endpoint
                )
            except ConnectionClosedError:
                logger.debug(
                    "Listener %s websocket closed", self._project_id
                )
            except Exception:
                logger.exception("Unexpected error in listener connection loop")
            if not self._stop_event.is_set():
                await asyncio.sleep(self._reconnect_delay)

    def start(self) -> None:
        """Run the listener until stop() is called or interrupted."""
        if self._stop_event.is_set():
            self._stop_event = asyncio.Event()
        try:
            asyncio.run(self.run_forever())
        except KeyboardInterrupt:
            logger.info("Listener %s interrupted by user", self._project_id)
        finally:
            self.stop()

    def stop(self) -> None:
        """Signal the connection loop to exit."""
        self._stop_event.set()

    async def _connect_once(self) -> None:
        """Open the websocket once and process messages until it closes."""
        endpoint = self.websocket_endpoint
        logger.debug("Listener %s connecting to %s", self._project_id, endpoint)
        async with websockets.connect(endpoint) as websocket:
            logger.info("Listener %s connected", self._project_id)
            try:
                async for payload in websocket:
                    if self._stop_event.is_set():
                        break
                    self._handle_websocket_payload(payload)
            finally:
                logger.info("Listener %s connection closed", self._project_id)

    def _handle_websocket_payload(self, payload: str) -> None:
        """Parse and log raw websocket payloads."""
        try:
            message = WebsocketMsg.model_validate_json(payload)
        except ValidationError:
            logger.warning("Received malformed listener payload: %s", payload)
            return
        logger.debug(
            "Listener %s received %s message", self._project_id, message.messageType
        )

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
