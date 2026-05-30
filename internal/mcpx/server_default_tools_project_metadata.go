package mcpx

import (
	"setta/internal/projectstate"
	"setta/internal/tools"
)

func defaultProjectMetadataToolDefinitions(
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
			Name:        "set_section_tag_color",
			Description: "Set or clear the tag color decoration for a section within the requested project config.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeWrite,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionId"},
				},
				SearchCategory: "layout",
				SearchTags:     []string{"layout", "presentation", "section", "tag", "color", "write"},
			},
			Handler: newSetSectionTagColorHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose section tag color should be updated.",
				},
				"sectionId": map[string]any{
					"type":        "string",
					"description": "Section id whose tag color should be updated.",
				},
				"tagColor": map[string]any{
					"type":        []string{"string", "null"},
					"description": "Hex color string to persist for the section tag, or null to clear it.",
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

	definitions = append(definitions, toolDefinition{
		Spec: tools.Spec{
			Name:        "set_section_style_color",
			Description: "Set or clear the style chrome color for a section within the requested project config.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeWrite,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionId"},
				},
				SearchCategory: "layout",
				SearchTags:     []string{"layout", "presentation", "section", "style", "color", "write"},
			},
			Handler: newSetSectionStyleColorHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose section style color should be updated.",
				},
				"sectionId": map[string]any{
					"type":        "string",
					"description": "Section id whose style color should be updated.",
				},
				"styleColor": map[string]any{
					"type":        []string{"string", "null"},
					"description": "Hex color string to persist for the section style chrome, or null to clear it.",
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

	definitions = append(definitions, toolDefinition{
		Spec: tools.Spec{
			Name:        "get_latest_lsp_diagnostics",
			Description: "Return the latest filtered LSP diagnostics payload for the requested project config.",
			Metadata: tools.Metadata{
				Kind:           tools.KindInit,
				AccessType:     tools.AccessTypeRead,
				ResultFilter:   tools.ResultFilterLSPDiagnostics,
				SearchCategory: "lsp",
				SearchTags:     []string{"lsp", "diagnostics", "errors", "python"},
			},
			Handler: newLSPDiagnosticsHandler(lspDiagnostics),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose latest diagnostics should be returned.",
				},
			},
			"required": []string{"projectConfigId"},
		},
		OutputSchema: map[string]any{
			"type": "object",
		},
	})

	definitions = append(definitions, toolDefinition{
		Spec: tools.Spec{
			Name:        "set_section_param_filter",
			Description: "Set the raw parameter-filter string for a section that supports parameter lists within the requested project config.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeWrite,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionId"},
				},
				SearchCategory: "params",
				SearchTags:     []string{"params", "filter", "section", "write"},
			},
			Handler: newSetSectionParamFilterHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose section param filter should be updated.",
				},
				"sectionId": map[string]any{
					"type":        "string",
					"description": "Section id whose param filter should be updated.",
				},
				"paramFilter": map[string]any{
					"type":        "string",
					"description": "Raw filter string to persist exactly as written.",
				},
			},
			"required": []string{"projectConfigId", "sectionId", "paramFilter"},
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
			Name:        "set_meta_control_show_section_title",
			Description: "Set whether a MetaControl section should show its section title within the requested project config.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeWrite,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionId"},
				},
				SearchCategory: "layout",
				SearchTags:     []string{"layout", "meta-control", "title", "section", "write"},
			},
			Handler: newSetMetaControlShowSectionTitleHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose MetaControl title visibility should be updated.",
				},
				"sectionId": map[string]any{
					"type":        "string",
					"description": "MetaControl section id whose title visibility should be updated.",
				},
				"showSectionTitle": map[string]any{
					"type":        "boolean",
					"description": "Whether the MetaControl section should render its section title.",
				},
			},
			"required": []string{"projectConfigId", "sectionId", "showSectionTitle"},
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
