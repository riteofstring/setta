package mcpx

import (
	"context"
	"fmt"
	"strings"

	"setta/internal/tools"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func (s *Server) buildToolErrorResult(err error) *sdkmcp.CallToolResult {
	return buildToolErrorResult(translateToolErrorToTemporary(err, s.temporaryIDs))
}

func buildSDKToolAnnotations(metadata tools.Metadata) *sdkmcp.ToolAnnotations {
	annotations := &sdkmcp.ToolAnnotations{}
	hasAnnotations := false
	if metadata.AccessType == tools.AccessTypeRead {
		annotations.ReadOnlyHint = true
		annotations.IdempotentHint = true
		annotations.OpenWorldHint = boolPtr(false)
		hasAnnotations = true
	}
	if metadata.ToolAnnotations != nil {
		if metadata.ToolAnnotations.DestructiveHint != nil {
			annotations.DestructiveHint = boolPtr(*metadata.ToolAnnotations.DestructiveHint)
			hasAnnotations = true
		}
		if metadata.ToolAnnotations.IdempotentHint != nil {
			annotations.IdempotentHint = *metadata.ToolAnnotations.IdempotentHint
			hasAnnotations = true
		}
		if metadata.ToolAnnotations.OpenWorldHint != nil {
			annotations.OpenWorldHint = boolPtr(*metadata.ToolAnnotations.OpenWorldHint)
			hasAnnotations = true
		}
		if title := strings.TrimSpace(metadata.ToolAnnotations.Title); title != "" {
			annotations.Title = title
			hasAnnotations = true
		}
	}
	if !hasAnnotations {
		return nil
	}
	return annotations
}

func closedWorldToolAnnotations() *tools.ToolAnnotationsMetadata {
	return &tools.ToolAnnotationsMetadata{
		OpenWorldHint: boolPtr(false),
	}
}

func additiveClosedWorldToolAnnotations() *tools.ToolAnnotationsMetadata {
	annotations := closedWorldToolAnnotations()
	annotations.DestructiveHint = boolPtr(false)
	return annotations
}

func buildSDKToolMeta(metadata tools.Metadata) sdkmcp.Meta {
	idPathsByType := make(map[string]any, len(metadata.IDPathsByType))
	for idType, paths := range metadata.IDPathsByType {
		copied := append([]string(nil), paths...)
		idPathsByType[string(idType)] = copied
	}
	resultIDPathsByType := make(map[string]any, len(metadata.ResultIDPathsByType))
	for idType, paths := range metadata.ResultIDPathsByType {
		copied := append([]string(nil), paths...)
		resultIDPathsByType[string(idType)] = copied
	}
	var toolArgumentPreview map[string]any
	if metadata.ToolArgumentPreview != nil {
		targetIDPathsByType := make(map[string]any, len(metadata.ToolArgumentPreview.TargetIDPathsByType))
		for idType, paths := range metadata.ToolArgumentPreview.TargetIDPathsByType {
			copied := append([]string(nil), paths...)
			targetIDPathsByType[string(idType)] = copied
		}
		toolArgumentPreview = map[string]any{
			"targetIdPathsByType": targetIDPathsByType,
			"previewValuePath":    metadata.ToolArgumentPreview.PreviewValuePath,
			"previewKind":         string(metadata.ToolArgumentPreview.PreviewKind),
		}
	}

	payload := map[string]any{
		"toolKind":       string(metadata.Kind),
		"accessType":     string(metadata.AccessType),
		"idPathsByType":  idPathsByType,
		"searchTags":     append([]string(nil), metadata.SearchTags...),
		"searchCategory": metadata.SearchCategory,
	}
	if metadata.RequiresLLM {
		payload["requiresLLM"] = true
	}
	if metadata.StartsRun {
		payload["startsRun"] = true
	}
	if metadata.DefaultTargetSingletonSection != "" {
		payload["defaultTargetSingletonSection"] = metadata.DefaultTargetSingletonSection
	}
	if metadata.ResultFilter != "" {
		payload["resultFilter"] = string(metadata.ResultFilter)
	}
	if len(resultIDPathsByType) != 0 {
		payload["resultIdPathsByType"] = resultIDPathsByType
	}
	if toolArgumentPreview != nil {
		payload["toolArgumentPreview"] = toolArgumentPreview
	}

	return sdkmcp.Meta{
		toolMetaNamespace: payload,
	}
}

func NewToolError(code string, format string, args ...any) error {
	return newToolError(code, format, args...)
}

func ExecuteScopedProjectStateOperation(
	ctx context.Context,
	projectConfigID string,
	missingContextMessage string,
	run func() (any, error),
) (any, error) {
	return executeScopedProjectStateOperation(ctx, projectConfigID, missingContextMessage, run)
}

func boolPtr(value bool) *bool {
	return &value
}

func newToolError(code string, format string, args ...any) error {
	return newToolErrorWithData(code, format, nil, args...)
}

func newToolErrorWithData(code string, format string, data map[string]any, args ...any) error {
	return &toolError{
		code:    code,
		message: fmt.Sprintf(format, args...),
		data:    data,
	}
}

func asToolError(err error, target **toolError) bool {
	if err == nil {
		return false
	}
	if typed, ok := err.(*toolError); ok {
		*target = typed
		return true
	}
	if shared, ok := tools.AsToolError(err); ok {
		*target = &toolError{
			code:    shared.Code,
			message: shared.Message,
			data:    shared.Data,
		}
		return true
	}
	return false
}

func isUnscopedToolName(toolName string) bool {
	_, ok := unscopedToolNames[toolName]
	return ok
}
