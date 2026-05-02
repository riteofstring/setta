from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
from pathlib import Path
from typing import TYPE_CHECKING, Any, Awaitable, Iterable, Mapping, Sequence
from urllib.parse import urlencode

import requests
import websockets
from pydantic import BaseModel, ValidationError
from websockets.exceptions import ConnectionClosedError

from setta.auth.cookies import auth_cookie_name
from setta.auth.manager import AUTH_COOKIE_MANAGER
from setta.auth.session import load_current_session_secret
from setta.logging.config import configure_listener_logging
from setta.logging.context import logging_context
from setta.logging.tasks import spawn_background_task
from setta.runtime_compat import (
    RuntimeCompatibilityError,
    verify_running_backend_compatibility,
)
from setta.sessions.registry import SessionMetadata, SessionRegistry
from setta.types.generated.go_shared_types import (
    ListenerErrorMessage,
    ListenerMessageType,
    ListenerRegisterAckMessage,
    ListenerRegisterAckStatus,
    ListenerRouterEndpointResultMessage,
    Route,
)
from setta.utils.constants import C
from setta.utils.paths import get_setta_paths
from setta.websockets.binary_frames import decode_binary_frame

from .listener_models import (
    _CONTROL_LISTENER_MESSAGE_MODELS,
    _LISTENER_ACK_STATUS_ACCEPTED,
    _LISTENER_ACK_STATUS_REJECTED,
    _hosts_are_equivalent,
    _normalize_listener_message_type,
    _validate_generated_listener_message,
    ListenerDependencyEventContent,
    ListenerForceRefreshEvent,
    ListenerRealtimeEventContent,
    ListenerSessionSecret,
)

if TYPE_CHECKING:
    from .hot_reload import ListenerHotReloader
    from .listener_models import ListenerCallbackBuilder, ListenerRuntimeState
    from setta.types.id import ID

logger = logging.getLogger("setta.api.listener")


