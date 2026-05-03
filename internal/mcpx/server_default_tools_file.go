package mcpx

import (
	"setta/internal/tools"
)

func defaultFileToolDefinitions(workspaceRoot string) []toolDefinition {
	definitions := make([]toolDefinition, 0, 1)
	definitions = append(definitions, toolDefinition{
		Spec: tools.Spec{
			Name:        "read_file_range",
			Description: "Return the requested line range from a UTF-8 text file.",
			Metadata: tools.Metadata{
				Kind:           tools.KindDiscoverable,
				AccessType:     tools.AccessTypeRead,
				SearchCategory: "files",
				SearchTags:     []string{"file", "read", "lines", "workspace"},
			},
			Handler: newReadFileRangeHandler(workspaceRoot),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"path": map[string]any{
					"type":        "string",
					"description": "Workspace-relative file path to read.",
				},
				"start_line": map[string]any{
					"type":        "integer",
					"description": "First line number to include.",
				},
				"end_line": map[string]any{
					"type":        "integer",
					"description": "Last line number to include.",
				},
			},
			"required": []string{"path"},
		},
		OutputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"path": map[string]any{
					"type": "string",
				},
				"absolute_path": map[string]any{
					"type": "string",
				},
				"start_line": map[string]any{
					"type": "integer",
				},
				"end_line": map[string]any{
					"type": "integer",
				},
				"encoding": map[string]any{
					"type": "string",
				},
				"content": map[string]any{
					"type": "string",
				},
			},
			"required": []string{
				"path",
				"absolute_path",
				"start_line",
				"end_line",
				"encoding",
				"content",
			},
		},
	})
	return definitions
}
