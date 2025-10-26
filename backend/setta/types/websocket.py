from enum import Enum
from typing import Any, Literal

from fastapi import WebSocket
from pydantic import BaseModel, ConfigDict

from setta.code_gen.dependency_graph import RenameReferenceChangedValue
from setta.project_state.project_manager_types import (
    ProjectStateSingleConfigWithCompletedOpIds,
)
from setta.types.ai import IDToUUIDForLLM
from setta.types.chat_messages import LLMStreamingResponse
from setta.types.generated.settings_state import SettingsState
from setta.types.generated.unions import (
    BaseArtifactUnionWithDiscriminator,
)
from setta.types.listener import (
    ListenerAckContent,
    ListenerErrorContent,
    ListenerForceRefreshContent,
    ListenerFrontendEmitContent,
    ListenerRealtimeEventContent,
    ListenerRegisterAckContent,
    ListenerRegisterContent,
)
from setta.types.lsp import (
    SettaProjectConfigDiagnostics,
)
from setta.types.notifications import SettaNotification
from setta.types.project_state import AllProjectMetadata
from setta.types.settings_state import RenameRefactorMode


class WebsocketMsgTypeForFrontend(str, Enum):
    AllConnections = "AllConnections"
    LSPDiagnostics = "LSPDiagnostics"
    TerminalMetadata = "TerminalMetadata"
    Notification = "Notification"
    LLMStreamingResponse = "LLMStreamingResponse"
    UUIDMappingForLLM = "UUIDMappingForLLM"
    ReturnRenameRefactorResults = "ReturnRenameRefactorResults"
    UpdateFrontendProjectState = "UpdateFrontendProjectState"
    UpdateSettings = "UpdateSettings"
    AllProjectMetadata = "AllProjectMetadata"
    UpdateArtifacts = "UpdateArtifacts"


class WebsocketMsgTypeForBackend(str, Enum):
    CurrentAddressUpdate = "CurrentAddressUpdate"


class WebsocketMsgTypeForPythonScript(str, Enum):
    ListenerRegister = "ListenerRegister"
    ListenerRegisterAck = "ListenerRegisterAck"
    ListenerBootstrap = "ListenerBootstrap"
    ListenerPersistedUpdate = "ListenerPersistedUpdate"
    ListenerRealtimeEvent = "ListenerRealtimeEvent"
    ListenerForceRefresh = "ListenerForceRefresh"
    ListenerAck = "ListenerAck"
    ListenerError = "ListenerError"
    ListenerFrontendEmit = "ListenerFrontendEmit"


class WebsocketConnectionType(str, Enum):
    CLI = "CLI"
    SERVER = "SERVER"
    PYTHON_SCRIPT = "PYTHON_SCRIPT"
    FRONTEND = "FRONTEND"


class WebsocketConnectionInfo(BaseModel):
    id: str
    connectionType: WebsocketConnectionType
    currentAddress: str | None


class WebsocketConnectionInfoWithSocket(WebsocketConnectionInfo):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    websocket: WebSocket


class WebsocketMsg(BaseModel):
    id: str | None = None
    content: Any
    messageType: Any


class FrontendWebsocketMsg(WebsocketMsg):
    pass


class BackendWebsocketMsg(WebsocketMsg):
    pass


class PythonScriptWebsocketMsg(WebsocketMsg):
    pass


class UpdateArtifactMsgContent(BaseModel):
    artifacts: list[BaseArtifactUnionWithDiscriminator]
    updateType: Literal["update", "delete"]


class WebsocketMsgAllConnections(FrontendWebsocketMsg):
    content: list[WebsocketConnectionInfo]
    messageType: Literal[WebsocketMsgTypeForFrontend.AllConnections] = (
        WebsocketMsgTypeForFrontend.AllConnections
    )


# class WebsocketMsgArtifact(FrontendWebsocketMsg):
#     content: Artifact
#     messageType: Literal[WebsocketMsgTypeForFrontend.Artifact] = (
#         WebsocketMsgTypeForFrontend.Artifact
#     )


class WebsocketMsgNotification(FrontendWebsocketMsg):
    content: SettaNotification
    messageType: Literal[WebsocketMsgTypeForFrontend.Notification] = (
        WebsocketMsgTypeForFrontend.Notification
    )


class WebsocketMsgLLMStreamingResponse(FrontendWebsocketMsg):
    content: LLMStreamingResponse
    messageType: Literal[WebsocketMsgTypeForFrontend.LLMStreamingResponse] = (
        WebsocketMsgTypeForFrontend.LLMStreamingResponse
    )


class WebsocketMsgUUIDMappingForLLM(FrontendWebsocketMsg):
    content: IDToUUIDForLLM
    messageType: Literal[WebsocketMsgTypeForFrontend.UUIDMappingForLLM] = (
        WebsocketMsgTypeForFrontend.UUIDMappingForLLM
    )


class WebsocketMsgLSPDiagnostics(FrontendWebsocketMsg):
    content: SettaProjectConfigDiagnostics
    messageType: Literal[WebsocketMsgTypeForFrontend.LSPDiagnostics] = (
        WebsocketMsgTypeForFrontend.LSPDiagnostics
    )


