from enum import Enum
from typing import Any, Literal

from fastapi import WebSocket
from pydantic import BaseModel, ConfigDict, Field

from setta.mcp.tool_metadata import FollowIdType
from setta.project_state.project_manager_types import (
    ProjectStateSingleConfigWithCompletedOpIds,
    RenameRefactorBroadcastContent,
)
from setta.types.agentic import (
    AgentProfileList,
    EngineConfigList,
    TranscriptionProfileList,
)
from setta.types.artifact_messages import UpdateArtifactMsgContent
from setta.types.chat import APIKeys
from setta.types.chat_stream_events import LLMStreamingResponse
from setta.types.external_agents import ExternalAgentConfigList
from setta.types.generated.settings_state import SettingsState
from setta.types.id import ID
from setta.types.listener import (
    ListenerCoverageSnapshot,
    ListenerDependencyEventContent,
    ListenerErrorContent,
    ListenerForceRefreshContent,
    ListenerFrontendEmitRawContent,
    ListenerInitContent,
    ListenerRealtimeEventContent,
    ListenerRegisterAckContent,
    ListenerRegisterContent,
    ListenerRouterEndpointCallContent,
    ListenerRouterEndpointResultContent,
    RealtimeDependencyEventContent,
    RealtimeUIChangeContent,
)
from setta.types.llm_config import AllLLMConfigs
from setta.types.lsp import SettaLspDiagnosticsPayload
from setta.types.name_validation import SettaProjectNameValidationErrors
from setta.types.notifications import SettaBackendLogEvent, SettaNotification
from setta.types.project_state import AllProjectMetadata
from setta.types.prompt import PromptTemplateList


class WebsocketMsgTypeForFrontend(str, Enum):
    AllConnections = "AllConnections"
    FrontendIdentity = "FrontendIdentity"
    LSPDiagnostics = "LSPDiagnostics"
    NameValidationErrors = "NameValidationErrors"
    TerminalMetadata = "TerminalMetadata"
    Notification = "Notification"
    BackendLogEvent = "BackendLogEvent"
    LLMStreamingResponse = "LLMStreamingResponse"
    ReturnRenameRefactorResults = "ReturnRenameRefactorResults"
    UpdateFrontendProjectState = "UpdateFrontendProjectState"
    UpdateSettings = "UpdateSettings"
    AllProjectMetadata = "AllProjectMetadata"
    UpdateArtifacts = "UpdateArtifacts"
    ListenerCoverageSnapshot = "ListenerCoverageSnapshot"
    LLMConfigUpdated = "LLMConfigUpdated"
    LLMApiKeysUpdated = "LLMApiKeysUpdated"
    AIFollowToolArgumentsUpdate = "AIFollowToolArgumentsUpdate"
    AIFollowToolResultUpdate = "AIFollowToolResultUpdate"
    UISettingReveal = "UISettingReveal"
    AgentProfilesUpdated = "AgentProfilesUpdated"
    PromptTemplatesUpdated = "PromptTemplatesUpdated"
    ExternalAgentConfigsUpdated = "ExternalAgentConfigsUpdated"
    EngineConfigsUpdated = "EngineConfigsUpdated"
    TranscriptionProfilesUpdated = "TranscriptionProfilesUpdated"


class WebsocketMsgTypeForBackend(str, Enum):
    CurrentAddressUpdate = "CurrentAddressUpdate"
    RealtimeUIChange = "RealtimeUIChange"
    RealtimeDependencyEvent = "RealtimeDependencyEvent"
    UISettingRevealResult = "UISettingRevealResult"


class WebsocketMsgTypeForPythonScript(str, Enum):
    ListenerInit = "ListenerInit"
    ListenerRegister = "ListenerRegister"
    ListenerRegisterAck = "ListenerRegisterAck"
    ListenerRealtimeEvent = "ListenerRealtimeEvent"
    ListenerDependencyEvent = "ListenerDependencyEvent"
    ListenerForceRefresh = "ListenerForceRefresh"
    ListenerError = "ListenerError"
    ListenerFrontendEmit = "ListenerFrontendEmit"
    ListenerRouterEndpointCall = "ListenerRouterEndpointCall"
    ListenerRouterEndpointResult = "ListenerRouterEndpointResult"


class WebsocketConnectionType(str, Enum):
    CLI = "CLI"
    SERVER = "SERVER"
    PYTHON_SCRIPT = "PYTHON_SCRIPT"
    FRONTEND = "FRONTEND"


class WebsocketConnectionInfo(BaseModel):
    id: str
    connectionType: WebsocketConnectionType
    currentAddress: str | None
    shareSessionId: str | None = None


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


class WebsocketMsgAllConnections(FrontendWebsocketMsg):
    content: list[WebsocketConnectionInfo]
    messageType: Literal[WebsocketMsgTypeForFrontend.AllConnections] = (
        WebsocketMsgTypeForFrontend.AllConnections
    )


class FrontendIdentityContent(BaseModel):
    frontendAffinityToken: str


