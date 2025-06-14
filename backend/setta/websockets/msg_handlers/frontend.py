from setta.lsp.specific_file_watcher import SpecificFileWatcher
from setta.project_state.lsp_response_handlers.diagnostics import (
    SettaProjectConfigDiagnostics,
)
from setta.project_state.project_manager import ProjectManager
from setta.types.ai import IDToUUIDForLLM
from setta.types.artifact import Artifact
from setta.types.chat_messages import LLMStreamingResponse, LLMStreamingResponseChunk
from setta.types.notifications import SettaNotification
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.websocket import (
    WebsocketConnectionType,
    WebsocketMsgAllDependencies,
    WebsocketMsgArtifact,
    WebsocketMsgLLMStreamingResponse,
    WebsocketMsgLSPDiagnostics,
    WebsocketMsgNewTerminalCreated,
    WebsocketMsgNotification,
    WebsocketMsgReturnRenameRefactorResults,
    WebsocketMsgSpecificFileWatcherUpdate,
    WebsocketMsgTerminalMetadata,
    WebsocketMsgUpdateFrontendProjectState,
    WebsocketMsgUUIDMappingForLLM,
)
from setta.utils.constants import C
from setta.websockets.msg_handlers.base import (
    BaseWebsocketMsgReceiver,
    BaseWebsocketMsgSender,
)
from setta.websockets.script_metadata import ScriptMetadata
from setta.websockets.websocket_manager import WebsocketManager


class WMHFrontendReceiver(BaseWebsocketMsgReceiver):
    def __init__(
        self,
        websocket_manager: WebsocketManager,
        project_manager: ProjectManager,
        script_metadata: ScriptMetadata,
        specific_file_watcher: SpecificFileWatcher,
    ):
        self.websocket_manager = websocket_manager
        self.project_manager = project_manager
        self.script_metadata = script_metadata
        self.specific_file_watcher = specific_file_watcher

    async def process_message(self, message, fromWebsocketId):
        if message.get("messageType") == C.WS_CALL_INTERACTIVE_FNS:
            print("WMHFrontend process_message", message, flush=True)
            wids = self.script_metadata.get_websocket_ids_listening_to_data(
                message["content"]
            )
            for wid in wids:
                await self.websocket_manager.send_message(message, wid)
        elif message.get("messageType") == C.WS_UPDATE_PROJECT_STATE:
            await self.project_manager.update_from_frontend(
                messageId=message["id"],
                projectState=ProjectStateSingleConfig.model_validate(
                    message["content"]["projectState"]
                ),
                requestRenameRefactor=message["content"]["requestRenameRefactor"],
            )

    async def on_connect(self, websocket_id: str):
        await self.websocket_manager.send_message(
            WebsocketMsgAllDependencies(content=self.script_metadata.dependencies),
            websocket_id,
        )
        self.specific_file_watcher.request_read_all_files()


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

    async def broadcast_project_state(self, project_state: ProjectStateSingleConfig):
        await self.websocket_manager.broadcast(
            WebsocketMsgUpdateFrontendProjectState(content=project_state),
            connectionType=WebsocketConnectionType.FRONTEND,
        )

    async def broadcast_file_updates(self, content):
        await self.websocket_manager.broadcast(
            WebsocketMsgSpecificFileWatcherUpdate(content=content),
            connectionType=WebsocketConnectionType.FRONTEND,
        )

    async def broadcast_terminal_metadata(self, terminal_metadata):
        await self.websocket_manager.broadcast(
            WebsocketMsgTerminalMetadata(content=terminal_metadata),
            connectionType=WebsocketConnectionType.FRONTEND,
        )

    async def send_new_terminal_id(self, projectConfigId, terminalId):
        await self.websocket_manager.broadcast(
            WebsocketMsgNewTerminalCreated(
                content={"projectConfigId": projectConfigId, "terminalId": terminalId}
            ),
            connectionType=WebsocketConnectionType.FRONTEND,
        )
