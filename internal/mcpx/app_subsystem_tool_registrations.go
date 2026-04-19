package mcpx

import (
	"context"

	"setta/internal/projectstate"
	"setta/internal/tools"
)

type AppSubsystemProjectStateProvider interface {
	GetAppDefinition(ctx context.Context) (projectstate.AppDefinitionReadResult, error)
	ValidateAppDefinition(ctx context.Context, input projectstate.ValidateAppDefinitionInput) (projectstate.AppDefinitionValidationResult, error)
	SetAppDefinition(ctx context.Context, input projectstate.SetAppDefinitionInput) (projectstate.Snapshot, projectstate.AppDefinitionMutationResult, error)
	StreamAppDefinition(ctx context.Context, input projectstate.StreamAppDefinitionInput) (projectstate.Snapshot, projectstate.AppDefinitionMutationResult, error)
	UpdateAppDefinition(ctx context.Context, patch any) (projectstate.Snapshot, projectstate.AppDefinitionMutationResult, error)
}

func BuildAppSubsystemToolRegistrations(
	projectState AppSubsystemProjectStateProvider,
) []ToolRegistration {
	definitions := buildAppCatalogToolDefinitions()
	definitions = append(definitions, buildAppDefinitionToolDefinitions(projectState)...)
	return toolRegistrationsFromDefinitions(definitions)
}

func buildAppCatalogToolDefinitions() []toolDefinition {
	return []toolDefinition{
		{
			Spec: tools.Spec{
				Name:        "get_app_catalog",
				Description: "Return the JSON render catalog used for app generation.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "project",
					SearchTags:     []string{"app", "catalog", "components", "generation"},
				},
				Handler: newGetAppCatalogHandler(),
			},
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"catalog": map[string]any{
						"type": "object",
					},
				},
				"required": []string{"catalog"},
			},
		},
		{
			Spec: tools.Spec{
				Name:        "list_app_components",
				Description: "List the allowed component types for app generation.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "project",
					SearchTags:     []string{"app", "components", "catalog", "generation"},
				},
				Handler: newListAppComponentsHandler(),
			},
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"components": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "string",
						},
					},
				},
				"required": []string{"components"},
			},
		},
	}
}