class WebsocketMsgFrontendIdentity(FrontendWebsocketMsg):
    content: FrontendIdentityContent
    messageType: Literal[WebsocketMsgTypeForFrontend.FrontendIdentity] = (
        WebsocketMsgTypeForFrontend.FrontendIdentity
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


class WebsocketMsgBackendLogEvent(FrontendWebsocketMsg):
    content: SettaBackendLogEvent
    messageType: Literal[WebsocketMsgTypeForFrontend.BackendLogEvent] = (
        WebsocketMsgTypeForFrontend.BackendLogEvent
    )


class WebsocketMsgLLMStreamingResponse(FrontendWebsocketMsg):
    content: LLMStreamingResponse
    messageType: Literal[WebsocketMsgTypeForFrontend.LLMStreamingResponse] = (
        WebsocketMsgTypeForFrontend.LLMStreamingResponse
    )


class WebsocketMsgLSPDiagnostics(FrontendWebsocketMsg):
    content: SettaLspDiagnosticsPayload
    messageType: Literal[WebsocketMsgTypeForFrontend.LSPDiagnostics] = (
        WebsocketMsgTypeForFrontend.LSPDiagnostics
    )


class WebsocketMsgNameValidationErrors(FrontendWebsocketMsg):
    content: SettaProjectNameValidationErrors
    messageType: Literal[WebsocketMsgTypeForFrontend.NameValidationErrors] = (
        WebsocketMsgTypeForFrontend.NameValidationErrors
    )


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


class WebsocketMsgListenerCoverageSnapshot(FrontendWebsocketMsg):
    content: ListenerCoverageSnapshot
    messageType: Literal[WebsocketMsgTypeForFrontend.ListenerCoverageSnapshot] = (
        WebsocketMsgTypeForFrontend.ListenerCoverageSnapshot
    )


class WebsocketMsgLLMConfigUpdated(FrontendWebsocketMsg):
    content: AllLLMConfigs
    messageType: Literal[WebsocketMsgTypeForFrontend.LLMConfigUpdated] = (
        WebsocketMsgTypeForFrontend.LLMConfigUpdated
    )


class WebsocketMsgLLMApiKeysUpdated(FrontendWebsocketMsg):
    content: APIKeys
    messageType: Literal[WebsocketMsgTypeForFrontend.LLMApiKeysUpdated] = (
        WebsocketMsgTypeForFrontend.LLMApiKeysUpdated
    )


class WebsocketMsgAgentProfilesUpdated(FrontendWebsocketMsg):
    content: AgentProfileList
    messageType: Literal[WebsocketMsgTypeForFrontend.AgentProfilesUpdated] = (
        WebsocketMsgTypeForFrontend.AgentProfilesUpdated
    )


class WebsocketMsgPromptTemplatesUpdated(FrontendWebsocketMsg):
    content: PromptTemplateList
    messageType: Literal[WebsocketMsgTypeForFrontend.PromptTemplatesUpdated] = (
        WebsocketMsgTypeForFrontend.PromptTemplatesUpdated
    )


class WebsocketMsgExternalAgentConfigsUpdated(FrontendWebsocketMsg):
    content: ExternalAgentConfigList
    messageType: Literal[WebsocketMsgTypeForFrontend.ExternalAgentConfigsUpdated] = (
        WebsocketMsgTypeForFrontend.ExternalAgentConfigsUpdated
    )


class WebsocketMsgEngineConfigsUpdated(FrontendWebsocketMsg):
    content: EngineConfigList
    messageType: Literal[WebsocketMsgTypeForFrontend.EngineConfigsUpdated] = (
        WebsocketMsgTypeForFrontend.EngineConfigsUpdated
    )


class WebsocketMsgTranscriptionProfilesUpdated(FrontendWebsocketMsg):
    content: TranscriptionProfileList
    messageType: Literal[WebsocketMsgTypeForFrontend.TranscriptionProfilesUpdated] = (
        WebsocketMsgTypeForFrontend.TranscriptionProfilesUpdated
    )


class AIFollowToolArgumentsUpdateContent(BaseModel):
    projectConfigId: ID
    chatId: ID
    idsByType: dict[FollowIdType, list[ID]]


class WebsocketMsgAIFollowToolArgumentsUpdate(FrontendWebsocketMsg):
    content: AIFollowToolArgumentsUpdateContent
    messageType: Literal[WebsocketMsgTypeForFrontend.AIFollowToolArgumentsUpdate] = (
        WebsocketMsgTypeForFrontend.AIFollowToolArgumentsUpdate
    )


class AIFollowToolResultUpdateContent(BaseModel):
    projectConfigId: ID
    chatId: ID
    idsByType: dict[FollowIdType, list[ID]]


class WebsocketMsgAIFollowToolResultUpdate(FrontendWebsocketMsg):
    content: AIFollowToolResultUpdateContent
    messageType: Literal[WebsocketMsgTypeForFrontend.AIFollowToolResultUpdate] = (
        WebsocketMsgTypeForFrontend.AIFollowToolResultUpdate
    )


class UISettingRevealActivationStep(BaseModel):
    type: Literal[
        "project_ai_settings_accordion_item",
        "run_instructions_accordion_item",
    ]
    itemValue: str


class UISettingRevealTarget(BaseModel):
    settingId: str
    side: Literal["left", "right"]
    overviewTabKey: str | None = None
    uiEditorTabName: str | None = None
    pluginId: str | None = None
    paneId: str | None = None
    strategy: Literal["dom_anchor", "plugin_handler"]
    anchorId: str | None = None
    pluginRevealKey: str | None = None
    revealActivationSteps: list[UISettingRevealActivationStep] = Field(
        default_factory=list
    )


class UISettingRevealContent(BaseModel):
    projectConfigId: ID
    chatId: ID | None = None
    activeSectionId: ID | None = None
    reveals: list[UISettingRevealTarget]
    durationMs: int = 3000
    requestId: str


class WebsocketMsgUISettingReveal(FrontendWebsocketMsg):
    content: UISettingRevealContent
    messageType: Literal[WebsocketMsgTypeForFrontend.UISettingReveal] = (
        WebsocketMsgTypeForFrontend.UISettingReveal
    )


class UISettingRevealResultStatus(BaseModel):
    settingId: str
    status: Literal["revealed", "failed"]
    errorCode: str | None = None
    errorMessage: str | None = None


class UISettingRevealResultContent(BaseModel):
    projectConfigId: ID
    requestId: str
    statuses: list[UISettingRevealResultStatus]


class WebsocketMsgUISettingRevealResult(BackendWebsocketMsg):
    content: UISettingRevealResultContent
    messageType: Literal[WebsocketMsgTypeForBackend.UISettingRevealResult] = (
        WebsocketMsgTypeForBackend.UISettingRevealResult
    )


class WebsocketMsgRealtimeUIChange(BackendWebsocketMsg):
    content: RealtimeUIChangeContent
    messageType: Literal[WebsocketMsgTypeForBackend.RealtimeUIChange] = (
        WebsocketMsgTypeForBackend.RealtimeUIChange
    )


class WebsocketMsgRealtimeDependencyEvent(BackendWebsocketMsg):
    content: RealtimeDependencyEventContent
    messageType: Literal[WebsocketMsgTypeForBackend.RealtimeDependencyEvent] = (
        WebsocketMsgTypeForBackend.RealtimeDependencyEvent
    )


class WebsocketMsgCurrentAddressUpdate(BackendWebsocketMsg):
    content: str
    messageType: Literal[WebsocketMsgTypeForBackend.CurrentAddressUpdate] = (
        WebsocketMsgTypeForBackend.CurrentAddressUpdate
    )


class WebsocketMsgListenerRealtimeEvent(PythonScriptWebsocketMsg):
    content: ListenerRealtimeEventContent
    messageType: Literal[WebsocketMsgTypeForPythonScript.ListenerRealtimeEvent] = (
        WebsocketMsgTypeForPythonScript.ListenerRealtimeEvent
    )


class WebsocketMsgListenerDependencyEvent(PythonScriptWebsocketMsg):
    content: ListenerDependencyEventContent
    messageType: Literal[WebsocketMsgTypeForPythonScript.ListenerDependencyEvent] = (
        WebsocketMsgTypeForPythonScript.ListenerDependencyEvent
    )


class WebsocketMsgListenerForceRefresh(PythonScriptWebsocketMsg):
    content: ListenerForceRefreshContent
    messageType: Literal[WebsocketMsgTypeForPythonScript.ListenerForceRefresh] = (
        WebsocketMsgTypeForPythonScript.ListenerForceRefresh
    )


class WebsocketMsgListenerError(PythonScriptWebsocketMsg):
    content: ListenerErrorContent
    messageType: Literal[WebsocketMsgTypeForPythonScript.ListenerError] = (
        WebsocketMsgTypeForPythonScript.ListenerError
    )


class WebsocketMsgListenerFrontendEmit(PythonScriptWebsocketMsg):
    content: ListenerFrontendEmitRawContent
    messageType: Literal[WebsocketMsgTypeForPythonScript.ListenerFrontendEmit] = (
        WebsocketMsgTypeForPythonScript.ListenerFrontendEmit
    )


class WebsocketMsgListenerRouterEndpointCall(PythonScriptWebsocketMsg):
    content: ListenerRouterEndpointCallContent
    messageType: Literal[WebsocketMsgTypeForPythonScript.ListenerRouterEndpointCall] = (
        WebsocketMsgTypeForPythonScript.ListenerRouterEndpointCall
    )


class WebsocketMsgListenerRouterEndpointResult(PythonScriptWebsocketMsg):
    content: ListenerRouterEndpointResultContent
    messageType: Literal[
        WebsocketMsgTypeForPythonScript.ListenerRouterEndpointResult
    ] = WebsocketMsgTypeForPythonScript.ListenerRouterEndpointResult


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


class WebsocketMsgListenerInit(PythonScriptWebsocketMsg):
    content: ListenerInitContent
    messageType: Literal[WebsocketMsgTypeForPythonScript.ListenerInit] = (
        WebsocketMsgTypeForPythonScript.ListenerInit
    )
