import asyncio
import contextlib
import inspect
import logging
import os
import re
from ast import literal_eval
from dataclasses import dataclass
from pathlib import Path
from typing import (
    TYPE_CHECKING,
    Any,
    Awaitable,
    Callable,
    Iterable,
    Literal,
    Mapping,
    Sequence,
)
from urllib.parse import urlencode
from uuid import uuid4

import websockets
from pydantic import BaseModel, ValidationError
from websockets.exceptions import ConnectionClosedError

from setta.api.generated_listener_endpoints import RouterEndpointAPI
from setta.auth.cookies import auth_cookie_name
from setta.auth.manager import AUTH_COOKIE_MANAGER
from setta.auth.session import load_current_session_secret
from setta.code_gen.dependency_graph import (
    DependencyGraph,
    Node,
    SectionNode,
)
from setta.code_gen.python.code_generator import PythonCodeGenerator
from setta.code_gen.utils import GEN_CODE_CLASS_NAME, GEN_CODE_INSTANCE_NAME
from setta.code_gen.value_mode import PythonValueMode
from setta.frontend_affinity_token import parse_frontend_affinity_token
from setta.logging.config import configure_listener_logging
from setta.logging.context import logging_context
from setta.logging.tasks import spawn_background_task
from setta.project_state.project_code import build_python_code_generator
from setta.sessions import SessionMetadata, SessionRegistry
from setta.types.dependency_key import (
    SectionDependencyKey,
    SectionParamDependencyKey,
    create_dep_key,
)
from setta.types.dependency_value import DependencyValueType
from setta.types.dependency_value import FileReadDependencyValue, LiteralDependencyValue
from setta.types.generated.dependency_keys import BaseDependencyKeyUnion
from setta.types.generated.dependency_values import BaseDependencyValueUnion
from setta.types.generated.unions import (
    BaseArtifactTypeAdapter,
    BaseArtifactUnionWithDiscriminator,
)
from setta.types.generated.websocket_unions import (
    PythonScriptWebsocketMsgTypeAdapter,
)
from setta.types.helpers_lvl2 import get_meta_control_param_id
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.listener import (
    DependencyEvent,
    ListenerDependencyEventContent,
    ListenerDependencyMode,
    ListenerForceRefreshContent,
    ListenerFrontendEmitRawContent,
    ListenerInitContent,
    ListenerRealtimeEventContent,
    ListenerRegisterAckStatus,
    ListenerRegisterCallback,
    ListenerRegisterContent,
    ListenerRouterEndpointCallContent,
)
from setta.types.project_config import (
    ProjectCodegenLanguage,
    SectionRepresentationMode,
    project_config_has_codegen_language,
)
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import ChatSectionImpl, ChatSectionState
from setta.types.routes import Route
from setta.types.websocket import (
    WebsocketMsgListenerDependencyEvent,
    WebsocketMsgListenerError,
    WebsocketMsgListenerForceRefresh,
    WebsocketMsgListenerFrontendEmit,
    WebsocketMsgListenerInit,
    WebsocketMsgListenerRealtimeEvent,
    WebsocketMsgListenerRegister,
    WebsocketMsgListenerRegisterAck,
    WebsocketMsgListenerRouterEndpointCall,
    WebsocketMsgListenerRouterEndpointResult,
)
from setta.utils.constants import C
from setta.utils.paths import get_setta_paths
from setta.websockets.binary_frames import decode_binary_frame

from .scheduling import ListenerCallbackScheduler

if TYPE_CHECKING:
    from websockets import ClientConnection

    from setta.types.id import ID

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

_COOKIE_TOKEN_SANITIZE_RE = re.compile(r"[^A-Za-z0-9_]")


def _sanitize_cookie_token(value: str) -> str:
    sanitized = _COOKIE_TOKEN_SANITIZE_RE.sub("_", value.strip())
    sanitized = re.sub(r"_+", "_", sanitized).strip("_")
    return sanitized


def _listener_endpoint_requires_force_refresh(endpoint_name: str) -> bool:
    return endpoint_name == "route_set_chat_section_state"


# Worktree/dev helpers ---------------------------------------------------------


def _hosts_equivalent(left: str, right: str) -> bool:
    if left == right:
        return True
    return {left, right} <= {"127.0.0.1", "localhost", "::1"}


def _find_workspace_sessions_root(start_dir: Path) -> tuple[Path, Path] | None:
    """Return (workspace_root, sessions_root) when runtime sessions exist."""
    sessions_root = C.RUNTIME_SESSIONS_FOLDER
    if sessions_root.is_absolute():
        paths = get_setta_paths()
        workspace_root = paths.workspace_root.resolve(strict=False)
        return workspace_root, sessions_root.resolve(strict=False)

    start = start_dir.resolve()
    for parent in (start, *start.parents):
        candidate = parent / sessions_root
        if candidate.is_dir():
            return parent, candidate
    return None


def _load_latest_local_session(
    start_dir: Path,
) -> tuple[SessionMetadata, bytes] | None:
    """Resolve the latest running Setta session for this workspace (if any)."""
    roots = _find_workspace_sessions_root(start_dir)
    if roots is None:
        return None
    workspace_root, sessions_root = roots
    if not sessions_root.exists():
        return None

    registry = SessionRegistry(sessions_root=sessions_root)
    sessions = registry.find_sessions_by_workspace(
        workspace_root,
        prune_stale=False,
        track_suspicious=True,
    )
    sessions = [
        session for session in sessions if registry.is_session_process_setta(session)
    ]
    if not sessions:
        return None
    sessions.sort(key=lambda session: session.startedAt)

    suspicious = registry.suspicious_session_ids()
    preferred = [session for session in sessions if session.id not in suspicious]
    selected = preferred[-1] if preferred else sessions[-1]
    try:
        secret = registry.load_secret(selected)
    except FileNotFoundError:
        return None
    return selected, secret


# Listener callbacks may either complete synchronously or return an awaitable.
ListenerCallback = Callable[[Any, Any], Awaitable[None] | None]
ListenerCallbackBuilder = Callable[["SettaListener"], None]


@dataclass(slots=True)
class ListenerCallbackSpec:
    function: ListenerCallback
    callback_id: str
    declared_dependencies: tuple["ListenerDependencySpec", ...]
    dependency_mode: ListenerDependencyMode
    debounce_ms: int | None
    throttle_ms: int | None
    run_on_refresh: bool
    structured_dependencies: tuple[BaseDependencyKeyUnion, ...] = ()
    dependency_names: tuple[str, ...] = ()
    logger: logging.Logger | None = None


