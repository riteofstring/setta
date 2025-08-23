from setta.types.ai import IDToUUIDForLLM
from setta.types.artifact import Artifact
from setta.types.chat_messages import LLMStreamingResponse, LLMStreamingResponseChunk
from setta.types.generated.settings_state import SettingsState
from setta.types.lsp import (
    SettaProjectConfigDiagnostics,
)
from setta.types.notifications import SettaNotification
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.websocket import (
    WebsocketConnectionType,
    WebsocketMsgArtifact,
    WebsocketMsgLLMStreamingResponse,
    WebsocketMsgLSPDiagnostics,
    WebsocketMsgNotification,
    WebsocketMsgReturnRenameRefactorResults,
    WebsocketMsgTerminalMetadata,
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

    async def broadcast_artifact(self, artifact: Artifact):
        await self.websocket_manager.broadcast(
            message=WebsocketMsgArtifact(content=artifact),
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

    async def return_rename_refactor_results(self, content, messageId):
        await self.websocket_manager.return_to_requester(
            WebsocketMsgReturnRenameRefactorResults(content=content),
            messageId,
        )

    async def broadcast_project_state(self, projectState: ProjectStateSingleConfig):
        await self.websocket_manager.broadcast(
            WebsocketMsgUpdateFrontendProjectState(content=projectState),
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
