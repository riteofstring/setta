from setta.utils.constants import C


class WebsocketMsgHandlers:
    def __init__(
        self,
        websocket_manager,
        lsp_writers,
        code_state,
        code_tasks,
        script_metadata,
    ):
        self.lsp_reader = WMHLSPReader(websocket_manager)
        self.specific_file_watcher = WMHSpecificFileWatcher(websocket_manager)
        self.artifact = WMHArtifact(websocket_manager)
        self.database = WMHDatabase(websocket_manager)
        self.terminals = WMHTerminals(websocket_manager)
        self.frontend = WMHFrontend(
            websocket_manager,
            lsp_writers,
            code_state,
            code_tasks,
            script_metadata,
        )
        self.cli = WMHCLI(websocket_manager)
        self.python_script = WMHPythonScript(
            websocket_manager, script_metadata, code_state
        )
        self.python_logger = WMHPythonLogger(websocket_manager)


class BaseWebsocketMsgHandler:
    async def on_connect(self, websocket_id):
        pass

    async def on_disconnect(self, websocket_id):
        pass


class WMHLSPReader(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def broadcast_notification(self, content):
        content["projectConfigId"] = C.NOTIFICATION_IS_FOR_ALL_PROJECTS
        await self.websocket_manager.broadcast(
            content,
            C.WS_NOTIFICATION,
            connectionType=C.WEBSOCKET_CONNECTION_TYPE_FRONTEND,
        )

    async def return_to_requester(self, content, returnId):
        await self.websocket_manager.return_to_requester(content, returnId)

    async def broadcast_lsp_diagnostics(self, content):
        await self.websocket_manager.broadcast(
            content,
            C.WS_LSP_DIAGNOSTICS,
            connectionType=C.WEBSOCKET_CONNECTION_TYPE_FRONTEND,
        )


class WMHSpecificFileWatcher(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def broadcast_file_updates(self, content):
        await self.websocket_manager.broadcast(
            content,
            C.WS_SPECIFIC_FILE_WATCHER_UPDATE,
            connectionType=C.WEBSOCKET_CONNECTION_TYPE_FRONTEND,
        )


class WMHArtifact(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def broadcast_artifact(self, content):
        await self.websocket_manager.broadcast(
            content, C.WS_ARTIFACT, connectionType=C.WEBSOCKET_CONNECTION_TYPE_FRONTEND
        )


class WMHDatabase(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def broadcast_notification(self, content, projectConfigId):
        content["projectConfigId"] = projectConfigId
        await self.websocket_manager.broadcast(
            content,
            C.WS_NOTIFICATION,
            connectionType=C.WEBSOCKET_CONNECTION_TYPE_FRONTEND,
        )


class WMHTerminals(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def send_command(self, command, cliId):
        message = {"content": command, "messageType": C.WS_RUN_CODE}
        await self.websocket_manager.send_message(message, cliId)

    async def broadcast_notification(self, content, projectConfigId):
        content["projectConfigId"] = projectConfigId
        await self.websocket_manager.broadcast(
            content,
            C.WS_NOTIFICATION,
            connectionType=C.WEBSOCKET_CONNECTION_TYPE_FRONTEND,
        )

    async def broadcast_terminal_metadata(self, terminal_metadata):
        await self.websocket_manager.broadcast(
            terminal_metadata,
            C.WS_TERMINAL_METADATA,
            connectionType=C.WEBSOCKET_CONNECTION_TYPE_FRONTEND,
        )


class WMHFrontend(BaseWebsocketMsgHandler):
    def __init__(
        self,
        websocket_manager,
        lsp_writers,
        code_state,
        code_tasks,
        script_metadata,
    ):
        self.websocket_manager = websocket_manager
        self.lsp_writers = lsp_writers
        self.code_state = code_state
        self.code_tasks = code_tasks
        self.script_metadata = script_metadata

    async def process_message(self, message, fromWebsocketId):
        if message.get("messageType") == C.WS_CALL_INTERACTIVE_FNS:
            print("WMHFrontend process_message", message, flush=True)
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

    async def on_connect(self, websocket_id):
        content = self.script_metadata.dependencies
        messageType = C.WS_ALL_DEPENDENCIES
        await self.websocket_manager.send_message(
            {"content": content, "messageType": messageType}, websocket_id
        )


class WMHCLI(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def process_message(self, message, *_):
        await self.websocket_manager.send_message(message, message["toWebsocketId"])


class WMHPythonScript(BaseWebsocketMsgHandler):
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


class WMHPythonLogger(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def process_message(self, message, *_):
        msg_type = message["messageType"]
        if msg_type == C.WS_ARTIFACT:
            await self.websocket_manager.broadcast(
                message=message, connectionType=C.WEBSOCKET_CONNECTION_TYPE_FRONTEND
            )
