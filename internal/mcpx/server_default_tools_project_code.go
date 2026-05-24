package mcpx

import (
	"setta/internal/projectstate"
	"setta/internal/tools"
)

func defaultProjectCodeToolDefinitions(
	server *Server,
	workspaceRoot string,
	registry *tools.Registry,
	projectState projectStateProvider,
	codegenTargetValidator projectstate.CodegenTargetValidator,
	pythonCodegenSectionReconciler projectstate.PythonCodegenSectionReconciler,
	codeUpdates codeUpdateProvider,
	settingsState settingsStateProvider,
	sectionNames sectionNameProvider,
	callableSignatures projectstate.CallableSignatureResolver,
	lspDiagnostics lspDiagnosticsProvider,
	stateMachineRuns stateMachineRunProvider,
) []toolDefinition {
	definitions := make([]toolDefinition, 0)
	definitions = append(definitions, toolDefinition{
		Spec: tools.Spec{
			Name:        "set_callable",
			Description: "Select the active callable for a callable section and optionally refetch its params.",
			Metadata: tools.Metadata{
				Kind:            tools.KindDiscoverable,
				AccessType:      tools.AccessTypeWrite,
				ToolAnnotations: closedWorldToolAnnotations(),
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionId"},
				},
				ToolArgumentPreview: &tools.ToolArgumentPreviewMetadata{
					TargetIDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionId"},
					},
					PreviewValuePath: "callableName",
					PreviewKind:      tools.PreviewKindCallableName,
				},
				ResultIDPathsByType: map[tools.IDType][]string{
					tools.IDTypeCodeObject: {"callableId", "childCodeObjs.codeObjId"},
				},
				SearchCategory: "code",
				SearchTags:     []string{"callable", "function", "signature", "params", "bind"},
			},
			Handler: newSetCallableHandler(projectState, callableSignatures),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose callable section should be updated.",
				},
				"sectionId": map[string]any{
					"type":        "string",
					"description": "Callable section id whose active callable should be updated.",
				},
				"callableName": map[string]any{
					"type":        "string",
					"description": "Callable name to select; pass an empty string to clear the current callable.",
				},
				"refetchParams": map[string]any{
					"type":        "boolean",
					"description": "When true, refetch callable params from the configured signature-help resolver.",
				},
			},
			"required": []string{"projectConfigId", "sectionId", "callableName", "refetchParams"},
		},
		OutputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"callableId": map[string]any{
					"type": []string{"string", "null"},
				},
				"childCodeObjs": map[string]any{
					"type": "array",
					"items": map[string]any{
						"type": "object",
						"properties": map[string]any{
							"codeObjId": map[string]any{
								"type": "string",
							},
							"name": map[string]any{
								"type": "string",
							},
						},
						"required": []string{"codeObjId", "name"},
					},
				},
				"lspStatus": map[string]any{
					"type": "string",
				},
			},
			"required": []string{"callableId", "childCodeObjs", "lspStatus"},
		},
	})

	if codeUpdates != nil {
		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "set_code",
				Description: "Replace the inline code for the targeted code section.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeWrite,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionId"},
					},
					ToolArgumentPreview: &tools.ToolArgumentPreviewMetadata{
						TargetIDPathsByType: map[tools.IDType][]string{
							tools.IDTypeSection: {"sectionId"},
						},
						PreviewValuePath: "code",
						PreviewKind:      tools.PreviewKindCode,
					},
					SearchCategory: "code",
					SearchTags:     []string{"code", "edit", "write", "section", "python"},
				},
				Handler: newSetCodeHandler(codeUpdates),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose code section should be updated.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Code section id whose inline code should be replaced.",
					},
					"code": map[string]any{
						"type":        "string",
						"description": "Complete replacement source for the targeted inline code section.",
					},
				},
				"required": []string{"projectConfigId", "sectionId", "code"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"status": map[string]any{
						"type": "string",
					},
				},
				"required": []string{"status"},
			},
		})

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "format_code",
				Description: "Format the targeted Python code section or generated Python code target using Ruff.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeWrite,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionId"},
					},
					SearchCategory: "code",
					SearchTags:     []string{"code", "format", "python", "generated", "write"},
				},
				Handler: newFormatCodeHandler(codeUpdates),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose Python code section should be formatted.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Python code section id or generated Python singleton section id to format.",
					},
				},
				"required": []string{"projectConfigId", "sectionId"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"status": map[string]any{
						"type": "string",
					},
				},
				"required": []string{"status"},
			},
		})
	}
	return definitions
}
