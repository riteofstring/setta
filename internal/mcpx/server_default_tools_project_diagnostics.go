package mcpx

import (
	"setta/internal/projectstate"
	"setta/internal/tools"
)

func defaultProjectDiagnosticsToolDefinitions(
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
			Name:        "set_type_error_ignore",
			Description: "Toggle ignoring type errors for the targeted section entry.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeWrite,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection:    {"sectionId"},
					tools.IDTypeCodeObject: {"paramInfoId"},
				},
				SearchCategory: "params",
				SearchTags:     []string{"param", "parameter", "type", "error", "ignore"},
			},
			Handler: newSetTypeErrorIgnoreHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose type-error ignore state should be updated.",
				},
				"sectionId": map[string]any{
					"type":        "string",
					"description": "Section id whose type-error ignore state should be updated.",
				},
				"paramInfoId": map[string]any{
					"type":        "string",
					"description": "Optional parameter code-object id to target; omit to target callable-level errors.",
				},
				"ignoreTypeErrors": map[string]any{
					"type":        "boolean",
					"description": "When true, ignore type errors for the targeted entry.",
				},
			},
			"required": []string{"projectConfigId", "sectionId", "ignoreTypeErrors"},
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
			Name:        "set_code_obj_name",
			Description: "Rename a code object referenced by the active project state.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeWrite,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeCodeObject: {"codeObjId"},
				},
				SearchCategory: "params",
				SearchTags:     []string{"code", "object", "name", "param", "rename"},
			},
			Handler: newSetCodeObjectNameHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose code-object name should be updated.",
				},
				"codeObjId": map[string]any{
					"type":        "string",
					"description": "Code-object id whose name should be updated.",
				},
				"name": map[string]any{
					"type":        "string",
					"description": "Code-object name to store on the referenced code object.",
				},
			},
			"required": []string{"projectConfigId", "codeObjId", "name"},
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
			Name:        "set_code_obj_display_name",
			Description: "Update the user-facing display name for the requested code object.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeWrite,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeCodeObject: {"codeObjId"},
				},
				SearchCategory: "params",
				SearchTags:     []string{"code", "object", "display", "name", "param"},
			},
			Handler: newSetCodeObjectDisplayNameHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose code-object display name should be updated.",
				},
				"codeObjId": map[string]any{
					"type":        "string",
					"description": "Code-object id whose display name should be updated.",
				},
				"displayName": map[string]any{
					"type":        "string",
					"description": "User-facing display name to store for the code object.",
				},
			},
			"required": []string{"projectConfigId", "codeObjId", "displayName"},
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
			Name:        "set_code_section_diagnostics_mute",
			Description: "Mute or unmute diagnostics for a code section in the requested project config.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeWrite,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionId"},
				},
				SearchCategory: "lsp",
				SearchTags:     []string{"lsp", "diagnostics", "mute", "code", "section"},
			},
			Handler: newSetCodeSectionDiagnosticsMuteHandler(projectState, lspDiagnostics),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose code-section diagnostics should be mutated.",
				},
				"sectionId": map[string]any{
					"type":        "string",
					"description": "Code section id whose diagnostics mute state should be updated.",
				},
				"mute": map[string]any{
					"type":        "boolean",
					"description": "When true, filter all diagnostics for the targeted code section.",
				},
			},
			"required": []string{"projectConfigId", "sectionId", "mute"},
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
			Name:        "set_code_section_diagnostic_code_suppression",
			Description: "Suppress or unsuppress a specific diagnostics code for a code section in the requested project config.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeWrite,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionId"},
				},
				SearchCategory: "lsp",
				SearchTags:     []string{"lsp", "diagnostics", "suppress", "code", "section"},
			},
			Handler: newSetCodeSectionDiagnosticCodeSuppressionHandler(projectState, lspDiagnostics),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose code-section diagnostics should be mutated.",
				},
				"sectionId": map[string]any{
					"type":        "string",
					"description": "Code section id whose diagnostics suppression should be updated.",
				},
				"code": map[string]any{
					"description": "Diagnostic code to suppress or unsuppress.",
				},
				"suppress": map[string]any{
					"type":        "boolean",
					"description": "When true, hide diagnostics matching the targeted code.",
				},
			},
			"required": []string{"projectConfigId", "sectionId", "code", "suppress"},
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
	return definitions
}
