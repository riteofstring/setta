from setta.project_state.base_project_manager import BaseProjectManager
from setta.types.generated.websocket_unions import (
    BackendWebsocketMsgTypeAdapter,
    BackendWebsocketMsgUnion,
)
from setta.types.listener import (
    ListenerRealtimeDelta,
    RealtimeActionEventContent,
    RealtimeUIChangeContent,
)
from setta.types.websocket import (
    WebsocketMsgCurrentAddressUpdate,
    WebsocketMsgRealtimeActionEvent,
    WebsocketMsgRealtimeUIChange,
)
from setta.websockets.msg_handlers.base import (
    BaseWebsocketMsgReceiver,
)
from setta.websockets.realtime_event_hub import RealtimeEventHub
from setta.websockets.websocket_manager import WebsocketManager


class WMHFrontendReceiver(BaseWebsocketMsgReceiver):
    def __init__(
        self,
        websocket_manager: WebsocketManager,
        project_manager: BaseProjectManager | None,
        realtime_event_hub: RealtimeEventHub,
        *,
        share_mode: bool = False,
    ):
        self.websocket_manager = websocket_manager
        self.project_manager = project_manager
        self.realtime_event_hub = realtime_event_hub
        self.share_mode = share_mode

    def _require_share_session_id(self, websocket_id: str) -> str:
        share_session_id = self.websocket_manager.get_share_session_id(websocket_id)
        if share_session_id is None:
            raise KeyError(f"Missing share session id for websocket {websocket_id}")
        return share_session_id

    async def process_json_str(self, json_str: str, fromWebsocketId: str):
        m: BackendWebsocketMsgUnion = BackendWebsocketMsgTypeAdapter.validate_json(
            json_str
        )

        if isinstance(m, WebsocketMsgCurrentAddressUpdate):
            self.websocket_manager.update_current_address(m.content, fromWebsocketId)
            return

        if isinstance(m, WebsocketMsgRealtimeUIChange):
            share_session_id = (
                self._require_share_session_id(fromWebsocketId)
                if self.share_mode
                else None
            )
            await self._handle_realtime_ui_change(
                m.content, share_session_id=share_session_id
            )
            return

        if isinstance(m, WebsocketMsgRealtimeActionEvent):
            share_session_id = (
                self._require_share_session_id(fromWebsocketId)
                if self.share_mode
                else None
            )
            await self._handle_realtime_action_event(
                m.content, share_session_id=share_session_id
            )

    async def on_connect(self, _websocket_id: str):
        if self.share_mode:
            self._require_share_session_id(_websocket_id)
            return
        if self.project_manager is None:
            return
        await self.project_manager.broadcast_all_project_metadata()

    async def _handle_realtime_ui_change(
        self,
        content: RealtimeUIChangeContent,
        *,
        share_session_id: str | None,
    ):
        delta = ListenerRealtimeDelta(
            dependency=content.dependencyKey, value=content.value
        )
        await self.realtime_event_hub.emit_realtime_delta(
            project_config_id=content.projectConfigId,
            deltas=[delta],
            share_session_id=share_session_id,
        )

    async def _handle_realtime_action_event(
        self,
        content: RealtimeActionEventContent,
        *,
        share_session_id: str | None,
    ) -> None:
        await self.realtime_event_hub.emit_action_event(
            project_config_id=content.projectConfigId,
            action_events=[content.actionEvent],
            share_session_id=share_session_id,
        )
