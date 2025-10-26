import logging
from typing import Any

from setta.project_state.project_manager_types import (
    ProjectStateSingleConfigWithCompletedOpIds,
)
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.websocket import (
    ListenerAckContent,
    ListenerErrorContent,
    ListenerForceRefreshContent,
    ListenerFrontendEmitContent,
    ListenerRealtimeEventContent,
    WebsocketConnectionType,
    WebsocketMsgListenerAck,
    WebsocketMsgListenerBootstrap,
    WebsocketMsgListenerError,
    WebsocketMsgListenerForceRefresh,
    WebsocketMsgListenerFrontendEmit,
    WebsocketMsgListenerPersistedUpdate,
    WebsocketMsgListenerRealtimeEvent,
)
from setta.websockets.msg_handlers.base import BaseWebsocketMsgSender

logger = logging.getLogger(__name__)


class WMHPythonScriptSender(BaseWebsocketMsgSender):
    async def send_persisted_update(
        self,
        projectState: ProjectStateSingleConfig,
        completedOpIds: list[str],
        pendingOpIds: list[str],
        *,
        is_bootstrap: bool,
    ):
        payload = ProjectStateSingleConfigWithCompletedOpIds(
            projectState=projectState,
            completedOpIds=completedOpIds,
            pendingOpIds=pendingOpIds,
        )
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
            message_cls(content=payload),
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
        await self.websocket_manager.broadcast(
            WebsocketMsgListenerRealtimeEvent(content=content),
            connectionType=WebsocketConnectionType.PYTHON_SCRIPT,
        )

    async def send_force_refresh(
        self,
        *,
        projectState: ProjectStateSingleConfigWithCompletedOpIds | None = None,
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
            projectState.projectState.projectConfig.id
            if projectState is not None
            else "unknown",
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
