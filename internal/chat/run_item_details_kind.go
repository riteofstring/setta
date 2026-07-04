package chat

const (
	RunItemDetailsKindCommandExecution RunItemDetailsKind = "command_execution"
	RunItemDetailsKindMCPToolCall      RunItemDetailsKind = "mcp_tool_call"
	RunItemDetailsKindFileChange       RunItemDetailsKind = "file_change"
)

var runItemDetailsKindValues = []RunItemDetailsKind{
	RunItemDetailsKindCommandExecution,
	RunItemDetailsKindMCPToolCall,
	RunItemDetailsKindFileChange,
}
