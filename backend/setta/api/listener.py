import asyncio
import contextlib
import inspect
import logging
import sys
from ast import literal_eval
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Awaitable, Callable, Iterable, Literal
from uuid import uuid4

import websockets
from pydantic import ValidationError
from websockets.exceptions import ConnectionClosedError

from setta.code_gen.dependency_graph import (
    DependencyGraph,
    Node,
)
from setta.code_gen.python.generate_code import PythonCodeGenerator
from setta.types.generated.websocket_unions import (
    PythonScriptWebsocketMsgTypeAdapter,
)
from setta.types.listener import (
    ListenerDependencyKey,
    ListenerDependencyMode,
    ListenerForceRefreshContent,
    ListenerFrontendEmitContent,
    ListenerInitContent,
    ListenerRealtimeEventContent,
    ListenerRegisterAckStatus,
    ListenerRegisterCallback,
    ListenerRegisterContent,
)
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.routes import Route
from setta.types.websocket import (
    WebsocketMsgListenerError,
    WebsocketMsgListenerForceRefresh,
    WebsocketMsgListenerFrontendEmit,
    WebsocketMsgListenerInit,
    WebsocketMsgListenerRealtimeEvent,
    WebsocketMsgListenerRegister,
    WebsocketMsgListenerRegisterAck,
)
from setta.utils.constants import C

from .scheduling import ListenerCallbackScheduler

if TYPE_CHECKING:
    from websockets import ClientConnection

    from .hot_reload import ListenerHotReloader

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
ListenerCallbackBuilder = Callable[["SettaListener"], None]


@dataclass(slots=True)
class ListenerCallbackSpec:
    function: ListenerCallback
    callback_id: str
    declared_dependencies: tuple[str, ...]
    dependency_mode: ListenerDependencyMode
    debounce_ms: int | None
    throttle_ms: int | None
    run_on_refresh: bool
    structured_dependencies: tuple[ListenerDependencyKey, ...] = ()
    logger: logging.Logger | None = None


@dataclass(slots=True)
class ListenerCallbackContext:
    changed: dict[str, Any]
    log: logging.Logger
    emit_to_frontend: Callable[[Any, str | None], Awaitable[None]]


@dataclass(slots=True)
class ListenerRuntimeState:
    project_state: ProjectStateSingleConfig
    dependency_graph: DependencyGraph
    code_generator: PythonCodeGenerator
    s_instance: Any | None


