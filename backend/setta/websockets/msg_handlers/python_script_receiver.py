import logging

from setta.types.generated.websocket_unions import (
    PythonScriptWebsocketMsgTypeAdapter,
    PythonScriptWebsocketMsgUnion,
)
from setta.types.listener import (
    ListenerErrorContent,
    ListenerRegisterAckContent,
    ListenerRegisterAckStatus,
)
from setta.types.websocket import (
    WebsocketMsgListenerError,
    WebsocketMsgListenerFrontendEmit,
    WebsocketMsgListenerInit,
    WebsocketMsgListenerRegister,
    WebsocketMsgListenerRegisterAck,
)
from setta.websockets.listener_coverage import ListenerCoverageTracker
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.base import BaseWebsocketMsgReceiver
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

logger = logging.getLogger(__name__)


class WMHPythonScriptReceiver(BaseWebsocketMsgReceiver):
    def __init__(
        self,
        websocket_manager,
        listener_registry: ListenerRegistry,
        frontend_sender: WMHFrontendSender,
    ):
        super().__init__(websocket_manager)
        self.listener_registry = listener_registry
        self.frontend_sender = frontend_sender
        self.listener_coverage_tracker = ListenerCoverageTracker()

    async def on_disconnect(self, websocket_id):
        registration = self.listener_registry.get_registration(websocket_id)
        self.listener_registry.remove_registration(websocket_id)
        if registration is not None:
            await self._sync_listener_coverage(registration.project_config_id)

    async def process_json_str(self, json_str, fromWebsocketId):
        message: PythonScriptWebsocketMsgUnion = (
            PythonScriptWebsocketMsgTypeAdapter.validate_json(json_str)
        )

        if isinstance(message, WebsocketMsgListenerInit):
            await self._handle_listener_init(message, fromWebsocketId)
        elif isinstance(message, WebsocketMsgListenerRegister):
            await self._handle_listener_register(message, fromWebsocketId)
        elif isinstance(message, WebsocketMsgListenerFrontendEmit):
            await self._handle_listener_frontend_emit(message, fromWebsocketId)

    async def _handle_listener_init(
        self, message: WebsocketMsgListenerInit, websocket_id: str
    ) -> None:
        project_config_id = message.content.projectConfigId
        self.listener_registry.record_bootstrap(
            websocket_id=websocket_id, project_config_id=project_config_id
        )
        logger.debug(
            "recorded listener bootstrap for websocket %s (project %s)",
            websocket_id,
            project_config_id,
        )

    async def _handle_listener_register(
        self, message: WebsocketMsgListenerRegister, websocket_id: str
    ) -> None:
        previous_registration = self.listener_registry.get_registration(websocket_id)
        registration = self.listener_registry.upsert_registration(
            websocket_id=websocket_id,
            project_config_id=message.content.projectConfigId,
            callbacks=message.content.callbacks,
        )
        bootstrap_project = self.listener_registry.get_bootstrap_project_config(
            websocket_id
        )
        if (bootstrap_project is not None) and (
            bootstrap_project != registration.project_config_id
        ):
            logger.warning(
                (
                    "listener websocket %s registered for project %s but "
                    "bootstrap targeted project %s"
                ),
                websocket_id,
                registration.project_config_id,
                bootstrap_project,
            )
        ack_statuses = {
            callback_id: ListenerRegisterAckStatus(status="accepted")
            for callback_id in message.content.callbacks
        }
        ack_content = ListenerRegisterAckContent(
            projectConfigId=registration.project_config_id,
            callbacks=ack_statuses,
        )
        ack_message = WebsocketMsgListenerRegisterAck(content=ack_content)
        await self.websocket_manager.send_message(ack_message, websocket_id)
        await self._sync_listener_coverage(registration.project_config_id)
        if (
            previous_registration is not None
            and previous_registration.project_config_id
            != registration.project_config_id
        ):
            await self._sync_listener_coverage(previous_registration.project_config_id)

    async def _handle_listener_frontend_emit(
        self, message: WebsocketMsgListenerFrontendEmit, websocket_id: str
    ) -> None:
        registration = self.listener_registry.get_registration(websocket_id)
        if registration is None:
            logger.warning(
                "dropping listener frontend emit for unregistered websocket %s",
                websocket_id,
            )
            error_message = WebsocketMsgListenerError(
                content=ListenerErrorContent(
                    error="listener_not_registered",
                    details={"websocketId": websocket_id},
                )
            )
            await self.websocket_manager.send_message(error_message, websocket_id)
            return
        expected_project_config_id = registration.project_config_id
        project_config_id = message.content.projectConfigId
        if project_config_id != expected_project_config_id:
            logger.warning(
                (
                    "dropping listener frontend emit for websocket %s "
                    "(expected project config %s, got %s)"
                ),
                websocket_id,
                expected_project_config_id,
                project_config_id,
            )
            error_message = WebsocketMsgListenerError(
                content=ListenerErrorContent(
                    error="project_config_mismatch",
                    details={
                        "expectedProjectConfigId": expected_project_config_id,
                        "receivedProjectConfigId": project_config_id,
                    },
                )
            )
            await self.websocket_manager.send_message(error_message, websocket_id)
            return

        await self.frontend_sender.broadcast_listener_emit(
            projectConfigId=project_config_id,
            payload=message.content.payload,
            target=message.content.target,
        )

    async def _sync_listener_coverage(self, project_config_id: str) -> None:
        snapshot = self.listener_coverage_tracker.update_for_project(
            project_config_id,
            self.listener_registry.iter_registrations_for_project(project_config_id),
        )
        if snapshot is not None:
            await self.frontend_sender.broadcast_listener_coverage_snapshot(snapshot)
