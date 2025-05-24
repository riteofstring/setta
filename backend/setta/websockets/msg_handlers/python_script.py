from setta.utils.constants import C
from setta.websockets.msg_handlers.base import BaseWebsocketMsgHandler


class WMHPythonScript(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager, script_metadata, project_manager):
        self.websocket_manager = websocket_manager
        self.script_metadata = script_metadata
        self.project_manager = project_manager

    async def process_message(self, message, websocket_id):
        print("WMHPythonScript process_message", message, websocket_id, flush=True)
        msg_type = message["messageType"]
        content = message["content"]
        if msg_type == C.WS_SCRIPT_READY:
            project = self.project_manager.get_project_from_rel_path(content)
            message = {"content": project, "messageType": C.WS_PROJECT_DATA}
            await self.websocket_manager.send_message(message, websocket_id)
        elif msg_type == C.WS_SCRIPT_DEPENDENCIES:
            self.script_metadata.add(websocket_id, content)
            await self.broadcast_all_dependencies()
        elif msg_type == C.WS_ARTIFACT:
            await self.websocket_manager.broadcast(
                message=message, connectionType=C.WEBSOCKET_CONNECTION_TYPE_FRONTEND
            )

    async def on_disconnect(self, websocket_id):
        self.script_metadata.delete(websocket_id)
        await self.broadcast_all_dependencies()

    async def broadcast_all_dependencies(self):
        await self.websocket_manager.broadcast(
            self.script_metadata.dependencies,
            C.WS_ALL_DEPENDENCIES,
            connectionType=C.WEBSOCKET_CONNECTION_TYPE_FRONTEND,
        )
