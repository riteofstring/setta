package mcpx

import (
	"setta/internal/projectstate"
	"setta/internal/tools"
)

func defaultProjectStructureToolDefinitions(
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
			Name:        "get_latest_project_state_summary",
			Description: "Return a filtered project-state summary for the requested project config.",
			Metadata: tools.Metadata{
				Kind:           tools.KindInit,
				AccessType:     tools.AccessTypeRead,
				ResultFilter:   tools.ResultFilterProjectStateSummary,
				SearchCategory: "project",
				SearchTags:     []string{"project", "summary", "state", "sections"},
			},
			Handler: newProjectStateSummaryHandler(),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Canonical project config id to summarize.",
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
			Name:        "create_top_level_section",
			Description: "Create a new top-level section in the requested project config.",
			Metadata: tools.Metadata{
				Kind:            tools.KindDiscoverable,
				AccessType:      tools.AccessTypeStructural,
				ToolAnnotations: additiveClosedWorldToolAnnotations(),
				ResultIDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection:    {"sectionId"},
					tools.IDTypeCodeObject: {"metaControlParamId"},
				},
				SearchCategory: "sections",
				SearchTags:     []string{"create", "section", "top", "level", "structural"},
			},
			Handler: newCreateTopLevelSectionHandler(projectState, settingsState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id where the new top-level section should be created.",
				},
				"implType": map[string]any{
					"type":        "string",
					"description": "Section implementation type to create.",
				},
				"controlCodeObjType": map[string]any{
					"type":        "string",
					"description": "Optional control code-object type for MetaControl sections.",
				},
				"position": map[string]any{
					"type":        "object",
					"description": "Optional explicit top-left position for the new section.",
					"properties": map[string]any{
						"x": map[string]any{
							"type": "number",
						},
						"y": map[string]any{
							"type": "number",
						},
					},
					"required": []string{"x", "y"},
				},
			},
			"required": []string{"projectConfigId", "implType"},
		},
		OutputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"sectionId": map[string]any{
					"type": "string",
				},
				"metaControlParamId": map[string]any{
					"type": "string",
				},
				"panTo": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"x": map[string]any{
							"type": "number",
						},
						"y": map[string]any{
							"type": "number",
						},
					},
					"required": []string{"x", "y"},
				},
			},
			"required": []string{"sectionId"},
		},
	})

	definitions = append(definitions, toolDefinition{
		Spec: tools.Spec{
			Name:        "create_child_sections",
			Description: "Create one or more child sections beneath the requested parent section.",
			Metadata: tools.Metadata{
				Kind:            tools.KindDiscoverable,
				AccessType:      tools.AccessTypeStructural,
				ToolAnnotations: additiveClosedWorldToolAnnotations(),
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"parentId"},
				},
				ResultIDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionIds"},
				},
				SearchCategory: "sections",
				SearchTags:     []string{"create", "child", "section", "structural", "parent"},
			},
			Handler: newCreateChildSectionsHandler(projectState, settingsState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id where child sections should be created.",
				},
				"parentId": map[string]any{
					"type":        "string",
					"description": "Parent section id that will receive the new children.",
				},
				"implType": map[string]any{
					"type":        "string",
					"description": "Section implementation type shared by every created child.",
				},
				"numChildren": map[string]any{
					"type":        "integer",
					"description": "Number of child sections to create.",
				},
				"startIdx": map[string]any{
					"type":        "integer",
					"description": "Optional insertion index for the created child block.",
				},
			},
			"required": []string{"projectConfigId", "parentId", "implType", "numChildren"},
		},
		OutputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"sectionIds": map[string]any{
					"type": "array",
					"items": map[string]any{
						"type": "string",
					},
				},
			},
			"required": []string{"sectionIds"},
		},
	})

	definitions = append(definitions, toolDefinition{
		Spec: tools.Spec{
			Name:        "create_child_sections_via_incrementer",
			Description: "Create one or more child sections using incrementer-style caller placement.",
			Metadata: tools.Metadata{
				Kind:            tools.KindDiscoverable,
				AccessType:      tools.AccessTypeStructural,
				ToolAnnotations: additiveClosedWorldToolAnnotations(),
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"calledBy"},
				},
				ResultIDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionIds"},
				},
				SearchCategory: "sections",
				SearchTags:     []string{"create", "child", "section", "incrementer", "structural"},
			},
			Handler: newCreateChildSectionsViaIncrementerHandler(projectState, settingsState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id where incrementer children should be created.",
				},
				"calledBy": map[string]any{
					"type":        "string",
					"description": "Parent section or existing child section that determines the insertion point.",
				},
				"implType": map[string]any{
					"type":        "string",
					"description": "Section implementation type shared by every created child.",
				},
				"numChildren": map[string]any{
					"type":        "integer",
					"description": "Number of child sections to create.",
				},
			},
			"required": []string{"projectConfigId", "calledBy", "implType", "numChildren"},
		},
		OutputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"sectionIds": map[string]any{
					"type": "array",
					"items": map[string]any{
						"type": "string",
					},
				},
			},
			"required": []string{"sectionIds"},
		},
	})

	definitions = append(definitions, toolDefinition{
		Spec: tools.Spec{
			Name:        "set_code_section_attached_terminal",
			Description: "Attach a top-level terminal to a code section, or detach the current attached terminal by passing null.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeStructural,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionId", "terminalSectionId"},
				},
				SearchCategory: "layout",
				SearchTags:     []string{"terminal", "attached", "code", "section", "structural"},
			},
			Handler: newSetCodeSectionAttachedTerminalHandler(projectState, settingsState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose code section attachment should be updated.",
				},
				"sectionId": map[string]any{
					"type":        "string",
					"description": "Code section id whose attached terminal should be updated.",
				},
				"terminalSectionId": map[string]any{
					"type":        []string{"string", "null"},
					"description": "Terminal section id to attach, or null to detach the current attached terminal.",
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
			Name:        "delete_sections",
			Description: "Delete one or more sections and any descendant sections referenced by them.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeStructural,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionIds"},
				},
				ResultIDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionIds"},
				},
				SearchCategory: "sections",
				SearchTags:     []string{"delete", "remove", "section", "structural"},
			},
			Handler: newDeleteSectionsHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id where sections should be deleted.",
				},
				"sectionIds": map[string]any{
					"type":        "array",
					"description": "Section ids to delete recursively.",
					"items": map[string]any{
						"type": "string",
					},
				},
			},
			"required": []string{"projectConfigId", "sectionIds"},
		},
		OutputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"sectionIds": map[string]any{
					"type": "array",
					"items": map[string]any{
						"type": "string",
					},
				},
			},
			"required": []string{"sectionIds"},
		},
	})

	definitions = append(definitions, toolDefinition{
		Spec: tools.Spec{
			Name:        "delete_child_sections_via_decrementer",
			Description: "Delete child sections using decrementer-style caller placement.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeStructural,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"calledBy"},
				},
				ResultIDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionIds"},
				},
				SearchCategory: "sections",
				SearchTags:     []string{"delete", "remove", "child", "section", "decrementer", "structural"},
			},
			Handler: newDeleteChildSectionsViaDecrementerHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id where decrementer children should be deleted.",
				},
				"calledBy": map[string]any{
					"type":        "string",
					"description": "Parent section or existing child section that determines the deletion window.",
				},
				"numChildren": map[string]any{
					"type":        "integer",
					"description": "Number of child sections to delete from the resolved window.",
				},
			},
			"required": []string{"projectConfigId", "calledBy", "numChildren"},
		},
		OutputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"sectionIds": map[string]any{
					"type": "array",
					"items": map[string]any{
						"type": "string",
					},
				},
			},
			"required": []string{"sectionIds"},
		},
	})

	definitions = append(definitions, toolDefinition{
		Spec: tools.Spec{
			Name:        "create_new_section_variant",
			Description: "Duplicate the active variant of a section and switch the section to the new variant.",
			Metadata: tools.Metadata{
				Kind:            tools.KindDiscoverable,
				AccessType:      tools.AccessTypeStructural,
				ToolAnnotations: closedWorldToolAnnotations(),
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionId"},
				},
				ResultIDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSectionVariant: {"variantId"},
				},
				SearchCategory: "sections",
				SearchTags:     []string{"create", "new", "section", "variant", "structural"},
			},
			Handler: newCreateNewSectionVariantHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id where the new section variant should be created.",
				},
				"sectionId": map[string]any{
					"type":        "string",
					"description": "Section id whose active variant should be duplicated.",
				},
			},
			"required": []string{"projectConfigId", "sectionId"},
		},
		OutputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"variantId": map[string]any{
					"type": "string",
				},
			},
			"required": []string{"variantId"},
		},
	})

	definitions = append(definitions, toolDefinition{
		Spec: tools.Spec{
			Name:        "set_section_variant",
			Description: "Switch a section to a specific existing variant.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeWrite,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection:        {"sectionId"},
					tools.IDTypeSectionVariant: {"variantId"},
				},
				SearchCategory: "sections",
				SearchTags:     []string{"section", "variant", "active", "select", "write"},
			},
			Handler: newSetSectionVariantHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose section variant should be switched.",
				},
				"sectionId": map[string]any{
					"type":        "string",
					"description": "Section id whose active variant should be updated.",
				},
				"variantId": map[string]any{
					"type":        "string",
					"description": "Existing variant id that should become active for the section.",
				},
			},
			"required": []string{"projectConfigId", "sectionId", "variantId"},
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
			Name:        "set_default_section_variant",
			Description: "Change which existing variant is treated as the default for a section.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeWrite,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection:        {"sectionId"},
					tools.IDTypeSectionVariant: {"variantId"},
				},
				SearchCategory: "sections",
				SearchTags:     []string{"section", "variant", "default", "select", "write"},
			},
			Handler: newSetDefaultSectionVariantHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose section default variant should be updated.",
				},
				"sectionId": map[string]any{
					"type":        "string",
					"description": "Section id whose default variant should be updated.",
				},
				"variantId": map[string]any{
					"type":        "string",
					"description": "Existing variant id that should become the default for the section.",
				},
			},
			"required": []string{"projectConfigId", "sectionId", "variantId"},
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
			Name:        "set_section_variant_sort_order",
			Description: "Persist the complete ordered list of variants for a section.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeWrite,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection:        {"sectionId"},
					tools.IDTypeSectionVariant: {"orderedVariantIds"},
				},
				SearchCategory: "sections",
				SearchTags:     []string{"section", "variant", "sort", "order", "write"},
			},
			Handler: newSetSectionVariantSortOrderHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose section variant order should be updated.",
				},
				"sectionId": map[string]any{
					"type":        "string",
					"description": "Section id whose complete variant ordering should be updated.",
				},
				"orderedVariantIds": map[string]any{
					"type":        "array",
					"description": "Complete list of existing variant ids in the desired order.",
					"items": map[string]any{
						"type": "string",
					},
				},
			},
			"required": []string{"projectConfigId", "sectionId", "orderedVariantIds"},
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
