from setta.project_state.project_manager import ProjectManager
from setta.types.generated.websocket_unions import (
    BackendWebsocketMsgTypeAdapter,
    BackendWebsocketMsgUnion,
)
from setta.types.websocket import (
    WebsocketMsgCurrentAddressUpdate,
)
from setta.websockets.msg_handlers.base import (
    BaseWebsocketMsgReceiver,
)
from setta.websockets.websocket_manager import WebsocketManager


class WMHFrontendReceiver(BaseWebsocketMsgReceiver):
    def __init__(
        self,
        websocket_manager: WebsocketManager,
        project_manager: ProjectManager,
    ):
        self.websocket_manager = websocket_manager
        self.project_manager = project_manager

    async def process_json_str(self, json_str: str, fromWebsocketId: str):
        m: BackendWebsocketMsgUnion = BackendWebsocketMsgTypeAdapter.validate_json(
            json_str
        )

        if isinstance(m, WebsocketMsgCurrentAddressUpdate):
            self.websocket_manager.update_current_address(m.content, fromWebsocketId)

    async def on_connect(self, websocket_id: str):
        await self.project_manager.broadcast_all_project_metadata()
