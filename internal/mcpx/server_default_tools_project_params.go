package mcpx

import (
	"setta/internal/projectstate"
	"setta/internal/tools"
)

func defaultProjectParamToolDefinitions(
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
			Name:        "add_kwarg",
			Description: "Create a new editable parameter entry in the targeted callable or dict section.",
			Metadata: tools.Metadata{
				Kind:            tools.KindDiscoverable,
				AccessType:      tools.AccessTypeWrite,
				ToolAnnotations: additiveClosedWorldToolAnnotations(),
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionId"},
				},
				ResultIDPathsByType: map[tools.IDType][]string{
					tools.IDTypeCodeObject: {"codeObjId"},
				},
				SearchCategory: "params",
				SearchTags:     []string{"param", "parameter", "kwarg", "create", "write"},
			},
			Handler: newAddKwargHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose section should receive the new parameter.",
				},
				"sectionId": map[string]any{
					"type":        "string",
					"description": "Callable or dict section id that should receive the new parameter.",
				},
			},
			"required": []string{"projectConfigId", "sectionId"},
		},
		OutputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"codeObjId": map[string]any{
					"type": "string",
				},
			},
			"required": []string{"codeObjId"},
		},
	})

	definitions = append(definitions, toolDefinition{
		Spec: tools.Spec{
			Name:        "delete_kwarg",
			Description: "Remove the last editable parameter entry from the targeted callable or dict section.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeWrite,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionId"},
				},
				ResultIDPathsByType: map[tools.IDType][]string{
					tools.IDTypeCodeObject: {"codeObjId"},
				},
				SearchCategory: "params",
				SearchTags:     []string{"param", "parameter", "kwarg", "delete", "remove", "write"},
			},
			Handler: newDeleteKwargHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose section should delete its last editable parameter.",
				},
				"sectionId": map[string]any{
					"type":        "string",
					"description": "Callable or dict section id whose last editable parameter should be removed.",
				},
			},
			"required": []string{"projectConfigId", "sectionId"},
		},
		OutputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"codeObjId": map[string]any{
					"type": "string",
				},
			},
			"required": []string{"codeObjId"},
		},
	})

	if sectionNames != nil {
		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "set_section_name",
				Description: "Rename a section within the requested project config.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeWrite,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionId"},
					},
					SearchCategory: "project",
					SearchTags:     []string{"section", "name", "rename", "title"},
				},
				Handler: newSetSectionNameHandler(sectionNames),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose section name should be updated.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Section id whose name should be updated.",
					},
					"name": map[string]any{
						"type":        "string",
						"description": "Raw section name to validate and persist.",
					},
				},
				"required": []string{"projectConfigId", "sectionId", "name"},
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