class ListenerConnectionMixin:
    def _maybe_autoconnect_to_latest_local_session(self) -> None:
        if not self._should_autoconnect_to_latest_local_session():
            return
        session_info = self._load_autoconnect_session()
        if session_info is None:
            return
        metadata, secret = session_info
        self._apply_autoconnect_session(metadata, secret)

    def _should_autoconnect_to_latest_local_session(self) -> bool:
        return (
            self._share_session_id is None
            and self._auth_headers is None
            and not self._explicit_host
            and not self._explicit_port
            and self._listener_autoconnect_enabled()
        )

    def _load_autoconnect_session(self) -> ListenerSessionSecret | None:
        # If the caller didn't pass host/port, prefer the latest session recorded in
        # this workspace (dev worktrees use per-worktree ports + cookie names).
        session_root_info = self._resolve_autoconnect_sessions_root()
        if session_root_info is None:
            return None
        workspace_root, sessions_root = session_root_info
        if not sessions_root.exists():
            return None
        return self._select_autoconnect_session(sessions_root, workspace_root)

    def _apply_autoconnect_session(
        self,
        metadata: SessionMetadata,
        secret: bytes,
    ) -> None:
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
        self._update_binary_base_url_for_host()

    def _listener_autoconnect_enabled(self) -> bool:
        raw_autoconnect = os.environ.get("SETTA_LISTENER_AUTOCONNECT")
        if raw_autoconnect is None:
            return False
        return raw_autoconnect.strip().lower() in {"1", "true", "yes"}

    def _resolve_autoconnect_sessions_root(self) -> tuple[Path, Path] | None:
        sessions_root = C.RUNTIME_SESSIONS_FOLDER
        if sessions_root.is_absolute():
            workspace_root = get_setta_paths().workspace_root.resolve(strict=False)
            return workspace_root, sessions_root.resolve(strict=False)
        start = Path.cwd().resolve()
        for parent in (start, *start.parents):
            candidate = parent / sessions_root
            if candidate.is_dir():
                return parent, candidate
        return None

    def _select_autoconnect_session(
        self,
        sessions_root: Path,
        workspace_root: Path,
    ) -> ListenerSessionSecret | None:
        registry = SessionRegistry(sessions_root=sessions_root)
        sessions = registry.find_sessions_by_workspace(
            workspace_root,
            prune_stale=False,
            track_suspicious=True,
        )
        sessions = [
            session
            for session in sessions
            if registry.is_session_process_setta(session)
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

    def _update_binary_base_url_for_host(self) -> None:
        if not self._set_binary_base_url:
            return
        if "://" in self._host:
            os.environ["SETTA_BINARY_BASE_URL"] = (
                f"{self._host.rstrip('/')}{Route.API_PREFIX.value}"
            )
            return
        os.environ["SETTA_BINARY_BASE_URL"] = (
            f"http://{self._host}:{self._port}{Route.API_PREFIX.value}"
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

    def _require_runtime_state(
        self,
        *,
        action: str,
    ) -> ListenerRuntimeState:
        runtime_state = self._runtime_state
        if runtime_state is None:
            raise RuntimeError(
                f"Listener project state is unavailable; wait for bootstrap before {action}"
            )
        return runtime_state

    def _require_registered_listener(
        self,
        *,
        action: str,
    ) -> None:
        if self._is_registered or self._registration_pending:
            return
        raise RuntimeError(
            "Listener is not registered with the server; "
            f"wait for registration to complete before {action}"
        )

    def _require_outbound_project_id(
        self,
        *,
        action: str,
    ):
        self._require_runtime_state(action=action)
        self._require_registered_listener(action=action)
        return self._require_project_id()

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
        route = Route.LISTENER_BY_ID.value.format(listenerID=self._socket_id)
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
        session_info = self._resolve_listener_session_secret()
        if session_info is None:
            return None
        session_metadata, secret = session_info
        if not self._session_matches_listener_target(session_metadata):
            return None

        cookie_value = AUTH_COOKIE_MANAGER.mint(session_metadata.id, secret)
        return {"Cookie": f"{auth_cookie_name(session_metadata.id)}={cookie_value}"}

    def _resolve_listener_session_secret(self) -> ListenerSessionSecret | None:
        session_info = load_current_session_secret()
        if session_info is not None:
            return session_info
        if self._auto_session_metadata is None or self._auto_session_secret is None:
            return None
        return self._auto_session_metadata, self._auto_session_secret

    def _session_matches_listener_target(
        self,
        session_metadata: SessionMetadata,
    ) -> bool:
        return session_metadata.port == self._port and _hosts_are_equivalent(
            session_metadata.host,
            self._host,
        )

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
                except RuntimeCompatibilityError:
                    raise
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
            self.start_with_hot_reload(
                self._build_hot_reload_reloader(
                    builder=builder,
                    extra_watch_paths=extra_watch_paths,
                    ignore_patterns=ignore_patterns,
                    trigger_refresh=trigger_refresh,
                    settle_delay=settle_delay,
                )
            )
            return
        self._validate_start_options_without_hot_reload(
            builder=builder,
            extra_watch_paths=extra_watch_paths,
            ignore_patterns=ignore_patterns,
            trigger_refresh=trigger_refresh,
            settle_delay=settle_delay,
        )
        self._run_listener_main(self.run_forever())

    def _build_hot_reload_reloader(
        self,
        *,
        builder: ListenerCallbackBuilder | None,
        extra_watch_paths: Iterable[str] | None,
        ignore_patterns: Iterable[str] | None,
        trigger_refresh: bool,
        settle_delay: float | None,
    ) -> "ListenerHotReloader":
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
        return ListenerHotReloader(**reloader_kwargs)

    def _validate_start_options_without_hot_reload(
        self,
        *,
        builder: ListenerCallbackBuilder | None,
        extra_watch_paths: Iterable[str] | None,
        ignore_patterns: Iterable[str] | None,
        trigger_refresh: bool,
        settle_delay: float | None,
    ) -> None:
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

    def _run_listener_main(self, task: Awaitable[None]) -> None:
        if self._stop_event.is_set():
            self._stop_event = asyncio.Event()
        try:
            with logging_context(
                listener_id=self._log_identifier,
                listener_socket_id=self._socket_id,
            ):
                asyncio.run(task)
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
        if self._local_core_client is not None:
            self._local_core_client.close()

    def _ensure_logging(self) -> None:
        if self._logging_configured:
            return
        configure_listener_logging()
        self._logging_configured = True

    async def _connect_once(self) -> None:
        """Open the websocket once and process messages until it closes."""
        await self._ensure_runtime_compatibility()
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
                    await self._consume_websocket_messages(websocket)
                finally:
                    self._handle_connection_closed()

    async def _consume_websocket_messages(
        self, websocket: websockets.ClientConnection
    ) -> None:
        async for payload in websocket:
            if self._stop_event.is_set():
                break
            message = self._parse_websocket_payload(payload)
            if message is None:
                continue
            await self._dispatch_websocket_message(message)

    def _handle_connection_closed(self) -> None:
        logger.info("Listener %s connection closed", self._log_identifier)
        self._websocket = None
        if self._local_core_client is not None:
            self._local_core_client.close()
        self._registration_pending = False
        self._is_registered = False
        self._expected_ack_callback_ids = set()
        self._fail_pending_router_endpoint_calls()
        self._fail_pending_router_endpoint_force_refreshes()

    def _fail_pending_router_endpoint_calls(self) -> None:
        if not self._pending_router_endpoint_calls:
            return
        pending_calls = list(self._pending_router_endpoint_calls.items())
        self._pending_router_endpoint_calls = {}
        for call_id, future in pending_calls:
            if future.done():
                continue
            future.set_exception(
                RuntimeError(
                    f"Listener connection closed before call {call_id} completed"
                )
            )

    def _fail_pending_router_endpoint_force_refreshes(self) -> None:
        if not self._pending_router_endpoint_force_refreshes:
            return
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

    async def _ensure_runtime_compatibility(self) -> None:
        if self._runtime_compatibility_verified:
            return
        auth_headers = self._resolve_auth_headers()
        await asyncio.to_thread(
            verify_running_backend_compatibility,
            requests.Session(),
            base_url=f"http://{self._host}:{self._port}",
            auth_headers=auth_headers,
        )
        self._runtime_compatibility_verified = True

    def _parse_websocket_payload(self, payload: str | bytes) -> Any | None:
        """Parse raw websocket payloads into typed messages."""
        if isinstance(payload, (bytes, bytearray)):
            return self._parse_binary_websocket_payload(bytes(payload))
        return self._parse_text_listener_payload(payload)

    def _parse_text_listener_payload(self, payload: str) -> Any | None:
        raw_message = self._parse_text_websocket_payload(payload)
        if raw_message is None:
            return None
        control_message = self._parse_listener_control_message(raw_message, payload)
        if control_message is not None:
            return control_message
        return self._parse_generated_listener_message(raw_message, payload)

    def _parse_generated_listener_message(
        self,
        raw_message: Any,
        payload: str,
    ) -> BaseModel | None:
        try:
            message = _validate_generated_listener_message(raw_message)
        except ValidationError:
            logger.warning("Received malformed listener payload: %s", payload)
            return None
        if message is None:
            logger.warning("Received malformed listener payload: %s", payload)
            return None
        logger.debug(
            "Listener %s received %s message",
            self._log_identifier,
            message.messageType,
        )
        return message

    def _parse_binary_websocket_payload(self, payload: bytes) -> Any | None:
        try:
            header, binary_payload = decode_binary_frame(payload)
        except ValueError as exc:
            logger.warning("Received malformed binary listener payload: %s", exc)
            return None
        if not isinstance(header, dict):
            logger.warning(
                "Binary websocket payload uses unsupported message type: %s",
                type(header),
            )
            return None
        message_type = header.get("messageType")
        if message_type == ListenerMessageType.ListenerRealtimeEvent.value:
            return self._parse_binary_realtime_event(header, binary_payload)
        if message_type == ListenerMessageType.ListenerDependencyEvent.value:
            return self._parse_binary_dependency_event(header, binary_payload)
        logger.warning(
            "Binary websocket payload uses unsupported message type: %s",
            message_type,
        )
        return None

    def _parse_binary_realtime_event(
        self,
        header: dict[str, Any],
        binary_payload: bytes,
    ) -> ListenerRealtimeEventContent | None:
        content = self._validate_listener_content(
            header,
            header.get("content"),
            ListenerRealtimeEventContent,
        )
        if content is None:
            return None
        if not content.deltas:
            logger.warning("Binary realtime event must contain at least one delta.")
            return None
        for delta in content.deltas:
            delta.binaryPayload = binary_payload
        return content

    def _parse_binary_dependency_event(
        self,
        header: dict[str, Any],
        binary_payload: bytes,
    ) -> ListenerDependencyEventContent | None:
        content = self._validate_listener_content(
            header,
            header.get("content"),
            ListenerDependencyEventContent,
        )
        if content is None:
            return None
        if not content.dependencyEvents:
            logger.warning("Binary dependency event must contain at least one event.")
            return None
        for event in content.dependencyEvents:
            event.binaryPayload = binary_payload
        return content

    def _parse_text_websocket_payload(self, payload: str) -> Any | None:
        try:
            return json.loads(payload)
        except json.JSONDecodeError:
            logger.warning("Received malformed listener payload: %s", payload)
            return None

    def _parse_listener_control_message(
        self,
        raw_message: Any,
        payload: str,
    ) -> Any | None:
        if not isinstance(raw_message, dict):
            return None
        message_type = _normalize_listener_message_type(raw_message.get("messageType"))
        if message_type is None:
            return None
        model = _CONTROL_LISTENER_MESSAGE_MODELS.get(message_type)
        if model is None:
            return None
        message = self._validate_listener_content(
            payload,
            raw_message.get("content"),
            model,
        )
        if message is None:
            return None
        logger.debug(
            "Listener %s received %s message",
            self._log_identifier,
            message_type,
        )
        return message

    def _validate_listener_content(
        self,
        payload: Any,
        raw_content: Any,
        model: type[BaseModel],
    ) -> Any | None:
        try:
            return model.model_validate(raw_content)
        except ValidationError:
            logger.warning("Received malformed listener payload: %s", payload)
            return None

    async def _dispatch_websocket_message(
        self,
        message: Any,
    ) -> None:
        """Delegate parsed websocket messages to dedicated handlers."""
        if self._dispatch_sync_websocket_message(message):
            return
        if await self._dispatch_async_websocket_message(message):
            return
        logger.debug(
            "Listener %s ignoring unsupported message type %s",
            self._log_identifier,
            getattr(message, "messageType", type(message)),
        )

    def _dispatch_sync_websocket_message(self, message: Any) -> bool:
        if isinstance(message, ListenerRegisterAckMessage):
            self._handle_register_ack(message)
            return True
        if isinstance(message, ListenerErrorMessage):
            self._handle_listener_error(message)
            return True
        if isinstance(message, ListenerRouterEndpointResultMessage):
            self._handle_router_endpoint_result(message)
            return True
        return False

    async def _dispatch_async_websocket_message(self, message: Any) -> bool:
        if isinstance(message, ListenerRealtimeEventContent):
            await self._handle_realtime_event(message)
            return True
        if isinstance(message, ListenerDependencyEventContent):
            await self._handle_dependency_event(message)
            return True
        if isinstance(message, ListenerForceRefreshEvent):
            await self._handle_force_refresh(message)
            return True
        return False

    def _handle_register_ack(self, message: ListenerRegisterAckMessage) -> None:
        """Handle ListenerRegisterAck responses from the server."""
        self._sync_register_ack_project_id(message.content.projectConfigId)
        expected_ids = self._consume_expected_register_ack_ids()
        ack_statuses = message.content.callbacks
        self._log_register_ack_mismatches(expected_ids, ack_statuses.keys())
        accepted_count, rejected = self._summarize_register_ack_statuses(ack_statuses)
        self._raise_for_rejected_register_ack(rejected)
        self._expected_ack_callback_ids = set()
        self._is_registered = True
        logger.info(
            "Listener %s registered %d callback(s)",
            self._log_identifier,
            accepted_count,
        )

    def _sync_register_ack_project_id(self, received_project_id: "ID") -> None:
        if self._project_config_id is None:
            self._project_config_id = received_project_id
            return
        if received_project_id != self._project_config_id:
            logger.warning(
                "Listener %s received register ack for unexpected project %s",
                self._log_identifier,
                received_project_id,
            )

    def _consume_expected_register_ack_ids(self) -> set[str]:
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
        return expected_ids

    def _log_register_ack_mismatches(
        self,
        expected_ids: set[str],
        ack_ids: Iterable[str],
    ) -> None:
        ack_id_set = set(ack_ids)
        missing_ids = expected_ids - ack_id_set
        if missing_ids:
            logger.warning(
                "Listener %s missing register ack for callbacks: %s",
                self._log_identifier,
                ", ".join(sorted(missing_ids)),
            )
        for callback_id in sorted(ack_id_set - expected_ids):
            logger.warning(
                "Listener %s received register ack for unknown callback %s",
                self._log_identifier,
                callback_id,
            )

    def _summarize_register_ack_statuses(
        self,
        ack_statuses: Mapping[str, ListenerRegisterAckStatus],
    ) -> tuple[int, list[tuple[str, ListenerRegisterAckStatus]]]:
        accepted_count = 0
        rejected: list[tuple[str, ListenerRegisterAckStatus]] = []
        for callback_id, status in ack_statuses.items():
            if status.status == _LISTENER_ACK_STATUS_ACCEPTED:
                accepted_count += 1
                continue
            if status.status == _LISTENER_ACK_STATUS_REJECTED:
                rejected.append((callback_id, status))
        return accepted_count, rejected

    def _raise_for_rejected_register_ack(
        self,
        rejected: Sequence[tuple[str, ListenerRegisterAckStatus]],
    ) -> None:
        if not rejected:
            return
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

    def _handle_listener_error(self, message: ListenerErrorMessage) -> None:
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
        self, message: ListenerRouterEndpointResultMessage
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
