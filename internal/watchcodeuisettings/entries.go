package watchcodeuisettings

import (
	"context"
	"fmt"
	"strings"

	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/uisettings"
)

const (
	EnabledSettingID = "core.watch_code.enabled"
	FoldersSettingID = "core.watch_code.folders"
	FilesSettingID   = "core.watch_code.files"
)

var (
	watchCodeFolderItemAdditionalProperties = false
	watchCodeFolderItemSchema               = uisettings.ValueSchema{
		Type: uisettings.ValueTypeObject,
		Properties: map[string]uisettings.ValueSchema{
			"path":      {Type: uisettings.ValueTypeString},
			"recursive": {Type: uisettings.ValueTypeBoolean},
		},
		RequiredProperties:   []string{"path"},
		AdditionalProperties: &watchCodeFolderItemAdditionalProperties,
	}
	watchCodeFoldersSchema = uisettings.ValueSchema{
		Type:  uisettings.ValueTypeArray,
		Items: valueSchemaPointer(watchCodeFolderItemSchema),
	}
	watchCodeFilesSchema = uisettings.ValueSchema{
		Type:  uisettings.ValueTypeArray,
		Items: valueSchemaPointer(uisettings.ValueSchema{Type: uisettings.ValueTypeString}),
	}
)

func BuildScopedUISettingEntries(
	capabilities plugins.PluginWatchCodeCapabilities,
	runtime uisettings.CoreProjectState,
	workspaceRoot string,
) ([]uisettings.RuntimeEntry, error) {
	if runtime == nil || !providerActive(capabilities) {
		return nil, nil
	}
	pluginID := strings.TrimSpace(capabilities.PluginID)
	if pluginID == "" {
		return nil, fmt.Errorf("watch code UI settings require a provider plugin id")
	}

	boolSchema := uisettings.ValueSchema{Type: uisettings.ValueTypeBoolean}
	return []uisettings.RuntimeEntry{
		uisettings.NewCompareAndSetEntry(
			entryMetadata(
				EnabledSettingID,
				pluginID,
				"Watch Code Enabled",
				[]string{"watch code", "watch mode", "watch toggle"},
				"Enable or disable watch code mode for the project.",
				boolSchema,
			),
			readProjectValue(runtime, func(project *projectstate.Project) any {
				return project.WatchCodeEnabled
			}),
			normalizeBoolWrite(boolSchema),
			func(ctx context.Context, projectID string, enabled bool, expected *bool) (projectstate.CompareAndSetResult[bool], error) {
				_, result, err := runtime.CompareAndSetWatchCodeEnabled(ctx, projectID, enabled, workspaceRoot, expected)
				return result, err
			},
			uisettings.ComparableMutationResult[bool],
		),
		uisettings.NewCompareAndSetEntry(
			entryMetadata(
				FoldersSettingID,
				pluginID,
				"Watch Code Folders",
				[]string{"watch folders", "watch code folders"},
				"List of folders watched by watch code mode.",
				watchCodeFoldersSchema,
			),
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
		uisettings.NewCompareAndSetEntry(
			entryMetadata(
				FilesSettingID,
				pluginID,
				"Watch Code Files",
				[]string{"watch files", "watch code files"},
				"List of explicit files watched by watch code mode.",
				watchCodeFilesSchema,
			),
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
	}, nil
}

func UnavailableSettingErrors(capabilities plugins.PluginWatchCodeCapabilities) map[string]uisettings.SettingError {
	if providerActive(capabilities) {
		return nil
	}
	message := "Watch Code settings are unavailable because no active Watch Code provider is selected."
	return map[string]uisettings.SettingError{
		EnabledSettingID: {Code: uisettings.ErrorCodePluginUnavailable, Message: message},
		FoldersSettingID: {Code: uisettings.ErrorCodePluginUnavailable, Message: message},
		FilesSettingID:   {Code: uisettings.ErrorCodePluginUnavailable, Message: message},
	}
}

func providerActive(capabilities plugins.PluginWatchCodeCapabilities) bool {
	return capabilities.PluginEnabled && capabilities.Python
}

func entryMetadata(
	settingID string,
	pluginID string,
	title string,
	synonyms []string,
	description string,
	valueSchema uisettings.ValueSchema,
) uisettings.Entry {
	return uisettings.Entry{
		SettingID:   settingID,
		Title:       title,
		Synonyms:    append([]string(nil), synonyms...),
		Description: description,
		Location: uisettings.Location{
			Side:           uisettings.SideLeft,
			OverviewTabKey: string(uisettings.OverviewTabNameOverview),
		},
		Highlight: uisettings.Highlight{
			Strategy: uisettings.HighlightStrategyDOMAnchor,
			AnchorID: settingID,
		},
		Source:      uisettings.SourcePlugin,
		PluginID:    pluginID,
		Mutability:  uisettings.MutabilityWritable,
		ValueSchema: valueSchema,
	}
}

func readProjectValue(runtime uisettings.CoreProjectState, selectValue func(*projectstate.Project) any) uisettings.ReadFunc {
	return func(_ context.Context, projectID string) (any, error) {
		project, err := runtime.Snapshot().Document.ProjectByID(projectID)
		if err != nil {
			return nil, err
		}
		return selectValue(&project), nil
	}
}

func normalizeBoolWrite(schema uisettings.ValueSchema) uisettings.CompareAndSetEntryNormalizer[bool, *bool] {
	return func(value any, expectedOldValue any) (bool, *bool, error) {
		if err := uisettings.ValidateValue(schema, value); err != nil {
			return false, nil, err
		}
		normalizedValue := value.(bool)
		if expectedOldValue == nil {
			return normalizedValue, nil, nil
		}
		if err := uisettings.ValidateValue(schema, expectedOldValue); err != nil {
			return false, nil, err
		}
		expected := expectedOldValue.(bool)
		return normalizedValue, &expected, nil
	}
}

func normalizeWatchCodeFoldersWrite(value any, expectedOldValue any) ([]projectstate.WatchCodeFolder, []projectstate.WatchCodeFolder, error) {
	if err := uisettings.ValidateValue(watchCodeFoldersSchema, value); err != nil {
		return nil, nil, err
	}
	normalizedValue, err := watchCodeFoldersFromValue(value)
	if err != nil {
		return nil, nil, err
	}
	if expectedOldValue == nil {
		return normalizedValue, nil, nil
	}
	if err := uisettings.ValidateValue(watchCodeFoldersSchema, expectedOldValue); err != nil {
		return nil, nil, err
	}
	expected, err := watchCodeFoldersFromValue(expectedOldValue)
	if err != nil {
		return nil, nil, err
	}
	return normalizedValue, expected, nil
}

func normalizeStringSliceWrite(schema uisettings.ValueSchema) uisettings.CompareAndSetEntryNormalizer[[]string, []string] {
	return func(value any, expectedOldValue any) ([]string, []string, error) {
		if err := uisettings.ValidateValue(schema, value); err != nil {
			return nil, nil, err
		}
		normalizedValue, err := stringSliceFromValue(value)
		if err != nil {
			return nil, nil, err
		}
		if expectedOldValue == nil {
			return normalizedValue, nil, nil
		}
		if err := uisettings.ValidateValue(schema, expectedOldValue); err != nil {
			return nil, nil, err
		}
		expected, err := stringSliceFromValue(expectedOldValue)
		if err != nil {
			return nil, nil, err
		}
		return normalizedValue, expected, nil
	}
}

func watchCodeFoldersFromValue(value any) ([]projectstate.WatchCodeFolder, error) {
	items, ok := sliceValues(value)
	if !ok {
		return nil, fmt.Errorf("expected an array value")
	}
	folders := make([]projectstate.WatchCodeFolder, 0, len(items))
	for _, item := range items {
		objectValue, ok := objectValues(item)
		if !ok {
			return nil, fmt.Errorf("expected an object value")
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
		return nil, fmt.Errorf("expected an array value")
	}
	values := make([]string, 0, len(items))
	for _, item := range items {
		stringValue, ok := item.(string)
		if !ok {
			return nil, fmt.Errorf("expected a string value")
		}
		values = append(values, stringValue)
	}
	return values, nil
}

func watchCodeFoldersMutationResult(result projectstate.CompareAndSetResult[[]projectstate.WatchCodeFolder]) uisettings.MutationResult {
	return uisettings.MutationResult{
		OldValue:        watchCodeFoldersToJSON(result.OldValue),
		NewValue:        watchCodeFoldersToJSON(result.NewValue),
		NormalizedValue: watchCodeFoldersToJSON(result.NewValue),
		Changed:         !watchCodeFoldersEqual(result.OldValue, result.NewValue),
	}
}

func stringSliceMutationResult(result projectstate.CompareAndSetResult[[]string]) uisettings.MutationResult {
	return uisettings.MutationResult{
		OldValue:        cloneStringSlice(result.OldValue),
		NewValue:        cloneStringSlice(result.NewValue),
		NormalizedValue: cloneStringSlice(result.NewValue),
		Changed:         !slicesEqual(result.OldValue, result.NewValue),
	}
}

func watchCodeFoldersToJSON(folders []projectstate.WatchCodeFolder) []map[string]any {
	if len(folders) == 0 {
		return []map[string]any{}
	}
	items := make([]map[string]any, len(folders))
	for index, folder := range folders {
		item := map[string]any{"path": folder.Path}
		item["recursive"] = folder.Recursive
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

func sliceValues(value any) ([]any, bool) {
	switch typed := value.(type) {
	case []any:
		return typed, true
	case []map[string]any:
		values := make([]any, len(typed))
		for index, item := range typed {
			values[index] = item
		}
		return values, true
	case []string:
		values := make([]any, len(typed))
		for index, item := range typed {
			values[index] = item
		}
		return values, true
	default:
		return nil, false
	}
}

func objectValues(value any) (map[string]any, bool) {
	switch typed := value.(type) {
	case map[string]any:
		return typed, true
	default:
		return nil, false
	}
}

func valueSchemaPointer(schema uisettings.ValueSchema) *uisettings.ValueSchema {
	cloned := schema
	return &cloned
}
