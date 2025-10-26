import asyncio
import inspect
import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Awaitable, Callable, Iterable
from uuid import uuid4

import websockets
from pydantic import ValidationError
from websockets.exceptions import ConnectionClosedError

from setta.code_gen.dependency_graph import DependencyGraph
from setta.code_gen.python.generate_code import PythonCodeGenerator
from setta.types.generated.websocket_unions import (
    PythonScriptWebsocketMsgTypeAdapter,
)
from setta.types.listener import (
    ListenerDependencyKey,
    ListenerFeed,
    ListenerInitContent,
    ListenerRealtimeEventContent,
    ListenerRegisterAckStatus,
    ListenerRegisterCallback,
    ListenerRegisterContent,
)
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.routes import Route
from setta.types.websocket import (
    WebsocketMsgListenerBootstrap,
    WebsocketMsgListenerInit,
    WebsocketMsgListenerPersistedUpdate,
    WebsocketMsgListenerRealtimeEvent,
    WebsocketMsgListenerRegister,
    WebsocketMsgListenerRegisterAck,
)
from setta.utils.constants import C

if TYPE_CHECKING:
    from websockets import ClientConnection

logger = logging.getLogger(__name__)
_MISSING = object()
_UNAVAILABLE = object()

_RECOVERABLE_SNAPSHOT_ERRORS: tuple[type[Exception], ...] = (
    ValidationError,
    SyntaxError,
    TypeError,
    ValueError,
    AttributeError,
    KeyError,
    IndexError,
    NameError,
    RuntimeError,
)


# Listener callbacks may either complete synchronously or return an awaitable.
ListenerCallback = Callable[[Any, Any], Awaitable[None] | None]


@dataclass(slots=True)
class ListenerCallbackSpec:
    function: ListenerCallback
    callback_id: str
    declared_dependencies: tuple[str, ...]
    feed: ListenerFeed
    debounce_ms: int | None
    throttle_ms: int | None
    run_on_refresh: bool
    structured_dependencies: tuple[ListenerDependencyKey, ...] = ()


@dataclass(slots=True)
class ListenerCallbackContext:
    changed: dict[str, Any]
    log: logging.Logger


