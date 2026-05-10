package mcpx

import (
	"setta/internal/projectstate"
	"setta/internal/tools"
)

func defaultProjectUIToolDefinitions(
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
			Name:        "search_ui_settings",
			Description: "Search canonical UI settings, including schema-backed plugin settings, by natural-language query.",
			Metadata: tools.Metadata{
				Kind:                          tools.KindDiscoverable,
				AccessType:                    tools.AccessTypeRead,
				DefaultTargetSingletonSection: "GlobalVariables",
				SearchCategory:                "project",
				SearchTags:                    []string{"ui", "settings", "discover"},
			},
			Handler: newSearchUISettingsHandler(server, workspaceRoot),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Canonical project config id whose UI settings should be searched.",
				},
				"query": map[string]any{
					"type":        "string",
					"description": "Natural-language query used to rank UI settings.",
				},
				"limit": map[string]any{
					"type":        "integer",
					"description": "Optional maximum number of results to return.",
				},
				"sourceFilter": map[string]any{
					"type":        "string",
					"description": "Optional source filter: core, plugin, or all.",
				},
			},
			"required": []string{"projectConfigId", "query"},
		},
		OutputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"results": map[string]any{
					"type":  "array",
					"items": uiSettingSummarySchema(),
				},
			},
			"required": []string{"results"},
		},
	})

	definitions = append(definitions, toolDefinition{
		Spec: tools.Spec{
			Name:        "get_ui_setting_value",
			Description: "Read the current value for a canonical UI setting id.",
			Metadata: tools.Metadata{
				Kind:                          tools.KindDiscoverable,
				AccessType:                    tools.AccessTypeRead,
				DefaultTargetSingletonSection: "GlobalVariables",
				SearchCategory:                "project",
				SearchTags:                    []string{"ui", "settings", "read"},
			},
			Handler: newGetUISettingValueHandler(server, workspaceRoot),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Canonical project config id whose UI setting should be read.",
				},
				"settingId": map[string]any{
					"type":        "string",
					"description": "Canonical UI setting id to read.",
				},
			},
			"required": []string{"projectConfigId", "settingId"},
		},
		OutputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"setting": uiSettingSummarySchema(),
				"value":   map[string]any{},
				"error":   uiSettingErrorSchema(),
			},
			"required": []string{"value"},
		},
	})

	definitions = append(definitions, toolDefinition{
		Spec: tools.Spec{
			Name:        "reveal_ui_setting",
			Description: "Open the UI pane/tab for a canonical UI setting and highlight its control.",
			Metadata: tools.Metadata{
				Kind:                          tools.KindDiscoverable,
				AccessType:                    tools.AccessTypeRead,
				DefaultTargetSingletonSection: "GlobalVariables",
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionIdToActivate"},
				},
				SearchCategory: "project",
				SearchTags:     []string{"ui", "settings", "reveal", "highlight"},
			},
			Handler: newRevealUISettingHandler(server, workspaceRoot),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Canonical project config id whose UI setting should be revealed.",
				},
				"settingId": map[string]any{
					"type":        "string",
					"description": "Canonical UI setting id to reveal.",
				},
				"sectionIdToActivate": map[string]any{
					"type":        "string",
					"description": "Optional section id to activate before revealing right-pane settings.",
				},
				"durationMs": map[string]any{
					"type":        "integer",
					"description": "Optional highlight duration in milliseconds.",
				},
			},
			"required": []string{"projectConfigId", "settingId"},
		},
		OutputSchema: uiSettingRevealResultSchema(),
	})

	definitions = append(definitions, toolDefinition{
		Spec: tools.Spec{
			Name:        "set_ui_setting_value",
			Description: "Set a canonical UI setting value, optionally guarded by expectedOldValue compare-and-set semantics.",
			Metadata: tools.Metadata{
				Kind:                          tools.KindDiscoverable,
				AccessType:                    tools.AccessTypeWrite,
				DefaultTargetSingletonSection: "GlobalVariables",
				SearchCategory:                "project",
				SearchTags:                    []string{"ui", "settings", "write", "mutate"},
			},
			Handler: newSetUISettingValueHandler(server, workspaceRoot),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Canonical project config id whose UI setting should be written.",
				},
				"settingId": map[string]any{
					"type":        "string",
					"description": "Canonical UI setting id to write.",
				},
				"value": map[string]any{
					"description": "New JSON value to persist for the setting.",
				},
				"expectedOldValue": map[string]any{
					"description": "Optional JSON value that must still match the current persisted setting before the write proceeds.",
				},
				"revealAfterSet": map[string]any{
					"type":        "boolean",
					"description": "When true, run the canonical UI-setting reveal flow after a successful write and include the nested reveal result.",
				},
				"durationMs": map[string]any{
					"type":        "integer",
					"description": "Optional reveal duration in milliseconds when revealAfterSet is true.",
				},
			},
			"required": []string{"projectConfigId", "settingId", "value"},
		},
		OutputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"setting":         uiSettingSummarySchema(),
				"oldValue":        map[string]any{},
				"newValue":        map[string]any{},
				"normalizedValue": map[string]any{},
				"changed": map[string]any{
					"type": "boolean",
				},
				"reveal": uiSettingRevealResultSchema(),
				"error":  uiSettingErrorSchema(),
			},
			"required": []string{"oldValue", "newValue", "normalizedValue", "changed"},
		},
	})
	return definitions
}
