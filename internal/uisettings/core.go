package uisettings

import (
	"context"
	"strings"

	"setta/internal/projectstate"
)

var (
	watchCodeFolderItemAdditionalProperties = false
	watchCodeFolderItemSchema               = ValueSchema{
		Type: ValueTypeObject,
		Properties: map[string]ValueSchema{
			"path":      {Type: ValueTypeString},
			"recursive": {Type: ValueTypeBoolean},
		},
		RequiredProperties:   []string{"path"},
		AdditionalProperties: &watchCodeFolderItemAdditionalProperties,
	}
	watchCodeFoldersSchema = ValueSchema{
		Type:  ValueTypeArray,
		Items: valueSchemaPointer(watchCodeFolderItemSchema),
	}
	watchCodeFilesSchema = ValueSchema{
		Type:  ValueTypeArray,
		Items: valueSchemaPointer(ValueSchema{Type: ValueTypeString}),
	}
)

func NewCoreRegistry(runtime CoreProjectState, workspaceRoot string) (*Registry, error) {
	if runtime == nil {
		return nil, projectstate.ErrRuntimeClosed
	}
	return New([]RuntimeEntry{
		{
			Metadata: Entry{
				SettingID:   "core.watch_code.enabled",
				Title:       "Watch Code Enabled",
				Synonyms:    []string{"watch code", "watch mode", "watch toggle"},
				Description: "Enable or disable watch code mode for the project.",
				Location:    Location{Side: SideLeft, OverviewTabKey: "Overview"},
				Highlight:   Highlight{Strategy: HighlightStrategyDOMAnchor, AnchorID: "core.watch_code.enabled"},
				Source:      SourceCore,
				Mutability:  MutabilityWritable,
				ValueSchema: ValueSchema{Type: ValueTypeBoolean},
			},
			ReadValue: func(_ context.Context, projectID string) (any, error) {
				project, err := runtime.Snapshot().Document.ProjectByID(projectID)
				if err != nil {
					return nil, err
				}
				return project.WatchCodeEnabled, nil
			},
			WriteValue: func(ctx context.Context, projectID string, value any, expectedOldValue any) (MutationResult, error) {
				enabled, expected, err := normalizeOptionalBoolWrite(ValueSchema{Type: ValueTypeBoolean}, value, expectedOldValue)
				if err != nil {
					return MutationResult{}, err
				}
				_, result, err := runtime.CompareAndSetWatchCodeEnabled(ctx, projectID, enabled, workspaceRoot, expected)
				if err != nil {
					return MutationResult{}, wrapMutationError(err)
				}
				return MutationResult{
					OldValue:        result.OldValue,
					NewValue:        result.NewValue,
					NormalizedValue: result.NewValue,
					Changed:         result.OldValue != result.NewValue,
				}, nil
			},
		},
		{
			Metadata: Entry{
				SettingID:   "core.watch_code.folders",
				Title:       "Watch Code Folders",
				Synonyms:    []string{"watch folders", "watch code folders"},
				Description: "List of folders watched by watch code mode.",
				Location:    Location{Side: SideLeft, OverviewTabKey: "Overview"},
				Highlight:   Highlight{Strategy: HighlightStrategyDOMAnchor, AnchorID: "core.watch_code.folders"},
				Source:      SourceCore,
				Mutability:  MutabilityWritable,
				ValueSchema: watchCodeFoldersSchema,
			},
			ReadValue: func(_ context.Context, projectID string) (any, error) {
				project, err := runtime.Snapshot().Document.ProjectByID(projectID)
				if err != nil {
					return nil, err
				}
				return watchCodeFoldersToJSON(project.WatchCodeFolders), nil
			},
			WriteValue: func(ctx context.Context, projectID string, value any, expectedOldValue any) (MutationResult, error) {
				folders, expected, err := normalizeWatchCodeFoldersWrite(value, expectedOldValue)
				if err != nil {
					return MutationResult{}, err
				}
				_, result, err := runtime.CompareAndSetWatchCodeFolders(ctx, projectID, folders, workspaceRoot, expected)
				if err != nil {
					return MutationResult{}, wrapMutationError(err)
				}
				return MutationResult{
					OldValue:        watchCodeFoldersToJSON(result.OldValue),
					NewValue:        watchCodeFoldersToJSON(result.NewValue),
					NormalizedValue: watchCodeFoldersToJSON(result.NewValue),
					Changed:         !watchCodeFoldersEqual(result.OldValue, result.NewValue),
				}, nil
			},
		},
		{
			Metadata: Entry{
				SettingID:   "core.watch_code.files",
				Title:       "Watch Code Files",
				Synonyms:    []string{"watch files", "watch code files"},
				Description: "List of explicit files watched by watch code mode.",
				Location:    Location{Side: SideLeft, OverviewTabKey: "Overview"},
				Highlight:   Highlight{Strategy: HighlightStrategyDOMAnchor, AnchorID: "core.watch_code.files"},
				Source:      SourceCore,
				Mutability:  MutabilityWritable,
				ValueSchema: watchCodeFilesSchema,
			},
			ReadValue: func(_ context.Context, projectID string) (any, error) {
				project, err := runtime.Snapshot().Document.ProjectByID(projectID)
				if err != nil {
					return nil, err
				}
				return append([]string(nil), project.WatchCodeFiles...), nil
			},
			WriteValue: func(ctx context.Context, projectID string, value any, expectedOldValue any) (MutationResult, error) {
				files, expected, err := normalizeStringSliceWrite(watchCodeFilesSchema, value, expectedOldValue)
				if err != nil {
					return MutationResult{}, err
				}
				_, result, err := runtime.CompareAndSetWatchCodeFiles(ctx, projectID, files, workspaceRoot, expected)
				if err != nil {
					return MutationResult{}, wrapMutationError(err)
				}
				return MutationResult{
					OldValue:        append([]string(nil), result.OldValue...),
					NewValue:        append([]string(nil), result.NewValue...),
					NormalizedValue: append([]string(nil), result.NewValue...),
					Changed:         !slicesEqual(result.OldValue, result.NewValue),
				}, nil
			},
		},
		{
			Metadata: Entry{
				SettingID:   "core.project.name",
				Title:       "Project Name",
				Synonyms:    []string{"project name", "config name", "rename project"},
				Description: "Project name shown in the overview header.",
				Location:    Location{Side: SideLeft, OverviewTabKey: "Overview"},
				Highlight:   Highlight{Strategy: HighlightStrategyDOMAnchor, AnchorID: "core.project.name"},
				Source:      SourceCore,
				Mutability:  MutabilityWritable,
				ValueSchema: ValueSchema{Type: ValueTypeString, MinLength: intPointer(1)},
			},
			ReadValue: func(_ context.Context, projectID string) (any, error) {
				project, err := runtime.Snapshot().Document.ProjectByID(projectID)
				if err != nil {
					return nil, err
				}
				return project.Name, nil
			},
			WriteValue: func(ctx context.Context, projectID string, value any, expectedOldValue any) (MutationResult, error) {
				return writeProjectNameSetting(ctx, runtime, projectID, value, expectedOldValue)
			},
		},
		{
			Metadata: Entry{
				SettingID:   "core.project.show_param_display_names",
				Title:       "Show Param Display Names",
				Synonyms:    []string{"display names", "parameter display names", "param names"},
				Description: "Toggle display names for parameters in the right pane.",
				Location:    Location{Side: SideRight, UIEditorTabName: "QuickInfoConfig", RequiresSectionSelection: true},
				Highlight:   Highlight{Strategy: HighlightStrategyDOMAnchor, AnchorID: "core.project.show_param_display_names"},
				Source:      SourceCore,
				Mutability:  MutabilityWritable,
				ValueSchema: ValueSchema{Type: ValueTypeBoolean},
			},
			ReadValue: func(_ context.Context, projectID string) (any, error) {
				project, err := runtime.Snapshot().Document.ProjectByID(projectID)
				if err != nil {
					return nil, err
				}
				return project.ShowParamDisplayNames, nil
			},
			WriteValue: func(ctx context.Context, projectID string, value any, expectedOldValue any) (MutationResult, error) {
				show, expected, err := normalizeOptionalBoolWrite(ValueSchema{Type: ValueTypeBoolean}, value, expectedOldValue)
				if err != nil {
					return MutationResult{}, err
				}
				_, result, err := runtime.CompareAndSetShowParamDisplayNames(ctx, projectID, show, expected)
				if err != nil {
					return MutationResult{}, wrapMutationError(err)
				}
				return MutationResult{
					OldValue:        result.OldValue,
					NewValue:        result.NewValue,
					NormalizedValue: result.NewValue,
					Changed:         result.OldValue != result.NewValue,
				}, nil
			},
		},
		{
			Metadata: Entry{
				SettingID:   "core.run_instructions.python_codegen_enabled",
				Title:       "Python Codegen Enabled",
				Synonyms:    []string{"python codegen", "generated code", "run instructions python"},
				Description: "Enable or disable generated Python code sections for the project.",
				Location:    Location{Side: SideLeft, OverviewTabKey: "Overview"},
				Highlight:   Highlight{Strategy: HighlightStrategyDOMAnchor, AnchorID: "core.run_instructions.python_codegen_enabled"},
				Source:      SourceCore,
				Mutability:  MutabilityWritable,
				ValueSchema: ValueSchema{Type: ValueTypeBoolean},
			},
			ReadValue: func(_ context.Context, projectID string) (any, error) {
				project, err := runtime.Snapshot().Document.ProjectByID(projectID)
				if err != nil {
					return nil, err
				}
				return project.HasPythonCodegenTarget(), nil
			},
			WriteValue: func(ctx context.Context, projectID string, value any, expectedOldValue any) (MutationResult, error) {
				return writePythonCodegenEnabledSetting(ctx, runtime, projectID, value, expectedOldValue)
			},
		},
		{
			Metadata: Entry{
				SettingID:   "core.app.catalog_id",
				Title:       "App Catalog ID",
				Synonyms:    []string{"app catalog", "catalog id"},
				Description: "Catalog id for the app definition.",
				Location:    Location{Side: SideLeft, OverviewTabKey: "App"},
				Highlight:   Highlight{Strategy: HighlightStrategyDOMAnchor, AnchorID: "core.app.catalog_id"},
				Source:      SourceCore,
				Mutability:  MutabilityWritable,
				ValueSchema: ValueSchema{Type: ValueTypeString, MinLength: intPointer(1)},
			},
			ReadValue: func(_ context.Context, _ string) (any, error) {
				return projectstate.EffectiveAppDefinition(runtime.Snapshot().Document).CatalogID, nil
			},
			WriteValue: func(ctx context.Context, _ string, value any, expectedOldValue any) (MutationResult, error) {
				nextValue, expected, err := normalizeOptionalNonEmptyStringWrite(value, expectedOldValue)
				if err != nil {
					return MutationResult{}, err
				}
				_, result, err := runtime.CompareAndSetAppDefinitionCatalogID(ctx, nextValue, expected)
				if err != nil {
					return MutationResult{}, wrapMutationError(err)
				}
				return MutationResult{
					OldValue:        result.OldValue,
					NewValue:        result.NewValue,
					NormalizedValue: result.NewValue,
					Changed:         result.OldValue != result.NewValue,
				}, nil
			},
		},
		{
			Metadata: Entry{
				SettingID:   "core.app.spec_version",
				Title:       "App Spec Version",
				Synonyms:    []string{"app version", "spec version"},
				Description: "Version marker for the app definition schema payload.",
				Location:    Location{Side: SideLeft, OverviewTabKey: "App"},
				Highlight:   Highlight{Strategy: HighlightStrategyDOMAnchor, AnchorID: "core.app.spec_version"},
				Source:      SourceCore,
				Mutability:  MutabilityWritable,
				ValueSchema: ValueSchema{Type: ValueTypeString, MinLength: intPointer(1)},
			},
			ReadValue: func(_ context.Context, _ string) (any, error) {
				return projectstate.EffectiveAppDefinition(runtime.Snapshot().Document).AppSpecVersion, nil
			},
			WriteValue: func(ctx context.Context, _ string, value any, expectedOldValue any) (MutationResult, error) {
				nextValue, expected, err := normalizeOptionalNonEmptyStringWrite(value, expectedOldValue)
				if err != nil {
					return MutationResult{}, err
				}
				_, result, err := runtime.CompareAndSetAppDefinitionSpecVersion(ctx, nextValue, expected)
				if err != nil {
					return MutationResult{}, wrapMutationError(err)
				}
				return MutationResult{
					OldValue:        result.OldValue,
					NewValue:        result.NewValue,
					NormalizedValue: result.NewValue,
					Changed:         result.OldValue != result.NewValue,
				}, nil
			},
		},
		{
			Metadata: Entry{
				SettingID:   "core.app.spec_path",
				Title:       "App Spec Path",
				Synonyms:    []string{"app path", "spec path"},
				Description: "Filesystem path where app spec JSON is saved.",
				Location:    Location{Side: SideLeft, OverviewTabKey: "App"},
				Highlight:   Highlight{Strategy: HighlightStrategyDOMAnchor, AnchorID: "core.app.spec_path"},
				Source:      SourceCore,
				Mutability:  MutabilityWritable,
				ValueSchema: ValueSchema{Type: ValueTypeString, MinLength: intPointer(1)},
			},
			ReadValue: func(_ context.Context, _ string) (any, error) {
				return projectstate.EffectiveAppSpecPath(runtime.Snapshot().Document), nil
			},
			WriteValue: func(ctx context.Context, _ string, value any, expectedOldValue any) (MutationResult, error) {
				nextValue, expected, err := normalizeOptionalNonEmptyStringWrite(value, expectedOldValue)
				if err != nil {
					return MutationResult{}, err
				}
				_, result, err := runtime.CompareAndSetAppDefinitionSpecPath(ctx, nextValue, expected)
				if err != nil {
					return MutationResult{}, wrapMutationError(err)
				}
				return MutationResult{
					OldValue:        result.OldValue,
					NewValue:        result.NewValue,
					NormalizedValue: result.NewValue,
					Changed:         result.OldValue != result.NewValue,
				}, nil
			},
		},
		{
			Metadata: Entry{
				SettingID:   "core.app.theme_mode",
				Title:       "App Theme Mode",
				Synonyms:    []string{"theme mode", "app theme", "light mode", "dark mode"},
				Description: "Theme mode for the app definition.",
				Location:    Location{Side: SideLeft, OverviewTabKey: "App"},
				Highlight:   Highlight{Strategy: HighlightStrategyDOMAnchor, AnchorID: "core.app.theme_mode"},
				Source:      SourceCore,
				Mutability:  MutabilityWritable,
				ValueSchema: ValueSchema{Type: ValueTypeString, EnumValues: []any{"auto", "dark", "light"}},
			},
			ReadValue: func(_ context.Context, _ string) (any, error) {
				return projectstate.EffectiveAppThemeMode(runtime.Snapshot().Document), nil
			},
			WriteValue: func(ctx context.Context, _ string, value any, expectedOldValue any) (MutationResult, error) {
				nextValue, expected, err := normalizeOptionalThemeModeWrite(value, expectedOldValue)
				if err != nil {
					return MutationResult{}, err
				}
				_, result, err := runtime.CompareAndSetAppDefinitionThemeMode(ctx, nextValue, expected)
				if err != nil {
					return MutationResult{}, wrapMutationError(err)
				}
				return MutationResult{
					OldValue:        result.OldValue,
					NewValue:        result.NewValue,
					NormalizedValue: result.NewValue,
					Changed:         result.OldValue != result.NewValue,
				}, nil
			},
		},
	})
}

