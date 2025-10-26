import logging

from setta.project_state.project_manager_types import (
    ProjectStateSingleConfigWithCompletedOpIds,
)
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.websocket import (
    WebsocketConnectionType,
    WebsocketMsgListenerBootstrap,
    WebsocketMsgListenerPersistedUpdate,
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
