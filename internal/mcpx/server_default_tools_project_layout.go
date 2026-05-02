package mcpx

import (
	"setta/internal/projectstate"
	"setta/internal/tools"
)

func defaultProjectLayoutToolDefinitions(
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
			Name:        "set_top_level_section_layout",
			Description: "Persist layout coordinates for top-level sections in the active view mode.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeWrite,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"topLevelSections"},
				},
				SearchCategory: "layout",
				SearchTags:     []string{"layout", "top-level", "sections", "position", "structural"},
			},
			Handler: newSetTopLevelSectionLayoutHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose active view-mode top-level layout should be updated.",
				},
				"topLevelSections": map[string]any{
					"type":        "object",
					"description": "Section-id keyed top-level layout map to persist for the active view mode.",
					"additionalProperties": map[string]any{
						"type": "object",
						"properties": map[string]any{
							"x": map[string]any{
								"type": "number",
							},
							"y": map[string]any{
								"type": "number",
							},
							"zIndex": map[string]any{
								"type": "integer",
							},
							"w": map[string]any{
								"type": "number",
							},
							"h": map[string]any{
								"type": "number",
							},
						},
						"required": []string{"x", "y"},
					},
				},
			},
			"required": []string{"projectConfigId", "topLevelSections"},
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
			Name:        "set_section_sizes",
			Description: "Persist normalized width and height settings for one or more sections.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeStructural,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionSizes"},
				},
				SearchCategory: "layout",
				SearchTags:     []string{"layout", "resize", "size", "section", "structural"},
			},
			Handler: newSetSectionSizesHandler(projectState, settingsState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose section sizes should be updated.",
				},
				"sectionSizes": map[string]any{
					"type":        "object",
					"description": "Section-id keyed size map to normalize and persist.",
					"additionalProperties": map[string]any{
						"type": "object",
						"properties": map[string]any{
							"width": map[string]any{
								"type":        []string{"number", "string"},
								"description": "Numeric width in pixels or the literal string 'auto'.",
							},
							"height": map[string]any{
								"type":        []string{"number", "string"},
								"description": "Numeric height in pixels or the literal string 'auto'.",
							},
						},
						"required": []string{"width", "height"},
					},
				},
			},
			"required": []string{"projectConfigId", "sectionSizes"},
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
			Name:        "set_group_overflow_mode",
			Description: "Enable or disable overflow mode for a Group section without changing its size.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeStructural,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionId"},
				},
				SearchCategory: "layout",
				SearchTags:     []string{"layout", "group", "overflow", "section", "structural"},
			},
			Handler: newSetGroupOverflowModeHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose Group overflow mode should be updated.",
				},
				"sectionId": map[string]any{
					"type":        "string",
					"description": "Group section id whose overflow mode should be updated.",
				},
				"overflowMode": map[string]any{
					"type":        "boolean",
					"description": "Boolean overflow-mode value to persist for the targeted Group section.",
				},
			},
			"required": []string{"projectConfigId", "sectionId", "overflowMode"},
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
			Name:        "auto_layout_top_level_sections",
			Description: "Automatically repack top-level sections in the active view mode using the Go auto-layout runtime.",
			Metadata: tools.Metadata{
				Kind:           tools.KindDiscoverable,
				AccessType:     tools.AccessTypeStructural,
				SearchCategory: "layout",
				SearchTags:     []string{"layout", "auto", "pack", "top-level", "sections", "structural"},
			},
			Handler: newAutoLayoutTopLevelSectionsHandler(projectState, settingsState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose active view-mode top-level sections should be auto laid out.",
				},
				"margin": map[string]any{
					"type":        "integer",
					"description": "Optional packing margin applied around each section; defaults to 50 when omitted.",
					"default":     50,
				},
			},
			"required": []string{"projectConfigId"},
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
			Name:        "set_show_param_display_names",
			Description: "Toggle whether parameter display names are shown across the active project view.",
			Metadata: tools.Metadata{
				Kind:           tools.KindDiscoverable,
				AccessType:     tools.AccessTypeStructural,
				SearchCategory: "layout",
				SearchTags:     []string{"layout", "presentation", "params", "display", "structural"},
			},
			Handler: newSetShowParamDisplayNamesHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose parameter display-name visibility should be updated.",
				},
				"showParamDisplayNames": map[string]any{
					"type":        "boolean",
					"description": "True to show parameter display names, false to show canonical parameter names.",
				},
			},
			"required": []string{"projectConfigId", "showParamDisplayNames"},
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
			Name:        "compare_and_set_show_param_display_names",
			Description: "Update parameter display-name visibility only if the caller's optional expectedOldValue still matches the current project setting.",
			Metadata: tools.Metadata{
				Kind:           tools.KindDiscoverable,
				AccessType:     tools.AccessTypeStructural,
				SearchCategory: "layout",
				SearchTags:     []string{"layout", "presentation", "params", "display", "structural", "compare-and-set"},
			},
			Handler: newCompareAndSetShowParamDisplayNamesHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose parameter display-name visibility should be compare-and-set updated.",
				},
				"showParamDisplayNames": map[string]any{
					"type":        "boolean",
					"description": "True to show parameter display names, false to show canonical parameter names.",
				},
				"expectedOldValue": map[string]any{
					"type":        "boolean",
					"description": "Optional precondition. When provided, the mutation fails with mutation_failed unless the current stored value still matches this boolean.",
				},
			},
			"required": []string{"projectConfigId", "showParamDisplayNames"},
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
			Name:        "set_project_config_codegen_targets",
			Description: "Update the ordered codegen target list for the active project config using the existing Go validator and generated-section reconciler.",
			Metadata: tools.Metadata{
				Kind:           tools.KindDiscoverable,
				AccessType:     tools.AccessTypeStructural,
				SearchCategory: "project",
				SearchTags:     []string{"codegen", "targets", "project", "python", "plugin", "structural"},
			},
			Handler: newSetProjectConfigCodegenTargetsHandler(projectState, codegenTargetValidator, pythonCodegenSectionReconciler),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose ordered codegen target list should be updated.",
				},
				"codegenTargets": map[string]any{
					"type":        "array",
					"description": "Ordered codegen target objects to persist on the project config.",
					"items": map[string]any{
						"type":                 "object",
						"additionalProperties": true,
						"properties": map[string]any{
							"language": map[string]any{
								"type":        "string",
								"description": "Codegen target language id, such as python or a registered plugin target id.",
							},
						},
						"required": []string{"language"},
					},
				},
			},
			"required": []string{"projectConfigId", "codegenTargets"},
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
			Name:        "set_gen_code_prefix",
			Description: "Update the text prepended to generated Python code for the active project config.",
			Metadata: tools.Metadata{
				Kind:                          tools.KindDiscoverable,
				AccessType:                    tools.AccessTypeWrite,
				DefaultTargetSingletonSection: "GenPythonCode",
				SearchCategory:                "codegen",
				SearchTags:                    []string{"codegen", "python", "generated", "prefix", "write"},
			},
			Handler: newSetGenCodePrefixHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose generated Python prefix should be updated.",
				},
				"genCodePrefix": map[string]any{
					"type":        "string",
					"description": "Arbitrary text inserted before the generated Python body.",
				},
			},
			"required": []string{"projectConfigId", "genCodePrefix"},
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
			Name:        "set_gen_code_suffix",
			Description: "Update the text appended after generated Python code for the active project config.",
			Metadata: tools.Metadata{
				Kind:                          tools.KindDiscoverable,
				AccessType:                    tools.AccessTypeWrite,
				DefaultTargetSingletonSection: "GenPythonCode",
				SearchCategory:                "codegen",
				SearchTags:                    []string{"codegen", "python", "generated", "suffix", "write"},
			},
			Handler: newSetGenCodeSuffixHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose generated Python suffix should be updated.",
				},
				"genCodeSuffix": map[string]any{
					"type":        "string",
					"description": "Arbitrary text inserted after the generated Python body.",
				},
			},
			"required": []string{"projectConfigId", "genCodeSuffix"},
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
			Name:        "toggle_position_locks",
			Description: "Flip whether one or more sections have locked positions and sizes.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeStructural,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionIds"},
				},
				SearchCategory: "layout",
				SearchTags:     []string{"layout", "presentation", "lock", "position", "sections", "structural"},
			},
			Handler: newTogglePositionLocksHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose section layout locks should be toggled.",
				},
				"sectionIds": map[string]any{
					"type":        "array",
					"description": "Section ids whose position-and-size lock flag should be flipped.",
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
				"status": map[string]any{
					"type": "string",
				},
			},
			"required": []string{"status"},
		},
	})

	definitions = append(definitions, toolDefinition{
		Spec: tools.Spec{
			Name:        "toggle_minimized",
			Description: "Expand or collapse a section panel within the project workspace.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeStructural,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionId"},
				},
				SearchCategory: "layout",
				SearchTags:     []string{"layout", "presentation", "minimize", "collapse", "section", "structural"},
			},
			Handler: newToggleMinimizedHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose section minimized state should be toggled.",
				},
				"sectionId": map[string]any{
					"type":        "string",
					"description": "Section id whose minimized state should be flipped.",
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
			Name:        "toggle_group_orientation",
			Description: "Flip a Group section between vertical and horizontal child orientation.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeStructural,
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionId"},
				},
				SearchCategory: "layout",
				SearchTags:     []string{"layout", "group", "orientation", "section", "structural"},
			},
			Handler: newToggleGroupOrientationHandler(projectState),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"projectConfigId": map[string]any{
					"type":        "string",
					"description": "Project config id whose Group orientation should be toggled.",
				},
				"sectionId": map[string]any{
					"type":        "string",
					"description": "Group section id whose orientation should be flipped.",
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
	return definitions
}
