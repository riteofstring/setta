from setta.types.websocket import (
    WebsocketConnectionType,
    WebsocketMsgTypeForFrontend,
)
from setta.websockets.msg_handlers.base import BaseWebsocketMsgReceiver


class WMHPythonScriptReceiver(BaseWebsocketMsgReceiver):
    def __init__(self, websocket_manager, script_metadata, project_manager):
        self.websocket_manager = websocket_manager
        self.script_metadata = script_metadata
        self.project_manager = project_manager

    async def process_json_str(self, json_str, fromWebsocketId):
        # TODO
        pass

    async def on_disconnect(self, websocket_id):
        self.script_metadata.delete(websocket_id)
        await self.broadcast_all_dependencies()

    async def broadcast_all_dependencies(self):
        await self.websocket_manager.broadcast(
            self.script_metadata.dependencies,
            WebsocketMsgTypeForFrontend.AllDependencies,
            connectionType=WebsocketConnectionType.FRONTEND,
        )