func normalizeOptionalBoolWrite(schema ValueSchema, value any, expectedOldValue any) (bool, *bool, error) {
	if err := ValidateValue(schema, value); err != nil {
		return false, nil, err
	}
	normalizedValue := value.(bool)
	if expectedOldValue == nil {
		return normalizedValue, nil, nil
	}
	if err := ValidateValue(schema, expectedOldValue); err != nil {
		return false, nil, err
	}
	expected := expectedOldValue.(bool)
	return normalizedValue, &expected, nil
}

func normalizeOptionalNonEmptyStringWrite(value any, expectedOldValue any) (string, *string, error) {
	normalizedValue, err := normalizeNonEmptyString(value)
	if err != nil {
		return "", nil, err
	}
	if expectedOldValue == nil {
		return normalizedValue, nil, nil
	}
	expected, err := normalizeNonEmptyString(expectedOldValue)
	if err != nil {
		return "", nil, err
	}
	return normalizedValue, &expected, nil
}

func normalizeOptionalThemeModeWrite(value any, expectedOldValue any) (string, *string, error) {
	normalizedValue, err := normalizeThemeMode(value)
	if err != nil {
		return "", nil, err
	}
	if expectedOldValue == nil {
		return normalizedValue, nil, nil
	}
	expected, err := normalizeThemeMode(expectedOldValue)
	if err != nil {
		return "", nil, err
	}
	return normalizedValue, &expected, nil
}

