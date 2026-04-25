package mcptools

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"setta/internal/appsubsystem/appdefinition"
	"setta/internal/appsubsystem/appspec"
	"setta/internal/mcpx"
	"setta/internal/tools"
)

type appCatalogToolResult struct {
	Catalog map[string]any `json:"catalog"`
}

type appComponentListToolResult struct {
	Components []string `json:"components"`
}

type appDefinitionMutationFields struct {
	appSpec        map[string]any
	appSpecVersion *string
	catalogID      *string
	routes         *[]appdefinition.AppRoute
	dataBindings   *map[string]any
	actions        *map[string]any
	theme          *map[string]any
	assets         *[]any
}

func BuildMCPToolRegistrations(
	service appdefinition.Runtime,
	defaultAppSpecPath string,
) []mcpx.ToolRegistration {
	registrations := BuildAppCatalogToolRegistrations()
	registrations = append(
		registrations,
		BuildAppDefinitionToolRegistrations(service, defaultAppSpecPath)...,
	)
	return registrations
}

func BuildAppCatalogToolRegistrations() []mcpx.ToolRegistration {
	return []mcpx.ToolRegistration{
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

func BuildAppDefinitionToolRegistrations(
	service appdefinition.Runtime,
	defaultAppSpecPath string,
) []mcpx.ToolRegistration {
	if service == nil {
		return nil
	}
	if strings.TrimSpace(defaultAppSpecPath) == "" {
		panic("default app spec path is required for app definition tool registrations")
	}

	return []mcpx.ToolRegistration{
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
				Handler: newGetAppDefinitionHandler(service),
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
				Handler: newValidateAppDefinitionHandler(service),
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
				Handler: newSetAppDefinitionHandler(service),
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
						"type": "string",
						"description": fmt.Sprintf(
							"Optional app-spec file path. Defaults to the existing configured path or %s.",
							defaultAppSpecPath,
						),
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
				Handler: newStreamAppDefinitionHandler(service),
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
						"type": "string",
						"description": fmt.Sprintf(
							"Optional app-spec file path override. Defaults to the existing configured path or %s.",
							defaultAppSpecPath,
						),
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
				Handler: newUpdateAppDefinitionHandler(service),
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

func newGetAppCatalogHandler() tools.Handler {
	return func(context.Context, map[string]any) (any, error) {
		return appCatalogToolResult{Catalog: appspec.DefaultCatalogJSON()}, nil
	}
}

func newListAppComponentsHandler() tools.Handler {
	return func(context.Context, map[string]any) (any, error) {
		return appComponentListToolResult{Components: appspec.DefaultComponentTypes()}, nil
	}
}

func newGetAppDefinitionHandler(
	service appdefinition.Runtime,
) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		if service == nil {
			return nil, mcpx.NewToolError("internal_error", "Project-state app-definition runtime is unavailable.")
		}
		return mcpx.ExecuteScopedProjectStateOperation(
			ctx,
			projectConfigID,
			"Structural app-definition invocation context is unavailable.",
			func() (any, error) {
				return service.GetAppDefinition(ctx)
			},
		)
	}
}

func newValidateAppDefinitionHandler(
	service appdefinition.Runtime,
) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, input, err := readValidateAppDefinitionArgs(arguments)
		if err != nil {
			return nil, err
		}
		if service == nil {
			return nil, mcpx.NewToolError("internal_error", "Project-state app-definition runtime is unavailable.")
		}
		return mcpx.ExecuteScopedProjectStateOperation(
			ctx,
			projectConfigID,
			"Structural app-definition invocation context is unavailable.",
			func() (any, error) {
				return service.ValidateAppDefinition(ctx, input)
			},
		)
	}
}

func newSetAppDefinitionHandler(
	service appdefinition.Runtime,
) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, input, err := readSetAppDefinitionArgs(arguments)
		if err != nil {
			return nil, err
		}
		if service == nil {
			return nil, mcpx.NewToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}
		return mcpx.ExecuteScopedProjectStateOperation(
			ctx,
			projectConfigID,
			"Structural app-definition invocation context is unavailable.",
			func() (any, error) {
				_, result, err := service.SetAppDefinition(ctx, input)
				return result, err
			},
		)
	}
}

