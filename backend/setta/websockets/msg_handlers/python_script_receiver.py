import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from pydantic import ValidationError

from setta.types.helpers_lvl2 import ProjectNotFound
from setta.types.websocket import (
    ListenerCallbackRegistration,
    ListenerRegisterContent,
    WebsocketMsg,
)
from setta.websockets.msg_handlers.base import BaseWebsocketMsgReceiver

if TYPE_CHECKING:
    from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
    from setta.websockets.msg_handlers.python_script_sender import (
        WMHPythonScriptSender,
    )

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ListenerSession:
    project_config_id: str
    listeners: tuple[ListenerCallbackRegistration, ...]


class WMHPythonScriptReceiver(BaseWebsocketMsgReceiver):
    def __init__(
        self,
        websocket_manager,
        project_manager_switcher: "ProjectManagerSwitcher",
        python_script_sender: "WMHPythonScriptSender",
    ):
        super().__init__(websocket_manager)
        self._project_manager_switcher = project_manager_switcher
        self._python_script_sender = python_script_sender
        self._sessions: dict[str, ListenerSession] = {}

    async def process_json_str(self, json_str: str, fromWebsocketId: str):
        message: WebsocketMsg
        try:
            message = WebsocketMsg.model_validate_json(json_str)
        except ValidationError as exc:
            logger.warning(
                "listener websocket payload failed validation: %s", exc
            )
            return

        handler = self._get_handler(message.messageType)
        if handler is None:
            logger.debug(
                "listener websocket message type %s ignored", message.messageType
            )
            return

        try:
            await handler(fromWebsocketId, message.content)
        except Exception:
            logger.exception(
                "error handling listener websocket message %s", message.messageType
            )
            await self._python_script_sender.send_error(
                error="listener message handling error",
                details={"messageType": message.messageType},
                websocket_id=fromWebsocketId,
            )

    async def on_disconnect(self, websocket_id: str):
        self._sessions.pop(websocket_id, None)

    def _get_handler(
        self, message_type: Any
    ) -> (
        callable[[str, Any], Any] | None
    ):
        if message_type == "ListenerRegister":
            return self._handle_register
        return None

    async def _handle_register(
        self,
        websocket_id: str,
        payload: Any,
    ):
        try:
            content = ListenerRegisterContent.model_validate(payload)
        except ValidationError as exc:
            logger.warning("invalid listener register payload: %s", exc)
            await self._python_script_sender.send_error(
                error="invalid listener register payload",
                details={"errors": exc.errors()},
                websocket_id=websocket_id,
            )
            return

        session = ListenerSession(
            project_config_id=content.projectConfigId,
            listeners=tuple(content.listeners),
        )
        self._sessions[websocket_id] = session

        await self._python_script_sender.send_ack(
            message="listener registered",
            websocket_id=websocket_id,
        )
        await self._send_bootstrap_snapshot(websocket_id, content.projectConfigId)

    async def _send_bootstrap_snapshot(
        self,
        websocket_id: str,
        project_config_id: str,
    ):
        manager = self._project_manager_switcher.get(project_config_id)
        try:
            project_state = manager.get_single_config_state(project_config_id)
        except (KeyError, ProjectNotFound) as exc:
            logger.exception(
                "failed to load project state for listener bootstrap: %s",
                project_config_id,
            )
            await self._python_script_sender.send_error(
                error="failed to load listener project state",
                details={"projectConfigId": project_config_id, "error": str(exc)},
                websocket_id=websocket_id,
            )
            return

        completed_op_ids = list(manager.completed_op_ids_since_last_broadcast)
        pending_op_ids = list(manager.pending_frontend_ops.keys())
        await self._python_script_sender.send_persisted_update(
            project_state,
            completed_op_ids,
            pending_op_ids,
            is_bootstrap=True,
            websocket_id=websocket_id,
        )