func normalizeStringSliceWrite(schema ValueSchema, value any, expectedOldValue any) ([]string, []string, error) {
	if err := ValidateValue(schema, value); err != nil {
		return nil, nil, err
	}
	normalizedValue, err := stringSliceFromValue(value)
	if err != nil {
		return nil, nil, err
	}
	if expectedOldValue == nil {
		return normalizedValue, nil, nil
	}
	if err := ValidateValue(schema, expectedOldValue); err != nil {
		return nil, nil, err
	}
	expected, err := stringSliceFromValue(expectedOldValue)
	if err != nil {
		return nil, nil, err
	}
	return normalizedValue, expected, nil
}

func normalizeWatchCodeFoldersWrite(value any, expectedOldValue any) ([]projectstate.WatchCodeFolder, []projectstate.WatchCodeFolder, error) {
	if err := ValidateValue(watchCodeFoldersSchema, value); err != nil {
		return nil, nil, err
	}
	normalizedValue, err := watchCodeFoldersFromValue(value)
	if err != nil {
		return nil, nil, err
	}
	if expectedOldValue == nil {
		return normalizedValue, nil, nil
	}
	if err := ValidateValue(watchCodeFoldersSchema, expectedOldValue); err != nil {
		return nil, nil, err
	}
	expected, err := watchCodeFoldersFromValue(expectedOldValue)
	if err != nil {
		return nil, nil, err
	}
	return normalizedValue, expected, nil
}

