package mcpx

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"setta/internal/projectstate"
	"setta/internal/tools"
	"setta/plugins/setta-json-render-app-gen/backend/appspec"
)

func appDefinitionToolRegistrationsForTest(
	service projectstate.AppDefinitionRuntime,
) []ToolRegistration {
	registrations := []ToolRegistration{
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
				Handler: func(context.Context, map[string]any) (any, error) {
					return map[string]any{"catalog": appspec.DefaultCatalogJSON()}, nil
				},
			},
			InputSchema: map[string]any{"type": "object", "properties": map[string]any{}},
			OutputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{"catalog": map[string]any{"type": "object"}},
				"required":   []string{"catalog"},
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
				Handler: func(context.Context, map[string]any) (any, error) {
					return map[string]any{"components": appspec.DefaultComponentTypes()}, nil
				},
			},
			InputSchema: map[string]any{"type": "object", "properties": map[string]any{}},
			OutputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{"components": map[string]any{"type": "array"}},
				"required":   []string{"components"},
			},
		},
	}
	if service == nil {
		return registrations
	}

	registrations = append(registrations,
		ToolRegistration{
			Spec: tools.Spec{
				Name:        "get_app_definition",
				Description: "Fetch the stored app UI spec and document-level app-definition metadata for the active project.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "app",
					SearchTags:     []string{"app", "definition", "spec", "ui", "read", "structural"},
				},
				Handler: func(ctx context.Context, arguments map[string]any) (any, error) {
					projectConfigID, err := readRequiredStringArgumentForTest(arguments, "projectConfigId")
					if err != nil {
						return nil, err
					}
					return ExecuteScopedProjectStateOperation(
						ctx,
						projectConfigID,
						"Structural app-definition invocation context is unavailable.",
						func() (any, error) {
							return service.GetAppDefinition(ctx)
						},
					)
				},
			},
			InputSchema:  map[string]any{"type": "object"},
			OutputSchema: map[string]any{"type": "object"},
		},
		ToolRegistration{
			Spec: tools.Spec{
				Name:        "validate_app_definition",
				Description: "Validate an app spec and optional app-definition metadata overrides without persisting them.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "app",
					SearchTags:     []string{"app", "definition", "spec", "validate", "diagnostics", "structural"},
				},
				Handler: func(ctx context.Context, arguments map[string]any) (any, error) {
					projectConfigID, input, err := readValidateAppDefinitionArgsForTest(arguments)
					if err != nil {
						return nil, err
					}
					return ExecuteScopedProjectStateOperation(
						ctx,
						projectConfigID,
						"Structural app-definition invocation context is unavailable.",
						func() (any, error) {
							return service.ValidateAppDefinition(ctx, input)
						},
					)
				},
			},
			InputSchema:  map[string]any{"type": "object"},
			OutputSchema: map[string]any{"type": "object"},
		},
		ToolRegistration{
			Spec: tools.Spec{
				Name:        "set_app_definition",
				Description: "Replace the stored app UI spec and optionally update persisted app-definition metadata.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "app",
					SearchTags:     []string{"app", "definition", "spec", "ui", "structural"},
				},
				Handler: func(ctx context.Context, arguments map[string]any) (any, error) {
					projectConfigID, input, err := readSetAppDefinitionArgsForTest(arguments)
					if err != nil {
						return nil, err
					}
					return ExecuteScopedProjectStateOperation(
						ctx,
						projectConfigID,
						"Structural app-definition invocation context is unavailable.",
						func() (any, error) {
							_, result, err := service.SetAppDefinition(ctx, input)
							return result, err
						},
					)
				},
			},
			InputSchema:  map[string]any{"type": "object"},
			OutputSchema: map[string]any{"type": "object"},
		},
		ToolRegistration{
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
				Handler: func(ctx context.Context, arguments map[string]any) (any, error) {
					projectConfigID, input, err := readStreamAppDefinitionArgsForTest(arguments)
					if err != nil {
						return nil, err
					}
					return ExecuteScopedProjectStateOperation(
						ctx,
						projectConfigID,
						"Structural app-definition invocation context is unavailable.",
						func() (any, error) {
							_, result, err := service.StreamAppDefinition(ctx, input)
							if errors.Is(err, projectstate.ErrAppSpecPatchInvalid) {
								return nil, NewToolError("invalid_arguments", "Invalid patches payload: %s", err.Error())
							}
							return result, err
						},
					)
				},
			},
			InputSchema:  map[string]any{"type": "object"},
			OutputSchema: map[string]any{"type": "object"},
		},
		ToolRegistration{
			Spec: tools.Spec{
				Name:        "update_app_definition",
				Description: "Apply a JSON merge patch to the stored app UI spec for the active project.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "app",
					SearchTags:     []string{"app", "definition", "spec", "patch", "structural"},
				},
				Handler: func(ctx context.Context, arguments map[string]any) (any, error) {
					projectConfigID, err := readRequiredStringArgumentForTest(arguments, "projectConfigId")
					if err != nil {
						return nil, err
					}
					patch, err := readRequiredPresentArgumentForTest(arguments, "patch")
					if err != nil {
						return nil, err
					}
					return ExecuteScopedProjectStateOperation(
						ctx,
						projectConfigID,
						"Structural app-definition invocation context is unavailable.",
						func() (any, error) {
							_, result, err := service.UpdateAppDefinition(ctx, patch)
							return result, err
						},
					)
				},
			},
			InputSchema:  map[string]any{"type": "object"},
			OutputSchema: map[string]any{"type": "object"},
		},
	)
	return registrations
}