func buildAppDefinitionToolDefinitions(
	projectState AppSubsystemProjectStateProvider,
) []toolDefinition {
	if projectState == nil {
		return nil
	}

	return []toolDefinition{
		{
			Spec: tools.Spec{
				Name:        "get_app_definition",
				Description: "Fetch the stored app UI spec and document-level app-definition metadata for the active project.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "app",
					SearchTags:     []string{"app", "definition", "spec", "ui", "read", "structural"},
				},
				Handler: newGetAppDefinitionHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose document-level app definition should be read.",
					},
				},
				"required": []string{"projectConfigId"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"appSpec": map[string]any{
						"description": "Stored JSON Render app spec, or null when no spec is configured or stored.",
					},
					"appDefinition": map[string]any{
						"type":        "object",
						"description": "Current document-level app-definition metadata, or null when none is configured.",
					},
				},
				"required": []string{"appSpec"},
			},
		},
		{
			Spec: tools.Spec{
				Name:        "validate_app_definition",
				Description: "Validate an app spec and optional app-definition metadata overrides without persisting them.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "app",
					SearchTags:     []string{"app", "definition", "spec", "validate", "diagnostics", "structural"},
				},
				Handler: newValidateAppDefinitionHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose app definition should be validated.",
					},
					"appSpec": map[string]any{
						"type":        "object",
						"description": "Full JSON Render app spec to validate.",
					},
					"appSpecVersion": map[string]any{
						"type":        "string",
						"description": "Optional app-spec version override used only for validation and capabilities.",
					},
					"catalogId": map[string]any{
						"type":        "string",
						"description": "Optional app catalog id override used only for validation and capabilities.",
					},
					"routes": map[string]any{
						"type":        "array",
						"description": "Optional app routes metadata to validate alongside the app definition.",
						"items": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"path": map[string]any{
									"type": "string",
								},
								"name": map[string]any{
									"type": "string",
								},
								"rootKey": map[string]any{
									"type": "string",
								},
							},
							"required": []string{"path"},
						},
					},
					"dataBindings": map[string]any{
						"type":        "object",
						"description": "Optional app data-binding overrides to validate.",
					},
					"actions": map[string]any{
						"type":        "object",
						"description": "Optional app action-definition overrides to validate.",
					},
					"theme": map[string]any{
						"type":        "object",
						"description": "Optional app theme overrides to validate.",
					},
					"assets": map[string]any{
						"type":        "array",
						"description": "Optional asset list overrides to validate.",
					},
				},
				"required": []string{"projectConfigId", "appSpec"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"errors": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "object",
						},
					},
					"warnings": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "object",
						},
					},
					"capabilities": map[string]any{
						"type": "object",
					},
				},
				"required": []string{"errors", "warnings", "capabilities"},
			},
		},
		{
			Spec: tools.Spec{
				Name:        "set_app_definition",
				Description: "Replace the stored app UI spec and optionally update persisted app-definition metadata.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "app",
					SearchTags:     []string{"app", "definition", "spec", "ui", "structural"},
				},
				Handler: newSetAppDefinitionHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose document-level app definition should be replaced.",
					},
					"appSpec": map[string]any{
						"type":        "object",
						"description": "Full JSON Render app spec to persist.",
					},
					"appSpecPath": map[string]any{
						"type":        "string",
						"description": "Optional app-spec file path. Defaults to the existing configured path or app_specs/app.json.",
					},
					"appSpecVersion": map[string]any{
						"type":        "string",
						"description": "Optional app-spec version metadata to persist alongside the spec.",
					},
					"catalogId": map[string]any{
						"type":        "string",
						"description": "Optional app catalog id to persist alongside the spec.",
					},
					"routes": map[string]any{
						"type":        "array",
						"description": "Optional app routes metadata to persist with the definition.",
						"items": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"path": map[string]any{
									"type": "string",
								},
								"name": map[string]any{
									"type": "string",
								},
								"rootKey": map[string]any{
									"type": "string",
								},
							},
							"required": []string{"path"},
						},
					},
					"dataBindings": map[string]any{
						"type":        "object",
						"description": "Optional app data-binding metadata to persist.",
					},
					"actions": map[string]any{
						"type":        "object",
						"description": "Optional app action-definition metadata to persist.",
					},
					"theme": map[string]any{
						"type":        "object",
						"description": "Optional app theme metadata to persist.",
					},
					"assets": map[string]any{
						"type":        "array",
						"description": "Optional app asset metadata to persist.",
					},
				},
				"required": []string{"projectConfigId", "appSpec"},
			},
			OutputSchema: map[string]any{
				"type": "object",
			},
		},
		{
			Spec: tools.Spec{
				Name:        "stream_app_definition",
				Description: "Persist an app spec by applying newline-delimited JSON Pointer patch operations to a base or stored app definition.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeStructural,
					ToolArgumentPreview: &tools.ToolArgumentPreviewMetadata{
						TargetIDPathsByType: map[tools.IDType][]string{},
						PreviewValuePath:    "patches",
						PreviewKind:         tools.PreviewKindAppSpecPatch,
					},
					SearchCategory: "app",
					SearchTags:     []string{"app", "definition", "spec", "stream", "patch", "structural"},
				},
				Handler: newStreamAppDefinitionHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose app definition should be streamed and persisted.",
					},
					"patches": map[string]any{
						"type":        "string",
						"description": "Newline-delimited JSON patch operations using the bounded /root and /elements/... pointer format.",
					},
					"appSpecPath": map[string]any{
						"type":        "string",
						"description": "Optional app-spec file path override. Defaults to the existing configured path or app_specs/app.json.",
					},
					"baseAppSpec": map[string]any{
						"type":        "object",
						"description": "Optional base app spec object to patch instead of the currently stored spec.",
					},
				},
				"required": []string{"projectConfigId", "patches"},
			},
			OutputSchema: map[string]any{
				"type": "object",
			},
		},
		{
			Spec: tools.Spec{
				Name:        "update_app_definition",
				Description: "Apply a JSON merge patch to the stored app UI spec for the active project.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "app",
					SearchTags:     []string{"app", "definition", "spec", "patch", "structural"},
				},
				Handler: newUpdateAppDefinitionHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose stored app spec should be patched.",
					},
					"patch": map[string]any{
						"description": "JSON merge patch to apply to the stored app spec. May be any JSON value.",
					},
				},
				"required": []string{"projectConfigId", "patch"},
			},
			OutputSchema: map[string]any{
				"type": "object",
			},
		},
	}
}

func toolRegistrationsFromDefinitions(
	definitions []toolDefinition,
) []ToolRegistration {
	registrations := make([]ToolRegistration, 0, len(definitions))
	for _, definition := range definitions {
		registrations = append(registrations, ToolRegistration{
			Spec:         definition.Spec,
			InputSchema:  definition.InputSchema,
			OutputSchema: definition.OutputSchema,
		})
	}
	return registrations
}
