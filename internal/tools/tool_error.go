package tools

import "fmt"

type ToolError struct {
	Code    string
	Message string
	Data    map[string]any
}

func NewToolError(code string, format string, args ...any) error {
	return &ToolError{
		Code:    code,
		Message: fmt.Sprintf(format, args...),
	}
}

func AsToolError(err error) (*ToolError, bool) {
	if err == nil {
		return nil, false
	}
	typed, ok := err.(*ToolError)
	if !ok {
		return nil, false
	}
	return typed, true
}

func (e *ToolError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}
