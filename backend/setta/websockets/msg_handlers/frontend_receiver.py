import logging

from setta.project_state.project_manager import ProjectManager
from setta.types.generated.websocket_unions import (
    BackendWebsocketMsgTypeAdapter,
    BackendWebsocketMsgUnion,
)
from setta.types.websocket import (
    RealtimeUIChangeContent,
    WebsocketMsgCurrentAddressUpdate,
    WebsocketMsgRealtimeUIChange,
)
from setta.websockets.msg_handlers.base import (
    BaseWebsocketMsgReceiver,
)
from setta.websockets.realtime_event_hub import RealtimeEventHub
from setta.websockets.websocket_manager import WebsocketManager

logger = logging.getLogger(__name__)


class WMHFrontendReceiver(BaseWebsocketMsgReceiver):
    def __init__(
        self,
        websocket_manager: WebsocketManager,
        project_manager: ProjectManager,
        realtime_event_hub: RealtimeEventHub,
    ):
        self.websocket_manager = websocket_manager
        self.project_manager = project_manager
        self.realtime_event_hub = realtime_event_hub

    async def process_json_str(self, json_str: str, fromWebsocketId: str):
        m: BackendWebsocketMsgUnion = BackendWebsocketMsgTypeAdapter.validate_json(
            json_str
        )

        if isinstance(m, WebsocketMsgCurrentAddressUpdate):
            self.websocket_manager.update_current_address(m.content, fromWebsocketId)
            return

        if isinstance(m, WebsocketMsgRealtimeUIChange):
            await self._handle_realtime_ui_change(m.content)

    async def on_connect(self, websocket_id: str):
        await self.project_manager.broadcast_all_project_metadata()

    async def _handle_realtime_ui_change(self, content: RealtimeUIChangeContent):
        await self.realtime_event_hub.emit_realtime_delta(
            project_config_id=content.projectConfigId,
            delta=[
                ListenerRealtimeDelta(
                    dependency=content.dependency,
                    value=content.value,
                )
            ],
            metadata=content.metadata,
        )
