package chat

const (
	RunItemDetailsKindPlan                    RunItemDetailsKind = "plan"
	RunItemDetailsKindCommandExecution        RunItemDetailsKind = "command_execution"
	RunItemDetailsKindCommandStartFailure     RunItemDetailsKind = "command_start_failure"
	RunItemDetailsKindMCPToolCall             RunItemDetailsKind = "mcp_tool_call"
	RunItemDetailsKindFileChange              RunItemDetailsKind = "file_change"
	RunItemDetailsKindDiff                    RunItemDetailsKind = "diff"
	RunItemDetailsKindApproval                RunItemDetailsKind = "approval"
	RunItemDetailsKindProviderStreamLifecycle RunItemDetailsKind = "provider_stream_lifecycle"
)

var runItemDetailsKindValues = []RunItemDetailsKind{
	RunItemDetailsKindPlan,
	RunItemDetailsKindCommandExecution,
	RunItemDetailsKindCommandStartFailure,
	RunItemDetailsKindMCPToolCall,
	RunItemDetailsKindFileChange,
	RunItemDetailsKindDiff,
	RunItemDetailsKindApproval,
	RunItemDetailsKindProviderStreamLifecycle,
}
