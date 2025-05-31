from setta.lsp.managers import LSPWriters
from setta.lsp.specific_file_watcher import SpecificFileWatcher
from setta.project_state.project_manager import ProjectManager
from setta.types.project_state import ProjectUpdateState
from setta.utils.constants import C
from setta.websockets.msg_handlers.base import BaseWebsocketMsgHandler
from setta.websockets.script_metadata import ScriptMetadata
from setta.websockets.websocket_manager import WebsocketManager


class WMHFrontend(BaseWebsocketMsgHandler):
    def __init__(
        self,
        websocket_manager: WebsocketManager,
        lsp_writers: LSPWriters,
        project_manager: ProjectManager,
        script_metadata: ScriptMetadata,
        specific_file_watcher: SpecificFileWatcher,
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
                projectUpdateState=ProjectUpdateState(**message["content"]),
                messageId=message["id"],
            )
        elif message.get("messageType") == C.WS_CODE_AREA_AUTOCOMPLETE:
            await self.project_manager.code_area_autocomplete(
                messageId=message["id"], **message["content"]
            )
        elif message.get("messageType") == C.WS_GEN_CODE_PREFIX_AUTOCOMPLETE:
            await self.project_manager.gen_code_prefix_autocomplete(
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
