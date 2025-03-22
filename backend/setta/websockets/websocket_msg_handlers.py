from setta.utils.constants import C


class WebsocketMsgHandlers:
    def __init__(self, websocket_manager):
        self.lsp_reader = WMHLSPReader(websocket_manager)
        self.specific_file_watcher = WMHSpecificFileWatcher(websocket_manager)
        self.artifact = WMHArtifact(websocket_manager)
        self.database = WMHDatabase(websocket_manager)


class WMHLSPReader:
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def broadcast_notification(self, content):
        content["projectConfigId"] = C.NOTIFICATION_IS_FOR_ALL_PROJECTS
        await self.websocket_manager.broadcast(
            {"content": content, "messageType": C.WS_NOTIFICATION}
        )

    async def return_to_requester(self, returnId, content):
        await self.websocket_manager.return_to_requester(returnId, content)

    async def broadcast_lsp_diagnostics(self, content):
        await self.websocket_manager.broadcast(
            {"content": content, "messageType": C.WS_LSP_DIAGNOSTICS}
        )


class WMHSpecificFileWatcher:
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def broadcast_file_updates(self, content):
        await self.websocket_manager.broadcast(
            {
                "content": content,
                "messageType": C.WS_SPECIFIC_FILE_WATCHER_UPDATE,
            }
        )


class WMHArtifact:
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def broadcast_artifact(self, content):
        await self.websocket_manager.broadcast(
            {"content": content, "messageType": C.WS_ARTIFACT}
        )


class WMHDatabase:
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def broadcast_notification(self, content, projectConfigId):
        content["projectConfigId"] = projectConfigId
        await self.websocket_manager.broadcast(
            {"content": content, "messageType": C.WS_NOTIFICATION}
        )


class WMHTasks:
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def broadcast_notification(self, message, fromWebsocketId):
        result = await tasks(
            message["messageType"],
            TaskMessage.parse_obj(message),
        )

        if "content" in result:
            websocket = self.sockets[fromWebsocketId]["websocket"]
            await websocket.send_text(
                json.dumps(
                    {
                        "id": message["id"],
                        "content": result["content"],
                        "messageType": result["messageType"],
                    }
                )
            )
