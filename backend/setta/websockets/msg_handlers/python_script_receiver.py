import logging

from setta.listeners.listener_frontend_emit_resolver import (
    InvalidListenerDependencyValueError,
    ListenerFrontendEmitResolver,
    ListenerFrontendEmitResolverError,
    UnknownListenerDependencyError,
    UnsupportedListenerDependencyError,
)
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.types.generated.websocket_unions import (
    PythonScriptWebsocketMsgTypeAdapter,
    PythonScriptWebsocketMsgUnion,
)
from setta.types.helpers_lvl2 import ProjectNotFound
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
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender

logger = logging.getLogger(__name__)


class WMHPythonScriptReceiver(BaseWebsocketMsgReceiver):
    def __init__(
        self,
        websocket_manager,
        listener_registry: ListenerRegistry,
        frontend_sender: WMHFrontendSender,
        python_script_sender: WMHPythonScriptSender,
        project_manager_switcher: ProjectManagerSwitcher,
    ):
        super().__init__(websocket_manager)
        self.listener_registry = listener_registry
        self.frontend_sender = frontend_sender
        self.python_script_sender = python_script_sender
        self.project_manager_switcher = project_manager_switcher
        self.listener_coverage_tracker = ListenerCoverageTracker()
        self.listener_frontend_emit_resolver = ListenerFrontendEmitResolver()

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
        project_name = message.content.projectName

        if project_config_id is None:
            if project_name is None:
                logger.warning(
                    "listener websocket %s missing both project config id and project name",
                    websocket_id,
                )
                error_message = WebsocketMsgListenerError(
                    content=ListenerErrorContent(
                        error="project_state_unavailable",
                        details={"websocketId": websocket_id},
                    )
                )
                await self.websocket_manager.send_message(error_message, websocket_id)
                return
            try:
                project_config_id = self.project_manager_switcher.get_config_id_by_name(
                    project_name
                )
            except ProjectNotFound:
                logger.warning(
                    "failed to resolve project name %s for listener websocket %s",
                    project_name,
                    websocket_id,
                )
                error_message = WebsocketMsgListenerError(
                    content=ListenerErrorContent(
                        error="project_state_unavailable",
                        details={"projectName": project_name},
                    )
                )
                await self.websocket_manager.send_message(error_message, websocket_id)
                return
        elif project_name is not None:
            try:
                resolved_id = self.project_manager_switcher.get_config_id_by_name(
                    project_name
                )
            except ProjectNotFound:
                logger.warning(
                    "listener websocket %s provided projectConfigId %s with unknown project name %s",
                    websocket_id,
                    project_config_id,
                    project_name,
                )
            else:
                if resolved_id != project_config_id:
                    logger.warning(
                        (
                            "listener websocket %s provided projectConfigId %s but "
                            "name %s resolved to %s; using provided id"
                        ),
                        websocket_id,
                        project_config_id,
                        project_name,
                        resolved_id,
                    )

        self.listener_registry.record_bootstrap(
            websocket_id=websocket_id, project_config_id=project_config_id
        )
        logger.debug(
            "recorded listener bootstrap for websocket %s (project %s)",
            websocket_id,
            project_config_id,
        )
        try:
            manager = self.project_manager_switcher.get(project_config_id)
            project_state = manager.get_single_config_state(project_config_id)
        except KeyError:
            logger.warning(
                "failed to load project state for listener websocket %s (project %s)",
                websocket_id,
                project_config_id,
            )
            error_message = WebsocketMsgListenerError(
                content=ListenerErrorContent(
                    error="project_state_unavailable",
                    details={"projectConfigId": project_config_id},
                )
            )
            await self.websocket_manager.send_message(error_message, websocket_id)
            return
        except Exception:
            logger.exception(
                "unexpected error while preparing bootstrap snapshot for listener websocket %s (project %s)",
                websocket_id,
                project_config_id,
            )
            error_message = WebsocketMsgListenerError(
                content=ListenerErrorContent(
                    error="project_state_unavailable",
                    details={"projectConfigId": project_config_id},
                )
            )
            await self.websocket_manager.send_message(error_message, websocket_id)
            return

        await self.python_script_sender.send_force_refresh(
            projectState=project_state,
            targetWebsocketIds=(websocket_id,),
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

        try:
            manager = self.project_manager_switcher.get(project_config_id)
            project_state = manager.get_single_config_state(project_config_id)
        except KeyError:
            logger.warning(
                "failed to load project state for listener emit (project %s)",
                project_config_id,
            )
            error_message = WebsocketMsgListenerError(
                content=ListenerErrorContent(
                    error="project_state_unavailable",
                    details={"projectConfigId": project_config_id},
                )
            )
            await self.websocket_manager.send_message(error_message, websocket_id)
            return
        except Exception:
            logger.exception(
                "unexpected error while loading project state for listener emit "
                "(project %s)",
                project_config_id,
            )
            error_message = WebsocketMsgListenerError(
                content=ListenerErrorContent(
                    error="project_state_unavailable",
                    details={"projectConfigId": project_config_id},
                )
            )
            await self.websocket_manager.send_message(error_message, websocket_id)
            return

        try:
            resolved_dependency_values = self.listener_frontend_emit_resolver.resolve(
                project_state=project_state,
                dependency_values=message.content.dependencyValues,
            )
        except UnknownListenerDependencyError as exc:
            logger.warning(
                "listener emit referenced unknown dependency %s",
                exc.dependency_name,
            )
            error_message = WebsocketMsgListenerError(
                content=ListenerErrorContent(
                    error="listener_emit_unknown_dependency",
                    details={"dependencyName": exc.dependency_name},
                )
            )
            await self.websocket_manager.send_message(error_message, websocket_id)
            return
        except InvalidListenerDependencyValueError as exc:
            logger.warning(
                "listener emit provided invalid value for %s", exc.dependency_name
            )
            error_message = WebsocketMsgListenerError(
                content=ListenerErrorContent(
                    error="listener_emit_invalid_value",
                    details={
                        "dependencyName": exc.dependency_name,
                        "expectedType": exc.expected_type.value,
                    },
                )
            )
            await self.websocket_manager.send_message(error_message, websocket_id)
            return
        except UnsupportedListenerDependencyError as exc:
            logger.warning(
                "listener emit targeted unsupported dependency %s", exc.dependency_name
            )
            error_message = WebsocketMsgListenerError(
                content=ListenerErrorContent(
                    error="listener_emit_unsupported_dependency",
                    details={
                        "dependencyName": exc.dependency_name,
                        "reason": exc.reason,
                    },
                )
            )
            await self.websocket_manager.send_message(error_message, websocket_id)
            return
        except ListenerFrontendEmitResolverError:
            logger.exception("listener emit resolver failed")
            error_message = WebsocketMsgListenerError(
                content=ListenerErrorContent(
                    error="listener_emit_failed",
                    details=None,
                )
            )
            await self.websocket_manager.send_message(error_message, websocket_id)
            return
        except ValueError as exc:
            logger.warning("invalid listener emit payload: %s", exc)
            error_message = WebsocketMsgListenerError(
                content=ListenerErrorContent(
                    error="listener_emit_invalid_payload",
                    details={"message": str(exc)},
                )
            )
            await self.websocket_manager.send_message(error_message, websocket_id)
            return

        await self.frontend_sender.broadcast_listener_emit(
            projectConfigId=project_config_id,
            dependencyValues=resolved_dependency_values,
        )

    async def _sync_listener_coverage(self, project_config_id: str) -> None:
        snapshot = self.listener_coverage_tracker.update_for_project(
            project_config_id,
            self.listener_registry.iter_registrations_for_project(project_config_id),
        )
        if snapshot is not None:
            await self.frontend_sender.broadcast_listener_coverage_snapshot(snapshot)