func normalizeNonEmptyString(value any) (string, error) {
	stringValue, ok := value.(string)
	if !ok {
		return "", newSettingError(ErrorCodeInvalidValueType, "Expected a non-empty string value.")
	}
	trimmed := strings.TrimSpace(stringValue)
	if trimmed == "" {
		return "", newSettingError(ErrorCodeInvalidValueType, "Expected a non-empty string value.")
	}
	return trimmed, nil
}

func normalizeThemeMode(value any) (string, error) {
	stringValue, ok := value.(string)
	if !ok {
		return "", newSettingError(ErrorCodeInvalidValueType, "Expected a string value.")
	}
	trimmed := strings.TrimSpace(stringValue)
	switch trimmed {
	case "auto", "dark", "light":
		return trimmed, nil
	default:
		return "", newSettingError(ErrorCodeInvalidValueRangeOrEnum, "Theme mode must be one of: auto, dark, light.")
	}
}

func watchCodeFoldersFromValue(value any) ([]projectstate.WatchCodeFolder, error) {
	items, ok := sliceValues(value)
	if !ok {
		return nil, newSettingError(ErrorCodeInvalidValueType, "Expected an array value.")
	}
	folders := make([]projectstate.WatchCodeFolder, 0, len(items))
	for _, item := range items {
		objectValue, ok := objectValues(item)
		if !ok {
			return nil, newSettingError(ErrorCodeInvalidValueType, "Expected an object value.")
		}
		folder := projectstate.WatchCodeFolder{}
		if path, ok := objectValue["path"].(string); ok {
			folder.Path = path
		}
		if recursive, ok := objectValue["recursive"].(bool); ok {
			folder.Recursive = recursive
		}
		folders = append(folders, folder)
	}
	return folders, nil
}