func newStreamAppDefinitionHandler(
	service appdefinition.Runtime,
) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, input, err := readStreamAppDefinitionArgs(arguments)
		if err != nil {
			return nil, err
		}
		if service == nil {
			return nil, mcpx.NewToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}
		return mcpx.ExecuteScopedProjectStateOperation(
			ctx,
			projectConfigID,
			"Structural app-definition invocation context is unavailable.",
			func() (any, error) {
				_, result, err := service.StreamAppDefinition(ctx, input)
				if errors.Is(err, appdefinition.ErrAppSpecPatchInvalid) {
					return nil, mcpx.NewToolError("invalid_arguments", "Invalid patches payload: %s", err.Error())
				}
				return result, err
			},
		)
	}
}

func newUpdateAppDefinitionHandler(
	service appdefinition.Runtime,
) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		patch, err := readRequiredPresentArgument(arguments, "patch")
		if err != nil {
			return nil, err
		}
		if service == nil {
			return nil, mcpx.NewToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}
		return mcpx.ExecuteScopedProjectStateOperation(
			ctx,
			projectConfigID,
			"Structural app-definition invocation context is unavailable.",
			func() (any, error) {
				_, result, err := service.UpdateAppDefinition(ctx, patch)
				return result, err
			},
		)
	}
}

func readValidateAppDefinitionArgs(
	arguments map[string]any,
) (string, appdefinition.ValidateInput, error) {
	projectConfigID, fields, err := readAppDefinitionMutationFields(arguments)
	if err != nil {
		return "", appdefinition.ValidateInput{}, err
	}
	return projectConfigID, appdefinition.ValidateInput{
		AppSpec:        fields.appSpec,
		AppSpecVersion: fields.appSpecVersion,
		CatalogID:      fields.catalogID,
		Routes:         fields.routes,
		DataBindings:   fields.dataBindings,
		Actions:        fields.actions,
		Theme:          fields.theme,
		Assets:         fields.assets,
	}, nil
}

func readSetAppDefinitionArgs(
	arguments map[string]any,
) (string, appdefinition.SetInput, error) {
	projectConfigID, fields, err := readAppDefinitionMutationFields(arguments)
	if err != nil {
		return "", appdefinition.SetInput{}, err
	}
	appSpecPath, err := readOptionalNullableStringPointerArgument(arguments, "appSpecPath")
	if err != nil {
		return "", appdefinition.SetInput{}, err
	}
	return projectConfigID, appdefinition.SetInput{
		AppSpec:        fields.appSpec,
		AppSpecPath:    appSpecPath,
		AppSpecVersion: fields.appSpecVersion,
		CatalogID:      fields.catalogID,
		Routes:         fields.routes,
		DataBindings:   fields.dataBindings,
		Actions:        fields.actions,
		Theme:          fields.theme,
		Assets:         fields.assets,
	}, nil
}

func readStreamAppDefinitionArgs(
	arguments map[string]any,
) (string, appdefinition.StreamInput, error) {
	projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
	if err != nil {
		return "", appdefinition.StreamInput{}, err
	}
	patches, err := readRequiredRawStringArgument(arguments, "patches")
	if err != nil {
		return "", appdefinition.StreamInput{}, err
	}
	if strings.TrimSpace(patches) == "" {
		return "", appdefinition.StreamInput{}, mcpx.NewToolError("invalid_arguments", "patches must be non-empty.")
	}
	appSpecPath, err := readOptionalNullableStringPointerArgument(arguments, "appSpecPath")
	if err != nil {
		return "", appdefinition.StreamInput{}, err
	}
	baseAppSpec, err := readOptionalObjectPointerArgument(arguments, "baseAppSpec")
	if err != nil {
		return "", appdefinition.StreamInput{}, err
	}
	return projectConfigID, appdefinition.StreamInput{
		Patches:     patches,
		AppSpecPath: appSpecPath,
		BaseAppSpec: baseAppSpec,
	}, nil
}

