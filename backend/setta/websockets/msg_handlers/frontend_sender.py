from typing import Literal

from setta.project_state.project_manager_types import (
    ProjectStateSingleConfigWithCompletedOpIds,
    RenameRefactorBroadcastContent,
)
from setta.types.ai import APIKeys, IDToUUIDForLLM
from setta.types.artifact_messages import UpdateArtifactMsgContent
from setta.types.chat_stream_events import (
    LLMStreamingResponse,
    LLMStreamingResponseChunk,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.generated.unions import BaseArtifactUnion
from setta.types.listener import ListenerCoverageSnapshot
from setta.types.llm_config import AllLLMConfigs
from setta.types.lsp import (
    SettaProjectConfigDiagnostics,
)
from setta.types.notifications import SettaNotification
from setta.types.project_config import ProjectConfig
from setta.types.project_state import (
    AllProjectMetadata,
    ProjectStateSingleConfig,
)
from setta.types.websocket import (
    WebsocketConnectionType,
    WebsocketMsgAllProjectMetadata,
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
    WebsocketMsgUUIDMappingForLLM,
)
from setta.websockets.msg_handlers.base import BaseWebsocketMsgSender


class WMHFrontendSender(BaseWebsocketMsgSender):
    async def broadcast_notification(self, notification: SettaNotification):
        await self.websocket_manager.broadcast(
            WebsocketMsgNotification(content=notification),
            connectionType=WebsocketConnectionType.FRONTEND,
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
        chatId: str,
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

    async def send_uuid_mapping(self, id_to_uuid: IDToUUIDForLLM):
        await self.websocket_manager.broadcast(
            WebsocketMsgUUIDMappingForLLM(content=id_to_uuid),
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
