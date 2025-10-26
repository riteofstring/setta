import logging

from setta.types.generated.websocket_unions import (
    PythonScriptWebsocketMsgTypeAdapter,
    PythonScriptWebsocketMsgUnion,
)
from setta.types.listener import ListenerRegisterAckContent, ListenerRegisterAckStatus
from setta.types.websocket import (
    WebsocketMsgListenerRegister,
    WebsocketMsgListenerRegisterAck,
)
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.base import BaseWebsocketMsgReceiver

logger = logging.getLogger(__name__)


class WMHPythonScriptReceiver(BaseWebsocketMsgReceiver):
    def __init__(
        self,
        websocket_manager,
        listener_registry: ListenerRegistry,
    ):
        super().__init__(websocket_manager)
        self.listener_registry = listener_registry

    async def on_disconnect(self, websocket_id):
        self.listener_registry.remove_registration(websocket_id)

    async def process_json_str(self, json_str, fromWebsocketId):
        message: PythonScriptWebsocketMsgUnion = (
            PythonScriptWebsocketMsgTypeAdapter.validate_json(json_str)
        )

        if isinstance(message, WebsocketMsgListenerRegister):
            await self._handle_listener_register(message, fromWebsocketId)

    async def _handle_listener_register(
        self, message: WebsocketMsgListenerRegister, websocket_id: str
    ) -> None:
        registration = self.listener_registry.upsert_registration(
            websocket_id=websocket_id,
            project_config_id=message.content.projectConfigId,
            callbacks=message.content.callbacks,
        )
        ack_statuses = [
            ListenerRegisterAckStatus(callbackId=cb.callbackId, status="accepted")
            for cb in message.content.callbacks
        ]
        ack_content = ListenerRegisterAckContent(
            projectConfigId=registration.project_config_id,
            callbacks=ack_statuses,
        )
        ack_message = WebsocketMsgListenerRegisterAck(content=ack_content)
        await self.websocket_manager.send_message(ack_message, websocket_id)