func readAppDefinitionMutationFields(
	arguments map[string]any,
) (string, appDefinitionMutationFields, error) {
	projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
	if err != nil {
		return "", appDefinitionMutationFields{}, err
	}
	appSpec, err := readRequiredObjectArgument(arguments, "appSpec")
	if err != nil {
		return "", appDefinitionMutationFields{}, err
	}
	appSpecVersion, err := readOptionalNullableStringPointerArgument(arguments, "appSpecVersion")
	if err != nil {
		return "", appDefinitionMutationFields{}, err
	}
	catalogID, err := readOptionalNullableStringPointerArgument(arguments, "catalogId")
	if err != nil {
		return "", appDefinitionMutationFields{}, err
	}
	routes, err := readOptionalAppRoutesArgument(arguments, "routes")
	if err != nil {
		return "", appDefinitionMutationFields{}, err
	}
	dataBindings, err := readOptionalObjectPointerArgument(arguments, "dataBindings")
	if err != nil {
		return "", appDefinitionMutationFields{}, err
	}
	actions, err := readOptionalObjectPointerArgument(arguments, "actions")
	if err != nil {
		return "", appDefinitionMutationFields{}, err
	}
	theme, err := readOptionalObjectPointerArgument(arguments, "theme")
	if err != nil {
		return "", appDefinitionMutationFields{}, err
	}
	assets, err := readOptionalArrayPointerArgument(arguments, "assets")
	if err != nil {
		return "", appDefinitionMutationFields{}, err
	}
	return projectConfigID, appDefinitionMutationFields{
		appSpec:        appSpec,
		appSpecVersion: appSpecVersion,
		catalogID:      catalogID,
		routes:         routes,
		dataBindings:   dataBindings,
		actions:        actions,
		theme:          theme,
		assets:         assets,
	}, nil
}

func readRequiredStringArgument(arguments map[string]any, key string) (string, error) {
	rawValue, ok := arguments[key]
	if !ok {
		return "", mcpx.NewToolError("invalid_arguments", "%s is required", key)
	}
	value, ok := rawValue.(string)
	if !ok {
		return "", mcpx.NewToolError("invalid_arguments", "%s must be a string", key)
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return "", mcpx.NewToolError("invalid_arguments", "%s must not be empty", key)
	}
	return value, nil
}

func readRequiredRawStringArgument(arguments map[string]any, key string) (string, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return "", mcpx.NewToolError("invalid_arguments", "%s is required", key)
	}
	value, ok := rawValue.(string)
	if !ok {
		return "", mcpx.NewToolError("invalid_arguments", "%s must be a string", key)
	}
	return value, nil
}

func readRequiredObjectArgument(arguments map[string]any, key string) (map[string]any, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, mcpx.NewToolError("invalid_arguments", "%s is required", key)
	}
	value, ok := rawValue.(map[string]any)
	if !ok {
		return nil, mcpx.NewToolError("invalid_arguments", "%s must be an object", key)
	}
	return value, nil
}

func readRequiredPresentArgument(arguments map[string]any, key string) (any, error) {
	value, ok := arguments[key]
	if !ok {
		return nil, mcpx.NewToolError("invalid_arguments", "%s is required", key)
	}
	return value, nil
}

func readOptionalNullableStringPointerArgument(arguments map[string]any, key string) (*string, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}
	value, ok := rawValue.(string)
	if !ok {
		return nil, mcpx.NewToolError("invalid_arguments", "%s must be a string or null", key)
	}
	trimmedValue := strings.TrimSpace(value)
	return &trimmedValue, nil
}

func readOptionalObjectPointerArgument(arguments map[string]any, key string) (*map[string]any, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}
	value, ok := rawValue.(map[string]any)
	if !ok {
		return nil, mcpx.NewToolError("invalid_arguments", "%s must be an object", key)
	}
	return &value, nil
}

func readOptionalArrayPointerArgument(arguments map[string]any, key string) (*[]any, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}
	value, ok := rawValue.([]any)
	if !ok {
		return nil, mcpx.NewToolError("invalid_arguments", "%s must be an array", key)
	}
	copied := append([]any(nil), value...)
	return &copied, nil
}

func readOptionalAppRoutesArgument(arguments map[string]any, key string) (*[]appdefinition.AppRoute, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}
	rawRoutes, ok := rawValue.([]any)
	if !ok {
		return nil, mcpx.NewToolError("invalid_arguments", "%s must be an array of route objects", key)
	}
	encoded, err := json.Marshal(rawRoutes)
	if err != nil {
		return nil, mcpx.NewToolError("invalid_arguments", "%s must be an array of route objects", key)
	}
	var routes []appdefinition.AppRoute
	if err := json.Unmarshal(encoded, &routes); err != nil {
		return nil, mcpx.NewToolError("invalid_arguments", "%s must be an array of route objects", key)
	}
	return &routes, nil
}
