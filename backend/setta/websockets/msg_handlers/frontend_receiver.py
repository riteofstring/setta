from setta.project_state.project_manager import ProjectManager
from setta.types.generated.websocket_unions import (
    BackendWebsocketMsgTypeAdapter,
    BackendWebsocketMsgUnion,
)
from setta.types.websocket import (
    WebsocketMsgAllDependencies,
    WebsocketMsgCurrentAddressUpdate,
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
    ):
        self.websocket_manager = websocket_manager
        self.project_manager = project_manager
        self.script_metadata = script_metadata

    async def process_json_str(self, json_str: str, fromWebsocketId: str):
        m: BackendWebsocketMsgUnion = BackendWebsocketMsgTypeAdapter.validate_json(
            json_str
        )

        if isinstance(m, WebsocketMsgCurrentAddressUpdate):
            self.websocket_manager.update_current_address(m.content, fromWebsocketId)

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
        await self.project_manager.broadcast_all_project_metadata()
