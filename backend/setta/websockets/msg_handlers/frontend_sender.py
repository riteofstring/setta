import logging
import os
from collections.abc import Mapping
from typing import Literal

from setta.logging.context import LoggingContextInput, logging_context
from setta.logging.errors import log_failure
from setta.logging.levels import parse_log_level
from setta.project_state.project_manager_types import (
    ProjectStateSingleConfigWithCompletedOpIds,
    RenameRefactorBroadcastContent,
)
from setta.types.artifact_messages import UpdateArtifactMsgContent
from setta.types.chat import APIKeys
from setta.types.chat_stream_events import (
    LLMStreamingResponse,
    LLMStreamingResponseChunk,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.generated.unions import BaseArtifactUnion
from setta.types.id import ID
from setta.types.listener import ListenerCoverageSnapshot
from setta.types.llm_config import AllLLMConfigs
from setta.types.lsp import (
    SettaProjectConfigDiagnostics,
)
from setta.types.notifications import (
    SettaBackendLogEvent,
    SettaBackendLogEventSeverity,
    SettaNotification,
)
from setta.types.project_config import ProjectConfig
from setta.types.project_state import (
    AllProjectMetadata,
    ProjectStateSingleConfig,
)
from setta.types.websocket import (
    AIFollowUpdateContent,
    WebsocketConnectionType,
    WebsocketMsgAIFollowUpdate,
    WebsocketMsgAllProjectMetadata,
    WebsocketMsgBackendLogEvent,
    WebsocketMsgListenerCoverageSnapshot,
    WebsocketMsgLLMApiKeysUpdated,
    WebsocketMsgLLMConfigUpdated,
    WebsocketMsgLLMStreamingResponse,
    WebsocketMsgLSPDiagnostics,
    WebsocketMsgNotification,
    WebsocketMsgReturnRenameRefactorResults,
    WebsocketMsgTerminalMetadata,
    WebsocketMsgUpdateArtifacts,
    WebsocketMsgUpdateFrontendProjectState,
    WebsocketMsgUpdateSettings,
)
from setta.websockets.msg_handlers.base import BaseWebsocketMsgSender

_UI_LOG_LEVEL_ENV = "SETTA_UI_LOG_LEVEL"
_SEVERITY_TO_LOG_LEVEL = {
    SettaBackendLogEventSeverity.info: logging.INFO,
    SettaBackendLogEventSeverity.warning: logging.WARNING,
    SettaBackendLogEventSeverity.error: logging.ERROR,
    SettaBackendLogEventSeverity.critical: logging.CRITICAL,
}


class WMHFrontendSender(BaseWebsocketMsgSender):
    @staticmethod
    def _resolve_ui_log_level() -> int:
        env_value = os.environ.get(_UI_LOG_LEVEL_ENV)
        if env_value is not None:
            try:
                return parse_log_level(env_value)
            except ValueError:
                pass
        return logging.getLogger().getEffectiveLevel()

    async def broadcast_notification(self, notification: SettaNotification):
        await self.websocket_manager.broadcast(
            WebsocketMsgNotification(content=notification),
            connectionType=WebsocketConnectionType.FRONTEND,
        )

    async def broadcast_backend_log_event(
        self,
        message: str,
        *,
        severity: SettaBackendLogEventSeverity = SettaBackendLogEventSeverity.info,
        project_config_id: ID | None = None,
    ) -> None:
        threshold = self._resolve_ui_log_level()
        event_level = _SEVERITY_TO_LOG_LEVEL.get(severity, logging.INFO)
        if event_level < threshold:
            return
        event = SettaBackendLogEvent(
            projectConfigId=project_config_id,
            severity=severity,
            message=message,
        )
        await self.websocket_manager.broadcast(
            WebsocketMsgBackendLogEvent(content=event),
            connectionType=WebsocketConnectionType.FRONTEND,
        )

    async def log_and_broadcast_backend_log_event(
        self,
        message: str,
        *,
        severity: SettaBackendLogEventSeverity = SettaBackendLogEventSeverity.info,
        project_config_id: ID | None = None,
        logger: logging.Logger | None = None,
        context: Mapping[str, LoggingContextInput] | None = None,
    ) -> None:
        """Log a backend message and surface it to the UI."""

        event_level = _SEVERITY_TO_LOG_LEVEL.get(severity, logging.INFO)
        backend_logger = logger or logging.getLogger(__name__)

        context_values: dict[str, LoggingContextInput] = {}
        if project_config_id is not None:
            context_values["project_config_id"] = str(project_config_id)
        if context:
            context_values.update(context)

        if context_values:
            with logging_context(values=context_values):
                backend_logger.log(event_level, message)
        else:
            backend_logger.log(event_level, message)

        await self.broadcast_backend_log_event(
            message,
            severity=severity,
            project_config_id=project_config_id,
        )

    async def log_failure_and_broadcast_backend_log_event(
        self,
        exc: BaseException,
        label: str,
        message: str,
        severity: SettaBackendLogEventSeverity = SettaBackendLogEventSeverity.error,
        project_config_id: ID | None = None,
        handled: bool = False,
        logger: logging.Logger | None = None,
        context: Mapping[str, LoggingContextInput] | None = None,
    ) -> None:
        """Log a structured failure and surface it to the UI."""

        log_failure(
            exc,
            label=label,
            logger=logger,
            handled=handled,
            context=context,
        )
        await self.log_and_broadcast_backend_log_event(
            message,
            severity=severity,
            project_config_id=project_config_id,
            logger=logger,
            context=context,
        )

    async def broadcast_artifacts_update(
        self,
        artifacts: list[BaseArtifactUnion],
        updateType: Literal["update", "delete"],
    ):
        await self.websocket_manager.broadcast(
            message=WebsocketMsgUpdateArtifacts(
                content=UpdateArtifactMsgContent(
                    artifacts=artifacts, updateType=updateType
                )
            ),
            connectionType=WebsocketConnectionType.FRONTEND,
        )

    async def broadcast_rename_refactor_results(
        self, content: RenameRefactorBroadcastContent
    ):
        await self.websocket_manager.broadcast(
            WebsocketMsgReturnRenameRefactorResults(content=content),
            connectionType=WebsocketConnectionType.FRONTEND,
        )

    async def send_streaming_response(
        self,
        chatId: ID,
        chunk: LLMStreamingResponseChunk,
    ):
        await self.websocket_manager.broadcast(
            WebsocketMsgLLMStreamingResponse(
                content=LLMStreamingResponse(
                    chatId=chatId,
                    chunk=chunk,
                )
            ),
            connectionType=WebsocketConnectionType.FRONTEND,
        )

    async def broadcast_lsp_diagnostics(self, content: SettaProjectConfigDiagnostics):
        await self.websocket_manager.broadcast(
            WebsocketMsgLSPDiagnostics(content=content),
            connectionType=WebsocketConnectionType.FRONTEND,
        )

    async def broadcast_project_state(
        self,
        projectState: ProjectStateSingleConfig,
        completedOpIds: list[str],
        pendingOpIds: list[str],
    ):
        await self.websocket_manager.broadcast(
            WebsocketMsgUpdateFrontendProjectState(
                content=ProjectStateSingleConfigWithCompletedOpIds(
                    projectState=projectState,
                    completedOpIds=completedOpIds,
                    pendingOpIds=pendingOpIds,
                )
            ),
            connectionType=WebsocketConnectionType.FRONTEND,
        )

    async def broadcast_all_project_metadata(
        self, defaultProjectConfigId: str | None, projectMetadata: list[ProjectConfig]
    ):
        await self.websocket_manager.broadcast(
            WebsocketMsgAllProjectMetadata(
                content=AllProjectMetadata(
                    defaultProjectConfigId=defaultProjectConfigId,
                    projectMetadata=projectMetadata,
                )
            ),
            connectionType=WebsocketConnectionType.FRONTEND,
        )

    async def broadcast_terminal_metadata(self, terminal_metadata):
        await self.websocket_manager.broadcast(
            WebsocketMsgTerminalMetadata(content=terminal_metadata),
            connectionType=WebsocketConnectionType.FRONTEND,
        )

    async def broadcast_settings(self, settings: SettingsState):
        await self.websocket_manager.broadcast(
            WebsocketMsgUpdateSettings(content=settings),
            connectionType=WebsocketConnectionType.FRONTEND,
        )

    async def broadcast_listener_coverage_snapshot(
        self, snapshot: ListenerCoverageSnapshot
    ):
        await self.websocket_manager.broadcast(
            WebsocketMsgListenerCoverageSnapshot(content=snapshot),
            connectionType=WebsocketConnectionType.FRONTEND,
        )

    async def broadcast_llm_config_update(self, config: AllLLMConfigs):
        await self.websocket_manager.broadcast(
            WebsocketMsgLLMConfigUpdated(content=config),
            connectionType=WebsocketConnectionType.FRONTEND,
        )

    async def broadcast_llm_api_keys_update(self, payload: APIKeys):
        await self.websocket_manager.broadcast(
            WebsocketMsgLLMApiKeysUpdated(content=payload),
            connectionType=WebsocketConnectionType.FRONTEND,
        )

    async def broadcast_ai_follow_update(
        self,
        projectConfigId: ID,
        chatId: ID,
        sectionIds: list[ID],
    ):
        await self.websocket_manager.broadcast(
            WebsocketMsgAIFollowUpdate(
                content=AIFollowUpdateContent(
                    projectConfigId=projectConfigId,
                    chatId=chatId,
                    sectionIds=sectionIds,
                )
            ),
            connectionType=WebsocketConnectionType.FRONTEND,
        )
