from typing import Annotated

from pydantic import Field, TypeAdapter

from setta.types.websocket import (
    WebsocketMsgAgentProfilesUpdated,
    WebsocketMsgAIFollowToolArgumentsUpdate,
    WebsocketMsgAIFollowToolResultUpdate,
    WebsocketMsgAllConnections,
    WebsocketMsgAllProjectMetadata,
    WebsocketMsgBackendLogEvent,
    WebsocketMsgCurrentAddressUpdate,
    WebsocketMsgEngineConfigsUpdated,
    WebsocketMsgExternalAgentConfigsUpdated,
    WebsocketMsgFrontendIdentity,
    WebsocketMsgListenerCoverageSnapshot,
    WebsocketMsgListenerDependencyEvent,
    WebsocketMsgListenerError,
    WebsocketMsgListenerForceRefresh,
    WebsocketMsgListenerFrontendEmit,
    WebsocketMsgListenerInit,
    WebsocketMsgListenerRealtimeEvent,
    WebsocketMsgListenerRegister,
    WebsocketMsgListenerRegisterAck,
    WebsocketMsgListenerRouterEndpointCall,
    WebsocketMsgListenerRouterEndpointResult,
    WebsocketMsgLLMApiKeysUpdated,
    WebsocketMsgLLMConfigUpdated,
    WebsocketMsgLLMStreamingResponse,
    WebsocketMsgLSPDiagnostics,
    WebsocketMsgNameValidationErrors,
    WebsocketMsgNotification,
    WebsocketMsgPromptTemplatesUpdated,
    WebsocketMsgRealtimeDependencyEvent,
    WebsocketMsgRealtimeUIChange,
    WebsocketMsgReturnRenameRefactorResults,
    WebsocketMsgTerminalMetadata,
    WebsocketMsgTranscriptionProfilesUpdated,
    WebsocketMsgUISettingReveal,
    WebsocketMsgUISettingRevealResult,
    WebsocketMsgUpdateArtifacts,
    WebsocketMsgUpdateFrontendProjectState,
    WebsocketMsgUpdateSettings,
)

WebsocketMsgUnion = (
    WebsocketMsgAllConnections
    | WebsocketMsgFrontendIdentity
    | WebsocketMsgNotification
    | WebsocketMsgBackendLogEvent
    | WebsocketMsgLLMStreamingResponse
    | WebsocketMsgLSPDiagnostics
    | WebsocketMsgNameValidationErrors
    | WebsocketMsgReturnRenameRefactorResults
    | WebsocketMsgUpdateFrontendProjectState
    | WebsocketMsgTerminalMetadata
    | WebsocketMsgUpdateSettings
    | WebsocketMsgAllProjectMetadata
    | WebsocketMsgUpdateArtifacts
    | WebsocketMsgListenerCoverageSnapshot
    | WebsocketMsgLLMConfigUpdated
    | WebsocketMsgLLMApiKeysUpdated
    | WebsocketMsgAgentProfilesUpdated
    | WebsocketMsgPromptTemplatesUpdated
    | WebsocketMsgExternalAgentConfigsUpdated
    | WebsocketMsgEngineConfigsUpdated
    | WebsocketMsgTranscriptionProfilesUpdated
    | WebsocketMsgAIFollowToolArgumentsUpdate
    | WebsocketMsgAIFollowToolResultUpdate
    | WebsocketMsgUISettingReveal
    | WebsocketMsgUISettingRevealResult
    | WebsocketMsgRealtimeUIChange
    | WebsocketMsgRealtimeDependencyEvent
    | WebsocketMsgCurrentAddressUpdate
    | WebsocketMsgListenerRealtimeEvent
    | WebsocketMsgListenerDependencyEvent
    | WebsocketMsgListenerForceRefresh
    | WebsocketMsgListenerError
    | WebsocketMsgListenerFrontendEmit
    | WebsocketMsgListenerRouterEndpointCall
    | WebsocketMsgListenerRouterEndpointResult
    | WebsocketMsgListenerRegister
    | WebsocketMsgListenerRegisterAck
    | WebsocketMsgListenerInit
)

WebsocketMsgUnionWithDiscriminator = Annotated[
    WebsocketMsgUnion, Field(discriminator="messageType")
]

WebsocketMsgTypeAdapter = TypeAdapter(WebsocketMsgUnionWithDiscriminator)

WebsocketMsgTypeSet = set(
    [
        "AllConnections",
        "FrontendIdentity",
        "Notification",
        "BackendLogEvent",
        "LLMStreamingResponse",
        "LSPDiagnostics",
        "NameValidationErrors",
        "ReturnRenameRefactorResults",
        "UpdateFrontendProjectState",
        "TerminalMetadata",
        "UpdateSettings",
        "AllProjectMetadata",
        "UpdateArtifacts",
        "ListenerCoverageSnapshot",
        "LLMConfigUpdated",
        "LLMApiKeysUpdated",
        "AgentProfilesUpdated",
        "PromptTemplatesUpdated",
        "ExternalAgentConfigsUpdated",
        "EngineConfigsUpdated",
        "TranscriptionProfilesUpdated",
        "AIFollowToolArgumentsUpdate",
        "AIFollowToolResultUpdate",
        "UISettingReveal",
        "UISettingRevealResult",
        "RealtimeUIChange",
        "RealtimeDependencyEvent",
        "CurrentAddressUpdate",
        "ListenerRealtimeEvent",
        "ListenerDependencyEvent",
        "ListenerForceRefresh",
        "ListenerError",
        "ListenerFrontendEmit",
        "ListenerRouterEndpointCall",
        "ListenerRouterEndpointResult",
        "ListenerRegister",
        "ListenerRegisterAck",
        "ListenerInit",
    ]
)

