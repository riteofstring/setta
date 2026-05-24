package uisettings

import (
	"context"
	"reflect"
	"strings"

	"setta/internal/plugins"
)

func buildPluginRuntimeEntry(pluginService PluginRuntimeService, pluginID string, definition pluginUISettingDefinition) RuntimeEntry {
	settingID := buildPluginSettingID(pluginID, definition.LocalSettingID)
	metadata := buildPluginEntryMetadata(
		pluginID,
		definition.LocalSettingID,
		definition.Title,
		definition.Synonyms,
		definition.Description,
		definition.PaneID,
		definition.RevealKey,
		definition.Mutability,
		definition.ValueSchema,
		true,
	)
	entry := RuntimeEntry{
		Metadata:  metadata,
		ReadValue: newPluginRuntimeReadFunc(pluginService, pluginID, definition),
	}
	if definition.Mutability == MutabilityWritable {
		entry.WriteValue = newPluginRuntimeWriteFunc(pluginService, pluginID, settingID, definition)
	}
	return entry
}

func buildPluginBackendRuntimeEntry(pluginService PluginRuntimeService, registration plugins.PluginRegisteredUISetting, includePaneMetadata bool) RuntimeEntry {
	settingID := buildPluginSettingID(registration.PluginID, registration.LocalSettingID)
	valueSchema := parsePluginRegisteredValueSchema(registration)
	metadata := buildPluginEntryMetadata(
		registration.PluginID,
		registration.LocalSettingID,
		registration.Title,
		registration.Synonyms,
		registration.Description,
		registration.PaneID,
		registration.RevealKey,
		Mutability(registration.Mutability),
		valueSchema,
		includePaneMetadata,
	)
	entry := RuntimeEntry{
		Metadata:  metadata,
		ReadValue: newPluginBackendReadFunc(pluginService, registration, metadata.ValueSchema, settingID),
	}
	if metadata.Mutability == MutabilityWritable && registration.WriteHandlerID != nil {
		writeHandlerID := *registration.WriteHandlerID
		entry.WriteValue = newPluginBackendWriteFunc(pluginService, registration, metadata.ValueSchema, settingID, writeHandlerID)
	}
	return entry
}

func buildPluginEntryMetadata(
	pluginID string,
	localSettingID string,
	title string,
	synonyms []string,
	description string,
	paneID string,
	revealKey string,
	mutability Mutability,
	valueSchema ValueSchema,
	includePaneMetadata bool,
) Entry {
	location := Location{
		Side:     SideLeft,
		PluginID: pluginID,
	}
	if includePaneMetadata && strings.TrimSpace(paneID) != "" {
		location.OverviewTabKey = buildPluginPaneOverviewTabKey(pluginID, paneID)
		location.PaneID = paneID
	}
	return Entry{
		SettingID:   buildPluginSettingID(pluginID, localSettingID),
		Title:       title,
		Synonyms:    append([]string(nil), synonyms...),
		Description: description,
		Location:    location,
		Highlight: Highlight{
			Strategy:        HighlightStrategyPluginHandler,
			PluginRevealKey: revealKey,
		},
		Source:      SourcePlugin,
		PluginID:    pluginID,
		Mutability:  mutability,
		ValueSchema: cloneValueSchema(valueSchema),
	}
}

func parsePluginRegisteredValueSchema(registration plugins.PluginRegisteredUISetting) ValueSchema {
	valueSchema, err := parseExplicitPluginValueSchema(registration.PluginID, registration.LocalSettingID, registration.ValueSchema)
	if err != nil {
		return ValueSchema{}
	}
	return valueSchema
}

func newPluginRuntimeReadFunc(pluginService PluginRuntimeService, pluginID string, definition pluginUISettingDefinition) ReadFunc {
	return func(_ context.Context, _ string) (any, error) {
		return readPluginRuntimeValue(pluginService, pluginID, definition)
	}
}

