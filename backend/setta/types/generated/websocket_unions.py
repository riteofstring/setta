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
    WebsocketMsgNotification,
    WebsocketMsgPromptAssetsUpdated,
    WebsocketMsgRealtimeDependencyEvent,
    WebsocketMsgRealtimeUIChange,
    WebsocketMsgReturnRenameRefactorResults,
    WebsocketMsgTerminalMetadata,
    WebsocketMsgUpdateArtifacts,
    WebsocketMsgUpdateFrontendProjectState,
    WebsocketMsgUpdateSettings,
)

WebsocketMsgUnion = (
    WebsocketMsgAllConnections
    | WebsocketMsgNotification
    | WebsocketMsgBackendLogEvent
    | WebsocketMsgLLMStreamingResponse
    | WebsocketMsgLSPDiagnostics
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
    | WebsocketMsgPromptAssetsUpdated
    | WebsocketMsgAIFollowToolArgumentsUpdate
    | WebsocketMsgAIFollowToolResultUpdate
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
        "Notification",
        "BackendLogEvent",
        "LLMStreamingResponse",
        "LSPDiagnostics",
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
        "PromptAssetsUpdated",
        "AIFollowToolArgumentsUpdate",
        "AIFollowToolResultUpdate",
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
    | WebsocketMsgNotification
    | WebsocketMsgBackendLogEvent
    | WebsocketMsgLLMStreamingResponse
    | WebsocketMsgLSPDiagnostics
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
    | WebsocketMsgPromptAssetsUpdated
    | WebsocketMsgAIFollowToolArgumentsUpdate
    | WebsocketMsgAIFollowToolResultUpdate
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
        "Notification",
        "BackendLogEvent",
        "LLMStreamingResponse",
        "LSPDiagnostics",
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
        "PromptAssetsUpdated",
        "AIFollowToolArgumentsUpdate",
        "AIFollowToolResultUpdate",
    ]
)

BackendWebsocketMsgUnion = (
    WebsocketMsgRealtimeUIChange
    | WebsocketMsgRealtimeDependencyEvent
    | WebsocketMsgCurrentAddressUpdate
)

BackendWebsocketMsgUnionWithDiscriminator = Annotated[
    BackendWebsocketMsgUnion, Field(discriminator="messageType")
]

BackendWebsocketMsgTypeAdapter = TypeAdapter(BackendWebsocketMsgUnionWithDiscriminator)

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
