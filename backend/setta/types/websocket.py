from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, field_serializer, field_validator
from setta.code_gen.dependency_graph import RenameReferenceChangedValue
from setta.mcp.tool_metadata import FollowIdType
from setta.types.chat import APIKeys
from setta.types.generated.dependency_keys import (
    BaseDependencyKeyUnionWithDiscriminator,
)
from setta.types.generated.dependency_values import (
    BaseDependencyValueUnionWithDiscriminator,
)
from setta.types.generated.unions import BaseArtifactUnionWithDiscriminator
from setta.types.id import ID, create_new_id
from setta.types.listener import (
    DependencyEvent,
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
)
from setta.types.settings_state import RenameRefactorMode
from setta.utils.constants import C
from setta.utils.timestamps import get_now_timestamp, parse_timestamp_str


class UpdateArtifactMsgContent(BaseModel):
    artifacts: list[BaseArtifactUnionWithDiscriminator]
    updateType: Literal["update", "delete"]


class SettaSectionTypeErrors(BaseModel):
    callable: list[str] = Field(default_factory=list)
    params: dict[ID, list[str]] = Field(default_factory=dict)


class SettaProjectConfigDiagnostics(BaseModel):
    projectConfigId: ID
    errors: dict[ID, SettaSectionTypeErrors] = Field(default_factory=dict)
    isGenCode: bool


class SettaLspDiagnosticPosition(BaseModel):
    line: int
    character: int


class SettaLspDiagnosticRange(BaseModel):
    start: SettaLspDiagnosticPosition
    end: SettaLspDiagnosticPosition


class SettaLspDiagnostic(BaseModel):
    message: str
    severity: int | None = None
    code: str | int | None = None
    source: str | None = None
    range: SettaLspDiagnosticRange
    uri: str | None = None


class SettaLspDiagnosticsPayload(BaseModel):
    projectConfigId: ID
    genCode: SettaProjectConfigDiagnostics
    codeSections: dict[ID, list[SettaLspDiagnostic]] = Field(default_factory=dict)
    unmappedGenCode: list[SettaLspDiagnostic] = Field(default_factory=list)


class SettaProjectNameValidationErrors(BaseModel):
    projectConfigId: ID
    projectErrors: list[str] = Field(default_factory=list)
    sectionErrors: dict[ID, list[str]] = Field(default_factory=dict)
    paramErrors: dict[ID, list[str]] = Field(default_factory=dict)


class ManagedAPIKeysSnapshot(BaseModel):
    apiKeys: APIKeys = Field(default_factory=dict)
    revision: int = Field(ge=0)
    corrupt: bool = False
    errorCode: str | None = None
    message: str | None = None


class EngineType(str, Enum):
    setta_llm = "setta_llm"
    external_agent = "external_agent"


class EngineConfigDefaults(BaseModel, extra="forbid"):
    thinking: bool | None = None