@dataclass(slots=True)
class ListenerCallbackContext:
    changed: dict[str, Any]
    changed_by_id: dict["ListenerDependencyId", Any]
    events: list[DependencyEvent]
    log: logging.Logger
    emit_to_frontend: Callable[..., Awaitable[None]]
    project_manager: RouterEndpointAPI
    frontend_affinity_token: str | None
    ids: "ListenerDependencyIds"
    values: "ListenerDependencyValues"


@dataclass(slots=True)
class ListenerRuntimeState:
    project_state: ProjectStateSingleConfig
    dependency_graph: DependencyGraph
    code_generator: PythonCodeGenerator
    s_instance: Any | None


@dataclass(frozen=True, slots=True)
class ListenerParamIds:
    sectionId: "ID"
    paramInfoId: "ID"


@dataclass(frozen=True, slots=True)
class ListenerDependencyId:
    sectionId: "ID"
    paramInfoId: "ID | None" = None


class ListenerDependencyIds:
    def __init__(
        self,
        dependency_graph: DependencyGraph,
        project_state: ProjectStateSingleConfig,
    ) -> None:
        self._dependency_graph = dependency_graph
        self._project_state = project_state

    def dependency_key(self, name: str) -> BaseDependencyKeyUnion:
        if not name:
            raise ValueError("dependency name must be non-empty")
        lookup = self._dependency_graph.full_path_name_to_dep_key
        if name not in lookup:
            raise KeyError(f"Unknown dependency name: {name}")
        return lookup[name]

    def section_id(self, dependency_name: str) -> "ID":
        dep_key = self.dependency_key(dependency_name)
        if not isinstance(dep_key, SectionDependencyKey):
            raise ValueError(
                f"Dependency {dependency_name!r} does not refer to a section"
            )
        return dep_key.sectionId

    def section_ids(self, dependency_names: list[str]) -> list["ID"]:
        return [self.section_id(name) for name in dependency_names]

    def param_ids(self, dependency_name: str) -> ListenerParamIds:
        dep_key = self.dependency_key(dependency_name)
        if not isinstance(dep_key, SectionParamDependencyKey):
            raise ValueError(
                f"Dependency {dependency_name!r} does not refer to a param"
            )
        return ListenerParamIds(
            sectionId=dep_key.sectionId,
            paramInfoId=dep_key.codeObjId,
        )

    def meta_control_param_ids(self, dependency_name: str) -> ListenerParamIds:
        section_id = self.section_id(dependency_name)
        param_id = get_meta_control_param_id(self._project_state, section_id)
        return ListenerParamIds(
            sectionId=section_id,
            paramInfoId=param_id,
        )

    def dependency_id(self, dependency_name: str) -> ListenerDependencyId:
        dep_key = self.dependency_key(dependency_name)
        return _dependency_id_from_key(dep_key)

    def dependency_name(
        self, section_id: "ID", param_info_id: "ID | None" = None
    ) -> str:
        dep_key = create_dep_key(sectionId=section_id, codeObjId=param_info_id)
        graph = self._dependency_graph.graph
        if dep_key not in graph:
            raise KeyError(
                f"Unknown dependency id: sectionId={section_id} paramInfoId={param_info_id}"
            )
        return graph[dep_key].full_path_name


class ListenerDependencyValues:
    def __init__(
        self,
        dependency_graph: DependencyGraph | None = None,
        state: Any = _MISSING,
        *,
        dependency_graph_resolver: Callable[[], DependencyGraph | None] | None = None,
        state_resolver: Callable[[], Any] | None = None,
    ) -> None:
        if dependency_graph_resolver is not None and dependency_graph is not None:
            raise ValueError(
                "ListenerDependencyValues accepts either dependency_graph or dependency_graph_resolver"
            )
        if dependency_graph_resolver is None and dependency_graph is None:
            raise ValueError(
                "ListenerDependencyValues requires dependency_graph or dependency_graph_resolver"
            )
        if state_resolver is not None and state is not _MISSING:
            raise ValueError(
                "ListenerDependencyValues accepts either state or state_resolver"
            )
        if state_resolver is None and state is _MISSING:
            raise ValueError(
                "ListenerDependencyValues requires state or state_resolver"
            )
        self._dependency_graph = dependency_graph
        self._dependency_graph_resolver = dependency_graph_resolver
        self._state = state
        self._state_resolver = state_resolver

    def _require_dependency_graph(self) -> DependencyGraph:
        if self._dependency_graph_resolver is not None:
            dependency_graph = self._dependency_graph_resolver()
        else:
            dependency_graph = self._dependency_graph
        if dependency_graph is None:
            raise RuntimeError("Listener dependency graph is unavailable")
        return dependency_graph

    def _require_state(self) -> Any:
        if self._state_resolver is not None:
            state = self._state_resolver()
        else:
            state = self._state
        if state is _MISSING or state is None:
            raise RuntimeError("Listener runtime state is unavailable")
        return state

    def by_id(self, section_id: "ID", param_id: "ID | None" = None) -> Any:
        dep_key = create_dep_key(sectionId=section_id, codeObjId=param_id)
        graph = self._require_dependency_graph().graph
        if dep_key not in graph:
            raise KeyError(
                f"Unknown dependency id: sectionId={section_id} paramInfoId={param_id}"
            )
        name = graph[dep_key].full_path_name
        return getattr(self._require_state(), name)


ListenerDependencySpec = str | ListenerDependencyId | BaseDependencyKeyUnion


def dep_id(section_id: "ID", param_id: "ID | None" = None) -> ListenerDependencyId:
    return ListenerDependencyId(sectionId=section_id, paramInfoId=param_id)


def _dependency_id_from_key(
    dep_key: BaseDependencyKeyUnion,
) -> ListenerDependencyId:
    if isinstance(dep_key, SectionParamDependencyKey):
        return ListenerDependencyId(
            sectionId=dep_key.sectionId,
            paramInfoId=dep_key.codeObjId,
        )
    return ListenerDependencyId(sectionId=dep_key.sectionId)