func readPluginRuntimeValue(pluginService PluginRuntimeService, pluginID string, definition pluginUISettingDefinition) (any, error) {
	pluginEntry, err := requireActivePluginRuntimeEntry(pluginService, pluginID)
	if err != nil {
		return nil, err
	}
	return readPluginConfigPathValue(
		pluginEntry.Config.CurrentConfig,
		definition.ConfigPath,
		definition.DefaultValue,
		pluginID,
	)
}

func newPluginRuntimeWriteFunc(pluginService PluginRuntimeService, pluginID string, settingID string, definition pluginUISettingDefinition) WriteFunc {
	return func(ctx context.Context, _ string, value any, expectedOldValue any) (MutationResult, error) {
		return writePluginRuntimeValue(ctx, pluginService, pluginID, settingID, definition, value, expectedOldValue)
	}
}

func writePluginRuntimeValue(
	ctx context.Context,
	pluginService PluginRuntimeService,
	pluginID string,
	settingID string,
	definition pluginUISettingDefinition,
	value any,
	expectedOldValue any,
) (MutationResult, error) {
	if err := validatePluginSettingWriteInput(definition.ValueSchema, value, expectedOldValue); err != nil {
		return MutationResult{}, err
	}
	pluginEntry, oldValue, err := loadPluginConfigWriteState(pluginService, pluginID, definition)
	if err != nil {
		return MutationResult{}, err
	}
	if err := ValidateValue(definition.ValueSchema, oldValue); err != nil {
		return MutationResult{}, err
	}
	if err := validateExpectedOldValue(settingID, expectedOldValue, oldValue); err != nil {
		return MutationResult{}, err
	}

	nextConfig, err := writePluginConfigPathValue(pluginEntry.Config.CurrentConfig, definition.ConfigPath, value, pluginID)
	if err != nil {
		return MutationResult{}, err
	}
	if _, err := pluginService.WriteConfig(ctx, plugins.ConfigWriteOptions{
		PluginID:                          pluginID,
		Config:                            nextConfig,
		ExpectedCurrentConfig:             cloneStringAnyMap(pluginEntry.Config.CurrentConfig),
		SkipWriteIfCurrentMatchesExpected: valuesEqualJSON(oldValue, value),
	}); err != nil {
		return MutationResult{}, normalizePluginConfigMutationError(pluginID, settingID, err)
	}
	return buildMutationResult(oldValue, value, value), nil
}

func validatePluginSettingWriteInput(schema ValueSchema, value any, expectedOldValue any) error {
	if err := ValidateValue(schema, value); err != nil {
		return err
	}
	if expectedOldValue != nil {
		return ValidateValue(schema, expectedOldValue)
	}
	return nil
}

func loadPluginConfigWriteState(pluginService PluginRuntimeService, pluginID string, definition pluginUISettingDefinition) (plugins.PluginListEntry, any, error) {
	pluginEntry, err := requireActivePluginRuntimeEntry(pluginService, pluginID)
	if err != nil {
		return plugins.PluginListEntry{}, nil, err
	}
	oldValue, err := readPluginConfigPathValue(
		pluginEntry.Config.CurrentConfig,
		definition.ConfigPath,
		definition.DefaultValue,
		pluginID,
	)
	if err != nil {
		return plugins.PluginListEntry{}, nil, err
	}
	return pluginEntry, oldValue, nil
}

func validateExpectedOldValue(settingID string, expectedOldValue any, oldValue any) error {
	if expectedOldValue == nil || valuesEqualJSON(expectedOldValue, oldValue) {
		return nil
	}
	return newSettingError(
		ErrorCodeMutationFailed,
		"%s changed since pre-write validation.",
		settingID,
	)
}

func valuesEqualJSON(left any, right any) bool {
	return reflect.DeepEqual(cloneJSONValue(left), cloneJSONValue(right))
}

func buildMutationResult(oldValue any, newValue any, normalizedValue any) MutationResult {
	return MutationResult{
		OldValue:        cloneJSONValue(oldValue),
		NewValue:        cloneJSONValue(newValue),
		NormalizedValue: cloneJSONValue(normalizedValue),
		Changed:         !reflect.DeepEqual(oldValue, newValue),
	}
}
