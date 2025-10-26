import logging
from typing import Any

from setta.types.helpers_lvl3 import convert_backend_to_single_config
from setta.types.websocket import (
    WebsocketConnectionType,
    WebsocketMsg,
    WebsocketMsgAllDependencies,
)
from setta.utils.constants import C
from setta.websockets.msg_handlers.base import BaseWebsocketMsgReceiver


logger = logging.getLogger(__name__)


class WMHPythonScriptReceiver(BaseWebsocketMsgReceiver):
    def __init__(self, websocket_manager, script_metadata, project_manager):
        self.websocket_manager = websocket_manager
        self.script_metadata = script_metadata
        self.project_manager = project_manager

    async def on_connect(self, websocket_id: str) -> None:
        await self._send_project_state_snapshot(websocket_id)

    async def process_json_str(self, json_str, fromWebsocketId):
        try:
            message = WebsocketMsg.model_validate_json(json_str)
        except ValueError:
            logger.warning(
                "Failed to parse python script websocket payload: %s", json_str
            )
            return

        message_type = message.messageType
        content = message.content

        if message_type == C.WS_SCRIPT_DEPENDENCIES:
            await self._handle_script_dependencies(fromWebsocketId, content)
            return

        if message_type == C.WS_SCRIPT_REQUEST_FULL_STATE:
            project_config_id: str | None = None
            if isinstance(content, dict):
                project_config_id = content.get("projectConfigId")
            elif content is not None:
                logger.warning(
                    "Expected dict content for requestFullState from %s, received %s",
                    fromWebsocketId,
                    type(content).__name__,
                )
            await self._send_project_state_snapshot(
                fromWebsocketId, project_config_id=project_config_id
            )
            return

        logger.debug(
            "Ignoring unsupported python script message %s from %s",
            message_type,
            fromWebsocketId,
        )

    async def on_disconnect(self, websocket_id):
        self.script_metadata.delete(websocket_id)
        await self.broadcast_all_dependencies()

    async def broadcast_all_dependencies(self):
        await self.websocket_manager.broadcast(
            WebsocketMsgAllDependencies(content=self.script_metadata.dependencies),
            connectionType=WebsocketConnectionType.FRONTEND,
        )

    async def _send_project_state_snapshot(
        self, websocket_id: str, project_config_id: str | None = None
    ) -> None:
        backend_state = self.project_manager.project_state_backend
        target_config_id = project_config_id or backend_state.defaultProjectConfigId

        content: Any
        if target_config_id and target_config_id in backend_state.projectConfigs:
            single_config = convert_backend_to_single_config(
                backend_state, target_config_id
            )
            content = {
                "projectConfigId": target_config_id,
                "projectState": single_config.model_dump(mode="json"),
            }
        else:
            if project_config_id and project_config_id != backend_state.defaultProjectConfigId:
                logger.warning(
                    "Unknown projectConfigId %s requested by %s; falling back to default snapshot",
                    project_config_id,
                    websocket_id,
                )
            content = {
                "projectConfigId": backend_state.defaultProjectConfigId,
                "projectState": backend_state.model_dump(mode="json"),
            }

        await self.websocket_manager.send_message(
            WebsocketMsg(messageType=C.WS_PROJECT_DATA, content=content), websocket_id
        )

    async def _handle_script_dependencies(
        self, websocket_id: str, content: Any
    ) -> None:
        if not isinstance(content, list):
            logger.warning(
                "Expected list of dependencies from websocket %s, received %s",
                websocket_id,
                type(content).__name__,
            )
            return

        # Remove prior registrations for this websocket before adding the new set.
        self.script_metadata.delete(websocket_id)
        self.script_metadata.add(websocket_id, content)
        await self.broadcast_all_dependencies()