FrontendWebsocketMsgUnion = (
    WebsocketMsgAllConnections
    | WebsocketMsgFrontendIdentity
    | WebsocketMsgNotification
    | WebsocketMsgBackendLogEvent
    | WebsocketMsgLLMStreamingResponse
    | WebsocketMsgLSPDiagnostics
    | WebsocketMsgNameValidationErrors
    | WebsocketMsgReturnRenameRefactorResults
    | WebsocketMsgUpdateFrontendProjectState
    | WebsocketMsgTerminalMetadata
    | WebsocketMsgUpdateSettings
    | WebsocketMsgAllProjectMetadata
    | WebsocketMsgUpdateArtifacts
    | WebsocketMsgListenerCoverageSnapshot
    | WebsocketMsgLLMConfigUpdated
    | WebsocketMsgLLMApiKeysUpdated
    | WebsocketMsgAgentProfilesUpdated
    | WebsocketMsgPromptTemplatesUpdated
    | WebsocketMsgExternalAgentConfigsUpdated
    | WebsocketMsgEngineConfigsUpdated
    | WebsocketMsgTranscriptionProfilesUpdated
    | WebsocketMsgAIFollowToolArgumentsUpdate
    | WebsocketMsgAIFollowToolResultUpdate
    | WebsocketMsgUISettingReveal
)

FrontendWebsocketMsgUnionWithDiscriminator = Annotated[
    FrontendWebsocketMsgUnion, Field(discriminator="messageType")
]

FrontendWebsocketMsgTypeAdapter = TypeAdapter(
    FrontendWebsocketMsgUnionWithDiscriminator
)

FrontendWebsocketMsgTypeSet = set(
    [
        "AllConnections",
        "FrontendIdentity",
        "Notification",
        "BackendLogEvent",
        "LLMStreamingResponse",
        "LSPDiagnostics",
        "NameValidationErrors",
        "ReturnRenameRefactorResults",
        "UpdateFrontendProjectState",
        "TerminalMetadata",
        "UpdateSettings",
        "AllProjectMetadata",
        "UpdateArtifacts",
        "ListenerCoverageSnapshot",
        "LLMConfigUpdated",
        "LLMApiKeysUpdated",
        "AgentProfilesUpdated",
        "PromptTemplatesUpdated",
        "ExternalAgentConfigsUpdated",
        "EngineConfigsUpdated",
        "TranscriptionProfilesUpdated",
        "AIFollowToolArgumentsUpdate",
        "AIFollowToolResultUpdate",
        "UISettingReveal",
    ]
)

BackendWebsocketMsgUnion = (
    WebsocketMsgUISettingRevealResult
    | WebsocketMsgRealtimeUIChange
    | WebsocketMsgRealtimeDependencyEvent
    | WebsocketMsgCurrentAddressUpdate
)

BackendWebsocketMsgUnionWithDiscriminator = Annotated[
    BackendWebsocketMsgUnion, Field(discriminator="messageType")
]

BackendWebsocketMsgTypeAdapter = TypeAdapter(BackendWebsocketMsgUnionWithDiscriminator)

BackendWebsocketMsgTypeSet = set(
    [
        "UISettingRevealResult",
        "RealtimeUIChange",
        "RealtimeDependencyEvent",
        "CurrentAddressUpdate",
    ]
)

PythonScriptWebsocketMsgUnion = (
    WebsocketMsgListenerRealtimeEvent
    | WebsocketMsgListenerDependencyEvent
    | WebsocketMsgListenerForceRefresh
    | WebsocketMsgListenerError
    | WebsocketMsgListenerFrontendEmit
    | WebsocketMsgListenerRouterEndpointCall
    | WebsocketMsgListenerRouterEndpointResult
    | WebsocketMsgListenerRegister
    | WebsocketMsgListenerRegisterAck
    | WebsocketMsgListenerInit
)

PythonScriptWebsocketMsgUnionWithDiscriminator = Annotated[
    PythonScriptWebsocketMsgUnion, Field(discriminator="messageType")
]

PythonScriptWebsocketMsgTypeAdapter = TypeAdapter(
    PythonScriptWebsocketMsgUnionWithDiscriminator
)

PythonScriptWebsocketMsgTypeSet = set(
    [
        "ListenerRealtimeEvent",
        "ListenerDependencyEvent",
        "ListenerForceRefresh",
        "ListenerError",
        "ListenerFrontendEmit",
        "ListenerRouterEndpointCall",
        "ListenerRouterEndpointResult",
        "ListenerRegister",
        "ListenerRegisterAck",
        "ListenerInit",
    ]
)
