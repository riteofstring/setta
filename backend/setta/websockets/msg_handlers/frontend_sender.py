from typing import Any, Literal

from setta.project_state.project_manager_types import (
    ProjectStateSingleConfigWithCompletedOpIds,
)
from setta.types.ai import IDToUUIDForLLM
from setta.types.chat_messages import LLMStreamingResponse, LLMStreamingResponseChunk
from setta.types.generated.settings_state import SettingsState
from setta.types.generated.unions import BaseArtifactUnion
from setta.types.listener import ListenerFrontendEmitContent
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
    RenameRefactorBroadcastContent,
    UpdateArtifactMsgContent,
    WebsocketConnectionType,
    WebsocketMsgAllProjectMetadata,
    WebsocketMsgListenerFrontendEmitForward,
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
        assistant_message_id: str | None,
        chunk: LLMStreamingResponseChunk,
    ):
        await self.websocket_manager.broadcast(
            WebsocketMsgLLMStreamingResponse(
                content=LLMStreamingResponse(
                    chatId=chatId,
                    assistantMessageId=assistant_message_id,
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

    async def broadcast_listener_emit(
        self,
        *,
        projectConfigId: str,
        payload: dict[str, Any],
        target: str | None = None,
    ):
        await self.websocket_manager.broadcast(
            WebsocketMsgListenerFrontendEmitForward(
                content=ListenerFrontendEmitContent(
                    projectConfigId=projectConfigId,
                    payload=payload,
                    target=target,
                )
            ),
            connectionType=WebsocketConnectionType.FRONTEND,
        )
