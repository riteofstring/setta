from typing import TYPE_CHECKING

from setta.logging.context import LoggingContextInput
from setta.types.id import ID
from setta.types.notifications import SettaBackendLogEventSeverity, SettaNotification

if TYPE_CHECKING:
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


class ScopedFrontendSender:
    def __init__(self, sender: "WMHFrontendSender", share_session_id: str | None):
        self._sender = sender
        self._share_session_id = share_session_id

    async def broadcast_project_state(
        self,
        projectState,
        completedOpIds: list[str],
        pendingOpIds: list[str],
    ) -> None:
        await self._sender.broadcast_project_state(
            projectState,
            completedOpIds,
            pendingOpIds,
            share_session_id=self._share_session_id,
        )

    async def broadcast_all_project_metadata(
        self,
        defaultProjectConfigId: str | None,
        projectMetadata: list,
    ) -> None:
        await self._sender.broadcast_all_project_metadata(
            defaultProjectConfigId=defaultProjectConfigId,
            projectMetadata=projectMetadata,
            share_session_id=self._share_session_id,
        )

    async def broadcast_notification(self, notification: SettaNotification) -> None:
        await self._sender.broadcast_notification(
            notification,
            share_session_id=self._share_session_id,
        )

    async def send_streaming_response(self, chat_id, chunk) -> None:
        await self._sender.send_streaming_response(
            chat_id,
            chunk,
            share_session_id=self._share_session_id,
        )

    async def broadcast_backend_log_event(
        self,
        message: str,
        *,
        severity: SettaBackendLogEventSeverity = SettaBackendLogEventSeverity.info,
        project_config_id: ID | None = None,
    ) -> None:
        await self._sender.broadcast_backend_log_event(
            message,
            severity=severity,
            project_config_id=project_config_id,
            share_session_id=self._share_session_id,
        )

    async def log_and_broadcast_backend_log_event(
        self,
        message: str,
        *,
        severity: SettaBackendLogEventSeverity = SettaBackendLogEventSeverity.info,
        project_config_id: ID | None = None,
        logger=None,
        context: dict[str, LoggingContextInput] | None = None,
    ) -> None:
        await self._sender.log_and_broadcast_backend_log_event(
            message,
            severity=severity,
            project_config_id=project_config_id,
            logger=logger,
            context=context,
            share_session_id=self._share_session_id,
        )

    async def log_failure_and_broadcast_backend_log_event(
        self,
        exc: BaseException,
        label: str,
        message: str,
        severity: SettaBackendLogEventSeverity = SettaBackendLogEventSeverity.error,
        project_config_id: ID | None = None,
        handled: bool = False,
        logger=None,
        context: dict[str, LoggingContextInput] | None = None,
    ) -> None:
        await self._sender.log_failure_and_broadcast_backend_log_event(
            exc,
            label,
            message,
            severity,
            project_config_id=project_config_id,
            handled=handled,
            logger=logger,
            context=context,
            share_session_id=self._share_session_id,
        )

    async def broadcast_artifacts_update(
        self, artifacts: list, updateType: str
    ) -> None:
        await self._sender.broadcast_artifacts_update(
            artifacts=artifacts,
            updateType=updateType,
            share_session_id=self._share_session_id,
        )

    async def broadcast_rename_refactor_results(self, content) -> None:
        await self._sender.broadcast_rename_refactor_results(
            content,
            share_session_id=self._share_session_id,
        )

    async def broadcast_ai_follow_tool_arguments_update(
        self,
        project_config_id: ID,
        chat_id: ID,
        ids_by_type,
    ) -> None:
        await self._sender.broadcast_ai_follow_tool_arguments_update(
            project_config_id,
            chat_id,
            ids_by_type,
            share_session_id=self._share_session_id,
        )

    async def broadcast_ai_follow_tool_result_update(
        self,
        project_config_id: ID,
        chat_id: ID,
        ids_by_type,
    ) -> None:
        await self._sender.broadcast_ai_follow_tool_result_update(
            project_config_id,
            chat_id,
            ids_by_type,
            share_session_id=self._share_session_id,
        )
