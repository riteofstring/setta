import logging
from typing import Any

from setta.types.listener import (
    ListenerAckContent,
    ListenerErrorContent,
    ListenerForceRefreshContent,
    ListenerFrontendEmitContent,
    ListenerRealtimeEventContent,
    ListenerFeed,
)
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.websocket import (
    WebsocketConnectionType,
    WebsocketMsgListenerAck,
    WebsocketMsgListenerBootstrap,
    WebsocketMsgListenerError,
    WebsocketMsgListenerForceRefresh,
    WebsocketMsgListenerFrontendEmit,
    WebsocketMsgListenerPersistedUpdate,
    WebsocketMsgListenerRealtimeEvent,
)
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.base import BaseWebsocketMsgSender

logger = logging.getLogger(__name__)


class WMHPythonScriptSender(BaseWebsocketMsgSender):
    def __init__(
        self,
        websocket_manager,
        listener_registry: ListenerRegistry,
    ):
        super().__init__(websocket_manager)
        self.listener_registry = listener_registry

    async def send_persisted_update(
        self,
        projectState: ProjectStateSingleConfig,
        *,
        is_bootstrap: bool,
    ):
        logger.debug(
            "sending listener persisted update (bootstrap=%s) for project config %s",
            is_bootstrap,
            projectState.projectConfig.id,
        )
        message_cls = (
            WebsocketMsgListenerBootstrap
            if is_bootstrap
            else WebsocketMsgListenerPersistedUpdate
        )
        await self.websocket_manager.broadcast(
            message_cls(content=projectState),
            connectionType=WebsocketConnectionType.PYTHON_SCRIPT,
        )

    async def send_realtime_update(
        self,
        *,
        projectConfigId: str,
        dependencyIds: list[str],
        delta: dict[str, Any],
        sequence: int,
        metadata: dict[str, Any] | None = None,
    ):
        content = ListenerRealtimeEventContent(
            projectConfigId=projectConfigId,
            dependencyIds=dependencyIds,
            delta=delta,
            sequence=sequence,
            metadata=metadata,
        )
        logger.debug(
            "sending listener realtime event for project config %s (sequence=%s)",
            projectConfigId,
            sequence,
        )
        sockets_to_notify = set()
        for registration, matching_callbacks in (
            self.listener_registry.iter_callbacks_matching_dependencies(
                project_config_id=projectConfigId,
                dependency_ids=dependencyIds,
            )
        ):
            if any(
                registration.callbacks[callback_id].feed
                in (ListenerFeed.REALTIME, ListenerFeed.BOTH)
                for callback_id in matching_callbacks
            ):
                sockets_to_notify.add(registration.websocket_id)

        if not sockets_to_notify:
            logger.debug(
                "no listener sockets registered for realtime dependencies %s "
                "(project config %s)",
                dependencyIds,
                projectConfigId,
            )
            return

        message = WebsocketMsgListenerRealtimeEvent(content=content)
        for websocket_id in sockets_to_notify:
            await self.websocket_manager.send_message(message, websocket_id)

    async def send_force_refresh(
        self,
        *,
        projectState: ProjectStateSingleConfig | None = None,
        reason: str | None = None,
        schemaHash: str | None = None,
    ):
        content = ListenerForceRefreshContent(
            projectState=projectState,
            reason=reason,
            schemaHash=schemaHash,
        )
        logger.debug(
            "sending listener force refresh for project config %s",
            projectState.projectConfig.id if projectState is not None else "unknown",
        )
        await self.websocket_manager.broadcast(
            WebsocketMsgListenerForceRefresh(content=content),
            connectionType=WebsocketConnectionType.PYTHON_SCRIPT,
        )

    async def send_ack(
        self,
        *,
        message: str | None = None,
        heartbeatIntervalSec: float | None = None,
    ):
        content = ListenerAckContent(
            message=message,
            heartbeatIntervalSec=heartbeatIntervalSec,
        )
        logger.debug("sending listener ack: %s", message)
        await self.websocket_manager.broadcast(
            WebsocketMsgListenerAck(content=content),
            connectionType=WebsocketConnectionType.PYTHON_SCRIPT,
        )

    async def send_error(self, *, error: str, details: Any | None = None):
        content = ListenerErrorContent(error=error, details=details)
        logger.error("sending listener error: %s", error)
        await self.websocket_manager.broadcast(
            WebsocketMsgListenerError(content=content),
            connectionType=WebsocketConnectionType.PYTHON_SCRIPT,
        )

    async def broadcast_listener_event(
        self,
        *,
        projectConfigId: str,
        payload: dict[str, Any],
        target: str | None = None,
    ):
        content = ListenerFrontendEmitContent(
            projectConfigId=projectConfigId,
            payload=payload,
            target=target,
        )
        logger.debug(
            "broadcasting listener event for project config %s (target=%s)",
            projectConfigId,
            target,
        )
        await self.websocket_manager.broadcast(
            WebsocketMsgListenerFrontendEmit(content=content),
            connectionType=WebsocketConnectionType.PYTHON_SCRIPT,
        )
