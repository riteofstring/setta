from setta.utils.constants import C


class BaseWebsocketMsgHandler:
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def on_connect(self, websocket_id):
        pass

    async def on_disconnect(self, websocket_id):
        pass

    async def process_message(self, message, fromWebsocketId):
        pass

    async def broadcast_notification_to_all_projects(self, content):
        content["projectConfigId"] = C.NOTIFICATION_IS_FOR_ALL_PROJECTS
        await self.websocket_manager.broadcast(
            content,
            C.WS_NOTIFICATION,
            connectionType=C.WEBSOCKET_CONNECTION_TYPE_FRONTEND,
        )

    async def broadcast_notification(self, content, projectConfigId):
        content["projectConfigId"] = projectConfigId
        await self.websocket_manager.broadcast(
            content,
            C.WS_NOTIFICATION,
            connectionType=C.WEBSOCKET_CONNECTION_TYPE_FRONTEND,
        )
