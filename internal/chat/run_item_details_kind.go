package chat

const (
	RunItemDetailsKindCommandExecution        RunItemDetailsKind = "command_execution"
	RunItemDetailsKindCommandStartFailure     RunItemDetailsKind = "command_start_failure"
	RunItemDetailsKindMCPToolCall             RunItemDetailsKind = "mcp_tool_call"
	RunItemDetailsKindDynamicToolCall         RunItemDetailsKind = "dynamic_tool_call"
	RunItemDetailsKindFileChange              RunItemDetailsKind = "file_change"
	RunItemDetailsKindDiff                    RunItemDetailsKind = "diff"
	RunItemDetailsKindApproval                RunItemDetailsKind = "approval"
	RunItemDetailsKindProviderStreamLifecycle RunItemDetailsKind = "provider_stream_lifecycle"
)

var runItemDetailsKindValues = []RunItemDetailsKind{
	RunItemDetailsKindCommandExecution,
	RunItemDetailsKindCommandStartFailure,
	RunItemDetailsKindMCPToolCall,
	RunItemDetailsKindDynamicToolCall,
	RunItemDetailsKindFileChange,
	RunItemDetailsKindDiff,
	RunItemDetailsKindApproval,
	RunItemDetailsKindProviderStreamLifecycle,
}
