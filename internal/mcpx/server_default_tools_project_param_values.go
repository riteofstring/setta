package mcpx

import (
	"setta/internal/projectstate"
	"setta/internal/tools"
)

func defaultProjectParamValueToolDefinitions(
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
			Name:        "change_param_impl",
			Description: "Switch the targeted parameter or meta-control to a different implementation type.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeWrite,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection:    {"sectionId"},
					tools.IDTypeCodeObject: {"paramInfoId"},
				},
				SearchCategory: "params",
				SearchTags:     []string{"param", "parameter", "type", "impl", "control", "write"},
			},
			Handler: newChangeParamImplHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose parameter implementation should be updated.",
				},
				"sectionId": map[string]any{
					"type":        "string",
					"description": "Section id containing the targeted parameter.",
				},
				"paramInfoId": map[string]any{
					"type":        "string",
					"description": "Code-object id for the targeted parameter.",
				},
				"selectedId": map[string]any{
					"type":        "string",
					"description": "Target impl id or code-object type name to activate.",
				},
			},
			"required": []string{"projectConfigId", "sectionId", "paramInfoId", "selectedId"},
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
			Name:        "update_param_impl_config",
			Description: "Update the active implementation config for the targeted parameter or meta-control.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeWrite,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection:    {"sectionId"},
					tools.IDTypeCodeObject: {"paramInfoId"},
				},
				SearchCategory: "params",
				SearchTags:     []string{"param", "parameter", "config", "impl", "control", "write"},
			},
			Handler: newUpdateParamImplConfigHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose parameter implementation config should be updated.",
				},
				"sectionId": map[string]any{
					"type":        "string",
					"description": "Section id containing the targeted parameter.",
				},
				"paramInfoId": map[string]any{
					"type":        "string",
					"description": "Code-object id for the targeted parameter.",
				},
				"newConfig": map[string]any{
					"type":                 "object",
					"additionalProperties": true,
					"description":          "Implementation-specific config fields to persist on the targeted parameter.",
				},
			},
			"required": []string{"projectConfigId", "sectionId", "paramInfoId", "newConfig"},
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
			Name:        "delete_selected_params",
			Description: "Delete the selected editable params from the targeted callable or dict section.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeWrite,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection:    {"sectionId"},
					tools.IDTypeCodeObject: {"paramInfoIds"},
				},
				ResultIDPathsByType: map[tools.IDType][]string{
					tools.IDTypeCodeObject: {"paramInfoIds"},
				},
				SearchCategory: "params",
				SearchTags:     []string{"param", "parameter", "delete", "remove", "selection", "write"},
			},
			Handler: newDeleteSelectedParamsHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose selected params should be deleted.",
				},
				"sectionId": map[string]any{
					"type":        "string",
					"description": "Callable or dict section id containing the targeted params.",
				},
				"paramInfoIds": map[string]any{
					"type":        "array",
					"description": "Ordered list of selected param code-object ids to delete.",
					"items": map[string]any{
						"type": "string",
					},
				},
			},
			"required": []string{"projectConfigId", "sectionId", "paramInfoIds"},
		},
		OutputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"paramInfoIds": map[string]any{
					"type": "array",
					"items": map[string]any{
						"type": "string",
					},
				},
			},
			"required": []string{"paramInfoIds"},
		},
	})

	definitions = append(definitions, toolDefinition{
		Spec: tools.Spec{
			Name:        "set_param_entered_value",
			Description: "Write a new manual value for the targeted section parameter.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeWrite,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection:    {"sectionId"},
					tools.IDTypeCodeObject: {"paramInfoId"},
				},
				ToolArgumentPreview: &tools.ToolArgumentPreviewMetadata{
					TargetIDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection:    {"sectionId"},
						tools.IDTypeCodeObject: {"paramInfoId"},
					},
					PreviewValuePath: "value",
					PreviewKind:      tools.PreviewKindParamValue,
				},
				SearchCategory: "params",
				SearchTags:     []string{"param", "parameter", "value", "input", "write"},
			},
			Handler: newSetParamEnteredValueHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose parameter value should be updated.",
				},
				"sectionId": map[string]any{
					"type":        "string",
					"description": "Section id containing the targeted parameter.",
				},
				"paramInfoId": map[string]any{
					"type":        "string",
					"description": "Code-object id for the targeted parameter.",
				},
				"value": map[string]any{
					"type":        "string",
					"description": "Raw parameter value to persist.",
				},
			},
			"required": []string{"projectConfigId", "sectionId", "paramInfoId", "value"},
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
			Name:        "set_param_name_and_value",
			Description: "Rename the targeted parameter and persist its raw value in one mutation.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeWrite,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection:    {"sectionId"},
					tools.IDTypeCodeObject: {"codeObjId"},
				},
				ToolArgumentPreview: &tools.ToolArgumentPreviewMetadata{
					TargetIDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection:    {"sectionId"},
						tools.IDTypeCodeObject: {"codeObjId"},
					},
					PreviewValuePath: "value",
					PreviewKind:      tools.PreviewKindParamValue,
				},
				SearchCategory: "params",
				SearchTags:     []string{"param", "parameter", "name", "rename", "value", "write"},
			},
			Handler: newSetParamNameAndValueHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose parameter should be renamed and updated.",
				},
				"sectionId": map[string]any{
					"type":        "string",
					"description": "Section id containing the targeted parameter.",
				},
				"codeObjId": map[string]any{
					"type":        "string",
					"description": "Code-object id for the targeted parameter.",
				},
				"name": map[string]any{
					"type":        "string",
					"description": "Parameter name to store on the referenced code object.",
				},
				"value": map[string]any{
					"type":        "string",
					"description": "Raw parameter value to persist.",
				},
			},
			"required": []string{"projectConfigId", "sectionId", "codeObjId", "name", "value"},
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