class EngineConfig(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    name: str
    engineType: EngineType
    settaLlmConfigId: str | None = None
    externalAgentConfigId: ID | None = None
    defaults: EngineConfigDefaults = Field(default_factory=EngineConfigDefaults)


class TranscriptionTransportMode(str, Enum):
    auto = "auto"
    file = "file"
    realtime = "realtime"


class TranscriptionProfile(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    name: str
    transcriptionLlmConfigId: str
    transportMode: TranscriptionTransportMode
    chunkMs: int = Field(ge=200, le=10_000)
    supportsRealtimeTranscription: bool = False
    language: str | None = None

    @field_validator("language", mode="before")
    @classmethod
    def parse_language(cls, value: Any) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError("language must be a string or null")
        stripped = value.strip()
        return stripped or None


class AgentProfile(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    name: str
    description: str = ""
    systemPrompt: str = ""
    enableBackgroundSummaryFill: bool = False
    enableLlmChatTitles: bool = False
    engineConfigId: ID | None = None
    toolAllowlist: list[str] = Field(default_factory=list)
    memoryScope: str | None = None


class AgentRunStatus(str, Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class RunEvent(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    timestamp: datetime = Field(default_factory=get_now_timestamp)
    type: str
    payload: dict[str, Any] = Field(default_factory=dict)

    @field_validator("timestamp", mode="before")
    @classmethod
    def parse_timestamp(cls, value: Any) -> datetime:
        if isinstance(value, str):
            return parse_timestamp_str(value)
        return value


class AgentRun(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    profileId: ID | None = None
    status: AgentRunStatus = AgentRunStatus.queued
    startedAt: datetime | None = None
    finishedAt: datetime | None = None
    inputs: dict[str, Any] | None = None
    outputs: dict[str, Any] | None = None
    toolCalls: list[dict[str, Any]] = Field(default_factory=list)
    cost: float | None = None
    events: list[RunEvent] = Field(default_factory=list)

    @field_validator("startedAt", "finishedAt", mode="before")
    @classmethod
    def parse_timestamp(cls, value: Any) -> datetime | None:
        if value is None:
            return None
        if isinstance(value, str):
            return parse_timestamp_str(value)
        return value


class ExternalAgentToolType(str, Enum):
    claude_code = "claude_code"
    codex = "codex"
    opencode = "opencode"


class ExternalAgentRunMode(str, Enum):
    mcp = "mcp"
    server = "server"
    sdk = "sdk"
    app_server = "app_server"


class ExternalAgentWorkingDirStrategy(str, Enum):
    project_root = "project_root"
    temp_dir = "temp_dir"
    custom = "custom"


class ExternalAgentSettingsMode(str, Enum):
    read_only = "read_only"
    managed_local = "managed_local"
    managed_project = "managed_project"
    explicit_path = "explicit_path"


class ClaudeSettingsSource(str, Enum):
    user = "user"
    project = "project"
    local = "local"


class ClaudeSettingsPermissions(BaseModel, extra="forbid"):
    allow: list[str] = Field(default_factory=list)
    ask: list[str] = Field(default_factory=list)
    deny: list[str] = Field(default_factory=list)


class ClaudeSettingsManaged(BaseModel, extra="forbid"):
    permissions: ClaudeSettingsPermissions | None = None
    defaultMode: str | None = None
    mcp: dict[str, Any] | None = None


class CodexSettingsManaged(BaseModel, extra="forbid"):
    approvalPolicy: str | None = None
    sandboxMode: str | None = None
    enabledTools: list[str] | None = None
    model: str | None = None


class OpenCodeSettingsManaged(BaseModel, extra="forbid"):
    permission: dict[str, str | dict[str, str]] | None = None
    mcp: dict[str, Any] | None = None
    model: str | None = None


class ExternalAgentSettingsManagedBlock(BaseModel, extra="forbid"):
    claude: ClaudeSettingsManaged | None = None
    codex: CodexSettingsManaged | None = None
    opencode: OpenCodeSettingsManaged | None = None


class ExternalAgentConfig(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    name: str
    description: str = ""
    toolType: ExternalAgentToolType
    runMode: ExternalAgentRunMode
    commandPath: str | None = None
    baseUrl: str | None = None
    defaultModel: str | None = None
    sandboxPolicy: str | None = None
    approvalPolicy: str | None = None
    settingsMode: ExternalAgentSettingsMode = ExternalAgentSettingsMode.managed_local
    settingsSources: list[ClaudeSettingsSource] | None = None
    settingsFilePath: str | None = None
    settingsAllowSettaEdits: bool = True
    settingsManagedBlock: ExternalAgentSettingsManagedBlock | None = None
    envVarWhitelist: list[str] = Field(default_factory=list)
    workingDirStrategy: ExternalAgentWorkingDirStrategy = (
        ExternalAgentWorkingDirStrategy.project_root
    )
    workingDir: str | None = None
    codexSkipGitRepoCheck: bool | None = None


class SettaNotificationType(str, Enum):
    error = "error"
    warning = "warning"
    info = "info"
    save = "save"


class SettaNotification(BaseModel):
    id: ID = Field(default_factory=create_new_id)
    projectConfigId: ID = Field(
        default_factory=lambda: ID(C.NOTIFICATION_IS_FOR_ALL_PROJECTS)
    )
    type: SettaNotificationType = SettaNotificationType.info
    message: str
    temporary: bool = True
    timestamp: datetime = Field(default_factory=get_now_timestamp)
    metadata: dict = Field(default_factory=dict)
    read_status: bool = False

    @field_serializer("timestamp")
    def serialize_timestamp(self, timestamp: datetime):
        return timestamp.isoformat()


class SettaBackendLogEventSeverity(str, Enum):
    critical = "critical"
    error = "error"
    warning = "warning"
    info = "info"


class SettaBackendLogEvent(BaseModel):
    id: ID = Field(default_factory=create_new_id)
    projectConfigId: ID | None = None
    severity: SettaBackendLogEventSeverity = SettaBackendLogEventSeverity.info
    message: str
    timestamp: datetime = Field(default_factory=get_now_timestamp)

    @field_serializer("timestamp")
    def serialize_timestamp(self, timestamp: datetime):
        return timestamp.isoformat()


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
    AgentRunUpdated = "AgentRunUpdated"
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
    FRONTEND = "FRONTEND"


class WebsocketConnectionInfo(BaseModel):
    id: str
    connectionType: WebsocketConnectionType
    currentAddress: str | None
    shareSessionId: str | None = None


class WebsocketMsg(BaseModel):
    id: str | None = None
    content: Any
    messageType: Any


class BackendWebsocketMsg(WebsocketMsg):
    pass


class PythonScriptWebsocketMsg(WebsocketMsg):
    pass


class FrontendIdentityContent(BaseModel):
    frontendAffinityToken: str


class RenameRefactorBroadcastContent(BaseModel):
    projectConfigId: ID
    frontendOpId: str
    renameMode: RenameRefactorMode
    changedNodeValues: list[RenameReferenceChangedValue]


class AIFollowToolArgumentsUpdateContent(BaseModel):
    projectConfigId: ID
    chatId: ID
    idsByType: dict[FollowIdType, list[ID]]


class AIFollowToolResultUpdateContent(BaseModel):
    projectConfigId: ID
    chatId: ID
    idsByType: dict[FollowIdType, list[ID]]


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


class ListenerCoverageSnapshot(BaseModel):
    projectConfigId: ID
    dependencies: list[BaseDependencyKeyUnionWithDiscriminator]
    hasRealtimeWildcard: bool


class RealtimeUIChangeContent(BaseModel):
    projectConfigId: ID
    dependencyKey: BaseDependencyKeyUnionWithDiscriminator
    value: BaseDependencyValueUnionWithDiscriminator


class RealtimeDependencyEventContent(BaseModel):
    projectConfigId: ID
    dependencyEvent: DependencyEvent


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