@dataclass(slots=True)
class ListenerRuntimeState:
    project_state: ProjectStateSingleConfig
    dependency_graph: DependencyGraph
    code_generator: PythonCodeGenerator
    s_instance: Any


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
        self._expected_ack_callback_ids: set[str] = set()
        self._runtime_state: ListenerRuntimeState | None = None
        self._dependency_cache: dict[str, Any] = {}
        self._last_realtime_sequence: int | None = None

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
            await self._send_bootstrap_init(websocket)
            try:
                async for payload in websocket:
                    if self._stop_event.is_set():
                        break
                    message = self._parse_websocket_payload(payload)
                    if message is None:
                        continue
                    await self._dispatch_websocket_message(message, websocket)
            finally:
                logger.info("Listener %s connection closed", self._project_id)
                self._registration_pending = False
                self._is_registered = False
                self._expected_ack_callback_ids = set()

    def _parse_websocket_payload(self, payload: str) -> Any | None:
        """Parse raw websocket payloads into typed messages."""
        try:
            message = PythonScriptWebsocketMsgTypeAdapter.validate_json(payload)
        except ValidationError:
            logger.warning("Received malformed listener payload: %s", payload)
            return None
        logger.debug(
            "Listener %s received %s message", self._project_id, message.messageType
        )
        return message

    async def _dispatch_websocket_message(
        self,
        message: Any,
        websocket: "ClientConnection",
    ) -> None:
        """Delegate parsed websocket messages to dedicated handlers."""
        if isinstance(message, WebsocketMsgListenerRegisterAck):
            self._handle_register_ack(message)
            return
        if isinstance(message, WebsocketMsgListenerBootstrap):
            await self._handle_persisted_snapshot(
                message.content,
                is_bootstrap=True,
                websocket=websocket,
            )
            return
        if isinstance(message, WebsocketMsgListenerPersistedUpdate):
            await self._handle_persisted_snapshot(
                message.content,
                is_bootstrap=False,
                websocket=websocket,
            )
            return
        if isinstance(message, WebsocketMsgListenerRealtimeEvent):
            await self._handle_realtime_event(message.content)
            return
        logger.debug(
            "Listener %s ignoring unsupported message type %s",
            self._project_id,
            getattr(message, "messageType", type(message)),
        )

    def _handle_register_ack(self, message: WebsocketMsgListenerRegisterAck) -> None:
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

        expected_ids = set(self._expected_ack_callback_ids)
        if not expected_ids:
            logger.debug(
                "Listener %s received register ack with no expected callback ids",
                self._project_id,
            )
        ack_statuses = message.content.callbacks
        ack_ids = set(ack_statuses.keys())

        missing_ids = expected_ids - ack_ids
        if missing_ids:
            logger.warning(
                "Listener %s missing register ack for callbacks: %s",
                self._project_id,
                ", ".join(sorted(missing_ids)),
            )

        unknown_ids = ack_ids - expected_ids
        for callback_id in sorted(unknown_ids):
            logger.warning(
                "Listener %s received register ack for unknown callback %s",
                self._project_id,
                callback_id,
            )

        rejected: list[tuple[str, ListenerRegisterAckStatus]] = [
            (callback_id, status)
            for callback_id, status in ack_statuses.items()
            if status.status == "rejected"
        ]
        accepted_count = sum(
            1 for status in ack_statuses.values() if status.status == "accepted"
        )

        if rejected:
            self._is_registered = False
            error_details = ", ".join(
                f"{callback_id} ({status.message or 'no details'})"
                for callback_id, status in rejected
            )
            logger.error(
                "Listener %s registration rejected for %d callback(s): %s",
                self._project_id,
                len(rejected),
                error_details,
            )
            raise RuntimeError(f"Listener registration rejected: {error_details}")

        self._expected_ack_callback_ids = set()
        self._is_registered = True
        logger.info(
            "Listener %s registered %d callback(s)",
            self._project_id,
            accepted_count,
        )

    def listen(
        self,
        *,
        deps: Iterable[str] | None = None,
        feed: ListenerFeed | str | None = None,
        debounce_ms: int | None = None,
        throttle_ms: int | None = None,
        run_on_refresh: bool = False,
    ) -> Callable[[ListenerCallback], ListenerCallback]:
        selection = self._normalize_feed(feed if feed is not None else self._feed)

        def decorator(func: ListenerCallback) -> ListenerCallback:
            dependencies = list(deps) if deps is not None else []
            callback_id = uuid4().hex
            spec = ListenerCallbackSpec(
                function=func,
                callback_id=callback_id,
                declared_dependencies=tuple(dependencies),
                feed=selection,
                debounce_ms=debounce_ms,
                throttle_ms=throttle_ms,
                run_on_refresh=run_on_refresh,
            )
            self._callbacks[callback_id] = spec
            return func

        return decorator

    def _build_register_content(self) -> ListenerRegisterContent:
        """Serialize callback metadata into a register payload."""
        runtime_state = self._runtime_state
        if runtime_state is None:
            raise RuntimeError(
                "Listener runtime state unavailable during registration payload build"
            )
        dependency_graph = runtime_state.dependency_graph
        callbacks: dict[str, ListenerRegisterCallback] = {}
        for spec in self._callbacks.values():
            structured_dependencies: list[ListenerDependencyKey] = []
            for dependency in spec.declared_dependencies:
                structured_dependencies.append(
                    self._translate_dependency_name(
                        dependency=dependency,
                        dependency_graph=dependency_graph,
                    )
                )
            callbacks[spec.callback_id] = ListenerRegisterCallback(
                dependencies=list(structured_dependencies),
                feed=spec.feed,
                debounceMs=spec.debounce_ms,
                throttleMs=spec.throttle_ms,
                runOnRefresh=spec.run_on_refresh,
            )
            spec.structured_dependencies = tuple(structured_dependencies)
        return ListenerRegisterContent(
            projectConfigId=self._project_id,
            callbacks=callbacks,
        )

    def _translate_dependency_name(
        self,
        *,
        dependency: str,
        dependency_graph: DependencyGraph,
    ) -> ListenerDependencyKey:
        graph_key = dependency_graph.full_path_name_to_graph_key.get(dependency)
        if graph_key is None:
            raise KeyError(
                f"Unknown listener dependency {dependency!r} for project {self._project_id}"
            )
        section_id, code_obj_id = graph_key
        return ListenerDependencyKey(sectionId=section_id, codeObjId=code_obj_id)

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

    async def _send_bootstrap_init(self, websocket: "ClientConnection") -> None:
        """Send an initial bootstrap handshake to identify the target project."""
        content = ListenerInitContent(
            projectConfigId=self._project_id,
            defaultFeed=self._feed,
        )
        message = WebsocketMsgListenerInit(content=content)
        payload = message.model_dump_json()
        logger.debug("Listener %s sending bootstrap init", self._project_id)
        try:
            await websocket.send(payload)
        except Exception:
            logger.exception(
                "Listener %s failed to send bootstrap init", self._project_id
            )
            raise

    async def _send_listener_register(self, websocket: "ClientConnection") -> None:
        """Send the full callback registration after bootstrap completes."""
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
        self._expected_ack_callback_ids = set(content.callbacks.keys())
        try:
            await websocket.send(payload)
        except Exception:
            self._registration_pending = False
            logger.exception(
                "Listener %s failed to send register payload", self._project_id
            )
            raise

    async def _handle_persisted_snapshot(
        self,
        project_state: ProjectStateSingleConfig,
        *,
        is_bootstrap: bool,
        websocket: "ClientConnection",
    ) -> None:
        """Refresh listener state from a persisted project snapshot."""
        runtime_state = self._build_runtime_state_with_guard(project_state)
        if runtime_state is None:
            logger.warning(
                "Listener %s skipped persisted snapshot due to build failure",
                self._project_id,
            )
            return
        snapshot_values: dict[str, Any] = {}
        updated_cache = dict(self._dependency_cache)
        callbacks_to_run: list[tuple[ListenerCallbackSpec, dict[str, Any]]] = []

        for spec in self._callbacks.values():
            if not self._callback_accepts_persisted(spec):
                continue
            dependencies = spec.declared_dependencies
            changed: dict[str, Any] = {}
            should_run = not dependencies

            for dependency in dependencies:
                value = self._get_dependency_value(
                    runtime_state.s_instance,
                    dependency,
                    snapshot_values,
                )
                if value is _UNAVAILABLE:
                    continue
                previous = self._dependency_cache.get(dependency, _MISSING)
                updated_cache[dependency] = value
                if previous is _MISSING or value != previous:
                    changed[dependency] = value
                    should_run = True

            if is_bootstrap and spec.run_on_refresh:
                should_run = True

            if should_run:
                callbacks_to_run.append((spec, changed))

        self._runtime_state = runtime_state
        self._dependency_cache = updated_cache

        if is_bootstrap:
            await self._send_listener_register(websocket)

        for spec, changed in callbacks_to_run:
            ctx = ListenerCallbackContext(
                changed=changed,
                log=logger.getChild(f"callback.{spec.callback_id}"),
            )
            await self._invoke_callback(spec, runtime_state.s_instance, ctx)

    def _build_runtime_state(
        self, project_state: ProjectStateSingleConfig
    ) -> ListenerRuntimeState:
        dep_graph = DependencyGraph(project_state)
        project_config = project_state.projectConfig
        code_generator = PythonCodeGenerator(
            dep_graph,
            project_config.genCodePrefix,
            project_config.genCodeSuffix,
        )
        code_generator.generate_code()
        s_instance = self._instantiate_s(code_generator.code)
        return ListenerRuntimeState(
            project_state=project_state,
            dependency_graph=dep_graph,
            code_generator=code_generator,
            s_instance=s_instance,
        )

    def _build_runtime_state_with_guard(
        self, project_state: ProjectStateSingleConfig
    ) -> ListenerRuntimeState | None:
        try:
            return self._build_runtime_state(project_state)
        except _RECOVERABLE_SNAPSHOT_ERRORS as error:
            logger.warning(
                "Listener %s failed to build runtime state: %s",
                self._project_id,
                error,
                exc_info=logger.isEnabledFor(logging.DEBUG),
            )
            return None

    def _instantiate_s(self, generated_code: str) -> Any:
        namespace: dict[str, Any] = {"__builtins__": __builtins__}
        exec(generated_code, namespace)
        if "s" in namespace:
            return namespace["s"]
        S_cls = namespace.get("S")
        if S_cls is None:
            raise RuntimeError("Generated code missing S class definition")
        return S_cls()

    def _get_dependency_value(
        self,
        s_instance: Any,
        dependency: str,
        snapshot_values: dict[str, Any],
    ) -> Any:
        if dependency in snapshot_values:
            return snapshot_values[dependency]
        try:
            value = self._resolve_dependency_value(s_instance, dependency)
        except AttributeError as error:
            logger.warning(
                "Listener %s missing dependency %s during snapshot: %s",
                self._project_id,
                dependency,
                error,
            )
            snapshot_values[dependency] = _UNAVAILABLE
            return _UNAVAILABLE
        snapshot_values[dependency] = value
        return value

    def _resolve_dependency_value(self, current: Any, dependency: str) -> Any:
        return getattr(current, dependency)

    @staticmethod
    def _callback_accepts_persisted(spec: ListenerCallbackSpec) -> bool:
        return spec.feed in {ListenerFeed.PERSISTED, ListenerFeed.BOTH}

    @staticmethod
    def _callback_accepts_realtime(spec: ListenerCallbackSpec) -> bool:
        return spec.feed in {ListenerFeed.REALTIME, ListenerFeed.BOTH}

    async def _invoke_callback(
        self,
        spec: ListenerCallbackSpec,
        state: Any,
        ctx: ListenerCallbackContext,
    ) -> None:
        result = spec.function(state, ctx)
        if inspect.isawaitable(result):
            await result

    async def _handle_realtime_event(
        self, content: ListenerRealtimeEventContent
    ) -> None:
        """Apply realtime deltas and invoke interested callbacks."""
        if content.projectConfigId != self._project_id:
            logger.debug(
                "Listener %s ignoring realtime event for project %s",
                self._project_id,
                content.projectConfigId,
            )
            return

        runtime_state = self._runtime_state
        if runtime_state is None:
            logger.debug(
                "Listener %s received realtime event before bootstrap; ignoring",
                self._project_id,
            )
            return

        if self._last_realtime_sequence is not None:
            if content.sequence <= self._last_realtime_sequence:
                logger.debug(
                    "Listener %s ignoring out-of-order realtime sequence %s (last=%s)",
                    self._project_id,
                    content.sequence,
                    self._last_realtime_sequence,
                )
                return

        self._last_realtime_sequence = content.sequence
        if not content.deltas:
            logger.debug(
                "Listener %s received realtime event with no deltas (sequence=%s)",
                self._project_id,
                content.sequence,
            )
            return

        applied_dependencies: dict[str, Any] = {}
        for delta in content.deltas:
            graph_key = delta.dependency.to_graph_key()
            node = runtime_state.dependency_graph.graph.get(graph_key)
            if node is None:
                logger.error(
                    "Listener %s received realtime delta for unknown graph key %s",
                    self._project_id,
                    graph_key,
                )
                continue
            value = delta.value
            dependency = node.full_path_name
            try:
                self._set_dependency_value(runtime_state.s_instance, dependency, value)
            except (AttributeError, KeyError, IndexError, ValueError) as error:
                logger.error(
                    (
                        "Listener %s failed to apply realtime delta for %s (graph key %s): %s"
                    ),
                    self._project_id,
                    dependency,
                    graph_key,
                    error,
                )
                continue
            applied_dependencies[dependency] = value

        if not applied_dependencies:
            logger.debug(
                "Listener %s applied no realtime changes for sequence %s",
                self._project_id,
                content.sequence,
            )
            return

        self._dependency_cache.update(applied_dependencies)

        callbacks_to_run: list[tuple[ListenerCallbackSpec, dict[str, Any]]] = []
        for spec in self._callbacks.values():
            if not self._callback_accepts_realtime(spec):
                continue

            dependencies = spec.declared_dependencies
            if not dependencies:
                callbacks_to_run.append((spec, dict(applied_dependencies)))
                continue

            changed: dict[str, Any] = {}
            for dependency in dependencies:
                if dependency not in applied_dependencies:
                    continue
                try:
                    value = self._resolve_dependency_value(
                        runtime_state.s_instance, dependency
                    )
                except (AttributeError, KeyError, IndexError, ValueError) as error:
                    logger.error(
                        "Listener %s failed to resolve dependency %s after realtime update: %s",
                        self._project_id,
                        dependency,
                        error,
                    )
                    continue
                changed[dependency] = value

            if changed:
                callbacks_to_run.append((spec, changed))

        if not callbacks_to_run:
            return

        for spec, changed in callbacks_to_run:
            ctx = ListenerCallbackContext(
                changed=changed,
                log=logger.getChild(f"callback.{spec.callback_id}"),
            )
            await self._invoke_callback(spec, runtime_state.s_instance, ctx)

    def _set_dependency_value(self, current: Any, dependency: str, value: Any) -> None:
        """Set a dependency value on the cached S instance."""
        setattr(current, dependency, value)
