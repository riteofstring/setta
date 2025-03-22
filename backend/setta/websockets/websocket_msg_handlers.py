from setta.utils.constants import C


class WebsocketMsgHandlers:
    def __init__(self, websocket_manager, code_tasks):
        self.lsp_reader = WMHLSPReader(websocket_manager)
        self.specific_file_watcher = WMHSpecificFileWatcher(websocket_manager)
        self.artifact = WMHArtifact(websocket_manager)
        self.database = WMHDatabase(websocket_manager)
        self.frontend = WMHFrontend(websocket_manager, code_tasks)


class WMHLSPReader:
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def broadcast_notification(self, content):
        content["projectConfigId"] = C.NOTIFICATION_IS_FOR_ALL_PROJECTS
        await self.websocket_manager.broadcast(content, C.WS_NOTIFICATION)

    async def return_to_requester(self, content, returnId):
        await self.websocket_manager.return_to_requester(content, returnId)

    async def broadcast_lsp_diagnostics(self, content):
        await self.websocket_manager.broadcast(content, C.WS_LSP_DIAGNOSTICS)


class WMHSpecificFileWatcher:
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def broadcast_file_updates(self, content):
        await self.websocket_manager.broadcast(
            content, C.WS_SPECIFIC_FILE_WATCHER_UPDATE
        )


class WMHArtifact:
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def broadcast_artifact(self, content):
        await self.websocket_manager.broadcast(content, C.WS_ARTIFACT)


class WMHDatabase:
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def broadcast_notification(self, content, projectConfigId):
        content["projectConfigId"] = projectConfigId
        await self.websocket_manager.broadcast(content, C.WS_NOTIFICATION)


class WMHFrontend:
    def __init__(self, websocket_manager, code_tasks):
        self.websocket_manager = websocket_manager
        self.code_tasks = code_tasks

    async def process_message(self, message, *_):
        msg_id = message["id"]
        result = await self.code_tasks(message)
        if result:
            await self.websocket_manager.return_to_requester(result, msg_id)
