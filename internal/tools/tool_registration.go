package tools

type ToolRegistration struct {
	Spec         Spec
	InputSchema  map[string]any
	OutputSchema map[string]any
}
