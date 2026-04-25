package uisettings

import (
	"context"
	"strings"

	"setta/internal/plugins"
	"setta/internal/projectstate"
)

const (
	watchCodeEnabledSettingID = "core.watch_code.enabled"
	watchCodeFoldersSettingID = "core.watch_code.folders"
	watchCodeFilesSettingID   = "core.watch_code.files"
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

type CoreRegistryOptions struct {
	WatchCodeCapabilities *plugins.PluginWatchCodeCapabilities
}

func NewCoreRegistry(runtime CoreProjectState, workspaceRoot string) (*Registry, error) {
	return NewCoreRegistryWithOptions(runtime, workspaceRoot, CoreRegistryOptions{})
}

func NewCoreRegistryWithOptions(runtime CoreProjectState, workspaceRoot string, options CoreRegistryOptions) (*Registry, error) {
	if runtime == nil {
		return nil, projectstate.ErrRuntimeClosed
	}
	boolSchema := ValueSchema{Type: ValueTypeBoolean}
	nonEmptyStringSchema := ValueSchema{Type: ValueTypeString, MinLength: intPointer(1)}

	entries := []RuntimeEntry{
		NewCompareAndSetEntry(
			Entry{
				SettingID:   watchCodeEnabledSettingID,
				Title:       "Watch Code Enabled",
				Synonyms:    []string{"watch code", "watch mode", "watch toggle"},
				Description: "Enable or disable watch code mode for the project.",
				Location:    Location{Side: SideLeft, OverviewTabKey: string(OverviewTabNameOverview)},
				Highlight:   Highlight{Strategy: HighlightStrategyDOMAnchor, AnchorID: watchCodeEnabledSettingID},
				Source:      SourceCore,
				Mutability:  MutabilityWritable,
				ValueSchema: boolSchema,
			},
			readProjectValue(runtime, func(project *projectstate.Project) any {
				return project.WatchCodeEnabled
			}),
			normalizeBoolWrite(boolSchema),
			func(ctx context.Context, projectID string, enabled bool, expected *bool) (projectstate.CompareAndSetResult[bool], error) {
				_, result, err := runtime.CompareAndSetWatchCodeEnabled(ctx, projectID, enabled, workspaceRoot, expected)
				return result, err
			},
			ComparableMutationResult[bool],
		),
		NewCompareAndSetEntry(
			Entry{
				SettingID:   watchCodeFoldersSettingID,
				Title:       "Watch Code Folders",
				Synonyms:    []string{"watch folders", "watch code folders"},
				Description: "List of folders watched by watch code mode.",
				Location:    Location{Side: SideLeft, OverviewTabKey: string(OverviewTabNameOverview)},
				Highlight:   Highlight{Strategy: HighlightStrategyDOMAnchor, AnchorID: watchCodeFoldersSettingID},
				Source:      SourceCore,
				Mutability:  MutabilityWritable,
				ValueSchema: watchCodeFoldersSchema,
			},
			readProjectValue(runtime, func(project *projectstate.Project) any {
				return watchCodeFoldersToJSON(project.WatchCodeFolders)
			}),
			normalizeWatchCodeFoldersWrite,
			func(ctx context.Context, projectID string, folders []projectstate.WatchCodeFolder, expected []projectstate.WatchCodeFolder) (projectstate.CompareAndSetResult[[]projectstate.WatchCodeFolder], error) {
				_, result, err := runtime.CompareAndSetWatchCodeFolders(ctx, projectID, folders, workspaceRoot, expected)
				return result, err
			},
			watchCodeFoldersMutationResult,
		),
		NewCompareAndSetEntry(
			Entry{
				SettingID:   watchCodeFilesSettingID,
				Title:       "Watch Code Files",
				Synonyms:    []string{"watch files", "watch code files"},
				Description: "List of explicit files watched by watch code mode.",
				Location:    Location{Side: SideLeft, OverviewTabKey: string(OverviewTabNameOverview)},
				Highlight:   Highlight{Strategy: HighlightStrategyDOMAnchor, AnchorID: watchCodeFilesSettingID},
				Source:      SourceCore,
				Mutability:  MutabilityWritable,
				ValueSchema: watchCodeFilesSchema,
			},
			readProjectValue(runtime, func(project *projectstate.Project) any {
				return cloneStringSlice(project.WatchCodeFiles)
			}),
			normalizeStringSliceWrite(watchCodeFilesSchema),
			func(ctx context.Context, projectID string, files []string, expected []string) (projectstate.CompareAndSetResult[[]string], error) {
				_, result, err := runtime.CompareAndSetWatchCodeFiles(ctx, projectID, files, workspaceRoot, expected)
				return result, err
			},
			stringSliceMutationResult,
		),
		NewCompareAndSetEntry(
			Entry{
				SettingID:   "core.project.name",
				Title:       "Project Name",
				Synonyms:    []string{"project name", "config name", "rename project"},
				Description: "Project name shown in the overview header.",
				Location:    Location{Side: SideLeft, OverviewTabKey: string(OverviewTabNameOverview)},
				Highlight:   Highlight{Strategy: HighlightStrategyDOMAnchor, AnchorID: "core.project.name"},
				Source:      SourceCore,
				Mutability:  MutabilityWritable,
				ValueSchema: nonEmptyStringSchema,
			},
			readProjectValue(runtime, func(project *projectstate.Project) any {
				return project.Name
			}),
			NormalizeOptionalNonEmptyStringWrite,
			func(ctx context.Context, projectID string, nextValue string, expected *string) (projectstate.CompareAndSetResult[string], error) {
				_, result, err := runtime.CompareAndSetProjectName(ctx, projectID, nextValue, expected)
				return result, err
			},
			ComparableMutationResult[string],
		),
		NewCompareAndSetEntry(
			Entry{
				SettingID:   "core.project.show_param_display_names",
				Title:       "Show Param Display Names",
				Synonyms:    []string{"display names", "parameter display names", "param names"},
				Description: "Toggle display names for parameters in the right pane.",
				Location:    Location{Side: SideRight, UIEditorTabName: string(UIEditorTabNameQuickInfoConfig), RequiresSectionSelection: true},
				Highlight:   Highlight{Strategy: HighlightStrategyDOMAnchor, AnchorID: "core.project.show_param_display_names"},
				Source:      SourceCore,
				Mutability:  MutabilityWritable,
				ValueSchema: boolSchema,
			},
			readProjectValue(runtime, func(project *projectstate.Project) any {
				return project.ShowParamDisplayNames
			}),
			normalizeBoolWrite(boolSchema),
			func(ctx context.Context, projectID string, show bool, expected *bool) (projectstate.CompareAndSetResult[bool], error) {
				_, result, err := runtime.CompareAndSetShowParamDisplayNames(ctx, projectID, show, expected)
				return result, err
			},
			ComparableMutationResult[bool],
		),
		NewCompareAndSetEntry(
			Entry{
				SettingID:   "core.run_instructions.python_codegen_enabled",
				Title:       "Python Codegen Enabled",
				Synonyms:    []string{"python codegen", "generated code", "run instructions python"},
				Description: "Enable or disable generated Python code sections for the project.",
				Location:    Location{Side: SideLeft, OverviewTabKey: string(OverviewTabNameRunInstructions)},
				Highlight:   Highlight{Strategy: HighlightStrategyDOMAnchor, AnchorID: "core.run_instructions.python_codegen_enabled"},
				Source:      SourceCore,
				Mutability:  MutabilityWritable,
				ValueSchema: boolSchema,
				RevealActivationSteps: []RevealActivationStep{
					{
						Type:      RevealActivationRunInstructions,
						ItemValue: "run-instructions-codegen-targets",
					},
				},
			},
			readProjectValue(runtime, func(project *projectstate.Project) any {
				return project.HasPythonCodegenTarget()
			}),
			normalizeBoolWrite(boolSchema),
			func(ctx context.Context, projectID string, enabled bool, expected *bool) (projectstate.CompareAndSetResult[bool], error) {
				_, result, err := runtime.CompareAndSetPythonCodegenEnabled(
					ctx,
					projectID,
					enabled,
					expected,
					projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
						return nil
					}),
					projectstate.PythonCodegenSectionReconcilerFunc(func(context.Context, *projectstate.Project) error {
						return nil
					}),
				)
				return result, err
			},
			ComparableMutationResult[bool],
		),
	}
	metadata := registryPluginMetadata{}
	if !coreRegistryWatchCodeProviderActive(options) {
		entries = filterWatchCodeSettingEntries(entries)
		metadata.unavailableSettings = unavailableWatchCodeSettingErrors()
	}
	return newRegistry(entries, metadata)
}

