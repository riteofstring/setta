from __future__ import annotations

import asyncio
import logging
import os
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from setta.types.generated.go_shared_constants import DEFAULT_HOST, DEFAULT_PORT
from setta.types.generated.go_shared_types import Route

from .listener_callbacks import ListenerCallbackMixin
from .listener_connection import ListenerConnectionMixin
from .listener_models import (
    DependencyEvent,
    ListenerCallback,
    ListenerCallbackBuilder,
    ListenerCallbackContext,
    ListenerCallbackSpec,
    ListenerDependencyEventContent,
    ListenerDependencyId,
    ListenerDependencyIds,
    ListenerDependencyMetadata,
    ListenerDependencyMetadataEntry,
    ListenerDependencySpec,
    ListenerDependencyValues,
    ListenerParamIds,
    ListenerRealtimeDelta,
    ListenerRealtimeEventContent,
    ListenerRuntimeState,
    dep_id,
    parse_frontend_affinity_token,
)
from .listener_realtime import ListenerRealtimeMixin
from .scheduling import ListenerCallbackScheduler

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    import websockets

    from setta.api.listener_endpoint_client import RouterEndpointAPI
    from setta.local_core_client import LocalCoreClient
    from setta.sdk_contracts.generated import (
        ListenerDependencyCatalog,
        ListenerRenderedDependencyValues,
    )
    from setta.sessions.registry import SessionMetadata
    from setta.types.id import ID


class SettaListener(
    ListenerConnectionMixin, ListenerCallbackMixin, ListenerRealtimeMixin
):
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
        self._refresh_callback_semaphore = asyncio.Semaphore(refresh_concurrency)
        self._callbacks: dict[str, ListenerCallbackSpec] = {}
        self._explicit_host = host is not None
        self._explicit_port = port is not None
        self._host = host or DEFAULT_HOST
        self._port = port or DEFAULT_PORT
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
        self._websocket: websockets.ClientConnection | None = None
        self._send_lock = asyncio.Lock()
        self._callback_lock = asyncio.Lock()
        self._latest_dependency_metadata: ListenerDependencyMetadata | None = None
        self._latest_dependency_catalog: ListenerDependencyCatalog | None = None
        self._latest_dependency_snapshot_values: (
            ListenerRenderedDependencyValues | None
        ) = None
        self._local_core_client: LocalCoreClient | None = None
        self._pending_router_endpoint_calls: dict[str, asyncio.Future[Any]] = {}
        self._pending_router_endpoint_force_refreshes: dict[
            str, asyncio.Future[None]
        ] = {}
        self._router_endpoint_api: RouterEndpointAPI | None = None
        self._logging_configured = False
        self._auto_session_metadata: SessionMetadata | None = None
        self._auto_session_secret: bytes | None = None
        self._runtime_compatibility_verified = False
        self._set_binary_base_url = False
        base_url = os.environ.get("SETTA_BINARY_BASE_URL")
        if base_url is None:
            if "://" in self._host:
                base_url = f"{self._host.rstrip('/')}{Route.API_PREFIX.value}"
            else:
                base_url = f"http://{self._host}:{self._port}{Route.API_PREFIX.value}"
            os.environ["SETTA_BINARY_BASE_URL"] = base_url
            self._set_binary_base_url = True


__all__ = [
    "DependencyEvent",
    "ListenerCallback",
    "ListenerCallbackBuilder",
    "ListenerCallbackContext",
    "ListenerCallbackSpec",
    "ListenerDependencyEventContent",
    "ListenerDependencyId",
    "ListenerDependencyIds",
    "ListenerDependencyMetadata",
    "ListenerDependencyMetadataEntry",
    "ListenerDependencySpec",
    "ListenerDependencyValues",
    "ListenerParamIds",
    "ListenerRealtimeDelta",
    "ListenerRealtimeEventContent",
    "SettaListener",
    "dep_id",
]