class SettaListener:
    def __init__(
        self,
        *,
        project_name: str | None = None,
        project_config_id: "ID | None" = None,
        share_session_id: str | None = None,
        use_temporary_ids: bool = False,
        refresh_concurrency: int = 8,
        host: str | None = None,
        port: int | None = None,
        reconnect_delay: float = 5.0,
        auth_headers: dict[str, str] | None = None,
        frontend_affinity_token: str | None = None,
    ) -> None:
        if project_name is None and project_config_id is None:
            raise ValueError("SettaListener requires project_name or project_config_id")
        if refresh_concurrency < 1:
            raise ValueError("refresh_concurrency must be >= 1")
        self._project_name = project_name
        self._project_config_id: "ID | None" = project_config_id
        self._share_session_id = share_session_id
        self._use_temporary_ids = use_temporary_ids
        self._refresh_concurrency = refresh_concurrency
        self._refresh_callback_semaphore = asyncio.Semaphore(refresh_concurrency)
        self._callbacks: dict[str, ListenerCallbackSpec] = {}
        self._explicit_host = host is not None
        self._explicit_port = port is not None
        self._host = host or C.HOST
        self._port = port or C.PORT
        self._reconnect_delay = reconnect_delay
        self._auth_headers = dict(auth_headers) if auth_headers is not None else None
        self._frontend_affinity_token = parse_frontend_affinity_token(
            frontend_affinity_token
        )
        self._stop_event = asyncio.Event()
        self._socket_id = uuid4().hex
        self._registration_pending = False
        self._is_registered = False
        self._expected_ack_callback_ids: set[str] = set()
        self._runtime_state: ListenerRuntimeState | None = None
        self._dependency_cache: dict[str, Any] = {}
        self._last_realtime_sequence: int | None = None
        self._scheduler = ListenerCallbackScheduler()
        self._websocket: "ClientConnection | None" = None
        self._send_lock = asyncio.Lock()
        self._callback_lock = asyncio.Lock()
        self._latest_persisted_snapshot: ProjectStateSingleConfig | None = None
        self._pending_router_endpoint_calls: dict[str, asyncio.Future[Any]] = {}
        self._pending_router_endpoint_force_refreshes: dict[
            str, asyncio.Future[None]
        ] = {}
        self._router_endpoint_api: RouterEndpointAPI | None = None
        self._logging_configured = False
        self._auto_session_metadata: SessionMetadata | None = None
        self._auto_session_secret: bytes | None = None
        self._set_binary_base_url = False
        base_url = os.environ.get("SETTA_BINARY_BASE_URL")
        if base_url is None:
            if "://" in self._host:
                base_url = f"{self._host.rstrip('/')}{Route.PREFIX.value}"
            else:
                base_url = f"http://{self._host}:{self._port}{Route.PREFIX.value}"
            os.environ["SETTA_BINARY_BASE_URL"] = base_url
            self._set_binary_base_url = True

    def _maybe_autoconnect_to_latest_local_session(self) -> None:
        if self._share_session_id is not None:
            return
        if self._auth_headers is not None:
            return
        if self._explicit_host or self._explicit_port:
            return
        raw_autoconnect = os.environ.get("SETTA_LISTENER_AUTOCONNECT")
        if raw_autoconnect is None:
            return
        normalized = raw_autoconnect.strip().lower()
        if normalized in {"0", "false", "no"}:
            return
        if normalized not in {"1", "true", "yes"}:
            return
        # If the caller didn't pass host/port, prefer the latest session recorded in
        # this workspace (dev worktrees use per-worktree ports + cookie names).
        session_info = _load_latest_local_session(Path.cwd())
        if session_info is None:
            return
        metadata, secret = session_info
        logger.info(
            "SettaListener autoconnecting to session %s at %s:%s (workspace=%s)",
            metadata.id,
            metadata.host,
            metadata.port,
            Path(metadata.workspacePath).name,
        )
        self._auto_session_metadata = metadata
        self._auto_session_secret = secret
        self._host = metadata.host
        self._port = metadata.port
        if self._set_binary_base_url:
            if "://" in self._host:
                os.environ["SETTA_BINARY_BASE_URL"] = (
                    f"{self._host.rstrip('/')}{Route.PREFIX.value}"
                )
            else:
                os.environ["SETTA_BINARY_BASE_URL"] = (
                    f"http://{self._host}:{self._port}{Route.PREFIX.value}"
                )

    @property
    def _log_identifier(self) -> str:
        return self._project_config_id or f"name:{self._project_name}"

    def _require_project_id(self):
        project_config_id = self._project_config_id
        if project_config_id is None:
            raise RuntimeError(
                "Listener project config id is not yet available; wait for bootstrap to complete"
            )
        return project_config_id

    def _validate_sequence_session_id(self, share_session_id: str | None) -> str | None:
        if self._share_session_id is None:
            if share_session_id is not None:
                raise ValueError(
                    "Listener received shareSessionId without a configured share session"
                )
            return None
        if share_session_id is None:
            raise ValueError(
                "Listener configured for share mode received payload without shareSessionId"
            )
        if share_session_id != self._share_session_id:
            raise ValueError(
                (
                    "Listener received shareSessionId "
                    f"{share_session_id!r} but expected {self._share_session_id!r}"
                )
            )
        return self._share_session_id

    def _get_last_realtime_sequence(self) -> int | None:
        return self._last_realtime_sequence

    def _set_last_realtime_sequence(self, sequence: int) -> None:
        self._last_realtime_sequence = sequence

    def _reset_realtime_sequence(self) -> None:
        self._last_realtime_sequence = None

    @property
    def websocket_endpoint(self) -> str:
        """Compute the websocket endpoint for the current listener configuration."""
        base = f"ws://{self._host}:{self._port}"
        route = Route.WEBSOCKET_LISTENER.value.format(id=self._socket_id)
        endpoint = f"{base}{route}"
        if self._share_session_id is None:
            return endpoint
        query = urlencode({"shareSessionId": self._share_session_id})
        return f"{endpoint}?{query}"

    def _resolve_auth_headers(self) -> dict[str, str] | None:
        if self._auth_headers is not None:
            return dict(self._auth_headers)
        if self._share_session_id is not None:
            return None
        session_info = load_current_session_secret()
        if session_info is None and self._auto_session_metadata is not None:
            if self._auto_session_secret is None:
                return None
            session_info = (self._auto_session_metadata, self._auto_session_secret)
        if session_info is None:
            return None
        session_metadata, secret = session_info
        if not _hosts_equivalent(session_metadata.host, self._host):
            return None
        if session_metadata.port != self._port:
            return None

        cookie_value = AUTH_COOKIE_MANAGER.mint(session_metadata.id, secret)
        return {"Cookie": f"{auth_cookie_name(session_metadata.id)}={cookie_value}"}

    async def run_forever(self) -> None:
        """Maintain a websocket connection, reconnecting when needed."""
        self._ensure_logging()
        self._maybe_autoconnect_to_latest_local_session()
        if self._stop_event.is_set():
            self._stop_event = asyncio.Event()
        with logging_context(
            listener_id=self._log_identifier,
            listener_socket_id=self._socket_id,
        ):
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
        self._ensure_logging()
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
            with logging_context(
                listener_id=self._log_identifier,
                listener_socket_id=self._socket_id,
            ):
                asyncio.run(self.run_forever())
        except KeyboardInterrupt:
            logger.info("Listener %s interrupted by user", self._log_identifier)
        finally:
            self.stop()

    def start_with_hot_reload(self, reloader: "ListenerHotReloader") -> None:
        """Run the listener with automatic hot reload support."""
        self._ensure_logging()
        if reloader.listener is not self:
            raise ValueError("ListenerHotReloader is bound to a different listener")
        if self._stop_event.is_set():
            self._stop_event = asyncio.Event()
        try:
            with logging_context(
                listener_id=self._log_identifier,
                listener_socket_id=self._socket_id,
            ):
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
            watch_task = spawn_background_task(
                reloader.watch(),
                label="listener-hot-reload-watch",
                extra_values={"listener_id": self._log_identifier},
            )
            await self.run_forever()
        finally:
            await reloader.stop()
            if watch_task is not None:
                await self._finalize_watch_task(watch_task)

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

    def _ensure_logging(self) -> None:
        if self._logging_configured:
            return
        configure_listener_logging()
        self._logging_configured = True

    async def _connect_once(self) -> None:
        """Open the websocket once and process messages until it closes."""
        endpoint = self.websocket_endpoint
        with logging_context(
            listener_id=self._log_identifier,
            listener_endpoint=endpoint,
        ):
            auth_headers = self._resolve_auth_headers()
            logger.debug("Listener %s connecting to %s", self._log_identifier, endpoint)
            async with websockets.connect(
                endpoint,
                additional_headers=auth_headers,
            ) as websocket:
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
                    if self._pending_router_endpoint_calls:
                        pending_calls = list(
                            self._pending_router_endpoint_calls.items()
                        )
                        self._pending_router_endpoint_calls = {}
                        for call_id, future in pending_calls:
                            if future.done():
                                continue
                            future.set_exception(
                                RuntimeError(
                                    f"Listener connection closed before call {call_id} completed"
                                )
                            )
                    if self._pending_router_endpoint_force_refreshes:
                        pending_force_refreshes = list(
                            self._pending_router_endpoint_force_refreshes.items()
                        )
                        self._pending_router_endpoint_force_refreshes = {}
                        for call_id, future in pending_force_refreshes:
                            if future.done():
                                continue
                            future.set_exception(
                                RuntimeError(
                                    "Listener connection closed before authoritative "
                                    f"refresh for call {call_id} completed"
                                )
                            )

    def _parse_websocket_payload(self, payload: str | bytes) -> Any | None:
        """Parse raw websocket payloads into typed messages."""
        if isinstance(payload, (bytes, bytearray)):
            try:
                header, binary_payload = decode_binary_frame(bytes(payload))
            except ValueError as exc:
                logger.warning("Received malformed binary listener payload: %s", exc)
                return None
            try:
                message = PythonScriptWebsocketMsgTypeAdapter.validate_python(header)
            except ValidationError:
                logger.warning("Received malformed listener payload: %s", header)
                return None
            if isinstance(message, WebsocketMsgListenerRealtimeEvent):
                if not message.content.deltas:
                    logger.warning(
                        "Binary realtime event must contain at least one delta."
                    )
                    return None
                for delta in message.content.deltas:
                    delta.binaryPayload = binary_payload
                return message
            if isinstance(message, WebsocketMsgListenerDependencyEvent):
                if not message.content.dependencyEvents:
                    logger.warning(
                        "Binary dependency event must contain at least one event."
                    )
                    return None
                for event in message.content.dependencyEvents:
                    event.binaryPayload = binary_payload
                return message
            logger.warning(
                "Binary websocket payload uses unsupported message type: %s",
                getattr(message, "messageType", type(message)),
            )
            return None
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
        if isinstance(message, WebsocketMsgListenerDependencyEvent):
            await self._handle_dependency_event(message.content)
            return
        if isinstance(message, WebsocketMsgListenerForceRefresh):
            await self._handle_force_refresh(message.content)
            return
        if isinstance(message, WebsocketMsgListenerError):
            self._handle_listener_error(message)
            return
        if isinstance(message, WebsocketMsgListenerRouterEndpointResult):
            self._handle_router_endpoint_result(message)
            return
        logger.debug(
            "Listener %s ignoring unsupported message type %s",
            self._log_identifier,
            getattr(message, "messageType", type(message)),
        )

    def _handle_register_ack(self, message: WebsocketMsgListenerRegisterAck) -> None:
        """Handle ListenerRegisterAck responses from the server."""
        received_project_id = message.content.projectConfigId
        if self._project_config_id is None:
            self._project_config_id = received_project_id
        elif received_project_id != self._project_config_id:
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
        """Surface listener errors."""
        if message.content.error == "listener_refresh_failed" and isinstance(
            message.content.details, dict
        ):
            raw_call_id = message.content.details.get("callId")
            if isinstance(raw_call_id, str):
                call_id = raw_call_id.strip()
                future = self._pending_router_endpoint_force_refreshes.get(call_id)
                if future is not None and not future.done():
                    detail_suffix = ""
                    if message.content.details is not None:
                        detail_suffix = f" (details={message.content.details!r})"
                    future.set_exception(
                        RuntimeError(f"listener_refresh_failed{detail_suffix}")
                    )
        detail_suffix = ""
        if message.content.details is not None:
            detail_suffix = f" (details={message.content.details!r})"
        text = (
            f"Listener {self._log_identifier} received error "
            f"{message.content.error}{detail_suffix}"
        )
        logger.error(text)

    def _handle_router_endpoint_result(
        self, message: WebsocketMsgListenerRouterEndpointResult
    ) -> None:
        content = message.content
        future = self._pending_router_endpoint_calls.get(content.callId)
        if future is None:
            logger.warning(
                "Listener %s received unknown call result %s",
                self._log_identifier,
                content.callId,
            )
            return
        if future.done():
            logger.warning(
                "Listener %s received duplicate call result %s",
                self._log_identifier,
                content.callId,
            )
            return
        if content.ok:
            future.set_result(content.result)
            return
        details_suffix = ""
        if content.details:
            details_suffix = f" (details={content.details!r})"
        future.set_exception(
            RuntimeError(f"{content.error or 'listener_call_failed'}{details_suffix}")
        )

    def listen(
        self,
        *,
        deps: Iterable[ListenerDependencySpec] | None = None,
        dependency_mode: ListenerDependencyMode | str | None = None,
        debounce_ms: int | None = None,
        throttle_ms: int | None = None,
        run_on_refresh: bool = False,
    ) -> Callable[[ListenerCallback], ListenerCallback]:
        def decorator(func: ListenerCallback) -> ListenerCallback:
            deps_provided = deps is not None
            dependencies = tuple(deps) if deps is not None else ()
            normalized_mode = self._normalize_dependency_mode(
                dependency_mode,
                deps_provided=deps_provided,
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
        self._refresh_callback_dependency_metadata(dependency_graph)
        callbacks: dict[str, ListenerRegisterCallback] = {}
        for spec in self._callbacks.values():
            callbacks[spec.callback_id] = ListenerRegisterCallback(
                dependencies=list(spec.structured_dependencies),
                dependencyMode=spec.dependency_mode,
                debounceMs=spec.debounce_ms,
                throttleMs=spec.throttle_ms,
                runOnRefresh=spec.run_on_refresh,
            )
        return ListenerRegisterContent(
            projectConfigId=self._require_project_id(), callbacks=callbacks
        )

    def _resolve_dependency_spec(
        self,
        dependency_graph: DependencyGraph,
        dependency: ListenerDependencySpec,
    ) -> BaseDependencyKeyUnion:
        if isinstance(dependency, ListenerDependencyId):
            dep_key = create_dep_key(
                sectionId=dependency.sectionId,
                codeObjId=dependency.paramInfoId,
            )
        elif isinstance(dependency, (SectionDependencyKey, SectionParamDependencyKey)):
            dep_key = dependency
        elif isinstance(dependency, str):
            lookup = dependency_graph.full_path_name_to_dep_key
            if dependency not in lookup:
                raise KeyError(
                    f"Unknown listener dependency {dependency!r} for project {self._log_identifier}"
                )
            dep_key = lookup[dependency]
        else:
            raise TypeError(
                "Listener dependencies must be a name, dependency id, or dependency key"
            )
        graph = dependency_graph.graph
        if dep_key not in graph:
            raise KeyError(
                f"Unknown listener dependency key {dep_key!r} for project {self._log_identifier}"
            )
        return dep_key

    def _refresh_callback_dependency_metadata(
        self, dependency_graph: DependencyGraph
    ) -> None:
        for spec in self._callbacks.values():
            if spec.declared_dependencies and not spec.structured_dependencies:
                structured: list[BaseDependencyKeyUnion] = []
                for dependency in spec.declared_dependencies:
                    structured.append(
                        self._resolve_dependency_spec(
                            dependency_graph,
                            dependency,
                        )
                    )
                spec.structured_dependencies = tuple(structured)
            if not spec.structured_dependencies:
                spec.dependency_names = ()
                continue
            names: list[str] = []
            graph = dependency_graph.graph
            for dep_key in spec.structured_dependencies:
                if dep_key not in graph:
                    raise KeyError(
                        f"Unknown listener dependency key {dep_key!r} for project {self._log_identifier}"
                    )
                names.append(graph[dep_key].full_path_name)
            spec.dependency_names = tuple(names)

    @staticmethod
    def _normalize_dependency_mode(
        mode: ListenerDependencyMode | str | None,
        *,
        deps_provided: bool,
    ) -> ListenerDependencyMode:
        if mode is None:
            if deps_provided:
                return ListenerDependencyMode.ALWAYS
            return ListenerDependencyMode.REFRESH_ONLY
        try:
            normalized = ListenerDependencyMode(mode)
        except ValueError as error:
            choices = ", ".join(member.value for member in ListenerDependencyMode)
            raise ValueError(
                f"Unknown dependency mode {mode!r}. Expected one of: {choices}"
            ) from error
        if not deps_provided and normalized is not ListenerDependencyMode.REFRESH_ONLY:
            raise ValueError(
                "Listener dependency_mode requires deps (use deps=[] for all dependencies)"
            )
        return normalized

    async def _send_bootstrap_init(self) -> None:
        """Send an initial bootstrap handshake to identify the target project."""
        content = ListenerInitContent(
            projectConfigId=self._project_config_id,
            projectName=self._project_name,
            useTemporaryIds=self._use_temporary_ids,
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
        *,
        share_session_id: str | None = None,
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
            share_session_id=share_session_id,
        )

    async def _process_snapshot(
        self,
        project_state: ProjectStateSingleConfig,
        *,
        refresh_kind: Literal["bootstrap", "force_refresh"],
        share_session_id: str | None,
    ) -> None:
        self._validate_sequence_session_id(share_session_id)
        self._reset_realtime_sequence()
        incoming_project_id = project_state.projectConfig.id
        if self._project_config_id is None:
            self._project_config_id = incoming_project_id
        elif incoming_project_id != self._project_config_id:
            logger.warning(
                "Listener %s received %s snapshot for unexpected project %s",
                self._log_identifier,
                refresh_kind,
                incoming_project_id,
            )
            self._project_config_id = incoming_project_id

        if not project_config_has_codegen_language(
            project_state.projectConfig,
            ProjectCodegenLanguage.python,
        ):
            logger.error(
                "Listener %s requires python codegen; disabled for project %s",
                self._log_identifier,
                incoming_project_id,
            )
            self.stop()
            raise RuntimeError("Listener requires python codegen to be enabled.")

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
        self._refresh_callback_dependency_metadata(runtime_state.dependency_graph)

        for spec in self._callbacks.values():
            self._scheduler.reset(spec.callback_id)
            changed: dict[str, Any] = {}
            for dep_key, dependency in zip(
                spec.structured_dependencies, spec.dependency_names
            ):
                value = self._get_dependency_value(
                    runtime_state,
                    runtime_state.s_instance,
                    dependency,
                    snapshot_values,
                    dep_key=dep_key,
                )
                if value is _UNAVAILABLE:
                    continue
                previous = self._dependency_cache.get(dependency, _MISSING)
                updated_cache[dependency] = value
                if previous is _MISSING or value != previous:
                    changed[dependency] = value

            mode = spec.dependency_mode
            if mode is ListenerDependencyMode.REALTIME_ONLY:
                continue

            if mode is ListenerDependencyMode.ALWAYS:
                should_run = bool(changed) or spec.run_on_refresh
                if not spec.dependency_names:
                    should_run = True
            else:  # ListenerDependencyMode.REFRESH_ONLY
                should_run = True

            if should_run:
                callbacks_to_run.append((spec, changed))

        self._runtime_state = runtime_state
        self._dependency_cache = updated_cache

        if refresh_kind == "bootstrap":
            await self._send_listener_register()

        for spec, changed in callbacks_to_run:
            ctx = self._build_callback_context(spec, changed, events=[])
            spawn_background_task(
                self._invoke_refresh_callback(spec, runtime_state.s_instance, ctx),
                label="listener-refresh-callback",
                extra_values={
                    "callback_id": spec.callback_id,
                    "refresh_kind": refresh_kind,
                },
            )

    def _build_runtime_state(
        self, project_state: ProjectStateSingleConfig
    ) -> ListenerRuntimeState:
        dep_graph = DependencyGraph(project_state)
        code_generator = build_python_code_generator(
            project_state,
            dep_graph,
            value_mode=PythonValueMode.LIVE_RUNTIME,
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
            s_instance = self._instantiate_state(code_generator.code)
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

    def _instantiate_state(self, generated_code: str) -> Any:
        namespace: dict[str, Any] = {"__builtins__": __builtins__}
        exec(generated_code, namespace)
        if GEN_CODE_INSTANCE_NAME in namespace:
            return namespace[GEN_CODE_INSTANCE_NAME]
        state_cls = namespace.get(GEN_CODE_CLASS_NAME)
        if state_cls is None:
            raise RuntimeError(
                f"Generated code missing {GEN_CODE_CLASS_NAME} class definition"
            )
        return state_cls()

    def _get_dependency_value(
        self,
        runtime_state: ListenerRuntimeState,
        s_instance: Any,
        dependency: str,
        snapshot_values: dict[str, Any],
        *,
        dep_key: BaseDependencyKeyUnion | None = None,
    ) -> Any:
        if dependency in snapshot_values:
            return snapshot_values[dependency]
        try:
            value = self._resolve_dependency_value(s_instance, dependency)
        except AttributeError as error:
            fallback_value = self._hydrate_missing_snapshot_dependency(
                runtime_state,
                dependency,
                dep_key=dep_key,
            )
            if fallback_value is _UNAVAILABLE:
                logger.warning(
                    "Listener %s missing dependency %s during snapshot: %s",
                    self._log_identifier,
                    dependency,
                    error,
                )
                snapshot_values[dependency] = _UNAVAILABLE
                return _UNAVAILABLE
            snapshot_values[dependency] = fallback_value
            return fallback_value
        snapshot_values[dependency] = value
        return value

    def _hydrate_missing_snapshot_dependency(
        self,
        runtime_state: ListenerRuntimeState,
        dependency: str,
        *,
        dep_key: BaseDependencyKeyUnion | None,
    ) -> Any:
        if dep_key is None:
            return _UNAVAILABLE
        if not isinstance(dep_key, SectionDependencyKey):
            return _UNAVAILABLE
        node = runtime_state.dependency_graph.graph.get(dep_key)
        if not isinstance(node, SectionNode):
            return _UNAVAILABLE
        dependency_value = self._build_snapshot_dependency_value(
            runtime_state.project_state,
            dep_key=dep_key,
            node=node,
        )
        if dependency_value is None:
            return _UNAVAILABLE
        if runtime_state.s_instance is None:
            return _UNAVAILABLE
        return self._set_dependency_value(
            runtime_state,
            runtime_state.s_instance,
            dependency,
            dependency_value,
            node,
        )

    def _build_snapshot_dependency_value(
        self,
        project_state: ProjectStateSingleConfig,
        *,
        dep_key: SectionDependencyKey,
        node: SectionNode,
    ) -> BaseDependencyValueUnion | None:
        section_id = dep_key.sectionId
        try:
            chat_impl = get_curr_effective_section_impl_with_type_guard(
                project_state,
                section_id,
                ChatSectionImpl,
            )
        except (KeyError, TypeError, ValueError):
            return None

        state = ChatSectionState(
            messages=chat_impl.messages,
            inputText=chat_impl.inputText,
            waitingForResponse=chat_impl.waitingForResponse,
            toolCallArguments=chat_impl.toolCallArguments,
            activeBranchId=chat_impl.activeBranchId,
            branches=chat_impl.branches,
        )
        if node.representation is SectionRepresentationMode.expression:
            return LiteralDependencyValue(payload=repr(state.model_dump(mode="json")))
        if chat_impl.chatId is None:
            return LiteralDependencyValue(payload=repr(state.model_dump(mode="json")))
        chat_path = C.SETTA_FILES_FOLDER / "chats" / f"{chat_impl.chatId}.json"
        if node.representation is SectionRepresentationMode.file_read:
            return FileReadDependencyValue(str(chat_path))
        if node.representation is SectionRepresentationMode.file_path:
            return LiteralDependencyValue(str(chat_path))
        return None

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

    async def _invoke_refresh_callback(
        self,
        spec: ListenerCallbackSpec,
        state: Any,
        ctx: ListenerCallbackContext,
    ) -> None:
        async with self._refresh_callback_semaphore:
            await self._invoke_callback(spec, state, ctx)

    async def _handle_realtime_event(
        self, content: ListenerRealtimeEventContent
    ) -> None:
        """Apply realtime deltas and invoke interested callbacks."""
        project_config_id = self._project_config_id
        if (
            project_config_id is not None
            and content.projectConfigId != project_config_id
        ):
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

        self._refresh_callback_dependency_metadata(runtime_state.dependency_graph)

        sequence_session_id = self._validate_sequence_session_id(content.shareSessionId)
        last_sequence = self._get_last_realtime_sequence()
        if last_sequence is not None:
            if content.sequence <= last_sequence:
                logger.debug(
                    (
                        "Listener %s ignoring out-of-order realtime sequence %s "
                        "(last=%s session=%s)"
                    ),
                    self._log_identifier,
                    content.sequence,
                    last_sequence,
                    sequence_session_id,
                )
                return

        self._set_last_realtime_sequence(content.sequence)
        if not content.deltas:
            logger.debug(
                "Listener %s received realtime event with no deltas (sequence=%s)",
                self._log_identifier,
                content.sequence,
            )
            return

        applied_dependencies: dict[str, Any] = {}
        applied_dependencies_by_key: dict[BaseDependencyKeyUnion, Any] = {}
        for delta in content.deltas:
            dep_key = delta.dependency
            node = runtime_state.dependency_graph.graph.get(dep_key)
            if node is None:
                logger.error(
                    "Listener %s received realtime delta for unknown dependency key %s",
                    self._log_identifier,
                    dep_key,
                )
                continue
            value = delta.value
            dependency = node.full_path_name
            binary_payload = (
                delta.binaryPayload
                if value.type is DependencyValueType.Binary
                else None
            )
            try:
                hydrated_value = self._set_dependency_value(
                    runtime_state,
                    runtime_state.s_instance,
                    dependency,
                    value,
                    node,
                    binary_payload=binary_payload,
                )
            except (AttributeError, KeyError, IndexError, ValueError) as error:
                logger.error(
                    (
                        "Listener %s failed to apply realtime delta for %s "
                        "(dependency key %s): %s"
                    ),
                    self._log_identifier,
                    dependency,
                    dep_key,
                    error,
                )
                continue
            applied_dependencies[dependency] = hydrated_value
            applied_dependencies_by_key[dep_key] = hydrated_value

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
            if not spec.structured_dependencies:
                callbacks_to_run.append((spec, dict(applied_dependencies)))
                continue

            changed: dict[str, Any] = {}
            for dep_key, dependency in zip(
                spec.structured_dependencies, spec.dependency_names
            ):
                if dep_key not in applied_dependencies_by_key:
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
            self._scheduler.submit(spec.callback_id, changed=dict(changed))

    async def _handle_dependency_event(
        self, content: ListenerDependencyEventContent
    ) -> None:
        """Apply realtime dependency events and invoke interested callbacks."""
        project_config_id = self._project_config_id
        if (
            project_config_id is not None
            and content.projectConfigId != project_config_id
        ):
            logger.debug(
                "Listener %s ignoring dependency event for project %s",
                self._log_identifier,
                content.projectConfigId,
            )
            return

        runtime_state = self._runtime_state
        if runtime_state is None:
            logger.debug(
                "Listener %s received dependency event before bootstrap; ignoring",
                self._log_identifier,
            )
            return

        if runtime_state.s_instance is None:
            logger.debug(
                "Listener %s ignoring dependency event because runtime state is unavailable",
                self._log_identifier,
            )
            return

        sequence_session_id = self._validate_sequence_session_id(content.shareSessionId)
        last_sequence = self._get_last_realtime_sequence()
        if last_sequence is not None:
            if content.sequence <= last_sequence:
                logger.debug(
                    (
                        "Listener %s ignoring out-of-order dependency sequence %s "
                        "(last=%s session=%s)"
                    ),
                    self._log_identifier,
                    content.sequence,
                    last_sequence,
                    sequence_session_id,
                )
                return

        self._set_last_realtime_sequence(content.sequence)
        if not content.dependencyEvents:
            logger.debug(
                "Listener %s received dependency event with no events (sequence=%s)",
                self._log_identifier,
                content.sequence,
            )
            return

        self._refresh_callback_dependency_metadata(runtime_state.dependency_graph)
        callbacks_to_run: dict[str, list[DependencyEvent]] = {}
        for event in content.dependencyEvents:
            for spec in self._callbacks.values():
                if spec.dependency_mode is ListenerDependencyMode.REFRESH_ONLY:
                    continue
                if not spec.structured_dependencies:
                    callbacks_to_run.setdefault(spec.callback_id, []).append(event)
                    continue
                if event.dependencyKey not in spec.structured_dependencies:
                    continue
                callbacks_to_run.setdefault(spec.callback_id, []).append(event)

        if not callbacks_to_run:
            return

        for callback_id, events in callbacks_to_run.items():
            spec = self._callbacks.get(callback_id)
            if spec is None:
                continue
            self._scheduler.submit(spec.callback_id, events=list(events))

    async def _handle_force_refresh(self, content: ListenerForceRefreshContent) -> None:
        """Handle force refresh payloads by replaying the latest snapshot."""
        self._validate_sequence_session_id(content.shareSessionId)
        completed = False
        try:
            project_state = content.projectState
            if project_state is not None:
                await self._refresh_from_snapshot(
                    project_state,
                    share_session_id=content.shareSessionId,
                )
                completed = True
                return
            project_state = self._latest_persisted_snapshot
            if project_state is None:
                logger.warning(
                    "Listener %s received force refresh without cached project state",
                    self._log_identifier,
                )
                self._reset_realtime_sequence()
                completed = True
                return

            await self._process_snapshot(
                project_state,
                refresh_kind="force_refresh",
                share_session_id=content.shareSessionId,
            )
            completed = True
        finally:
            if completed:
                raw_call_id = content.callId
                if raw_call_id is not None:
                    call_id = raw_call_id.strip()
                    if call_id:
                        future = self._pending_router_endpoint_force_refreshes.get(
                            call_id
                        )
                        if future is not None and not future.done():
                            future.set_result(None)

    async def emit_to_frontend(
        self,
        *,
        dependency_values: Mapping[str, Any] | None = None,
        artifact_updates: Sequence[
            BaseArtifactUnionWithDiscriminator | Mapping[str, Any]
        ]
        | None = None,
    ) -> None:
        if self._runtime_state is None:
            raise RuntimeError(
                "Listener project state is unavailable; wait for bootstrap before emitting"
            )
        if not self._is_registered and not self._registration_pending:
            raise RuntimeError(
                "Listener is not registered with the server; wait for registration to complete before emitting"
            )
        serialized_values = dict(dependency_values or {})
        serialized_artifact_updates = self._serialize_listener_artifact_updates(
            artifact_updates
        )
        if not serialized_values and not serialized_artifact_updates:
            raise ValueError(
                "emit_to_frontend requires at least one dependency value or artifact update"
            )
        project_config_id = self._require_project_id()
        message = WebsocketMsgListenerFrontendEmit(
            content=ListenerFrontendEmitRawContent(
                projectConfigId=project_config_id,
                dependencyValues=serialized_values,
                artifactUpdates=serialized_artifact_updates,
            )
        )
        logger.debug(
            "Listener %s emitting dependency overrides %s and artifact updates %s",
            self._log_identifier,
            ", ".join(serialized_values.keys()) or "-",
            ", ".join(artifact.id for artifact in serialized_artifact_updates) or "-",
        )
        await self._send_websocket_payload(message.model_dump_json())

    async def _call_router_endpoint(
        self,
        endpoint_name: str,
        payload: BaseModel | dict[str, object] | None = None,
    ) -> Any:
        if self._runtime_state is None:
            raise RuntimeError(
                "Listener project state is unavailable; wait for bootstrap before calling router endpoints"
            )
        if not self._is_registered and not self._registration_pending:
            raise RuntimeError(
                "Listener is not registered with the server; wait for registration to complete before calling router endpoints"
            )
        if not endpoint_name:
            raise ValueError("router endpoint call requires a non-empty endpoint name")
        call_id = uuid4().hex
        loop = asyncio.get_running_loop()
        future: asyncio.Future[Any] = loop.create_future()
        self._pending_router_endpoint_calls[call_id] = future
        refresh_future: asyncio.Future[None] | None = None
        if _listener_endpoint_requires_force_refresh(endpoint_name):
            refresh_future = loop.create_future()
            self._pending_router_endpoint_force_refreshes[call_id] = refresh_future
        project_config_id = self._require_project_id()
        serialized_payload = self._serialize_router_endpoint_payload(payload)
        message = WebsocketMsgListenerRouterEndpointCall(
            content=ListenerRouterEndpointCallContent(
                projectConfigId=project_config_id,
                callId=call_id,
                endpointName=endpoint_name,
                payload=serialized_payload,
            )
        )
        logger.debug(
            "Listener %s calling router endpoint %s (callId=%s)",
            self._log_identifier,
            endpoint_name,
            call_id,
        )
        try:
            await self._send_websocket_payload(message.model_dump_json())
            result = await future
            if refresh_future is not None:
                await refresh_future
        finally:
            self._pending_router_endpoint_calls.pop(call_id, None)
            if refresh_future is not None:
                self._pending_router_endpoint_force_refreshes.pop(call_id, None)
        return result

    def _serialize_listener_artifact_updates(
        self,
        artifact_updates: Sequence[
            BaseArtifactUnionWithDiscriminator | Mapping[str, Any]
        ]
        | None,
    ) -> list[BaseArtifactUnionWithDiscriminator]:
        if not artifact_updates:
            return []

        serialized: list[BaseArtifactUnionWithDiscriminator] = []
        for artifact in artifact_updates:
            try:
                serialized.append(BaseArtifactTypeAdapter.validate_python(artifact))
            except ValidationError as exc:
                raise ValueError(
                    "artifact_updates entries must match the BaseArtifact schema"
                ) from exc
        return serialized

    def _serialize_router_endpoint_payload(
        self,
        payload: BaseModel | dict[str, object] | None,
    ) -> dict[str, object]:
        if payload is None:
            return {}
        if isinstance(payload, BaseModel):
            return payload.model_dump()
        if isinstance(payload, dict):
            return dict(payload)
        raise ValueError("router endpoint payload must be a dict or pydantic model")

    def _set_dependency_value(
        self,
        runtime_state: ListenerRuntimeState,
        current: Any,
        dependency: str,
        value: BaseDependencyValueUnion,
        node: Node,
        *,
        binary_payload: bytes | None = None,
    ) -> Any:
        """Set a dependency value on the cached state instance."""
        node.value = value
        if value.type is DependencyValueType.Binary and binary_payload is not None:
            setattr(current, dependency, binary_payload)
            return binary_payload
        expression = runtime_state.code_generator.get_value(node)
        hydrated = self._evaluate_expression(
            dependency=dependency,
            expression=expression,
        )
        setattr(current, dependency, hydrated)
        return hydrated

    def _evaluate_expression(
        self,
        *,
        dependency: str,
        expression: str | None,
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
        async def executor(
            changed: dict[str, Any], events: list[DependencyEvent]
        ) -> None:
            runtime_state = self._runtime_state
            if runtime_state is None or runtime_state.s_instance is None:
                return
            ctx = self._build_callback_context(spec, changed, events)
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
        self,
        spec: ListenerCallbackSpec,
        changed: dict[str, Any],
        events: list[DependencyEvent] | None = None,
    ) -> ListenerCallbackContext:
        spec_logger = spec.logger
        if spec_logger is None:
            spec_logger = logger.getChild(f"callback.{spec.callback_id}")
            spec.logger = spec_logger

        if events is None:
            events = []

        project_manager = self._get_router_endpoint_api()
        runtime_state = self._runtime_state
        if runtime_state is None:
            raise RuntimeError(
                "Listener project state is unavailable; wait for bootstrap before calling router endpoints"
            )
        ids = ListenerDependencyIds(
            runtime_state.dependency_graph, runtime_state.project_state
        )
        values = ListenerDependencyValues(
            dependency_graph_resolver=self._current_runtime_state_dependency_graph,
            state_resolver=self._current_runtime_state_instance,
        )
        return ListenerCallbackContext(
            changed=changed,
            changed_by_id=self._build_changed_by_id(
                runtime_state.dependency_graph, changed
            ),
            events=events,
            log=spec_logger,
            emit_to_frontend=self.emit_to_frontend,
            project_manager=project_manager,
            frontend_affinity_token=self._frontend_affinity_token,
            ids=ids,
            values=values,
        )

    def _current_runtime_state_dependency_graph(self) -> DependencyGraph | None:
        runtime_state = self._runtime_state
        if runtime_state is None:
            return None
        return runtime_state.dependency_graph

    def _current_runtime_state_instance(self) -> Any:
        runtime_state = self._runtime_state
        if runtime_state is None:
            return None
        return runtime_state.s_instance

    def _build_changed_by_id(
        self,
        dependency_graph: DependencyGraph,
        changed: dict[str, Any],
    ) -> dict[ListenerDependencyId, Any]:
        if not changed:
            return {}
        lookup = dependency_graph.full_path_name_to_dep_key
        changed_by_id: dict[ListenerDependencyId, Any] = {}
        for dependency_name, value in changed.items():
            if dependency_name not in lookup:
                raise KeyError(
                    f"Unknown dependency name {dependency_name!r} for project {self._log_identifier}"
                )
            dep_key = lookup[dependency_name]
            changed_by_id[_dependency_id_from_key(dep_key)] = value
        return changed_by_id

    def _get_router_endpoint_api(self) -> RouterEndpointAPI:
        if self._router_endpoint_api is None:
            self._router_endpoint_api = RouterEndpointAPI(self._call_router_endpoint)
        return self._router_endpoint_api

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
        self._refresh_callback_dependency_metadata(runtime_state.dependency_graph)

        for spec in self._callbacks.values():
            self._scheduler.reset(spec.callback_id)
            if spec.dependency_mode is ListenerDependencyMode.REALTIME_ONLY:
                continue
            dependencies = spec.dependency_names
            if not dependencies:
                callbacks_to_run.append((spec, {}))
                continue

            changed: dict[str, Any] = {}
            for dep_key, dependency in zip(spec.structured_dependencies, dependencies):
                value = self._get_dependency_value(
                    runtime_state,
                    state_instance,
                    dependency,
                    snapshot_values,
                    dep_key=dep_key,
                )
                if value is _UNAVAILABLE:
                    continue
                updated_cache[dependency] = value
                changed[dependency] = value

            if changed or spec.run_on_refresh:
                callbacks_to_run.append((spec, changed))

        self._dependency_cache = updated_cache

        for spec, changed in callbacks_to_run:
            ctx = self._build_callback_context(spec, changed, events=[])
            await self._invoke_callback(spec, state_instance, ctx)
