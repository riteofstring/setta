import logging
import os
from collections.abc import Mapping
from typing import Literal

from setta.logging.context import LoggingContextInput, logging_context
from setta.logging.errors import log_failure
from setta.logging.levels import parse_log_level
from setta.mcp.tool_metadata import FollowIdType
from setta.project_state.project_manager_types import (
    ProjectStateSingleConfigWithCompletedOpIds,
    RenameRefactorBroadcastContent,
)
from setta.types.agentic import (
    AgentProfile,
    AgentProfileList,
    EngineConfig,
    EngineConfigList,
    TranscriptionProfile,
    TranscriptionProfileList,
)
from setta.types.artifact_messages import UpdateArtifactMsgContent
from setta.types.chat_stream_events import (
    LLMStreamingResponse,
    LLMStreamingResponseChunk,
)
from setta.types.external_agents import ExternalAgentConfig, ExternalAgentConfigList
from setta.types.generated.settings_state import SettingsState
from setta.types.generated.unions import BaseArtifactUnion
from setta.types.id import ID
from setta.types.listener import ListenerCoverageSnapshot
from setta.types.llm_config import AllLLMConfigs
from setta.types.lsp import SettaLspDiagnosticsPayload
from setta.types.managed_api_keys import ManagedAPIKeysSnapshot
from setta.types.name_validation import SettaProjectNameValidationErrors
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
from setta.types.prompt import PromptTemplate, PromptTemplateList
from setta.types.websocket import (
    AIFollowToolArgumentsUpdateContent,
    AIFollowToolResultUpdateContent,
    WebsocketConnectionType,
    WebsocketMsgAgentProfilesUpdated,
    WebsocketMsgAIFollowToolArgumentsUpdate,
    WebsocketMsgAIFollowToolResultUpdate,
    WebsocketMsgAllProjectMetadata,
    WebsocketMsgBackendLogEvent,
    WebsocketMsgEngineConfigsUpdated,
    WebsocketMsgExternalAgentConfigsUpdated,
    WebsocketMsgListenerCoverageSnapshot,
    WebsocketMsgLLMApiKeysUpdated,
    WebsocketMsgLLMConfigUpdated,
    WebsocketMsgLLMStreamingResponse,
    WebsocketMsgLSPDiagnostics,
    WebsocketMsgNameValidationErrors,
    WebsocketMsgNotification,
    WebsocketMsgPromptTemplatesUpdated,
    WebsocketMsgReturnRenameRefactorResults,
    WebsocketMsgTerminalMetadata,
    WebsocketMsgTranscriptionProfilesUpdated,
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
    def __init__(
        self,
        websocket_manager,
        *,
        share_mode: bool = False,
        share_session_id: str | None = None,
    ) -> None:
        super().__init__(websocket_manager)
        self.share_mode = share_mode
        self._share_session_id = share_session_id

    def scoped(self, share_session_id: str | None) -> "WMHFrontendSender":
        if share_session_id is None or share_session_id == self._share_session_id:
            return self
        return WMHFrontendSender(
            self.websocket_manager,
            share_mode=self.share_mode,
            share_session_id=share_session_id,
        )

    @staticmethod
    def _resolve_ui_log_level() -> int:
        env_value = os.environ.get(_UI_LOG_LEVEL_ENV)
        if env_value is not None:
            try:
                return parse_log_level(env_value)
            except ValueError:
                pass
        return logging.getLogger().getEffectiveLevel()

    async def _broadcast_frontend(
        self,
        message,
        share_session_id: str | None,
    ) -> None:
        resolved_share_session_id = (
            share_session_id if share_session_id is not None else self._share_session_id
        )
        if self.share_mode:
            if resolved_share_session_id is None:
                return
            await self.websocket_manager.broadcast_to_session(
                message,
                share_session_id=resolved_share_session_id,
                connectionType=WebsocketConnectionType.FRONTEND,
            )
            return
        await self.websocket_manager.broadcast(
            message,
            connectionType=WebsocketConnectionType.FRONTEND,
        )

    async def broadcast_notification(
        self,
        notification: SettaNotification,
        *,
        share_session_id: str | None = None,
    ):
        await self._broadcast_frontend(
            WebsocketMsgNotification(content=notification),
            share_session_id,
        )

    async def broadcast_backend_log_event(
        self,
        message: str,
        *,
        severity: SettaBackendLogEventSeverity = SettaBackendLogEventSeverity.info,
        project_config_id: ID | None = None,
        share_session_id: str | None = None,
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
        await self._broadcast_frontend(
            WebsocketMsgBackendLogEvent(content=event),
            share_session_id,
        )

    async def log_and_broadcast_backend_log_event(
        self,
        message: str,
        *,
        severity: SettaBackendLogEventSeverity = SettaBackendLogEventSeverity.info,
        project_config_id: ID | None = None,
        logger: logging.Logger | None = None,
        context: Mapping[str, LoggingContextInput] | None = None,
        share_session_id: str | None = None,
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
            share_session_id=share_session_id,
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
        share_session_id: str | None = None,
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
            share_session_id=share_session_id,
        )

    async def broadcast_artifacts_update(
        self,
        artifacts: list[BaseArtifactUnion],
        updateType: Literal["update", "delete"],
        *,
        share_session_id: str | None = None,
    ):
        await self._broadcast_frontend(
            WebsocketMsgUpdateArtifacts(
                content=UpdateArtifactMsgContent(
                    artifacts=artifacts, updateType=updateType
                )
            ),
            share_session_id,
        )

    async def broadcast_rename_refactor_results(
        self,
        content: RenameRefactorBroadcastContent,
        *,
        share_session_id: str | None = None,
    ):
        await self._broadcast_frontend(
            WebsocketMsgReturnRenameRefactorResults(content=content),
            share_session_id,
        )

    async def send_streaming_response(
        self,
        chatId: ID,
        chunk: LLMStreamingResponseChunk,
        *,
        section_id: ID | None = None,
        project_config_id: ID | None = None,
        share_session_id: str | None = None,
    ):
        await self._broadcast_frontend(
            WebsocketMsgLLMStreamingResponse(
                content=LLMStreamingResponse(
                    chatId=chatId,
                    chunk=chunk,
                    sectionId=section_id,
                    projectConfigId=project_config_id,
                )
            ),
            share_session_id,
        )

    async def broadcast_lsp_diagnostics(
        self,
        content: SettaLspDiagnosticsPayload,
        *,
        share_session_id: str | None = None,
    ):
        await self._broadcast_frontend(
            WebsocketMsgLSPDiagnostics(content=content),
            share_session_id,
        )

    async def broadcast_name_validation_errors(
        self,
        content: SettaProjectNameValidationErrors,
        *,
        share_session_id: str | None = None,
    ):
        await self._broadcast_frontend(
            WebsocketMsgNameValidationErrors(content=content),
            share_session_id,
        )

    async def broadcast_project_state(
        self,
        projectState: ProjectStateSingleConfig,
        completedOpIds: list[str],
        pendingOpIds: list[str],
        *,
        share_session_id: str | None = None,
    ):
        await self._broadcast_frontend(
            WebsocketMsgUpdateFrontendProjectState(
                content=ProjectStateSingleConfigWithCompletedOpIds(
                    projectState=projectState,
                    completedOpIds=completedOpIds,
                    pendingOpIds=pendingOpIds,
                )
            ),
            share_session_id,
        )

    async def broadcast_all_project_metadata(
        self,
        defaultProjectConfigId: str | None,
        projectMetadata: list[ProjectConfig],
        *,
        share_session_id: str | None = None,
    ):
        await self._broadcast_frontend(
            WebsocketMsgAllProjectMetadata(
                content=AllProjectMetadata(
                    defaultProjectConfigId=defaultProjectConfigId,
                    projectMetadata=projectMetadata,
                )
            ),
            share_session_id,
        )

    async def broadcast_terminal_metadata(
        self,
        terminal_metadata,
        *,
        share_session_id: str | None = None,
    ):
        await self._broadcast_frontend(
            WebsocketMsgTerminalMetadata(content=terminal_metadata),
            share_session_id,
        )

    async def broadcast_settings(
        self,
        settings: SettingsState,
        *,
        share_session_id: str | None = None,
    ):
        await self._broadcast_frontend(
            WebsocketMsgUpdateSettings(content=settings),
            share_session_id,
        )

    async def broadcast_listener_coverage_snapshot(
        self,
        snapshot: ListenerCoverageSnapshot,
        *,
        share_session_id: str | None = None,
    ):
        await self._broadcast_frontend(
            WebsocketMsgListenerCoverageSnapshot(content=snapshot),
            share_session_id,
        )

    async def broadcast_llm_config_update(
        self,
        config: AllLLMConfigs,
        *,
        share_session_id: str | None = None,
    ):
        await self._broadcast_frontend(
            WebsocketMsgLLMConfigUpdated(content=config),
            share_session_id,
        )

    async def broadcast_llm_api_keys_update(
        self,
        payload: ManagedAPIKeysSnapshot,
        *,
        share_session_id: str | None = None,
    ):
        await self._broadcast_frontend(
            WebsocketMsgLLMApiKeysUpdated(content=payload),
            share_session_id,
        )

    async def broadcast_agent_profiles_update(
        self,
        profiles: list[AgentProfile],
        *,
        share_session_id: str | None = None,
    ) -> None:
        await self._broadcast_frontend(
            WebsocketMsgAgentProfilesUpdated(
                content=AgentProfileList(profiles=profiles)
            ),
            share_session_id,
        )

    async def broadcast_prompt_templates_update(
        self,
        templates: list[PromptTemplate],
        *,
        share_session_id: str | None = None,
    ) -> None:
        await self._broadcast_frontend(
            WebsocketMsgPromptTemplatesUpdated(
                content=PromptTemplateList(templates=templates)
            ),
            share_session_id,
        )

    async def broadcast_external_agent_configs_update(
        self,
        configs: list[ExternalAgentConfig],
        *,
        share_session_id: str | None = None,
    ) -> None:
        await self._broadcast_frontend(
            WebsocketMsgExternalAgentConfigsUpdated(
                content=ExternalAgentConfigList(configs=configs)
            ),
            share_session_id,
        )

    async def broadcast_engine_configs_update(
        self,
        configs: list[EngineConfig],
        *,
        share_session_id: str | None = None,
    ) -> None:
        await self._broadcast_frontend(
            WebsocketMsgEngineConfigsUpdated(content=EngineConfigList(configs=configs)),
            share_session_id,
        )

    async def broadcast_transcription_profiles_update(
        self,
        profiles: list[TranscriptionProfile],
        *,
        share_session_id: str | None = None,
    ) -> None:
        await self._broadcast_frontend(
            WebsocketMsgTranscriptionProfilesUpdated(
                content=TranscriptionProfileList(profiles=profiles)
            ),
            share_session_id,
        )

    async def broadcast_ai_follow_tool_arguments_update(
        self,
        projectConfigId: ID,
        chatId: ID,
        idsByType: dict[FollowIdType, list[ID]],
        *,
        share_session_id: str | None = None,
    ):
        await self._broadcast_frontend(
            WebsocketMsgAIFollowToolArgumentsUpdate(
                content=AIFollowToolArgumentsUpdateContent(
                    projectConfigId=projectConfigId,
                    chatId=chatId,
                    idsByType=idsByType,
                )
            ),
            share_session_id,
        )

    async def broadcast_ai_follow_tool_result_update(
        self,
        projectConfigId: ID,
        chatId: ID,
        idsByType: dict[FollowIdType, list[ID]],
        *,
        share_session_id: str | None = None,
    ):
        await self._broadcast_frontend(
            WebsocketMsgAIFollowToolResultUpdate(
                content=AIFollowToolResultUpdateContent(
                    projectConfigId=projectConfigId,
                    chatId=chatId,
                    idsByType=idsByType,
                )
            ),
            share_session_id,
        )
