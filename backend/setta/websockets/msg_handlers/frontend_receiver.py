import json
from typing import TYPE_CHECKING

from setta.project_state.base_project_manager import BaseProjectManager
from setta.types.dependency_value import DependencyValueType
from setta.types.generated.websocket_unions import (
    BackendWebsocketMsgTypeAdapter,
    BackendWebsocketMsgUnion,
)
from setta.types.id import ID
from setta.types.listener import (
    ListenerRealtimeDelta,
    RealtimeDependencyEventContent,
    RealtimeUIChangeContent,
)
from setta.types.websocket import (
    WebsocketMsg,
    WebsocketMsgCurrentAddressUpdate,
    WebsocketMsgRealtimeDependencyEvent,
    WebsocketMsgRealtimeUIChange,
    WebsocketMsgUISettingRevealResult,
)
from setta.ui_settings.reveal_result_hub import (
    UISettingRevealResultHub,
)
from setta.utils.constants import C
from setta.websockets.binary_frames import decode_binary_frame
from setta.websockets.msg_handlers.base import (
    BaseWebsocketMsgReceiver,
)
from setta.websockets.realtime_event_hub import RealtimeEventHub
from setta.websockets.websocket_manager import WebsocketManager

if TYPE_CHECKING:
    from setta.project_state.share_runtime_state import ShareRuntimeState

_FRONTEND_IDENTITY_MESSAGE_TYPE = "FrontendIdentity"