class SettaListener:
    def __init__(
        self,
        *,
        project_name: str,
        host: str = C.HOST,
        port: int = C.PORT,
        reconnect_delay: float = 5.0,
    ) -> None:
        self._project_name = project_name
        self._project_id: str | None = None
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
        self._scheduler = ListenerCallbackScheduler()
        self._websocket: "ClientConnection" | None = None
        self._send_lock = asyncio.Lock()
        self._callback_lock = asyncio.Lock()
        self._latest_persisted_snapshot: ProjectStateSingleConfig | None = None

    @property
    def _log_identifier(self) -> str:
        return self._project_id or f"name:{self._project_name}"

    def _require_project_id(self) -> str:
        project_id = self._project_id
        if project_id is None:
            raise RuntimeError(
                "Listener project config id is not yet available; wait for bootstrap to complete"
            )
        return project_id

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
                    self._log_identifier,
                    self.websocket_endpoint,
                )
            except ConnectionClosedError:
                logger.debug("Listener %s websocket closed", self._log_identifier)
            except Exception:
                logger.exception("Unexpected error in listener connection loop")
            if not self._stop_event.is_set():
                await asyncio.sleep(self._reconnect_delay)

    def start(
        self,
        *,
        hot_reload: bool = False,
        builder: ListenerCallbackBuilder | None = None,
        extra_watch_paths: Iterable[str] | None = None,
        ignore_patterns: Iterable[str] | None = None,
        trigger_refresh: bool = True,
        settle_delay: float | None = None,
    ) -> None:
        """Run the listener until stop() is called or interrupted.

        When `hot_reload` is True, the listener will wrap the provided builder in a
        `ListenerHotReloader` instance and reuse the existing hot reload workflow.
        """
        if hot_reload:
            if builder is None:
                raise ValueError("hot_reload=True requires a callback builder")
            from .hot_reload import ListenerHotReloader

            reloader_kwargs: dict[str, Any] = {
                "listener": self,
                "builder": builder,
                "trigger_refresh": trigger_refresh,
            }
            if extra_watch_paths is not None:
                reloader_kwargs["extra_watch_paths"] = extra_watch_paths
            if ignore_patterns is not None:
                reloader_kwargs["ignore_patterns"] = ignore_patterns
            if settle_delay is not None:
                reloader_kwargs["settle_delay"] = settle_delay
            reloader = ListenerHotReloader(**reloader_kwargs)
            self.start_with_hot_reload(reloader)
            return

        if builder is not None:
            raise ValueError("Provide hot_reload=True when passing a callback builder")
        if extra_watch_paths is not None:
            raise ValueError("Provide hot_reload=True when configuring watch paths")
        if ignore_patterns is not None:
            raise ValueError("Provide hot_reload=True when configuring ignore patterns")
        if not trigger_refresh:
            raise ValueError("trigger_refresh is only meaningful with hot_reload=True")
        if settle_delay is not None:
            raise ValueError("settle_delay is only meaningful with hot_reload=True")

        if self._stop_event.is_set():
            self._stop_event = asyncio.Event()
        try:
            asyncio.run(self.run_forever())
        except KeyboardInterrupt:
            logger.info("Listener %s interrupted by user", self._log_identifier)
        finally:
            self.stop()

    def start_with_hot_reload(self, reloader: "ListenerHotReloader") -> None:
        """Run the listener with automatic hot reload support."""
        if reloader.listener is not self:
            raise ValueError("ListenerHotReloader is bound to a different listener")
        if self._stop_event.is_set():
            self._stop_event = asyncio.Event()
        try:
            asyncio.run(self._run_with_hot_reload(reloader))
        except KeyboardInterrupt:
            logger.info("Listener %s interrupted by user", self._log_identifier)
        finally:
            self.stop()

    async def _run_with_hot_reload(
        self,
        reloader: "ListenerHotReloader",
    ) -> None:
        watch_task: asyncio.Task[None] | None = None
        try:
            await reloader.reload_now(reload_module=False)
            watch_task = asyncio.create_task(reloader.watch())
            watch_task.add_done_callback(self._log_watch_task_completion)
            await self.run_forever()
        finally:
            await reloader.stop()
            if watch_task is not None:
                await self._finalize_watch_task(watch_task)

    @staticmethod
    def _log_watch_task_completion(task: asyncio.Task[None]) -> None:
        if not task.done() or task.cancelled():
            return
        exception = task.exception()
        if exception is None:
            return
        logger.error(
            "Listener hot reload watcher exited with error: %s",
            exception,
            exc_info=(exception.__class__, exception, exception.__traceback__),
        )

    @staticmethod
    async def _finalize_watch_task(task: asyncio.Task[None]) -> None:
        if task.done():
            return
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

    def stop(self) -> None:
        """Signal the connection loop to exit."""
        self._stop_event.set()

    async def _connect_once(self) -> None:
        """Open the websocket once and process messages until it closes."""
        endpoint = self.websocket_endpoint
        logger.debug("Listener %s connecting to %s", self._log_identifier, endpoint)
        async with websockets.connect(endpoint) as websocket:
            logger.info("Listener %s connected", self._log_identifier)
            self._websocket = websocket
            await self._send_bootstrap_init()
            try:
                async for payload in websocket:
                    if self._stop_event.is_set():
                        break
                    message = self._parse_websocket_payload(payload)
                    if message is None:
                        continue
                    await self._dispatch_websocket_message(message)
            finally:
                logger.info("Listener %s connection closed", self._log_identifier)
                self._websocket = None
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
            "Listener %s received %s message",
            self._log_identifier,
            message.messageType,
        )
        return message

    async def _dispatch_websocket_message(
        self,
        message: Any,
    ) -> None:
        """Delegate parsed websocket messages to dedicated handlers."""
        if isinstance(message, WebsocketMsgListenerRegisterAck):
            self._handle_register_ack(message)
            return
        if isinstance(message, WebsocketMsgListenerRealtimeEvent):
            await self._handle_realtime_event(message.content)
            return
        if isinstance(message, WebsocketMsgListenerForceRefresh):
            await self._handle_force_refresh(message.content)
            return
        if isinstance(message, WebsocketMsgListenerError):
            self._handle_listener_error(message)
            return
        logger.debug(
            "Listener %s ignoring unsupported message type %s",
            self._log_identifier,
            getattr(message, "messageType", type(message)),
        )

    def _handle_register_ack(self, message: WebsocketMsgListenerRegisterAck) -> None:
        """Handle ListenerRegisterAck responses from the server."""
        received_project_id = message.content.projectConfigId
        if self._project_id is None:
            self._project_id = received_project_id
        elif received_project_id != self._project_id:
            logger.warning(
                "Listener %s received register ack for unexpected project %s",
                self._log_identifier,
                received_project_id,
            )
        if not self._registration_pending:
            logger.debug(
                "Listener %s received register ack without pending registration",
                self._log_identifier,
            )
        self._registration_pending = False

        expected_ids = set(self._expected_ack_callback_ids)
        if not expected_ids:
            logger.debug(
                "Listener %s received register ack with no expected callback ids",
                self._log_identifier,
            )
        ack_statuses = message.content.callbacks
        ack_ids = set(ack_statuses.keys())

        missing_ids = expected_ids - ack_ids
        if missing_ids:
            logger.warning(
                "Listener %s missing register ack for callbacks: %s",
                self._log_identifier,
                ", ".join(sorted(missing_ids)),
            )

        unknown_ids = ack_ids - expected_ids
        for callback_id in sorted(unknown_ids):
            logger.warning(
                "Listener %s received register ack for unknown callback %s",
                self._log_identifier,
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
                self._log_identifier,
                len(rejected),
                error_details,
            )
            raise RuntimeError(f"Listener registration rejected: {error_details}")

        self._expected_ack_callback_ids = set()
        self._is_registered = True
        logger.info(
            "Listener %s registered %d callback(s)",
            self._log_identifier,
            accepted_count,
        )

    def _handle_listener_error(self, message: WebsocketMsgListenerError) -> None:
        """Surface listener errors even when logging is not configured."""
        detail_suffix = ""
        if message.content.details is not None:
            detail_suffix = f" (details={message.content.details!r})"
        text = (
            f"Listener {self._log_identifier} received error "
            f"{message.content.error}{detail_suffix}"
        )
        current_logger = logger
        has_real_handler = False
        while current_logger is not None:
            for handler in current_logger.handlers:
                if not isinstance(handler, logging.NullHandler):
                    has_real_handler = True
                    break
            if has_real_handler or not current_logger.propagate:
                break
            current_logger = current_logger.parent

        if has_real_handler:
            logger.error(text)
        else:
            sys.stderr.write(text + "\n")
            sys.stderr.flush()

    def listen(
        self,
        *,
        deps: Iterable[str] | None = None,
        dependency_mode: ListenerDependencyMode | str | None = None,
        debounce_ms: int | None = None,
        throttle_ms: int | None = None,
        run_on_refresh: bool = False,
    ) -> Callable[[ListenerCallback], ListenerCallback]:
        def decorator(func: ListenerCallback) -> ListenerCallback:
            dependencies = tuple(deps) if deps is not None else ()
            normalized_mode = self._normalize_dependency_mode(
                dependency_mode, declared_dependencies=dependencies
            )
            callback_id = uuid4().hex
            spec = ListenerCallbackSpec(
                function=func,
                callback_id=callback_id,
                declared_dependencies=dependencies,
                dependency_mode=normalized_mode,
                debounce_ms=debounce_ms,
                throttle_ms=throttle_ms,
                run_on_refresh=run_on_refresh,
            )
            spec.logger = logger.getChild(f"callback.{callback_id}")
            self._callbacks[callback_id] = spec
            self._register_scheduler_callback(spec)
            return func

        return decorator

    def clear_callbacks(self) -> None:
        """Remove every registered callback and scheduler entry."""
        if not self._callbacks:
            return
        for callback_id in list(self._callbacks.keys()):
            self._remove_callback(callback_id)

    def _remove_callback(self, callback_id: str) -> None:
        """Drop a single callback and its scheduler registration."""
        spec = self._callbacks.pop(callback_id, None)
        if spec is None:
            return
        self._scheduler.unregister_callback(callback_id)

    async def reload_callbacks(
        self,
        builder: ListenerCallbackBuilder,
        *,
        trigger_refresh: bool = True,
    ) -> None:
        async with self._callback_lock:
            previous_callbacks = dict(self._callbacks)
            previous_is_registered = self._is_registered
            previous_registration_pending = self._registration_pending
            previous_expected_ids = set(self._expected_ack_callback_ids)
            try:
                self.clear_callbacks()
                builder(self)
                self._is_registered = False
                self._registration_pending = False
                self._expected_ack_callback_ids = set()
                await self._send_listener_register()
                if trigger_refresh:
                    await self._replay_cached_snapshot()
            except Exception:
                self.clear_callbacks()
                for spec in previous_callbacks.values():
                    self._callbacks[spec.callback_id] = spec
                    self._register_scheduler_callback(spec)
                self._is_registered = previous_is_registered
                self._registration_pending = previous_registration_pending
                self._expected_ack_callback_ids = previous_expected_ids
                raise

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
                dependencyMode=spec.dependency_mode,
                debounceMs=spec.debounce_ms,
                throttleMs=spec.throttle_ms,
                runOnRefresh=spec.run_on_refresh,
            )
            spec.structured_dependencies = tuple(structured_dependencies)
        return ListenerRegisterContent(
            projectConfigId=self._require_project_id(), callbacks=callbacks
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
                f"Unknown listener dependency {dependency!r} for project {self._log_identifier}"
            )
        section_id, code_obj_id = graph_key
        return ListenerDependencyKey(sectionId=section_id, codeObjId=code_obj_id)

    @staticmethod
    def _normalize_dependency_mode(
        mode: ListenerDependencyMode | str | None,
        *,
        declared_dependencies: tuple[str, ...],
    ) -> ListenerDependencyMode:
        if mode is None:
            if declared_dependencies:
                return ListenerDependencyMode.SPECIFIC
            return ListenerDependencyMode.REFRESH_ONLY
        try:
            normalized = ListenerDependencyMode(mode)
        except ValueError as error:
            choices = ", ".join(member.value for member in ListenerDependencyMode)
            raise ValueError(
                f"Unknown dependency mode {mode!r}. Expected one of: {choices}"
            ) from error
        if normalized is ListenerDependencyMode.SPECIFIC and not declared_dependencies:
            raise ValueError(
                "Listener dependency_mode 'specific' requires at least one dependency"
            )
        if (
            normalized is ListenerDependencyMode.ANY_DEPENDENCY
            and declared_dependencies
        ):
            raise ValueError(
                "Listener dependency_mode 'any_dependency' does not accept explicit dependencies"
            )
        return normalized

    async def _send_bootstrap_init(self) -> None:
        """Send an initial bootstrap handshake to identify the target project."""
        content = ListenerInitContent(
            projectConfigId=self._project_id,
            projectName=self._project_name,
        )
        message = WebsocketMsgListenerInit(content=content)
        payload = message.model_dump_json()
        logger.debug("Listener %s sending bootstrap init", self._log_identifier)
        try:
            await self._send_websocket_payload(payload)
        except Exception:
            logger.exception(
                "Listener %s failed to send bootstrap init", self._log_identifier
            )
            raise

    async def _send_listener_register(self) -> None:
        """Send the full callback registration after bootstrap completes."""
        if self._runtime_state is None:
            logger.debug(
                "Listener %s skipping register because runtime state is unavailable",
                self._log_identifier,
            )
            return
        content = self._build_register_content()
        message = WebsocketMsgListenerRegister(content=content)
        payload = message.model_dump_json()
        logger.debug(
            "Listener %s registering %d callbacks",
            self._log_identifier,
            len(content.callbacks),
        )
        self._registration_pending = True
        self._is_registered = False
        self._expected_ack_callback_ids = set(content.callbacks.keys())
        try:
            await self._send_websocket_payload(payload)
        except Exception:
            self._registration_pending = False
            logger.exception(
                "Listener %s failed to send register payload", self._log_identifier
            )
            raise

    async def _refresh_from_snapshot(
        self,
        project_state: ProjectStateSingleConfig,
    ) -> None:
        """Refresh listener state from a snapshot delivered over the websocket."""
        self._latest_persisted_snapshot = project_state
        refresh_kind: Literal["bootstrap", "force_refresh"]
        if self._runtime_state is None:
            refresh_kind = "bootstrap"
        else:
            refresh_kind = "force_refresh"
        await self._process_snapshot(
            project_state,
            refresh_kind=refresh_kind,
        )

    async def _process_snapshot(
        self,
        project_state: ProjectStateSingleConfig,
        *,
        refresh_kind: Literal["bootstrap", "force_refresh"],
    ) -> None:
        self._last_realtime_sequence = None
        incoming_project_id = project_state.projectConfig.id
        if self._project_id is None:
            self._project_id = incoming_project_id
        elif incoming_project_id != self._project_id:
            logger.warning(
                "Listener %s received %s snapshot for unexpected project %s",
                self._log_identifier,
                refresh_kind,
                incoming_project_id,
            )
            self._project_id = incoming_project_id

        try:
            runtime_state = self._build_runtime_state(project_state)
        except _RECOVERABLE_SNAPSHOT_ERRORS as error:
            logger.warning(
                "Listener %s skipped snapshot refresh due to build failure: %s",
                self._log_identifier,
                error,
                exc_info=logger.isEnabledFor(logging.DEBUG),
            )
            return
        if runtime_state.s_instance is None:
            self._runtime_state = runtime_state
            self._dependency_cache = {}
            if refresh_kind == "bootstrap":
                logger.warning(
                    (
                        "Listener %s skipping snapshot hydration due to missing runtime "
                        "state; callbacks will run once the project rebuilds successfully"
                    ),
                    self._log_identifier,
                )
                await self._send_listener_register()
            else:
                logger.debug(
                    (
                        "Listener %s ignoring %s snapshot because runtime state "
                        "is unavailable"
                    ),
                    self._log_identifier,
                    refresh_kind,
                )
            return
        snapshot_values: dict[str, Any] = {}
        updated_cache = dict(self._dependency_cache)
        callbacks_to_run: list[tuple[ListenerCallbackSpec, dict[str, Any]]] = []

        for spec in self._callbacks.values():
            self._scheduler.reset(spec.callback_id)
            changed: dict[str, Any] = {}
            mode = spec.dependency_mode
            should_run = False

            if mode is ListenerDependencyMode.SPECIFIC:
                for dependency in spec.declared_dependencies:
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
                should_run = bool(changed)
                if (
                    refresh_kind in {"bootstrap", "force_refresh"}
                    and spec.run_on_refresh
                ):
                    should_run = True
            elif mode is ListenerDependencyMode.ANY_DEPENDENCY:
                should_run = True
            else:  # ListenerDependencyMode.REFRESH_ONLY
                if refresh_kind in {"bootstrap", "force_refresh"}:
                    should_run = True
                    for dependency in spec.declared_dependencies:
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

            if should_run:
                callbacks_to_run.append((spec, changed))

        self._runtime_state = runtime_state
        self._dependency_cache = updated_cache

        if refresh_kind == "bootstrap":
            await self._send_listener_register()

        for spec, changed in callbacks_to_run:
            ctx = self._build_callback_context(spec, changed)
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
        try:
            code_generator.generate_code()
        except _RECOVERABLE_SNAPSHOT_ERRORS as error:
            logger.warning(
                "Listener %s failed to generate code: %s",
                self._log_identifier,
                error,
                exc_info=logger.isEnabledFor(logging.DEBUG),
            )
            return ListenerRuntimeState(
                project_state=project_state,
                dependency_graph=dep_graph,
                code_generator=code_generator,
                s_instance=None,
            )
        try:
            s_instance = self._instantiate_s(code_generator.code)
        except _RECOVERABLE_SNAPSHOT_ERRORS as error:
            logger.warning(
                "Listener %s failed to instantiate generated state: %s",
                self._log_identifier,
                error,
                exc_info=logger.isEnabledFor(logging.DEBUG),
            )
            s_instance = None
        return ListenerRuntimeState(
            project_state=project_state,
            dependency_graph=dep_graph,
            code_generator=code_generator,
            s_instance=s_instance,
        )

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
                self._log_identifier,
                dependency,
                error,
            )
            snapshot_values[dependency] = _UNAVAILABLE
            return _UNAVAILABLE
        snapshot_values[dependency] = value
        return value

    def _resolve_dependency_value(self, current: Any, dependency: str) -> Any:
        return getattr(current, dependency)

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
        project_id = self._project_id
        if project_id is not None and content.projectConfigId != project_id:
            logger.debug(
                "Listener %s ignoring realtime event for project %s",
                self._log_identifier,
                content.projectConfigId,
            )
            return

        runtime_state = self._runtime_state
        if runtime_state is None:
            logger.debug(
                "Listener %s received realtime event before bootstrap; ignoring",
                self._log_identifier,
            )
            return

        if runtime_state.s_instance is None:
            logger.debug(
                "Listener %s ignoring realtime event because runtime state is unavailable",
                self._log_identifier,
            )
            return

        if self._last_realtime_sequence is not None:
            if content.sequence <= self._last_realtime_sequence:
                logger.debug(
                    "Listener %s ignoring out-of-order realtime sequence %s (last=%s)",
                    self._log_identifier,
                    content.sequence,
                    self._last_realtime_sequence,
                )
                return

        self._last_realtime_sequence = content.sequence
        if not content.deltas:
            logger.debug(
                "Listener %s received realtime event with no deltas (sequence=%s)",
                self._log_identifier,
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
                    self._log_identifier,
                    graph_key,
                )
                continue
            value = delta.value
            dependency = node.full_path_name
            try:
                hydrated_value = self._set_dependency_value(
                    runtime_state,
                    runtime_state.s_instance,
                    dependency,
                    value,
                    node,
                )
            except (AttributeError, KeyError, IndexError, ValueError) as error:
                logger.error(
                    (
                        "Listener %s failed to apply realtime delta for %s (graph key %s): %s"
                    ),
                    self._log_identifier,
                    dependency,
                    graph_key,
                    error,
                )
                continue
            applied_dependencies[dependency] = hydrated_value

        if not applied_dependencies:
            logger.debug(
                "Listener %s applied no realtime changes for sequence %s",
                self._log_identifier,
                content.sequence,
            )
            return

        self._dependency_cache.update(applied_dependencies)

        callbacks_to_run: list[tuple[ListenerCallbackSpec, dict[str, Any]]] = []
        for spec in self._callbacks.values():
            if spec.dependency_mode is ListenerDependencyMode.REFRESH_ONLY:
                continue
            if spec.dependency_mode is ListenerDependencyMode.ANY_DEPENDENCY:
                callbacks_to_run.append((spec, dict(applied_dependencies)))
                continue

            changed: dict[str, Any] = {}
            for dependency in spec.declared_dependencies:
                if dependency not in applied_dependencies:
                    continue
                try:
                    value = self._resolve_dependency_value(
                        runtime_state.s_instance, dependency
                    )
                except (AttributeError, KeyError, IndexError, ValueError) as error:
                    logger.error(
                        "Listener %s failed to resolve dependency %s after realtime update: %s",
                        self._log_identifier,
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
            self._scheduler.submit(spec.callback_id, dict(changed))

    async def _handle_force_refresh(self, content: ListenerForceRefreshContent) -> None:
        """Handle force refresh payloads by replaying the latest snapshot."""
        project_state = content.projectState
        if project_state is not None:
            await self._refresh_from_snapshot(project_state)
            return
        project_state = self._latest_persisted_snapshot
        if project_state is None:
            logger.warning(
                "Listener %s received force refresh without cached project state",
                self._log_identifier,
            )
            self._last_realtime_sequence = None
            return

        await self._process_snapshot(project_state, refresh_kind="force_refresh")

    async def emit_to_frontend(
        self,
        *,
        payload: Any,
        target: str | None = None,
    ) -> None:
        if self._runtime_state is None:
            raise RuntimeError(
                "Listener project state is unavailable; wait for bootstrap before emitting"
            )
        if not self._is_registered and not self._registration_pending:
            raise RuntimeError(
                "Listener is not registered with the server; wait for registration to complete before emitting"
            )
        project_id = self._require_project_id()
        message = WebsocketMsgListenerFrontendEmit(
            content=ListenerFrontendEmitContent(
                projectConfigId=project_id,
                payload=payload,
                target=target,
            )
        )
        logger.debug(
            "Listener %s emitting frontend payload (target=%s)",
            self._log_identifier,
            target,
        )
        await self._send_websocket_payload(message.model_dump_json())

    def _set_dependency_value(
        self,
        runtime_state: ListenerRuntimeState,
        current: Any,
        dependency: str,
        value: Any,
        node: Node,
    ) -> Any:
        """Set a dependency value on the cached S instance."""
        node.value = value  # realtime payloads are already canonical strings
        expression = runtime_state.code_generator.get_value(node)
        hydrated = self._evaluate_expression(
            dependency=dependency,
            expression=expression,
            s_instance=runtime_state.s_instance,
        )
        setattr(current, dependency, hydrated)
        return hydrated

    def _evaluate_expression(
        self,
        *,
        dependency: str,
        expression: str | None,
        s_instance: Any,
    ) -> Any:
        if not expression:
            raise ValueError(
                f"Listener {self._log_identifier} missing expression for dependency {dependency}"
            )

        try:
            return literal_eval(expression)
        except Exception as error:
            logger.error(
                "Listener %s failed to evaluate expression for %s: %s",
                self._log_identifier,
                dependency,
                error,
            )
            raise

    def _register_scheduler_callback(self, spec: ListenerCallbackSpec) -> None:
        async def executor(changed: dict[str, Any]) -> None:
            runtime_state = self._runtime_state
            if runtime_state is None or runtime_state.s_instance is None:
                return
            ctx = self._build_callback_context(spec, changed)
            await self._invoke_callback(spec, runtime_state.s_instance, ctx)

        try:
            self._scheduler.register_callback(
                spec.callback_id,
                executor=executor,
                debounce_ms=spec.debounce_ms,
                throttle_ms=spec.throttle_ms,
            )
        except ValueError:
            # Re-registering should overwrite prior scheduling state.
            self._scheduler.unregister_callback(spec.callback_id)
            self._scheduler.register_callback(
                spec.callback_id,
                executor=executor,
                debounce_ms=spec.debounce_ms,
                throttle_ms=spec.throttle_ms,
            )

    def _build_callback_context(
        self, spec: ListenerCallbackSpec, changed: dict[str, Any]
    ) -> ListenerCallbackContext:
        spec_logger = spec.logger
        if spec_logger is None:
            spec_logger = logger.getChild(f"callback.{spec.callback_id}")
            spec.logger = spec_logger

        return ListenerCallbackContext(
            changed=changed,
            log=spec_logger,
            emit_to_frontend=self.emit_to_frontend,
        )

    async def _send_websocket_payload(self, payload: str) -> None:
        websocket = self._websocket
        if websocket is None:
            raise RuntimeError(
                f"Listener {self._log_identifier} is not connected to the websocket"
            )
        async with self._send_lock:
            try:
                await websocket.send(payload)
            except Exception:
                logger.exception(
                    "Listener %s failed to send websocket payload",
                    self._log_identifier,
                )
                raise

    async def _replay_cached_snapshot(self) -> None:
        """Replay the most recent cached snapshot for newly registered callbacks."""
        runtime_state = self._runtime_state
        snapshot = self._latest_persisted_snapshot
        if runtime_state is None or runtime_state.s_instance is None:
            if snapshot is None:
                logger.debug(
                    "Listener %s cannot replay snapshot without cached state",
                    self._log_identifier,
                )
                return
            try:
                runtime_state = self._build_runtime_state(snapshot)
            except _RECOVERABLE_SNAPSHOT_ERRORS as error:
                logger.warning(
                    "Listener %s skipped snapshot replay due to build failure: %s",
                    self._log_identifier,
                    error,
                    exc_info=logger.isEnabledFor(logging.DEBUG),
                )
                return
            if runtime_state.s_instance is None:
                self._runtime_state = runtime_state
                self._dependency_cache = {}
                logger.warning(
                    (
                        "Listener %s cannot replay snapshot because runtime state "
                        "remains unavailable"
                    ),
                    self._log_identifier,
                )
                return
            self._runtime_state = runtime_state

        state_instance = runtime_state.s_instance
        if state_instance is None:
            logger.debug(
                "Listener %s cannot replay snapshot because runtime state is unavailable",
                self._log_identifier,
            )
            return

        snapshot_values: dict[str, Any] = {}
        updated_cache = dict(self._dependency_cache)
        callbacks_to_run: list[tuple[ListenerCallbackSpec, dict[str, Any]]] = []

        for spec in self._callbacks.values():
            self._scheduler.reset(spec.callback_id)
            dependencies = spec.declared_dependencies
            if not dependencies:
                callbacks_to_run.append((spec, {}))
                continue

            changed: dict[str, Any] = {}
            for dependency in dependencies:
                value = self._get_dependency_value(
                    state_instance,
                    dependency,
                    snapshot_values,
                )
                if value is _UNAVAILABLE:
                    continue
                updated_cache[dependency] = value
                changed[dependency] = value

            if changed or spec.run_on_refresh:
                callbacks_to_run.append((spec, changed))

        self._dependency_cache = updated_cache

        for spec, changed in callbacks_to_run:
            ctx = self._build_callback_context(spec, changed)
            await self._invoke_callback(spec, state_instance, ctx)
