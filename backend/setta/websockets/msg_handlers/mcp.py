from setta.types.ai import IDToUUIDForLLM
from setta.types.websocket_manager import WebsocketConnectionType
from setta.types.websocket_msgs import WebsocketMsgTypeForFrontend
from setta.websockets.msg_handlers.base import BaseWebsocketMsgHandler
from setta.websockets.websocket_manager import WebsocketManager


class WMHMCP(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager: WebsocketManager):
        self.websocket_manager = websocket_manager

    async def send_uuid_mapping(self, id_to_uuid: IDToUUIDForLLM):
        await self.websocket_manager.broadcast(
            id_to_uuid,
            WebsocketMsgTypeForFrontend.UUID_MAPPING_FOR_LLM,
            connectionType=WebsocketConnectionType.FRONTEND,
        )
