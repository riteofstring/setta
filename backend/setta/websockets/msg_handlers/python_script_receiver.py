import inspect
import logging

from pydantic import BaseModel, ValidationError

from setta.listeners.listener_frontend_emit_resolver import (
    InvalidListenerArtifactUpdateError,
    InvalidListenerDependencyValueError,
    ListenerFrontendEmitResolver,
    ListenerFrontendEmitResolverError,
    UnknownListenerDependencyError,
    UnsupportedListenerArtifactUpdateError,
    UnsupportedListenerDependencyError,
)
from setta.project_state.listener_artifact_updates import (
    ListenerArtifactUpdateError,
)
from setta.project_state.listener_dependency_updates import (
    ListenerDependencyUpdateError,
)
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.terminals.run_code import run_code
from setta.terminals.terminals import Terminals
from setta.types.generated.websocket_unions import (
    PythonScriptWebsocketMsgTypeAdapter,
    PythonScriptWebsocketMsgUnion,
)
from setta.types.helpers_lvl2 import ProjectNotFound
from setta.types.id import ID
from setta.types.listener import (
    ListenerErrorContent,
    ListenerProjectManagerResultContent,
    ListenerRegisterAckContent,
    ListenerRegisterAckStatus,
)
from setta.types.notifications import SettaBackendLogEventSeverity
from setta.types.project_ops import RunOp
from setta.types.websocket import (
    WebsocketMsgListenerError,
    WebsocketMsgListenerFrontendEmit,
    WebsocketMsgListenerInit,
    WebsocketMsgListenerProjectManagerCall,
    WebsocketMsgListenerProjectManagerResult,
    WebsocketMsgListenerProjectOps,
    WebsocketMsgListenerRegister,
    WebsocketMsgListenerRegisterAck,
)
from setta.websockets.listener_coverage import ListenerCoverageTracker
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.base import BaseWebsocketMsgReceiver
from setta.websockets.msg_handlers.cli_sender import WMHCLISender
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
        terminals: Terminals,
        wmh_cli_sender: WMHCLISender,
    ):
        super().__init__(websocket_manager)
        self.listener_registry = listener_registry
        self.frontend_sender = frontend_sender
        self.python_script_sender = python_script_sender
        self.project_manager_switcher = project_manager_switcher
        self.terminals = terminals
        self.wmh_cli_sender = wmh_cli_sender
        self.listener_coverage_tracker = ListenerCoverageTracker()
        self.listener_frontend_emit_resolver = ListenerFrontendEmitResolver()

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
    ) -> None:
        await self.websocket_manager.send_message(
            WebsocketMsgListenerError(
                content=ListenerErrorContent(error=error, details=details)
            ),
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
        )

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
        elif isinstance(message, WebsocketMsgListenerProjectOps):
            await self._handle_listener_project_ops(message, fromWebsocketId)
        elif isinstance(message, WebsocketMsgListenerProjectManagerCall):
            await self._handle_listener_project_manager_call(message, fromWebsocketId)

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
                await self._send_listener_error(
                    websocket_id,
                    error="project_state_unavailable",
                    details={"websocketId": websocket_id},
                )
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
                await self._send_listener_error(
                    websocket_id,
                    error="project_state_unavailable",
                    details={"projectName": project_name},
                )
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
            await self._send_listener_error(
                websocket_id,
                error="project_state_unavailable",
                details={"projectConfigId": project_config_id},
                project_config_id=project_config_id,
            )
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
            await self._send_listener_error(
                websocket_id,
                error="listener_not_registered",
                details={"websocketId": websocket_id},
            )
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
            await self._send_listener_error(
                websocket_id,
                error="project_config_mismatch",
                details={
                    "expectedProjectConfigId": expected_project_config_id,
                    "receivedProjectConfigId": project_config_id,
                },
                project_config_id=expected_project_config_id,
            )
            return

        manager = self.project_manager_switcher.get(project_config_id)
        dependency_values = message.content.dependencyValues
        artifact_updates = message.content.artifactUpdates
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
            )
            return

        try:
            dependency_graph = manager.gen_code[project_config_id].dep_graph
        except KeyError:
            logger.warning(
                "failed to load dependency graph for listener emit (project %s)",
                project_config_id,
            )
            await self._send_listener_error(
                websocket_id,
                error="project_state_unavailable",
                details={"projectConfigId": project_config_id},
                project_config_id=project_config_id,
            )
            return

        try:
            resolved_dependency_values = self.listener_frontend_emit_resolver.resolve(
                dependency_values=dependency_values,
                dependency_graph=dependency_graph,
            )
            resolved_artifact_updates = (
                self.listener_frontend_emit_resolver.resolve_artifact_updates(
                    artifact_updates=artifact_updates,
                    artifacts=manager.artifacts,
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
            )
            return
        except InvalidListenerDependencyValueError as exc:
            logger.warning(
                "listener emit provided invalid value for %s", exc.dependency_name
            )
            await self._send_listener_error(
                websocket_id,
                error="listener_emit_invalid_value",
                details={
                    "dependencyName": exc.dependency_name,
                    "expectedType": exc.expected_type.value,
                },
                project_config_id=project_config_id,
            )
            return
        except UnsupportedListenerDependencyError as exc:
            logger.warning(
                "listener emit targeted unsupported dependency %s", exc.dependency_name
            )
            await self._send_listener_error(
                websocket_id,
                error="listener_emit_unsupported_dependency",
                details={
                    "dependencyName": exc.dependency_name,
                    "reason": exc.reason,
                },
                project_config_id=project_config_id,
            )
            return
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
            )
            return
        except UnsupportedListenerArtifactUpdateError as exc:
            logger.warning(
                "listener emit targeted unsupported artifact update for %s", exc.path
            )
            await self._send_listener_error(
                websocket_id,
                error="listener_emit_unsupported_artifact_update",
                details={"path": exc.path, "reason": exc.reason},
                project_config_id=project_config_id,
            )
            return

        except ListenerFrontendEmitResolverError as exc:
            logger.exception("listener emit resolver failed")
            await self._send_listener_error(
                websocket_id,
                error="listener_emit_failed",
                details={"message": str(exc)},
                project_config_id=project_config_id,
            )
            return
        except ValueError as exc:
            logger.warning("invalid listener emit payload: %s", exc)
            await self._send_listener_error(
                websocket_id,
                error="listener_emit_invalid_payload",
                details={"message": str(exc)},
                project_config_id=project_config_id,
            )
            return

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
            )
        except ListenerDependencyUpdateError as exc:
            logger.warning("listener emit failed to apply: %s", exc)
            await self._send_listener_error(
                websocket_id,
                error="listener_emit_failed",
                details={"message": str(exc)},
                project_config_id=project_config_id,
            )

    async def _handle_listener_project_ops(
        self, message: WebsocketMsgListenerProjectOps, websocket_id: str
    ) -> None:
        registration = self.listener_registry.get_registration(websocket_id)
        if registration is None:
            logger.warning(
                "dropping listener project ops for unregistered websocket %s",
                websocket_id,
            )
            await self._send_listener_error(
                websocket_id,
                error="listener_not_registered",
                details={"websocketId": websocket_id},
            )
            return
        expected_project_config_id = registration.project_config_id
        project_config_id = message.content.projectConfigId
        if project_config_id != expected_project_config_id:
            logger.warning(
                (
                    "dropping listener project ops for websocket %s "
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
            )
            return

        project_ops = message.content.projectOps
        if not project_ops:
            logger.warning("listener project ops rejected due to empty payload")
            await self._send_listener_error(
                websocket_id,
                error="listener_ops_invalid_payload",
                details={"message": "listener ops require at least one entry"},
                project_config_id=project_config_id,
            )
            return

        manager = self.project_manager_switcher.get(project_config_id)
        for op in project_ops:
            if isinstance(op, RunOp):
                await run_code(
                    project_config_id,
                    op.sectionId,
                    op.cliId,
                    manager,
                    self.terminals,
                    self.wmh_cli_sender,
                )
                run_label = "Started command"
                if op.runKind:
                    run_label = f"Started command ({op.runKind})"
                await self.frontend_sender.log_and_broadcast_backend_log_event(
                    run_label,
                    project_config_id=project_config_id,
                    severity=SettaBackendLogEventSeverity.info,
                )
                continue
            raise ValueError(f"Unsupported project op: {op.type}")

    async def _handle_listener_project_manager_call(
        self, message: WebsocketMsgListenerProjectManagerCall, websocket_id: str
    ) -> None:
        registration = self.listener_registry.get_registration(websocket_id)
        if registration is None:
            logger.warning(
                "dropping listener project manager call for unregistered websocket %s",
                websocket_id,
            )
            await self._send_project_manager_result(
                websocket_id,
                project_config_id=message.content.projectConfigId,
                call_id=message.content.callId,
                ok=False,
                error="listener_not_registered",
                details={"websocketId": websocket_id},
            )
            return
        expected_project_config_id = registration.project_config_id
        project_config_id = message.content.projectConfigId
        if project_config_id != expected_project_config_id:
            logger.warning(
                (
                    "dropping listener project manager call for websocket %s "
                    "(expected project config %s, got %s)"
                ),
                websocket_id,
                expected_project_config_id,
                project_config_id,
            )
            await self._send_project_manager_result(
                websocket_id,
                project_config_id=expected_project_config_id,
                call_id=message.content.callId,
                ok=False,
                error="project_config_mismatch",
                details={
                    "expectedProjectConfigId": expected_project_config_id,
                    "receivedProjectConfigId": project_config_id,
                },
            )
            return

        operation = message.content.operation
        if not operation:
            await self._send_project_manager_result(
                websocket_id,
                project_config_id=project_config_id,
                call_id=message.content.callId,
                ok=False,
                error="listener_call_invalid_operation",
                details={"message": "operation must be non-empty"},
            )
            return

        payload = message.content.payload
        if "projectConfigId" in payload:
            if payload["projectConfigId"] != project_config_id:
                await self._send_project_manager_result(
                    websocket_id,
                    project_config_id=project_config_id,
                    call_id=message.content.callId,
                    ok=False,
                    error="project_config_mismatch",
                    details={
                        "expectedProjectConfigId": project_config_id,
                        "receivedProjectConfigId": payload["projectConfigId"],
                    },
                )
                return

        try:
            result = await self._dispatch_project_manager_call(
                project_config_id=project_config_id,
                operation=operation,
                payload=payload,
            )
        except ValidationError as exc:
            await self._send_project_manager_result(
                websocket_id,
                project_config_id=project_config_id,
                call_id=message.content.callId,
                ok=False,
                error="listener_call_invalid_payload",
                details={"message": str(exc)},
            )
            return
        except ValueError as exc:
            await self._send_project_manager_result(
                websocket_id,
                project_config_id=project_config_id,
                call_id=message.content.callId,
                ok=False,
                error="listener_call_failed",
                details={"message": str(exc)},
            )
            return
        except Exception as exc:
            logger.exception("listener project manager call failed")
            await self._send_project_manager_result(
                websocket_id,
                project_config_id=project_config_id,
                call_id=message.content.callId,
                ok=False,
                error="listener_call_failed",
                details={"message": str(exc)},
            )
            return

        await self._send_project_manager_result(
            websocket_id,
            project_config_id=project_config_id,
            call_id=message.content.callId,
            ok=True,
            result=result,
        )

    async def _dispatch_project_manager_call(
        self,
        *,
        project_config_id: ID,
        operation: str,
        payload: dict[str, object],
    ) -> object:
        if operation.startswith("_"):
            raise ValueError("operation is not allowed")
        manager = self.project_manager_switcher.get(project_config_id)
        method = getattr(manager, operation, None)
        if method is None or not callable(method):
            raise ValueError(f"unknown project manager operation: {operation}")
        args, kwargs = self._build_project_manager_args(
            method, project_config_id=project_config_id, payload=payload
        )
        result = method(*args, **kwargs)
        if inspect.isawaitable(result):
            return await result
        return result

    def _build_project_manager_args(
        self,
        method,
        *,
        project_config_id: ID,
        payload: dict[str, object],
    ) -> tuple[tuple[object, ...], dict[str, object]]:
        signature = inspect.signature(method)
        params = list(signature.parameters.values())
        if params and params[0].name == "self":
            params = params[1:]

        if not params:
            extra_keys = set(payload.keys()) - {"projectConfigId"}
            if extra_keys:
                raise ValueError("payload not expected for operation")
            return (), {}

        if len(params) == 1 and self._is_pydantic_model(params[0].annotation):
            model_cls = params[0].annotation
            payload_data = dict(payload)
            if "projectConfigId" in payload_data:
                if payload_data["projectConfigId"] != project_config_id:
                    raise ValueError("project_config_mismatch")
            elif "projectConfigId" in model_cls.model_fields:
                payload_data["projectConfigId"] = project_config_id
            return (model_cls(**payload_data),), {}

        param_names = {param.name for param in params}
        extra_keys = set(payload.keys()) - param_names - {"projectConfigId"}
        if extra_keys:
            raise ValueError(f"Unexpected payload keys: {sorted(extra_keys)}")

        kwargs: dict[str, object] = {}
        for param in params:
            if param.name == "projectConfigId":
                kwargs[param.name] = project_config_id
                continue
            if param.name in payload:
                kwargs[param.name] = payload[param.name]
                continue
            if param.default is not inspect.Signature.empty:
                continue
            raise ValueError(f"Missing required payload key: {param.name}")

        return (), kwargs

    @staticmethod
    def _is_pydantic_model(annotation: object) -> bool:
        if not inspect.isclass(annotation):
            return False
        return issubclass(annotation, BaseModel)

    async def _send_project_manager_result(
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
        content = ListenerProjectManagerResultContent(
            projectConfigId=project_config_id,
            callId=call_id,
            ok=ok,
            result=result,
            error=error,
            details=details or {},
        )
        await self.websocket_manager.send_message(
            WebsocketMsgListenerProjectManagerResult(content=content),
            websocket_id,
        )

    async def _sync_listener_coverage(self, project_config_id: ID) -> None:
        snapshot = self.listener_coverage_tracker.update_for_project(
            project_config_id,
            self.listener_registry.iter_registrations_for_project(project_config_id),
        )
        if snapshot is not None:
            await self.frontend_sender.broadcast_listener_coverage_snapshot(snapshot)
