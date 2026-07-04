package chat

const (
	RunItemDetailsKindCommandExecution RunItemDetailsKind = "command_execution"
	RunItemDetailsKindMCPToolCall      RunItemDetailsKind = "mcp_tool_call"
	RunItemDetailsKindDynamicToolCall  RunItemDetailsKind = "dynamic_tool_call"
	RunItemDetailsKindFileChange       RunItemDetailsKind = "file_change"
	RunItemDetailsKindDiff             RunItemDetailsKind = "diff"
)

var runItemDetailsKindValues = []RunItemDetailsKind{
	RunItemDetailsKindCommandExecution,
	RunItemDetailsKindMCPToolCall,
	RunItemDetailsKindDynamicToolCall,
	RunItemDetailsKindFileChange,
	RunItemDetailsKindDiff,
}
