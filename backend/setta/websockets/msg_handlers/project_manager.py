from setta.types.project_state import ProjectStateSingleConfig
from setta.types.websocket_manager import (
    WebsocketConnectionType,
    WebsocketMsgLSPDiagnostics,
    WebsocketMsgRenameRefactorResults,
    WebsocketMsgUpdateFrontendProjectState,
)
from setta.websockets.msg_handlers.base import BaseWebsocketMsgHandler
from setta.websockets.websocket_manager import WebsocketManager


class WMHProjectManager(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager: WebsocketManager):
        self.websocket_manager = websocket_manager

    async def broadcast_lsp_diagnostics(self, content):
        await self.websocket_manager.broadcast(
            WebsocketMsgLSPDiagnostics(content=content),
            connectionType=WebsocketConnectionType.FRONTEND,
        )

    async def return_rename_refactor_results(self, content, messageId):
        await self.websocket_manager.return_to_requester(
            WebsocketMsgRenameRefactorResults(content=content),
            messageId,
        )

    async def broadcast_project_state(self, project_state: ProjectStateSingleConfig):
        await self.websocket_manager.broadcast(
            WebsocketMsgUpdateFrontendProjectState(content=project_state),
            connectionType=WebsocketConnectionType.FRONTEND,
        )