func coreRegistryWatchCodeProviderActive(options CoreRegistryOptions) bool {
	if options.WatchCodeCapabilities == nil {
		return true
	}
	return options.WatchCodeCapabilities.PluginEnabled && options.WatchCodeCapabilities.Python
}

func filterWatchCodeSettingEntries(entries []RuntimeEntry) []RuntimeEntry {
	filtered := make([]RuntimeEntry, 0, len(entries))
	for _, entry := range entries {
		switch entry.Metadata.SettingID {
		case watchCodeEnabledSettingID, watchCodeFoldersSettingID, watchCodeFilesSettingID:
			continue
		default:
			filtered = append(filtered, entry)
		}
	}
	return filtered
}

func unavailableWatchCodeSettingErrors() map[string]SettingError {
	message := "Watch Code settings are unavailable because no active Watch Code provider is selected."
	return map[string]SettingError{
		watchCodeEnabledSettingID: {Code: ErrorCodePluginUnavailable, Message: message},
		watchCodeFoldersSettingID: {Code: ErrorCodePluginUnavailable, Message: message},
		watchCodeFilesSettingID:   {Code: ErrorCodePluginUnavailable, Message: message},
	}
}

type CompareAndSetEntryNormalizer[Value any, Expected any] func(value any, expectedOldValue any) (Value, Expected, error)
type CompareAndSetEntryWriter[Value any, Expected any, Result any] func(ctx context.Context, projectID string, value Value, expectedOldValue Expected) (projectstate.CompareAndSetResult[Result], error)
type CompareAndSetEntryMutationBuilder[Result any] func(projectstate.CompareAndSetResult[Result]) MutationResult

