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
        websocket_id: str | None = None,
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
        message = message_cls(content=payload)
        if websocket_id is None:
            await self.websocket_manager.broadcast(
                message,
                connectionType=WebsocketConnectionType.PYTHON_SCRIPT,
            )
        else:
            await self.websocket_manager.send_message(message, websocket_id)

    async def send_realtime_update(
        self,
        *,
        projectConfigId: str,
        dependencyIds: list[str],
        delta: dict[str, Any],
        sequence: int,
        metadata: dict[str, Any] | None = None,
        websocket_id: str | None = None,
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
        message = WebsocketMsgListenerRealtimeEvent(content=content)
        if websocket_id is None:
            await self.websocket_manager.broadcast(
                message,
                connectionType=WebsocketConnectionType.PYTHON_SCRIPT,
            )
        else:
            await self.websocket_manager.send_message(message, websocket_id)

    async def send_force_refresh(
        self,
        *,
        projectState: ProjectStateSingleConfigWithCompletedOpIds | None = None,
        reason: str | None = None,
        schemaHash: str | None = None,
        websocket_id: str | None = None,
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
        message = WebsocketMsgListenerForceRefresh(content=content)
        if websocket_id is None:
            await self.websocket_manager.broadcast(
                message,
                connectionType=WebsocketConnectionType.PYTHON_SCRIPT,
            )
        else:
            await self.websocket_manager.send_message(message, websocket_id)

    async def send_ack(
        self,
        *,
        message: str | None = None,
        heartbeatIntervalSec: float | None = None,
        websocket_id: str | None = None,
    ):
        content = ListenerAckContent(
            message=message,
            heartbeatIntervalSec=heartbeatIntervalSec,
        )
        logger.debug("sending listener ack: %s", message)
        ws_message = WebsocketMsgListenerAck(content=content)
        if websocket_id is None:
            await self.websocket_manager.broadcast(
                ws_message,
                connectionType=WebsocketConnectionType.PYTHON_SCRIPT,
            )
        else:
            await self.websocket_manager.send_message(ws_message, websocket_id)

    async def send_error(
        self,
        *,
        error: str,
        details: Any | None = None,
        websocket_id: str | None = None,
    ):
        content = ListenerErrorContent(error=error, details=details)
        logger.error("sending listener error: %s", error)
        message = WebsocketMsgListenerError(content=content)
        if websocket_id is None:
            await self.websocket_manager.broadcast(
                message,
                connectionType=WebsocketConnectionType.PYTHON_SCRIPT,
            )
        else:
            await self.websocket_manager.send_message(message, websocket_id)

    async def broadcast_listener_event(
        self,
        *,
        projectConfigId: str,
        payload: dict[str, Any],
        target: str | None = None,
        websocket_id: str | None = None,
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
        message = WebsocketMsgListenerFrontendEmit(content=content)
        if websocket_id is None:
            await self.websocket_manager.broadcast(
                message,
                connectionType=WebsocketConnectionType.PYTHON_SCRIPT,
            )
        else:
            await self.websocket_manager.send_message(message, websocket_id)
