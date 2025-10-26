import asyncio
import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Awaitable, Callable, Iterable
from uuid import uuid4

import websockets
from pydantic import ValidationError
from websockets.exceptions import ConnectionClosedError

from setta.types.listener import (
    ListenerFeed,
    ListenerRegisterCallback,
    ListenerRegisterContent,
)
from setta.types.routes import Route
from setta.types.generated.websocket_unions import (
    PythonScriptWebsocketMsgTypeAdapter,
)
from setta.types.websocket import (
    WebsocketMsgListenerRegister,
    WebsocketMsgListenerRegisterAck,
)
from setta.utils.constants import C

if TYPE_CHECKING:
    from websockets import ClientConnection

logger = logging.getLogger(__name__)


# Listener callbacks may either complete synchronously or return an awaitable.
ListenerCallback = Callable[[Any, Any], Awaitable[None] | None]


@dataclass(slots=True)
class ListenerCallbackSpec:
    function: ListenerCallback
    raw_dependencies: tuple[Any, ...] = field(default_factory=tuple)
    register: ListenerRegisterCallback = field(
        default_factory=lambda: ListenerRegisterCallback(
            callbackId=uuid4().hex,
            dependencies=[],
            feed=ListenerFeed.PERSISTED,
        )
    )

    @property
    def callback_id(self) -> str:
        return self.register.callbackId


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
        self._callbacks: dict[str, ListenerCallbackSpec] = {}
        self._host = host
        self._port = port
        self._reconnect_delay = reconnect_delay
        self._stop_event = asyncio.Event()
        self._socket_id = uuid4().hex
        self._registration_pending = False
        self._is_registered = False

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
                    "Listener %s connection refused at %s",
                    self._project_id,
                    self.websocket_endpoint,
                )
            except ConnectionClosedError:
                logger.debug("Listener %s websocket closed", self._project_id)
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
            await self._send_register_message(websocket)
            try:
                async for payload in websocket:
                    if self._stop_event.is_set():
                        break
                    self._handle_websocket_payload(payload)
            finally:
                logger.info("Listener %s connection closed", self._project_id)
                self._registration_pending = False
                self._is_registered = False

    def _handle_websocket_payload(self, payload: str) -> None:
        """Parse websocket payloads and delegate to specific handlers."""
        try:
            message = PythonScriptWebsocketMsgTypeAdapter.validate_json(payload)
        except ValidationError:
            logger.warning("Received malformed listener payload: %s", payload)
            return
        logger.debug(
            "Listener %s received %s message", self._project_id, message.messageType
        )
        if isinstance(message, WebsocketMsgListenerRegisterAck):
            self._handle_register_ack(message)

    def _handle_register_ack(
        self, message: WebsocketMsgListenerRegisterAck
    ) -> None:
        """Handle ListenerRegisterAck responses from the server."""
        if message.content.projectConfigId != self._project_id:
            logger.warning(
                "Listener %s received register ack for unexpected project %s",
                self._project_id,
                message.content.projectConfigId,
            )
        if not self._registration_pending:
            logger.debug(
                "Listener %s received register ack without pending registration",
                self._project_id,
            )
        self._registration_pending = False

        known_ids = set(self._callbacks.keys())
        ack_statuses = message.content.callbacks
        ack_ids = {status.callbackId for status in ack_statuses}

        missing_ids = known_ids - ack_ids
        if missing_ids:
            logger.warning(
                "Listener %s missing register ack for callbacks: %s",
                self._project_id,
                ", ".join(sorted(missing_ids)),
            )

        unknown_ids = ack_ids - known_ids
        for callback_id in sorted(unknown_ids):
            logger.warning(
                "Listener %s received register ack for unknown callback %s",
                self._project_id,
                callback_id,
            )

        rejected = [
            status for status in ack_statuses if status.status == "rejected"
        ]
        accepted_count = sum(
            1 for status in ack_statuses if status.status == "accepted"
        )

        if rejected:
            self._is_registered = False
            error_details = ", ".join(
                f"{status.callbackId} ({status.message or 'no details'})"
                for status in rejected
            )
            logger.error(
                "Listener %s registration rejected for %d callback(s): %s",
                self._project_id,
                len(rejected),
                error_details,
            )
            raise RuntimeError(
                f"Listener registration rejected: {error_details}"
            )

        self._is_registered = True
        logger.info(
            "Listener %s registered %d callback(s)",
            self._project_id,
            accepted_count,
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
            register = ListenerRegisterCallback(
                callbackId=uuid4().hex,
                dependencies=[],
                feed=selection,
                debounceMs=debounce_ms,
                throttleMs=throttle_ms,
                runOnRefresh=run_on_refresh,
            )
            spec = ListenerCallbackSpec(
                function=func,
                raw_dependencies=tuple(deps) if deps is not None else (),
                register=register,
            )
            self._callbacks[spec.callback_id] = spec
            return func

        return decorator

    def _build_register_content(self) -> ListenerRegisterContent:
        """Serialize callback metadata into a register payload."""
        callbacks = []
        for spec in self._callbacks.values():
            dependencies = [
                self._stringify_dependency(dep) for dep in spec.raw_dependencies
            ]
            callbacks.append(
                spec.register.model_copy(update={"dependencies": dependencies})
            )
        return ListenerRegisterContent(
            projectConfigId=self._project_id,
            callbacks=callbacks,
        )

    @staticmethod
    def _stringify_dependency(value: Any) -> str:
        """Convert dependency descriptors into canonical strings."""
        if isinstance(value, str):
            return value
        path_attr = getattr(value, "path", None)
        if isinstance(path_attr, str):
            return path_attr
        identifier = getattr(value, "id", None)
        if isinstance(identifier, str):
            return identifier
        return str(value)

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

    async def _send_register_message(self, websocket: "ClientConnection") -> None:
        """Send a ListenerRegister handshake when a websocket connection opens."""
        content = self._build_register_content()
        message = WebsocketMsgListenerRegister(content=content)
        payload = message.model_dump_json()
        logger.debug(
            "Listener %s registering %d callbacks",
            self._project_id,
            len(content.callbacks),
        )
        self._registration_pending = True
        self._is_registered = False
        try:
            await websocket.send(payload)
        except Exception:
            self._registration_pending = False
            logger.exception("Listener %s failed to send register payload", self._project_id)
            raise