class WMHFrontendReceiver(BaseWebsocketMsgReceiver):
    def __init__(
        self,
        websocket_manager: WebsocketManager,
        project_manager: BaseProjectManager | None,
        realtime_event_hub: RealtimeEventHub,
        ui_setting_reveal_result_hub: UISettingRevealResultHub,
        *,
        share_mode: bool = False,
        share_runtime_state: "ShareRuntimeState | None" = None,
    ):
        self.websocket_manager = websocket_manager
        self.project_manager = project_manager
        self.realtime_event_hub = realtime_event_hub
        self.ui_setting_reveal_result_hub = ui_setting_reveal_result_hub
        self.share_mode = share_mode
        self.share_runtime_state = share_runtime_state
        if share_mode and share_runtime_state is None:
            raise ValueError("Deployment mode requires deployment runtime state")

    async def process_json_str(self, json_str: str, fromWebsocketId: str):
        raw_message = json.loads(json_str)
        m: BackendWebsocketMsgUnion = BackendWebsocketMsgTypeAdapter.validate_python(
            raw_message
        )

        if isinstance(m, WebsocketMsgUISettingRevealResult):
            share_session_id = (
                self.require_share_session_id(fromWebsocketId)
                if self.share_mode
                else None
            )
            self._require_share_project_config(
                m.content.projectConfigId,
                share_session_id=share_session_id,
            )
            self.ui_setting_reveal_result_hub.resolve(
                m.content,
                from_websocket_id=fromWebsocketId,
            )
            return

        if isinstance(m, WebsocketMsgCurrentAddressUpdate):
            self.websocket_manager.update_current_address(m.content, fromWebsocketId)
            if not self.share_mode:
                await self.websocket_manager.broadcast_connections()
            return

        if isinstance(m, WebsocketMsgRealtimeUIChange):
            share_session_id = (
                self.require_share_session_id(fromWebsocketId)
                if self.share_mode
                else None
            )
            await self._handle_realtime_ui_change(
                m.content, share_session_id=share_session_id
            )
            return

        if isinstance(m, WebsocketMsgRealtimeDependencyEvent):
            share_session_id = (
                self.require_share_session_id(fromWebsocketId)
                if self.share_mode
                else None
            )
            await self._handle_realtime_dependency_event(
                m.content, share_session_id=share_session_id
            )

    async def process_bytes(self, payload: bytes, fromWebsocketId: str):
        header, binary_payload = decode_binary_frame(payload)
        message: BackendWebsocketMsgUnion = (
            BackendWebsocketMsgTypeAdapter.validate_python(header)
        )
        if (
            C.REALTIME_BINARY_MAX_BYTES > 0
            and len(binary_payload) > C.REALTIME_BINARY_MAX_BYTES
        ):
            raise ValueError("Realtime binary payload exceeds size limit.")
        share_session_id = (
            self.require_share_session_id(fromWebsocketId) if self.share_mode else None
        )
        if isinstance(message, WebsocketMsgRealtimeUIChange):
            if message.content.value.type is not DependencyValueType.Binary:
                raise ValueError("Binary realtime UI change requires Binary value.")
            await self._handle_realtime_ui_change(
                message.content,
                share_session_id=share_session_id,
                binary_payload=binary_payload,
            )
            return
        if isinstance(message, WebsocketMsgRealtimeDependencyEvent):
            payload_value = message.content.dependencyEvent.payload
            if (
                payload_value is None
                or payload_value.type is not DependencyValueType.Binary
            ):
                raise ValueError("Binary dependency event requires Binary payload.")
            await self._handle_realtime_dependency_event(
                message.content,
                share_session_id=share_session_id,
                binary_payload=binary_payload,
            )

    async def on_connect(self, _websocket_id: str):
        if self.share_mode:
            self.require_share_session_id(_websocket_id)
        await self.websocket_manager.send_message(
            WebsocketMsg(
                content={"websocketId": _websocket_id},
                messageType=_FRONTEND_IDENTITY_MESSAGE_TYPE,
            ),
            _websocket_id,
        )
        if self.share_mode:
            return
        if self.project_manager is None:
            return
        await self.project_manager.broadcast_all_project_metadata()

    async def _handle_realtime_ui_change(
        self,
        content: RealtimeUIChangeContent,
        *,
        share_session_id: str | None,
        binary_payload: bytes | None = None,
    ):
        self._require_share_project_config(
            content.projectConfigId,
            share_session_id=share_session_id,
        )
        delta = ListenerRealtimeDelta(
            dependency=content.dependencyKey, value=content.value
        )
        if binary_payload is None:
            await self.realtime_event_hub.emit_realtime_delta(
                project_config_id=content.projectConfigId,
                deltas=[delta],
                share_session_id=share_session_id,
            )
            return
        delta.binaryPayload = binary_payload
        await self.realtime_event_hub.emit_realtime_delta_binary(
            project_config_id=content.projectConfigId,
            delta=delta,
            binary_payload=binary_payload,
            share_session_id=share_session_id,
        )

    async def _handle_realtime_dependency_event(
        self,
        content: RealtimeDependencyEventContent,
        *,
        share_session_id: str | None,
        binary_payload: bytes | None = None,
    ) -> None:
        self._require_share_project_config(
            content.projectConfigId,
            share_session_id=share_session_id,
        )
        if binary_payload is None:
            await self.realtime_event_hub.emit_dependency_event(
                project_config_id=content.projectConfigId,
                dependency_events=[content.dependencyEvent],
                share_session_id=share_session_id,
            )
            return
        content.dependencyEvent.binaryPayload = binary_payload
        await self.realtime_event_hub.emit_dependency_event_binary(
            project_config_id=content.projectConfigId,
            dependency_event=content.dependencyEvent,
            binary_payload=binary_payload,
            share_session_id=share_session_id,
        )

    def _require_share_project_config(
        self,
        project_config_id: ID,
        *,
        share_session_id: str | None,
    ) -> None:
        if not self.share_mode:
            return
        if share_session_id is None:
            raise KeyError("Missing share session id")
        if self.share_runtime_state is None:
            raise KeyError("Missing share runtime state")
        session_backend = self.share_runtime_state.get_session_backend(share_session_id)
        if project_config_id not in session_backend.projectConfigs:
            raise KeyError(f"Unknown share project config: {project_config_id}")
