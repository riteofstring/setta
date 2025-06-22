from setta.lsp.specific_file_watcher import SpecificFileWatcher
from setta.project_state.project_manager import ProjectManager
from setta.types.generated.websocket_type_unions import (
    WebsocketMsgForBackendTypeAdapter,
    WebsocketMsgForBackendUnion,
)
from setta.types.websocket import (
    WebsocketMsgAllDependencies,
    WebsocketMsgCurrentAddressUpdate,
    WebsocketMsgUpdateBackendProjectState,
)
from setta.websockets.msg_handlers.base import (
    BaseWebsocketMsgReceiver,
)
from setta.websockets.script_metadata import ScriptMetadata
from setta.websockets.websocket_manager import WebsocketManager


class WMHFrontendReceiver(BaseWebsocketMsgReceiver):
    def __init__(
        self,
        websocket_manager: WebsocketManager,
        project_manager: ProjectManager,
        script_metadata: ScriptMetadata,
        specific_file_watcher: SpecificFileWatcher,
    ):
        self.websocket_manager = websocket_manager
        self.project_manager = project_manager
        self.script_metadata = script_metadata
        self.specific_file_watcher = specific_file_watcher

    async def process_json_str(self, json_str: str, fromWebsocketId: str):
        m: WebsocketMsgForBackendUnion = (
            WebsocketMsgForBackendTypeAdapter.validate_json(json_str)
        )

        if isinstance(m, WebsocketMsgCurrentAddressUpdate):
            self.websocket_manager.update_current_address(m.content, fromWebsocketId)
        elif isinstance(m, WebsocketMsgUpdateBackendProjectState):
            await self.project_manager.update_from_frontend(
                messageId=m.id,
                projectState=m.content.projectState,
                requestRenameRefactor=m.content.requestRenameRefactor,
            )

        # if message.get("messageType") == C.WS_CALL_INTERACTIVE_FNS:
        #     print("WMHFrontend process_message", message, flush=True)
        #     wids = self.script_metadata.get_websocket_ids_listening_to_data(
        #         message["content"]
        #     )
        #     for wid in wids:
        #         await self.websocket_manager.send_message(message, wid)

    async def on_connect(self, websocket_id: str):
        await self.websocket_manager.send_message(
            WebsocketMsgAllDependencies(content=self.script_metadata.dependencies),
            websocket_id,
        )
        self.specific_file_watcher.request_read_all_files()
