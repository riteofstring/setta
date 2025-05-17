from pydantic import TypeAdapter

from setta.database.db.chats.load import load_uuid_mapping_for_llm
from setta.database.db.chats.save import save_uuid_mapping_for_llm
from setta.mcp.utils import (
    IDDoesNotExist,
    SettaMCPToolError,
    replace_ids_with_uuids,
    replace_uuids_with_ids,
)
from setta.utils.constants import C


class WebsocketMsgHandlers:
    def __init__(
        self,
        websocket_manager,
        lsp_writers,
        project_manager,
        script_metadata,
        dbq,
        specific_file_watcher,
    ):
        self.base = BaseWebsocketMsgHandler(websocket_manager)
        self.artifact = WMHArtifact(websocket_manager)
        self.terminals = WMHTerminals(websocket_manager)
        self.frontend = WMHFrontend(
            websocket_manager,
            lsp_writers,
            project_manager,
            script_metadata,
            specific_file_watcher,
        )
        self.cli = WMHCLI(websocket_manager)
        self.python_script = WMHPythonScript(
            websocket_manager, script_metadata, project_manager
        )
        self.python_logger = WMHPythonLogger(websocket_manager)
        self.mcp = WMHMCP(websocket_manager, dbq)
        self.chat_manager = WMHChatManager(websocket_manager)


class BaseWebsocketMsgHandler:
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def on_connect(self, websocket_id):
        pass

    async def on_disconnect(self, websocket_id):
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


class WMHTerminals(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def send_command(self, command, cliId):
        message = {"content": command, "messageType": C.WS_RUN_CODE}
        await self.websocket_manager.send_message(message, cliId)

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
        project_manager,
        script_metadata,
        specific_file_watcher,
    ):
        self.websocket_manager = websocket_manager
        self.lsp_writers = lsp_writers
        self.project_manager = project_manager
        self.script_metadata = script_metadata
        self.specific_file_watcher = specific_file_watcher

    async def process_message(self, message, fromWebsocketId):
        if message.get("messageType") == C.WS_CALL_INTERACTIVE_FNS:
            print("WMHFrontend process_message", message, flush=True)
            wids = self.script_metadata.get_websocket_ids_listening_to_data(
                message["content"]
            )
            for wid in wids:
                await self.websocket_manager.send_message(message, wid)
        elif message.get("messageType") == C.WS_MCP_TOOL_USE_RETURN:
            self.websocket_manager.resolve_pending_request(
                message["id"], message["content"]
            )
        elif message.get("messageType") == C.WS_TEXT_FIELD_AUTOCOMPLETE:
            await self.project_manager.text_field_autocomplete(
                messageId=message["id"], **message["content"]
            )
        elif message.get("messageType") == C.WS_PARAMETERS_REQUEST:
            await self.project_manager.parameters_request(
                messageId=message["id"], **message["content"]
            )
        elif message.get("messageType") == C.WS_UPDATE_PROJECT_STATE:
            await self.project_manager.update(
                project_state=message["content"], messageId=message["id"]
            )
        elif message.get("messageType") == C.WS_CODE_AREA_AUTOCOMPLETE:
            await self.project_manager.code_area_autocomplete(
                messageId=message["id"], **message["content"]
            )

        # else:
        #     msg_id = message.get("id")
        #     if not msg_id:
        #         return
        #     result = await self.code_tasks.process_message(message)
        #     if result:
        #         await self.websocket_manager.return_to_requester(result, msg_id)

    async def on_connect(self, websocket_id):
        content = self.script_metadata.dependencies
        messageType = C.WS_ALL_DEPENDENCIES
        await self.websocket_manager.send_message(
            {"content": content, "messageType": messageType}, websocket_id
        )
        self.specific_file_watcher.request_read_all_files()


class WMHCLI(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def process_message(self, message, *_):
        await self.websocket_manager.send_message(message, message["toWebsocketId"])


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


class WMHPythonLogger(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def process_message(self, message, *_):
        msg_type = message["messageType"]
        if msg_type == C.WS_ARTIFACT:
            await self.websocket_manager.broadcast(
                message=message, connectionType=C.WEBSOCKET_CONNECTION_TYPE_FRONTEND
            )


class WMHMCP(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager, dbq):
        self.websocket_manager = websocket_manager
        self.dbq = dbq
        with self.dbq as db:
            self.id_to_uuid, self.uuid_to_id = load_uuid_mapping_for_llm(db)

    async def use_frontend_tool(self, fn_name, return_type, args=None):
        # Generate request ID
        request_id = self.websocket_manager.create_pending_request()

        try:
            args = replace_ids_with_uuids(args, self.id_to_uuid)
        except IDDoesNotExist as e:
            return {"error": str(e)}

        if args is None:
            args = {}
        # Send request to frontend with the ID
        await self.websocket_manager.broadcast(
            {"id": request_id, "fnName": fn_name, "args": args},
            C.WS_MCP_TOOL_USE,
            connectionType=C.WEBSOCKET_CONNECTION_TYPE_FRONTEND,
        )

        # Wait for response
        result = await self.websocket_manager.wait_for_pending_request(request_id)
        if isinstance(result, dict) and C.SETTA_MCP_TOOL_ERROR in result:
            raise SettaMCPToolError(result[C.SETTA_MCP_TOOL_ERROR])
        result = TypeAdapter(return_type).validate_python(result)
        result = replace_uuids_with_ids(result, self.uuid_to_id, self.id_to_uuid)
        with self.dbq as db:
            save_uuid_mapping_for_llm(db, self.uuid_to_id)
            await self.send_uuid_mapping()
        return result

    async def send_uuid_mapping(self):
        await self.websocket_manager.broadcast(
            self.id_to_uuid,
            C.WS_UUID_MAPPING_FOR_LLM,
            connectionType=C.WEBSOCKET_CONNECTION_TYPE_FRONTEND,
        )


class WMHChatManager(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager

    async def send_streaming_response(self, chatId, assistant_message_id, chunk):
        await self.websocket_manager.broadcast(
            {
                "chatId": chatId,
                "assistantMessageId": assistant_message_id,
                "chunk": chunk,
            },
            C.WS_LLM_STREAMING_RESPONSE,
            connectionType=C.WEBSOCKET_CONNECTION_TYPE_FRONTEND,
        )
