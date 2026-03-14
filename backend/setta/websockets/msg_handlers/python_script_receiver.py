import inspect
import logging
from typing import TYPE_CHECKING

from pydantic import ValidationError

from setta.code_gen.dependency_graph import DependencyGraph
from setta.database.db_objs import DBE
from setta.listeners.listener_frontend_emit_resolver import (
    InvalidListenerArtifactUpdateError,
    InvalidListenerDependencyValueError,
    ListenerFrontendEmitResolver,
    ListenerFrontendEmitResolverError,
    UnknownListenerDependencyError,
    UnsupportedListenerArtifactUpdateError,
    UnsupportedListenerDependencyError,
)
from setta.listeners.listener_router_endpoint_registry import (
    get_listener_router_endpoint_specs,
)
from setta.mcp.utils import (
    IDDoesNotExist,
    convert_canonical_ids_to_temporary,
    convert_temporary_ids_to_canonical,
)
from setta.project_state.listener_artifact_updates import (
    ListenerArtifactUpdateError,
)
from setta.project_state.listener_dependency_updates import (
    ListenerDependencyUpdateError,
)
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.runtime.context import RuntimeContext
from setta.types.generated.unions import BaseArtifactUnionWithDiscriminator
from setta.types.generated.websocket_unions import (
    PythonScriptWebsocketMsgTypeAdapter,
    PythonScriptWebsocketMsgUnion,
)
from setta.types.helpers_lvl2 import ProjectNotFound
from setta.types.id import (
    ID,
    CanonicalToTemporaryIDMap,
    TemporaryToCanonicalIDMap,
)
from setta.types.listener import (
    ListenerErrorContent,
    ListenerFrontendEmitKeyAndValue,
    ListenerRegisterAckContent,
    ListenerRegisterAckStatus,
    ListenerRouterEndpointResultContent,
)
from setta.types.notifications import SettaBackendLogEventSeverity
from setta.types.websocket import (
    WebsocketMsgListenerError,
    WebsocketMsgListenerFrontendEmit,
    WebsocketMsgListenerInit,
    WebsocketMsgListenerRegister,
    WebsocketMsgListenerRegisterAck,
    WebsocketMsgListenerRouterEndpointCall,
    WebsocketMsgListenerRouterEndpointResult,
)
from setta.websockets.listener_coverage import ListenerCoverageTracker
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.base import BaseWebsocketMsgReceiver
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender

if TYPE_CHECKING:
    from setta.project_state.base_project_manager import BaseProjectManager

logger = logging.getLogger(__name__)


