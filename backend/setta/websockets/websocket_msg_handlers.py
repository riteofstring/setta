from setta.utils.constants import C


class WebsocketMsgHandlers:
    def __init__(self, websocket_manager, code_tasks):
        self.lsp_reader = WMHLSPReader(websocket_manager)
        self.specific_file_watcher = WMHSpecificFileWatcher(websocket_manager)
        self.artifact = WMHArtifact(websocket_manager)
        self.database = WMHDatabase(websocket_manager)
        self.frontend = WMHFrontend(websocket_manager, code_tasks)
        self.cli = WMHCLI(websocket_manager)
        self.python_script = WMHPythonScript(websocket_manager)


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
        if (
            message["messageType"] == C.WS_SEND_TO_SCRIPT
            or message["toWebsocketId"] != self.websocket_manager.main_id
        ):
            self.websocket_manager.send_message(message, message["toWebsocketId"])
        else:
            msg_id = message.get("id")
            if not msg_id:
                return
            result = await self.code_tasks.process_message(message)
            if result:
                await self.websocket_manager.return_to_requester(result, msg_id)


class WMHCLI:
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def process_message(self, message, *_):
        self.websocket_manager.send_message(message, message["toWebsocketId"])


class WMHPythonScript:
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def process_message(self, message, *_):
        print("WMHPythonScript process_message", message, flush=True)
        # self.websocket_manager.send_message(message, message["toWebsocketId"])