func NewCompareAndSetEntry[Value any, Expected any, Result any](
	metadata Entry,
	read ReadFunc,
	normalize CompareAndSetEntryNormalizer[Value, Expected],
	write CompareAndSetEntryWriter[Value, Expected, Result],
	buildMutationResult CompareAndSetEntryMutationBuilder[Result],
) RuntimeEntry {
	return RuntimeEntry{
		Metadata:  metadata,
		ReadValue: read,
		WriteValue: func(ctx context.Context, projectID string, value any, expectedOldValue any) (MutationResult, error) {
			normalizedValue, expected, err := normalize(value, expectedOldValue)
			if err != nil {
				return MutationResult{}, err
			}
			result, err := write(ctx, projectID, normalizedValue, expected)
			if err != nil {
				return MutationResult{}, wrapMutationError(err)
			}
			return buildMutationResult(result), nil
		},
	}
}

func readProjectValue(runtime CoreProjectState, selectValue func(*projectstate.Project) any) ReadFunc {
	return func(_ context.Context, projectID string) (any, error) {
		project, err := runtime.Snapshot().Document.ProjectByID(projectID)
		if err != nil {
			return nil, err
		}
		return selectValue(&project), nil
	}
}

func normalizeBoolWrite(schema ValueSchema) CompareAndSetEntryNormalizer[bool, *bool] {
	return func(value any, expectedOldValue any) (bool, *bool, error) {
		return normalizeOptionalBoolWrite(schema, value, expectedOldValue)
	}
}

func normalizeStringSliceWrite(schema ValueSchema) CompareAndSetEntryNormalizer[[]string, []string] {
	return func(value any, expectedOldValue any) ([]string, []string, error) {
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
}

func ComparableMutationResult[Value comparable](result projectstate.CompareAndSetResult[Value]) MutationResult {
	return MutationResult{
		OldValue:        result.OldValue,
		NewValue:        result.NewValue,
		NormalizedValue: result.NewValue,
		Changed:         result.OldValue != result.NewValue,
	}
}

func watchCodeFoldersMutationResult(result projectstate.CompareAndSetResult[[]projectstate.WatchCodeFolder]) MutationResult {
	return MutationResult{
		OldValue:        watchCodeFoldersToJSON(result.OldValue),
		NewValue:        watchCodeFoldersToJSON(result.NewValue),
		NormalizedValue: watchCodeFoldersToJSON(result.NewValue),
		Changed:         !watchCodeFoldersEqual(result.OldValue, result.NewValue),
	}
}

func stringSliceMutationResult(result projectstate.CompareAndSetResult[[]string]) MutationResult {
	return MutationResult{
		OldValue:        cloneStringSlice(result.OldValue),
		NewValue:        cloneStringSlice(result.NewValue),
		NormalizedValue: cloneStringSlice(result.NewValue),
		Changed:         !slicesEqual(result.OldValue, result.NewValue),
	}
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

func NormalizeOptionalNonEmptyStringWrite(value any, expectedOldValue any) (string, *string, error) {
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

func NormalizeOptionalThemeModeWrite(value any, expectedOldValue any) (string, *string, error) {
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

func cloneStringSlice(values []string) []string {
	return append([]string(nil), values...)
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
