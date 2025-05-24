from setta.utils.constants import C
from setta.websockets.msg_handlers.base import BaseWebsocketMsgHandler


class WMHProjectManager(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def return_to_requester(self, content, messageId):
        await self.websocket_manager.return_to_requester(content, messageId)

    async def broadcast_lsp_diagnostics(self, content):
        await self.websocket_manager.broadcast(
            content,
            C.WS_LSP_DIAGNOSTICS,
            connectionType=C.WEBSOCKET_CONNECTION_TYPE_FRONTEND,
        )

    async def return_rename_refactor_results(self, content, messageId):
        await self.websocket_manager.return_to_requester(
            content, messageId, messageType=C.WS_RETURN_RENAME_REFACTOR_RESULTS
        )
