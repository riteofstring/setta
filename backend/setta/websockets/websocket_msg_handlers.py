from setta.utils.constants import C


class WebsocketMsgHandlers:
    def __init__(self, websocket_manager, code_tasks, script_metadata, code_state):
        self.lsp_reader = WMHLSPReader(websocket_manager)
        self.specific_file_watcher = WMHSpecificFileWatcher(websocket_manager)
        self.artifact = WMHArtifact(websocket_manager)
        self.database = WMHDatabase(websocket_manager)
        self.frontend = WMHFrontend(websocket_manager, code_tasks, script_metadata)
        self.cli = WMHCLI(websocket_manager)
        self.python_script = WMHPythonScript(
            websocket_manager, script_metadata, code_state
        )
        self.python_logger = WMHPythonLogger(websocket_manager)


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
    def __init__(self, websocket_manager, code_tasks, script_metadata):
        self.websocket_manager = websocket_manager
        self.code_tasks = code_tasks
        self.script_metadata = script_metadata

    async def process_message(self, message, *_):
        # print("WMHFrontend process_message", message, flush=True)
        wid = message.get("toWebsocketId")
        if wid and wid != self.websocket_manager.main_id:
            self.websocket_manager.send_message(message, wid)
        elif message.get("messageType") == C.WS_CALL_INTERACTIVE_FNS:
            wids = self.script_metadata.get_websocket_ids_listening_to_data(
                message["content"]
            )
            for wid in wids:
                await self.websocket_manager.send_message(message, wid)
        else:
            msg_id = message.get("id")
            if not msg_id:
                return
            result = await self.code_tasks.process_message(message)
            if result:
                await self.websocket_manager.return_to_requester(result, msg_id)

    def disconnect(self, websocket_id):
        pass


class WMHCLI:
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def process_message(self, message, *_):
        self.websocket_manager.send_message(message, message["toWebsocketId"])


class WMHPythonScript:
    def __init__(self, websocket_manager, script_metadata, code_state):
        self.websocket_manager = websocket_manager
        self.script_metadata = script_metadata
        self.code_state = code_state

    async def process_message(self, message, websocket_id):
        print("WMHPythonScript process_message", message, websocket_id, flush=True)
        msg_type = message["messageType"]
        content = message["content"]
        if msg_type == C.WS_SCRIPT_READY:
            project = self.code_state.get_project_from_rel_path(content)
            message = {"content": project, "messageType": C.WS_PROJECT_DATA}
            await self.websocket_manager.send_message(message, websocket_id)
        elif msg_type == C.WS_SCRIPT_DEPENDENCIES:
            self.script_metadata.add(websocket_id, content)

    def disconnect(self, websocket_id):
        self.script_metadata.delete(websocket_id)


class WMHPythonLogger:
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def process_message(self, message, *_):
        print("WMHPythonLogger process_message", message, flush=True)
        # await self.websocket_manager.broadcast(
        #     message, connectionType=C.WEBSOCKET_CONNECTION_TYPE_FRONTEND
        # )

    def disconnect(self, websocket_id):
        pass
