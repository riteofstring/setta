package mcpx

import (
	"encoding/json"
	"fmt"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func decodeToolArguments(req *sdkmcp.CallToolRequest) (map[string]any, error) {
	if req == nil || req.Params == nil || len(req.Params.Arguments) == 0 {
		return map[string]any{}, nil
	}
	var decoded any
	if err := json.Unmarshal(req.Params.Arguments, &decoded); err != nil {
		return nil, newToolError("invalid_arguments", "Tool arguments must be valid JSON.")
	}
	arguments, ok := decoded.(map[string]any)
	if !ok {
		return nil, newToolError("invalid_arguments", "Tool arguments must be a JSON object.")
	}
	return arguments, nil
}

func buildToolSuccessResult(payload any) (*sdkmcp.CallToolResult, error) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal tool result: %w", err)
	}

	var structured any
	if err := json.Unmarshal(encoded, &structured); err != nil {
		return nil, fmt.Errorf("decode tool result: %w", err)
	}

	return &sdkmcp.CallToolResult{
		Content:           []sdkmcp.Content{&sdkmcp.TextContent{Text: string(encoded)}},
		StructuredContent: structured,
	}, nil
}

func buildToolErrorResult(err error) *sdkmcp.CallToolResult {
	result := toolErrorResult{
		Code:    "internal_error",
		Message: "Internal server error.",
	}
	var typed *toolError
	if ok := asToolError(err, &typed); ok {
		result.Code = typed.code
		result.Message = typed.message
		result.Data = copyMetaMap(typed.data)
	} else if err != nil {
		result.Message = err.Error()
	}

	structuredContent := map[string]any{
		"code":    result.Code,
		"message": result.Message,
	}
	for key, value := range result.Data {
		structuredContent[key] = value
	}

	return &sdkmcp.CallToolResult{
		IsError: true,
		Content: []sdkmcp.Content{
			&sdkmcp.TextContent{Text: result.Message},
		},
		StructuredContent: structuredContent,
	}
}

func requireProjectStateRuntime(projectState any, unavailableMessage string) error {
	if projectState != nil {
		return nil
	}
	return newToolError("internal_error", unavailableMessage)
}

func requireCodeSectionDiagnosticsRuntime(projectState projectStateProvider, diagnostics lspDiagnosticsProvider) error {
	if projectState != nil && diagnostics != nil {
		return nil
	}
	return newToolError("internal_error", "LSP diagnostics mutation runtime is unavailable.")
}