class WMHPythonScriptReceiver(BaseWebsocketMsgReceiver):
    def __init__(
        self,
        websocket_manager,
        listener_registry: ListenerRegistry,
        frontend_sender: WMHFrontendSender,
        python_script_sender: WMHPythonScriptSender,
        project_manager_switcher: ProjectManagerSwitcher,
        dbe: DBE,
    ):
        super().__init__(websocket_manager)
        self.listener_registry = listener_registry
        self.frontend_sender = frontend_sender
        self.python_script_sender = python_script_sender
        self.project_manager_switcher = project_manager_switcher
        self.dbe = dbe
        self.listener_coverage_tracker = ListenerCoverageTracker()
        self.listener_frontend_emit_resolver = ListenerFrontendEmitResolver()
        self._temporary_id_map_mtime_ns: int | None = None
        self._temporary_to_canonical: TemporaryToCanonicalIDMap = {}
        self._canonical_to_temporary: CanonicalToTemporaryIDMap = {}

    def _get_share_session_id_for_socket(self, websocket_id: str) -> str | None:
        state = self._get_listener_state(websocket_id)
        if not state.deployment_mode:
            return None
        return self.require_share_session_id(websocket_id)

    def _get_session_manager(
        self,
        websocket_id: str,
        *,
        share_session_id: str | None,
        project_config_id: ID | None = None,
    ) -> "BaseProjectManager":
        state = self._get_listener_state(websocket_id)
        if state.deployment_mode:
            if share_session_id is None:
                share_session_id = self.require_share_session_id(websocket_id)
            return self.project_manager_switcher.get_for_session(share_session_id)
        if project_config_id is None:
            return self.project_manager_switcher.main
        return self.project_manager_switcher.get(project_config_id)

    @staticmethod
    def _format_listener_error_message(
        *,
        websocket_id: str,
        error: str,
        details: dict[str, object],
        project_config_id: ID | None,
    ) -> str:
        pairs: list[str] = [f"listenerWebsocketId={websocket_id}"]
        if project_config_id is not None:
            pairs.append(f"projectConfigId={project_config_id}")
        for key in sorted(details):
            value = details[key]
            if isinstance(value, (str, int, float, bool)):
                pairs.append(f"{key}={value}")
        suffix = f" ({' '.join(pairs)})"
        return f"Listener error: {error}{suffix}"

    async def _send_listener_error(
        self,
        websocket_id: str,
        *,
        error: str,
        details: dict[str, object],
        project_config_id: ID | None = None,
        severity: SettaBackendLogEventSeverity = SettaBackendLogEventSeverity.error,
        share_session_id: str | None = None,
    ) -> None:
        content = ListenerErrorContent(error=error, details=details)
        if self.listener_registry.use_temporary_ids_for_socket(websocket_id):
            content = self._convert_outgoing_payload(content)
        await self.websocket_manager.send_message(
            WebsocketMsgListenerError(content=content),
            websocket_id,
        )
        message = self._format_listener_error_message(
            websocket_id=websocket_id,
            error=error,
            details=details,
            project_config_id=project_config_id,
        )
        await self.frontend_sender.log_and_broadcast_backend_log_event(
            message,
            severity=severity,
            project_config_id=project_config_id,
            share_session_id=share_session_id,
        )

    async def on_disconnect(self, websocket_id):
        registration = self.listener_registry.get_registration(websocket_id)
        self.listener_registry.remove_registration(websocket_id)
        if registration is not None:
            await self._sync_listener_coverage(
                registration.project_config_id,
                share_session_id=registration.share_session_id,
            )

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
        elif isinstance(message, WebsocketMsgListenerRouterEndpointCall):
            await self._handle_listener_router_endpoint_call(message, fromWebsocketId)

    async def _handle_listener_init(
        self, message: WebsocketMsgListenerInit, websocket_id: str
    ) -> None:
        project_config_id = message.content.projectConfigId
        project_name = message.content.projectName
        use_temporary_ids = message.content.useTemporaryIds
        share_session_id = self._get_share_session_id_for_socket(websocket_id)
        if project_config_id is not None and use_temporary_ids:
            try:
                project_config_id = self._convert_incoming_payload(project_config_id)
            except IDDoesNotExist as exc:
                logger.warning(
                    "listener websocket %s provided unknown temporary id %s",
                    websocket_id,
                    project_config_id,
                )
                await self._send_listener_error(
                    websocket_id,
                    error="listener_invalid_id",
                    details={"message": str(exc)},
                    share_session_id=share_session_id,
                )
                return
        if project_config_id is None:
            if project_name is not None:
                try:
                    project_config_id = (
                        self.project_manager_switcher.get_config_id_by_name(
                            project_name,
                            share_session_id=share_session_id,
                        )
                    )
                except ProjectNotFound:
                    logger.warning(
                        "failed to resolve project name %s for listener websocket %s",
                        project_name,
                        websocket_id,
                    )
                    await self._send_listener_error(
                        websocket_id,
                        error="project_state_unavailable",
                        details={"projectName": project_name},
                        share_session_id=share_session_id,
                    )
                    return
            else:
                try:
                    manager = self._get_session_manager(
                        websocket_id, share_session_id=share_session_id
                    )
                    project_config_id = (
                        manager.project_state_backend.defaultProjectConfigId
                    )
                except Exception as exc:
                    logger.warning(
                        "listener websocket %s missing project config defaults",
                        websocket_id,
                    )
                    await self._send_listener_error(
                        websocket_id,
                        error="project_state_unavailable",
                        details={"message": str(exc)},
                        share_session_id=share_session_id,
                    )
                    return
        if project_config_id is None:
            await self._send_listener_error(
                websocket_id,
                error="project_state_unavailable",
                details={"websocketId": websocket_id},
                share_session_id=share_session_id,
            )
            return
        if project_name is not None:
            try:
                resolved_id = self.project_manager_switcher.get_config_id_by_name(
                    project_name,
                    share_session_id=share_session_id,
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
            websocket_id=websocket_id,
            project_config_id=project_config_id,
            use_temporary_ids=use_temporary_ids,
            share_session_id=share_session_id,
        )
        logger.debug(
            "recorded listener bootstrap for websocket %s (project %s)",
            websocket_id,
            project_config_id,
        )
        try:
            manager = self._get_session_manager(
                websocket_id,
                share_session_id=share_session_id,
                project_config_id=project_config_id,
            )
            project_state = manager.get_single_config_state(project_config_id)
        except KeyError:
            logger.warning(
                "failed to load project state for listener websocket %s (project %s)",
                websocket_id,
                project_config_id,
            )
            await self._send_listener_error(
                websocket_id,
                error="project_state_unavailable",
                details={"projectConfigId": project_config_id},
                project_config_id=project_config_id,
                share_session_id=share_session_id,
            )
            return

        await self.python_script_sender.send_force_refresh(
            projectState=project_state,
            targetWebsocketIds=(websocket_id,),
            share_session_id=share_session_id,
        )

    async def _handle_listener_register(
        self, message: WebsocketMsgListenerRegister, websocket_id: str
    ) -> None:
        previous_registration = self.listener_registry.get_registration(websocket_id)
        content = message.content
        share_session_id = self._get_share_session_id_for_socket(websocket_id)
        if self.listener_registry.use_temporary_ids_for_socket(websocket_id):
            try:
                content = self._convert_incoming_payload(content)
            except IDDoesNotExist as exc:
                logger.warning(
                    "listener websocket %s register payload had unknown temporary id",
                    websocket_id,
                )
                await self._send_listener_error(
                    websocket_id,
                    error="listener_invalid_id",
                    details={"message": str(exc)},
                    share_session_id=share_session_id,
                )
                return
        registration = self.listener_registry.upsert_registration(
            websocket_id=websocket_id,
            project_config_id=content.projectConfigId,
            callbacks=content.callbacks,
            share_session_id=share_session_id,
        )
        bootstrap_project = self.listener_registry.get_bootstrap_project_config(
            websocket_id
        )
        bootstrap_session = self.listener_registry.get_bootstrap_share_session_id(
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
        if (bootstrap_session is not None) and (
            bootstrap_session != registration.share_session_id
        ):
            logger.warning(
                (
                    "listener websocket %s registered for share session %s but "
                    "bootstrap targeted session %s"
                ),
                websocket_id,
                registration.share_session_id,
                bootstrap_session,
            )
        ack_statuses = {
            callback_id: ListenerRegisterAckStatus(status="accepted")
            for callback_id in content.callbacks
        }
        ack_content = ListenerRegisterAckContent(
            projectConfigId=registration.project_config_id,
            callbacks=ack_statuses,
        )
        if self.listener_registry.use_temporary_ids_for_socket(websocket_id):
            ack_content = self._convert_outgoing_payload(ack_content)
        ack_message = WebsocketMsgListenerRegisterAck(content=ack_content)
        await self.websocket_manager.send_message(ack_message, websocket_id)
        await self._sync_listener_coverage(
            registration.project_config_id,
            share_session_id=registration.share_session_id,
        )
        if (
            previous_registration is not None
            and previous_registration.project_config_id
            != registration.project_config_id
        ):
            await self._sync_listener_coverage(
                previous_registration.project_config_id,
                share_session_id=previous_registration.share_session_id,
            )

    async def _handle_listener_frontend_emit(
        self, message: WebsocketMsgListenerFrontendEmit, websocket_id: str
    ) -> None:
        registration = self.listener_registry.get_registration(websocket_id)
        if registration is None:
            logger.warning(
                "dropping listener frontend emit for unregistered websocket %s",
                websocket_id,
            )
            await self._send_listener_error(
                websocket_id,
                error="listener_not_registered",
                details={"websocketId": websocket_id},
            )
            return
        share_session_id = registration.share_session_id
        content = message.content
        if self.listener_registry.use_temporary_ids_for_socket(websocket_id):
            try:
                content = self._convert_incoming_payload(content)
            except IDDoesNotExist as exc:
                logger.warning(
                    "listener websocket %s emit payload had unknown temporary id",
                    websocket_id,
                )
                await self._send_listener_error(
                    websocket_id,
                    error="listener_invalid_id",
                    details={"message": str(exc)},
                    share_session_id=share_session_id,
                )
                return
        expected_project_config_id = registration.project_config_id
        project_config_id = content.projectConfigId
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
            await self._send_listener_error(
                websocket_id,
                error="project_config_mismatch",
                details={
                    "expectedProjectConfigId": expected_project_config_id,
                    "receivedProjectConfigId": project_config_id,
                },
                project_config_id=expected_project_config_id,
                share_session_id=share_session_id,
            )
            return

        state = self._get_listener_state(websocket_id)
        if state.deployment_mode and share_session_id is None:
            await self._send_listener_error(
                websocket_id,
                error="share_session_missing",
                details={"websocketId": websocket_id},
                project_config_id=project_config_id,
                share_session_id=share_session_id,
            )
            return

        dependency_values = content.dependencyValues
        artifact_updates = content.artifactUpdates
        if not dependency_values and not artifact_updates:
            logger.warning(
                "listener emit rejected due to empty dependency/artifact payload"
            )
            await self._send_listener_error(
                websocket_id,
                error="listener_emit_invalid_payload",
                details={
                    "message": "listener emits require dependencyValues or artifactUpdates"
                },
                project_config_id=project_config_id,
                share_session_id=share_session_id,
            )
            return

        async def _resolve_emits_for_state(
            *,
            dependency_graph: DependencyGraph,
            artifacts,
        ) -> (
            tuple[
                list[ListenerFrontendEmitKeyAndValue],
                list[BaseArtifactUnionWithDiscriminator],
            ]
            | None
        ):
            try:
                resolved_dependency_values = (
                    self.listener_frontend_emit_resolver.resolve(
                        dependency_values=dependency_values,
                        dependency_graph=dependency_graph,
                    )
                )
                resolved_artifact_updates = (
                    self.listener_frontend_emit_resolver.resolve_artifact_updates(
                        artifact_updates=artifact_updates,
                        artifacts=artifacts,
                    )
                )
            except UnknownListenerDependencyError as exc:
                logger.warning(
                    "listener emit referenced unknown dependency %s",
                    exc.dependency_name,
                )
                await self._send_listener_error(
                    websocket_id,
                    error="listener_emit_unknown_dependency",
                    details={"dependencyName": exc.dependency_name},
                    project_config_id=project_config_id,
                    share_session_id=share_session_id,
                )
                return None
            except InvalidListenerDependencyValueError as exc:
                logger.warning(
                    "listener emit provided invalid value for %s",
                    exc.dependency_name,
                )
                await self._send_listener_error(
                    websocket_id,
                    error="listener_emit_invalid_value",
                    details={
                        "dependencyName": exc.dependency_name,
                        "expectedType": exc.expected_type.value,
                    },
                    project_config_id=project_config_id,
                    share_session_id=share_session_id,
                )
                return None
            except UnsupportedListenerDependencyError as exc:
                logger.warning(
                    "listener emit targeted unsupported dependency %s",
                    exc.dependency_name,
                )
                await self._send_listener_error(
                    websocket_id,
                    error="listener_emit_unsupported_dependency",
                    details={
                        "dependencyName": exc.dependency_name,
                        "reason": exc.reason,
                    },
                    project_config_id=project_config_id,
                    share_session_id=share_session_id,
                )
                return None
            except InvalidListenerArtifactUpdateError as exc:
                logger.warning(
                    "listener emit provided invalid artifact update for %s", exc.path
                )
                await self._send_listener_error(
                    websocket_id,
                    error="listener_emit_invalid_artifact_update",
                    details={
                        "path": exc.path,
                        "message": exc.message,
                    },
                    project_config_id=project_config_id,
                    share_session_id=share_session_id,
                )
                return None
            except UnsupportedListenerArtifactUpdateError as exc:
                logger.warning(
                    "listener emit targeted unsupported artifact update for %s",
                    exc.path,
                )
                await self._send_listener_error(
                    websocket_id,
                    error="listener_emit_unsupported_artifact_update",
                    details={"path": exc.path, "reason": exc.reason},
                    project_config_id=project_config_id,
                    share_session_id=share_session_id,
                )
                return None
            except ListenerFrontendEmitResolverError as exc:
                logger.exception("listener emit resolver failed")
                await self._send_listener_error(
                    websocket_id,
                    error="listener_emit_failed",
                    details={"message": str(exc)},
                    project_config_id=project_config_id,
                    share_session_id=share_session_id,
                )
                return None
            except ValueError as exc:
                logger.warning("invalid listener emit payload: %s", exc)
                await self._send_listener_error(
                    websocket_id,
                    error="listener_emit_invalid_payload",
                    details={"message": str(exc)},
                    project_config_id=project_config_id,
                    share_session_id=share_session_id,
                )
                return None
            return resolved_dependency_values, resolved_artifact_updates

        try:
            manager = self._get_session_manager(
                websocket_id,
                share_session_id=share_session_id,
                project_config_id=project_config_id,
            )
            project_state = manager.get_single_config_state(project_config_id)
        except KeyError as exc:
            logger.warning(
                "failed to load state for listener emit (project %s)",
                project_config_id,
            )
            await self._send_listener_error(
                websocket_id,
                error="project_state_unavailable",
                details={"message": str(exc)},
                project_config_id=project_config_id,
                share_session_id=share_session_id,
            )
            return

        if project_config_id in manager.gen_code:
            dependency_graph = manager.gen_code[project_config_id].dep_graph
        else:
            dependency_graph = DependencyGraph(project_state)
        resolved = await _resolve_emits_for_state(
            dependency_graph=dependency_graph,
            artifacts=manager.artifacts,
        )
        if resolved is None:
            return
        resolved_dependency_values, resolved_artifact_updates = resolved

        try:
            await manager.apply_listener_emit_updates(
                projectConfigId=project_config_id,
                dependency_updates=resolved_dependency_values,
                artifact_updates=resolved_artifact_updates,
            )
        except ListenerArtifactUpdateError as exc:
            logger.warning("listener emit artifact updates failed: %s", exc)
            await self._send_listener_error(
                websocket_id,
                error="listener_emit_artifact_update_failed",
                details={"message": str(exc)},
                project_config_id=project_config_id,
                share_session_id=share_session_id,
            )
        except ListenerDependencyUpdateError as exc:
            logger.warning("listener emit failed to apply: %s", exc)
            await self._send_listener_error(
                websocket_id,
                error="listener_emit_failed",
                details={"message": str(exc)},
                project_config_id=project_config_id,
                share_session_id=share_session_id,
            )

    async def _handle_listener_router_endpoint_call(
        self, message: WebsocketMsgListenerRouterEndpointCall, websocket_id: str
    ) -> None:
        registration = self.listener_registry.get_registration(websocket_id)
        if registration is None:
            logger.warning(
                "dropping listener router endpoint call for unregistered websocket %s",
                websocket_id,
            )
            await self._send_router_endpoint_result(
                websocket_id,
                project_config_id=message.content.projectConfigId,
                call_id=message.content.callId,
                ok=False,
                error="listener_not_registered",
                details={"websocketId": websocket_id},
            )
            return
        content = message.content
        raw_project_config_id = content.projectConfigId
        use_temporary_ids = self.listener_registry.use_temporary_ids_for_socket(
            websocket_id
        )
        if use_temporary_ids:
            try:
                content = self._convert_incoming_payload(content)
            except IDDoesNotExist as exc:
                logger.warning(
                    "listener websocket %s call payload had unknown temporary id",
                    websocket_id,
                )
                await self._send_router_endpoint_result(
                    websocket_id,
                    project_config_id=registration.project_config_id,
                    call_id=message.content.callId,
                    ok=False,
                    error="listener_invalid_id",
                    details={"message": str(exc)},
                )
                return
        expected_project_config_id = registration.project_config_id
        project_config_id = content.projectConfigId
        if project_config_id != expected_project_config_id:
            logger.warning(
                (
                    "dropping listener router endpoint call for websocket %s "
                    "(expected project config %s, got %s)"
                ),
                websocket_id,
                expected_project_config_id,
                project_config_id,
            )
            await self._send_router_endpoint_result(
                websocket_id,
                project_config_id=expected_project_config_id,
                call_id=content.callId,
                ok=False,
                error="project_config_mismatch",
                details={
                    "expectedProjectConfigId": expected_project_config_id,
                    "receivedProjectConfigId": project_config_id,
                },
            )
            return

        endpoint_name = content.endpointName
        if not endpoint_name:
            await self._send_router_endpoint_result(
                websocket_id,
                project_config_id=project_config_id,
                call_id=content.callId,
                ok=False,
                error="listener_call_invalid_operation",
                details={"message": "endpointName must be non-empty"},
            )
            return

        payload = content.payload

        try:
            result = await self._dispatch_listener_router_endpoint_call(
                project_config_id=project_config_id,
                endpoint_name=endpoint_name,
                payload=payload,
                websocket_id=websocket_id,
                temporary_project_config_id=(
                    raw_project_config_id if use_temporary_ids else None
                ),
            )
        except IDDoesNotExist as exc:
            await self._send_router_endpoint_result(
                websocket_id,
                project_config_id=project_config_id,
                call_id=content.callId,
                ok=False,
                error="listener_invalid_id",
                details={"message": str(exc)},
            )
            return
        except ValidationError as exc:
            await self._send_router_endpoint_result(
                websocket_id,
                project_config_id=project_config_id,
                call_id=content.callId,
                ok=False,
                error="listener_call_invalid_payload",
                details={"message": str(exc)},
            )
            return
        except ValueError as exc:
            error_code = (
                "project_config_mismatch"
                if str(exc) == "project_config_mismatch"
                else "listener_call_failed"
            )
            await self._send_router_endpoint_result(
                websocket_id,
                project_config_id=project_config_id,
                call_id=content.callId,
                ok=False,
                error=error_code,
                details={"message": str(exc)},
            )
            return
        except Exception as exc:
            logger.exception("listener router endpoint call failed")
            await self._send_router_endpoint_result(
                websocket_id,
                project_config_id=project_config_id,
                call_id=content.callId,
                ok=False,
                error="listener_call_failed",
                details={"message": str(exc)},
            )
            return

        await self._send_router_endpoint_result(
            websocket_id,
            project_config_id=project_config_id,
            call_id=content.callId,
            ok=True,
            result=result,
        )

    async def _dispatch_listener_router_endpoint_call(
        self,
        *,
        project_config_id: ID,
        endpoint_name: str,
        payload: dict[str, object],
        websocket_id: str,
        temporary_project_config_id: ID | None = None,
    ) -> object:
        specs = get_listener_router_endpoint_specs()
        if endpoint_name not in specs:
            state = self._get_listener_state(websocket_id)
            await state.wait_until_ready()
            payload_data = self._prepare_listener_router_payload_data(
                websocket_id=websocket_id,
                payload=payload,
                project_config_id=project_config_id,
                temporary_project_config_id=temporary_project_config_id,
                has_project_context=True,
            )
            try:
                return state.plugin_manager.invoke_listener_endpoint(
                    endpoint_name=endpoint_name,
                    payload=payload_data,
                )
            except KeyError as exc:
                raise ValueError(f"unknown listener endpoint: {endpoint_name}") from exc

        spec = specs[endpoint_name]
        state = self._get_listener_state(websocket_id)
        await state.wait_until_ready()

        has_project_context = "projectConfigId" in spec.request_model.model_fields
        payload_data = self._prepare_listener_router_payload_data(
            websocket_id=websocket_id,
            payload=payload,
            project_config_id=project_config_id,
            temporary_project_config_id=temporary_project_config_id,
            has_project_context=has_project_context,
        )

        request_model = spec.request_model(**payload_data)

        kwargs: dict[str, object] = {spec.request_param_name: request_model}
        if spec.state_param_name is not None:
            kwargs[spec.state_param_name] = state
        if spec.runtime_context_param_name is not None:
            share_session_id = self._get_share_session_id_for_socket(websocket_id)
            kwargs[spec.runtime_context_param_name] = RuntimeContext(
                state,
                share_session_id=share_session_id,
            )

        result = spec.endpoint(**kwargs)
        if inspect.isawaitable(result):
            return await result
        return result

    def _prepare_listener_router_payload_data(
        self,
        *,
        websocket_id: str,
        payload: dict[str, object],
        project_config_id: ID,
        temporary_project_config_id: ID | None,
        has_project_context: bool,
    ) -> dict[str, object]:
        use_temporary_ids = self.listener_registry.use_temporary_ids_for_socket(
            websocket_id
        )
        payload_data = dict(payload)
        if "projectConfigId" not in payload_data and has_project_context:
            if use_temporary_ids:
                if temporary_project_config_id is None:
                    raise ValueError("project_config_mismatch")
                payload_data["projectConfigId"] = temporary_project_config_id
            else:
                payload_data["projectConfigId"] = project_config_id
        if use_temporary_ids:
            payload_data = self._convert_incoming_payload(payload_data)
        if has_project_context:
            payload_project_config_id = payload_data.get("projectConfigId")
            if payload_project_config_id != project_config_id:
                raise ValueError("project_config_mismatch")
        return payload_data

    def _get_listener_state(self, websocket_id: str):
        if websocket_id not in self.websocket_manager.sockets:
            raise KeyError(f"unknown websocket id: {websocket_id}")
        socket_info = self.websocket_manager.sockets[websocket_id]
        return socket_info.websocket.app.state.setta

    async def _send_router_endpoint_result(
        self,
        websocket_id: str,
        *,
        project_config_id: ID,
        call_id: str,
        ok: bool,
        result: object | None = None,
        error: str | None = None,
        details: dict[str, object] | None = None,
    ) -> None:
        content = ListenerRouterEndpointResultContent(
            projectConfigId=project_config_id,
            callId=call_id,
            ok=ok,
            result=result,
            error=error,
            details=details or {},
        )
        if self.listener_registry.use_temporary_ids_for_socket(websocket_id):
            content = self._convert_outgoing_payload(content)
        await self.websocket_manager.send_message(
            WebsocketMsgListenerRouterEndpointResult(content=content),
            websocket_id,
        )

    def _convert_incoming_payload(self, payload):
        self._refresh_temporary_id_map_if_needed()
        return convert_temporary_ids_to_canonical(payload, self._temporary_to_canonical)

    def _convert_outgoing_payload(self, payload):
        self._refresh_temporary_id_map_if_needed()
        map_size_before = len(self._canonical_to_temporary)
        converted = convert_canonical_ids_to_temporary(
            payload,
            self._canonical_to_temporary,
            self._temporary_to_canonical,
        )
        if len(self._canonical_to_temporary) != map_size_before:
            self.dbe.write_temporary_id_map(self._canonical_to_temporary)
            self._temporary_id_map_mtime_ns = (
                self.dbe.temporary_id_map.stat().st_mtime_ns
            )
        return converted

    def _refresh_temporary_id_map_if_needed(self) -> None:
        path = self.dbe.temporary_id_map
        mtime_ns = path.stat().st_mtime_ns if path.exists() else None
        if mtime_ns == self._temporary_id_map_mtime_ns:
            return
        (
            self._temporary_to_canonical,
            self._canonical_to_temporary,
        ) = self.dbe.read_temporary_id_map()
        self._temporary_id_map_mtime_ns = mtime_ns

    async def _sync_listener_coverage(
        self,
        project_config_id: ID,
        *,
        share_session_id: str | None = None,
    ) -> None:
        snapshot = self.listener_coverage_tracker.update_for_project(
            project_config_id,
            self.listener_registry.iter_registrations_for_project(
                project_config_id,
                share_session_id=share_session_id,
            ),
            share_session_id=share_session_id,
        )
        if snapshot is not None:
            await self.frontend_sender.broadcast_listener_coverage_snapshot(
                snapshot,
                share_session_id=share_session_id,
            )