class RenameRefactorBroadcastContent(BaseModel):
    projectConfigId: str
    frontendOpId: str
    renameMode: RenameRefactorMode
    changedNodeValues: list[RenameReferenceChangedValue]


class WebsocketMsgReturnRenameRefactorResults(FrontendWebsocketMsg):
    content: RenameRefactorBroadcastContent
    messageType: Literal[WebsocketMsgTypeForFrontend.ReturnRenameRefactorResults] = (
        WebsocketMsgTypeForFrontend.ReturnRenameRefactorResults
    )


class WebsocketMsgUpdateFrontendProjectState(FrontendWebsocketMsg):
    content: ProjectStateSingleConfigWithCompletedOpIds
    messageType: Literal[WebsocketMsgTypeForFrontend.UpdateFrontendProjectState] = (
        WebsocketMsgTypeForFrontend.UpdateFrontendProjectState
    )


class WebsocketMsgTerminalMetadata(FrontendWebsocketMsg):
    content: Any
    messageType: Literal[WebsocketMsgTypeForFrontend.TerminalMetadata] = (
        WebsocketMsgTypeForFrontend.TerminalMetadata
    )


class WebsocketMsgUpdateSettings(FrontendWebsocketMsg):
    content: SettingsState
    messageType: Literal[WebsocketMsgTypeForFrontend.UpdateSettings] = (
        WebsocketMsgTypeForFrontend.UpdateSettings
    )


class WebsocketMsgAllProjectMetadata(FrontendWebsocketMsg):
    content: AllProjectMetadata
    messageType: Literal[WebsocketMsgTypeForFrontend.AllProjectMetadata] = (
        WebsocketMsgTypeForFrontend.AllProjectMetadata
    )


class WebsocketMsgUpdateArtifacts(FrontendWebsocketMsg):
    content: UpdateArtifactMsgContent
    messageType: Literal[WebsocketMsgTypeForFrontend.UpdateArtifacts] = (
        WebsocketMsgTypeForFrontend.UpdateArtifacts
    )


class WebsocketMsgCurrentAddressUpdate(BackendWebsocketMsg):
    content: str
    messageType: Literal[WebsocketMsgTypeForBackend.CurrentAddressUpdate] = (
        WebsocketMsgTypeForBackend.CurrentAddressUpdate
    )


class WebsocketMsgListenerBootstrap(PythonScriptWebsocketMsg):
    content: ProjectStateSingleConfigWithCompletedOpIds
    messageType: Literal[WebsocketMsgTypeForPythonScript.ListenerBootstrap] = (
        WebsocketMsgTypeForPythonScript.ListenerBootstrap
    )


class WebsocketMsgListenerPersistedUpdate(PythonScriptWebsocketMsg):
    content: ProjectStateSingleConfigWithCompletedOpIds
    messageType: Literal[WebsocketMsgTypeForPythonScript.ListenerPersistedUpdate] = (
        WebsocketMsgTypeForPythonScript.ListenerPersistedUpdate
    )


class WebsocketMsgListenerRealtimeEvent(PythonScriptWebsocketMsg):
    content: ListenerRealtimeEventContent
    messageType: Literal[WebsocketMsgTypeForPythonScript.ListenerRealtimeEvent] = (
        WebsocketMsgTypeForPythonScript.ListenerRealtimeEvent
    )


class WebsocketMsgListenerForceRefresh(PythonScriptWebsocketMsg):
    content: ListenerForceRefreshContent
    messageType: Literal[WebsocketMsgTypeForPythonScript.ListenerForceRefresh] = (
        WebsocketMsgTypeForPythonScript.ListenerForceRefresh
    )


class WebsocketMsgListenerAck(PythonScriptWebsocketMsg):
    content: ListenerAckContent
    messageType: Literal[WebsocketMsgTypeForPythonScript.ListenerAck] = (
        WebsocketMsgTypeForPythonScript.ListenerAck
    )


class WebsocketMsgListenerError(PythonScriptWebsocketMsg):
    content: ListenerErrorContent
    messageType: Literal[WebsocketMsgTypeForPythonScript.ListenerError] = (
        WebsocketMsgTypeForPythonScript.ListenerError
    )


class WebsocketMsgListenerFrontendEmit(PythonScriptWebsocketMsg):
    content: ListenerFrontendEmitContent
    messageType: Literal[WebsocketMsgTypeForPythonScript.ListenerFrontendEmit] = (
        WebsocketMsgTypeForPythonScript.ListenerFrontendEmit
    )


class WebsocketMsgListenerRegister(PythonScriptWebsocketMsg):
    content: ListenerRegisterContent
    messageType: Literal[WebsocketMsgTypeForPythonScript.ListenerRegister] = (
        WebsocketMsgTypeForPythonScript.ListenerRegister
    )


class WebsocketMsgListenerRegisterAck(PythonScriptWebsocketMsg):
    content: ListenerRegisterAckContent
    messageType: Literal[WebsocketMsgTypeForPythonScript.ListenerRegisterAck] = (
        WebsocketMsgTypeForPythonScript.ListenerRegisterAck
    )