func stringSliceFromValue(value any) ([]string, error) {
	items, ok := sliceValues(value)
	if !ok {
		return nil, newSettingError(ErrorCodeInvalidValueType, "Expected an array value.")
	}
	values := make([]string, 0, len(items))
	for _, item := range items {
		stringValue, ok := item.(string)
		if !ok {
			return nil, newSettingError(ErrorCodeInvalidValueType, "Expected a string value.")
		}
		values = append(values, stringValue)
	}
	return values, nil
}

func watchCodeFoldersToJSON(folders []projectstate.WatchCodeFolder) []map[string]any {
	if len(folders) == 0 {
		return []map[string]any{}
	}
	items := make([]map[string]any, len(folders))
	for index, folder := range folders {
		item := map[string]any{"path": folder.Path}
		if folder.Recursive {
			item["recursive"] = true
		} else {
			item["recursive"] = false
		}
		items[index] = item
	}
	return items
}

func watchCodeFoldersEqual(left []projectstate.WatchCodeFolder, right []projectstate.WatchCodeFolder) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func wrapMutationError(err error) error {
	if err == nil {
		return nil
	}
	if projectstate.IsExpectedOldValueMismatchError(err) {
		return newSettingError(ErrorCodeMutationFailed, "%s", err.Error())
	}
	return err
}