type appDefinitionMutationFieldsForTest struct {
	appSpec        map[string]any
	appSpecVersion *string
	catalogID      *string
	routes         *[]projectstate.AppRoute
	dataBindings   *map[string]any
	actions        *map[string]any
	theme          *map[string]any
	assets         *[]any
}

func readValidateAppDefinitionArgsForTest(
	arguments map[string]any,
) (string, projectstate.ValidateAppDefinitionInput, error) {
	projectConfigID, fields, err := readAppDefinitionMutationFieldsForTest(arguments)
	if err != nil {
		return "", projectstate.ValidateAppDefinitionInput{}, err
	}
	return projectConfigID, projectstate.ValidateAppDefinitionInput{
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

func readSetAppDefinitionArgsForTest(
	arguments map[string]any,
) (string, projectstate.SetAppDefinitionInput, error) {
	projectConfigID, fields, err := readAppDefinitionMutationFieldsForTest(arguments)
	if err != nil {
		return "", projectstate.SetAppDefinitionInput{}, err
	}
	appSpecPath, err := readOptionalNullableStringPointerArgumentForTest(arguments, "appSpecPath")
	if err != nil {
		return "", projectstate.SetAppDefinitionInput{}, err
	}
	return projectConfigID, projectstate.SetAppDefinitionInput{
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

func readStreamAppDefinitionArgsForTest(
	arguments map[string]any,
) (string, projectstate.StreamAppDefinitionInput, error) {
	projectConfigID, err := readRequiredStringArgumentForTest(arguments, "projectConfigId")
	if err != nil {
		return "", projectstate.StreamAppDefinitionInput{}, err
	}
	patches, err := readRequiredRawStringArgumentForTest(arguments, "patches")
	if err != nil {
		return "", projectstate.StreamAppDefinitionInput{}, err
	}
	if strings.TrimSpace(patches) == "" {
		return "", projectstate.StreamAppDefinitionInput{}, NewToolError("invalid_arguments", "patches must be non-empty.")
	}
	appSpecPath, err := readOptionalNullableStringPointerArgumentForTest(arguments, "appSpecPath")
	if err != nil {
		return "", projectstate.StreamAppDefinitionInput{}, err
	}
	baseAppSpec, err := readOptionalObjectPointerArgumentForTest(arguments, "baseAppSpec")
	if err != nil {
		return "", projectstate.StreamAppDefinitionInput{}, err
	}
	return projectConfigID, projectstate.StreamAppDefinitionInput{
		Patches:     patches,
		AppSpecPath: appSpecPath,
		BaseAppSpec: baseAppSpec,
	}, nil
}

func readAppDefinitionMutationFieldsForTest(
	arguments map[string]any,
) (string, appDefinitionMutationFieldsForTest, error) {
	projectConfigID, err := readRequiredStringArgumentForTest(arguments, "projectConfigId")
	if err != nil {
		return "", appDefinitionMutationFieldsForTest{}, err
	}
	appSpec, err := readRequiredObjectArgumentForTest(arguments, "appSpec")
	if err != nil {
		return "", appDefinitionMutationFieldsForTest{}, err
	}
	appSpecVersion, err := readOptionalNullableStringPointerArgumentForTest(arguments, "appSpecVersion")
	if err != nil {
		return "", appDefinitionMutationFieldsForTest{}, err
	}
	catalogID, err := readOptionalNullableStringPointerArgumentForTest(arguments, "catalogId")
	if err != nil {
		return "", appDefinitionMutationFieldsForTest{}, err
	}
	routes, err := readOptionalAppRoutesArgumentForTest(arguments, "routes")
	if err != nil {
		return "", appDefinitionMutationFieldsForTest{}, err
	}
	dataBindings, err := readOptionalObjectPointerArgumentForTest(arguments, "dataBindings")
	if err != nil {
		return "", appDefinitionMutationFieldsForTest{}, err
	}
	actions, err := readOptionalObjectPointerArgumentForTest(arguments, "actions")
	if err != nil {
		return "", appDefinitionMutationFieldsForTest{}, err
	}
	theme, err := readOptionalObjectPointerArgumentForTest(arguments, "theme")
	if err != nil {
		return "", appDefinitionMutationFieldsForTest{}, err
	}
	assets, err := readOptionalArrayPointerArgumentForTest(arguments, "assets")
	if err != nil {
		return "", appDefinitionMutationFieldsForTest{}, err
	}
	return projectConfigID, appDefinitionMutationFieldsForTest{
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

func readRequiredStringArgumentForTest(arguments map[string]any, key string) (string, error) {
	rawValue, ok := arguments[key]
	if !ok {
		return "", NewToolError("invalid_arguments", "%s is required", key)
	}
	value, ok := rawValue.(string)
	if !ok {
		return "", NewToolError("invalid_arguments", "%s must be a string", key)
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return "", NewToolError("invalid_arguments", "%s must not be empty", key)
	}
	return value, nil
}

func readRequiredRawStringArgumentForTest(arguments map[string]any, key string) (string, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return "", NewToolError("invalid_arguments", "%s is required", key)
	}
	value, ok := rawValue.(string)
	if !ok {
		return "", NewToolError("invalid_arguments", "%s must be a string", key)
	}
	return value, nil
}

func readRequiredObjectArgumentForTest(arguments map[string]any, key string) (map[string]any, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, NewToolError("invalid_arguments", "%s is required", key)
	}
	value, ok := rawValue.(map[string]any)
	if !ok {
		return nil, NewToolError("invalid_arguments", "%s must be an object", key)
	}
	return value, nil
}

func readRequiredPresentArgumentForTest(arguments map[string]any, key string) (any, error) {
	value, ok := arguments[key]
	if !ok {
		return nil, NewToolError("invalid_arguments", "%s is required", key)
	}
	return value, nil
}

func readOptionalNullableStringPointerArgumentForTest(arguments map[string]any, key string) (*string, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}
	value, ok := rawValue.(string)
	if !ok {
		return nil, NewToolError("invalid_arguments", "%s must be a string or null", key)
	}
	trimmedValue := strings.TrimSpace(value)
	return &trimmedValue, nil
}

func readOptionalObjectPointerArgumentForTest(arguments map[string]any, key string) (*map[string]any, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}
	value, ok := rawValue.(map[string]any)
	if !ok {
		return nil, NewToolError("invalid_arguments", "%s must be an object", key)
	}
	return &value, nil
}

func readOptionalArrayPointerArgumentForTest(arguments map[string]any, key string) (*[]any, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}
	value, ok := rawValue.([]any)
	if !ok {
		return nil, NewToolError("invalid_arguments", "%s must be an array", key)
	}
	copied := append([]any(nil), value...)
	return &copied, nil
}

func readOptionalAppRoutesArgumentForTest(arguments map[string]any, key string) (*[]projectstate.AppRoute, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}
	rawRoutes, ok := rawValue.([]any)
	if !ok {
		return nil, NewToolError("invalid_arguments", "%s must be an array of route objects", key)
	}
	encoded, err := json.Marshal(rawRoutes)
	if err != nil {
		return nil, NewToolError("invalid_arguments", "%s must be an array of route objects", key)
	}
	var routes []projectstate.AppRoute
	if err := json.Unmarshal(encoded, &routes); err != nil {
		return nil, NewToolError("invalid_arguments", "%s must be an array of route objects", key)
	}
	return &routes, nil
}
