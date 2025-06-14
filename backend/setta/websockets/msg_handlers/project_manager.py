from setta.types.project_state import ProjectStateSingleConfig
from setta.types.websocket_manager import WebsocketConnectionType
from setta.types.websocket_msgs import WebsocketMsgForFrontend
from setta.websockets.msg_handlers.base import BaseWebsocketMsgHandler
from setta.websockets.websocket_manager import WebsocketManager


class WMHProjectManager(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager: WebsocketManager):
        self.websocket_manager = websocket_manager

    async def return_to_requester(self, content, messageId):
        await self.websocket_manager.return_to_requester(content, messageId)

    async def broadcast_lsp_diagnostics(self, content):
        await self.websocket_manager.broadcast(
            content,
            WebsocketMsgForFrontend.WS_LSP_DIAGNOSTICS,
            connectionType=WebsocketConnectionType.FRONTEND,
        )

    async def return_rename_refactor_results(self, content, messageId):
        await self.websocket_manager.return_to_requester(
            content,
            messageId,
            messageType=WebsocketMsgForFrontend.WS_RETURN_RENAME_REFACTOR_RESULTS,
        )

    async def broadcast_project_state(self, project_state: ProjectStateSingleConfig):
        await self.websocket_manager.broadcast(
            project_state.model_dump(),
            WebsocketMsgForFrontend.WS_UPDATE_FRONTEND_PROJECT_STATE,
            connectionType=WebsocketConnectionType.FRONTEND,
        )