func writeProjectNameSetting(
	ctx context.Context,
	runtime CoreProjectState,
	projectID string,
	value any,
	expectedOldValue any,
) (MutationResult, error) {
	nextValue, expected, err := normalizeOptionalNonEmptyStringWrite(value, expectedOldValue)
	if err != nil {
		return MutationResult{}, err
	}
	_, result, err := runtime.CompareAndSetProjectName(ctx, projectID, nextValue, expected)
	if err != nil {
		return MutationResult{}, wrapMutationError(err)
	}
	return MutationResult{
		OldValue:        result.OldValue,
		NewValue:        result.NewValue,
		NormalizedValue: result.NewValue,
		Changed:         result.OldValue != result.NewValue,
	}, nil
}

func writePythonCodegenEnabledSetting(
	ctx context.Context,
	runtime CoreProjectState,
	projectID string,
	value any,
	expectedOldValue any,
) (MutationResult, error) {
	nextValue, expected, err := normalizeOptionalBoolWrite(ValueSchema{Type: ValueTypeBoolean}, value, expectedOldValue)
	if err != nil {
		return MutationResult{}, err
	}
	_, result, err := runtime.CompareAndSetPythonCodegenEnabled(
		ctx,
		projectID,
		nextValue,
		expected,
		projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
			return nil
		}),
		projectstate.PythonCodegenSectionReconcilerFunc(func(context.Context, *projectstate.Project) error {
			return nil
		}),
	)
	if err != nil {
		return MutationResult{}, wrapMutationError(err)
	}
	return MutationResult{
		OldValue:        result.OldValue,
		NewValue:        result.NewValue,
		NormalizedValue: result.NewValue,
		Changed:         result.OldValue != result.NewValue,
	}, nil
}

func valueSchemaPointer(schema ValueSchema) *ValueSchema {
	cloned := cloneValueSchema(schema)
	return &cloned
}

func boolPointer(value bool) *bool {
	return &value
}

func intPointer(value int) *int {
	return &value
}

func slicesEqual(left []string, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}
