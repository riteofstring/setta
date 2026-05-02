package uisettings

import (
	"context"
	"strings"

	"setta/internal/plugins"
)

const (
	pluginSettingPrefix                = "plugin::"
	pluginUISettingsSchemaKey          = "x-setta-ui-settings"
	pluginRegisterPaneCapability       = "registerPane"
	pluginRegisterUISettingsCapability = "registerUISettings"
)

type PluginRuntimeService interface {
	Runtime(options plugins.RuntimeOptions) (plugins.PluginRuntimeResponse, error)
	WriteConfig(ctx context.Context, options plugins.ConfigWriteOptions) (plugins.PluginConfigWriteResponse, error)
	GetBackendUISettings(pluginID string) ([]plugins.PluginRegisteredUISetting, error)
	ReadBackendUISettingValue(ctx context.Context, options plugins.BackendUISettingReadOptions) (any, error)
	WriteBackendUISettingValue(ctx context.Context, options plugins.BackendUISettingWriteOptions) error
}

type pluginUISettingDefinition struct {
	LocalSettingID string
	Title          string
	Description    string
	Synonyms       []string
	PaneID         string
	RevealKey      string
	ConfigPath     []string
	Mutability     Mutability
	ValueSchema    ValueSchema
	DefaultValue   any
}

type pluginUISettingParseResult struct {
	Definitions          []pluginUISettingDefinition
	InvalidSettingErrors map[string]SettingError
}

type pluginUISettingRequiredFields struct {
	LocalSettingID string
	Title          string
	Description    string
	PaneID         string
	RevealKey      string
}

type RuntimeEntryBuilder func(plugins.PluginRuntimeResponse) ([]RuntimeEntry, error)

type UnavailableSettingProvider func() map[string]SettingError

type ScopedRegistryOptions struct {
	Runtime                  CoreProjectState
	WorkspaceRoot            string
	PluginService            PluginRuntimeService
	UnavailableSettings      []UnavailableSettingProvider
	ProjectAISettings        ProjectAISettingProviders
	ContributedEntryBuilders []RuntimeEntryBuilder
}

type pluginBackendInvalidValueError struct {
	pluginID     string
	settingID    string
	prefix       string
	causeCode    ErrorCode
	causeMessage string
	settingErr   *SettingError
}

type pluginRuntimeSnapshot struct {
	trimmedPluginID string
	observedStates  []string
	pluginEntry     plugins.PluginListEntry
	hasRuntimeEntry bool
}

type pluginContributionSources struct {
	parseResult               pluginUISettingParseResult
	validBackendRegistrations []plugins.PluginRegisteredUISetting
	contributionCount         map[string]int
}

func NewScopedRegistry(options ScopedRegistryOptions) (*Registry, error) {
	entries, err := buildScopedRegistryBaseEntries(options)
	if err != nil {
		return nil, err
	}
	baseMetadata := buildScopedRegistryBaseMetadata(options)
	if options.PluginService == nil {
		if err := appendContributedRuntimeEntries(&entries, plugins.PluginRuntimeResponse{}, options.ContributedEntryBuilders); err != nil {
			return nil, err
		}
		return newRegistry(entries, baseMetadata)
	}

	pluginRuntime, err := options.PluginService.Runtime(plugins.RuntimeOptions{})
	if err != nil {
		return nil, err
	}

	metadata := buildPluginRegistryMetadata(pluginRuntime)
	metadata.unavailableSettings = cloneSettingErrorMap(baseMetadata.unavailableSettings)
	if err := appendContributedRuntimeEntries(&entries, pluginRuntime, options.ContributedEntryBuilders); err != nil {
		return nil, err
	}
	if err := appendPluginRuntimeEntries(&entries, &metadata, options.PluginService, pluginRuntime.List.Plugins); err != nil {
		return nil, err
	}

	return newRegistry(entries, metadata)
}

func buildScopedRegistryBaseMetadata(options ScopedRegistryOptions) registryPluginMetadata {
	metadata := registryPluginMetadata{}
	for _, provider := range options.UnavailableSettings {
		if provider == nil {
			continue
		}
		for settingID, settingErr := range provider() {
			if metadata.unavailableSettings == nil {
				metadata.unavailableSettings = map[string]SettingError{}
			}
			metadata.unavailableSettings[settingID] = settingErr
		}
	}
	return metadata
}

func buildScopedRegistryBaseEntries(options ScopedRegistryOptions) ([]RuntimeEntry, error) {
	coreRegistry, err := NewCoreRegistry(options.Runtime, options.WorkspaceRoot)
	if err != nil {
		return nil, err
	}
	entries := make([]RuntimeEntry, 0, len(coreRegistry.entriesByID))
	for _, entry := range coreRegistry.entriesByID {
		entries = append(entries, entry)
	}
	return append(entries, buildProjectAISettingEntries(options.ProjectAISettings)...), nil
}

func appendContributedRuntimeEntries(
	entries *[]RuntimeEntry,
	runtime plugins.PluginRuntimeResponse,
	builders []RuntimeEntryBuilder,
) error {
	for _, builder := range builders {
		if builder == nil {
			continue
		}
		contributedEntries, err := builder(runtime)
		if err != nil {
			return err
		}
		*entries = append(*entries, contributedEntries...)
	}
	return nil
}

func appendPluginRuntimeEntries(
	entries *[]RuntimeEntry,
	metadata *registryPluginMetadata,
	pluginService PluginRuntimeService,
	pluginEntries []plugins.PluginListEntry,
) error {
	for _, pluginEntry := range pluginEntries {
		if err := appendPluginRuntimeEntriesForPlugin(entries, metadata, pluginService, pluginEntry); err != nil {
			return err
		}
	}
	return nil
}

func appendPluginRuntimeEntriesForPlugin(
	entries *[]RuntimeEntry,
	metadata *registryPluginMetadata,
	pluginService PluginRuntimeService,
	pluginEntry plugins.PluginListEntry,
) error {
	pluginID := strings.TrimSpace(pluginEntry.PluginID)
	if pluginID == "" {
		return nil
	}
	markPluginRuntimeEntryAvailable(metadata, pluginID, pluginEntry.EffectiveCapabilities)
	hasRegisterPane := pluginHasRegisterPaneCapability(pluginEntry.EffectiveCapabilities)
	hasRegisterUISettings := pluginHasRegisterUISettingsCapability(pluginEntry.EffectiveCapabilities)
	if !hasRegisterPane && !hasRegisterUISettings {
		return nil
	}

	sources, ok, err := loadPluginContributionSources(
		pluginService,
		pluginID,
		pluginEntry.Config.SchemaJSON,
		metadata,
		hasRegisterPane,
		hasRegisterUISettings,
	)
	if err != nil || !ok {
		return err
	}
	recordInvalidPluginSettingErrors(metadata, pluginID, sources.parseResult.InvalidSettingErrors)
	if hasRegisterPane {
		appendSchemaDefinedPluginEntries(entries, metadata, pluginService, pluginID, sources)
	}
	if hasRegisterUISettings {
		appendBackendRegisteredPluginEntries(entries, metadata, pluginService, pluginID, sources, hasRegisterPane)
	}
	return nil
}

func markPluginRuntimeEntryAvailable(metadata *registryPluginMetadata, pluginID string, capabilities []string) {
	status := metadata.pluginStatusByPluginID[pluginID]
	status.RuntimeEntryAvailable = true
	if pluginHasAnyUISettingsCapability(capabilities) {
		status.SupportsUISettings = true
	}
	metadata.pluginStatusByPluginID[pluginID] = status
}

func loadPluginContributionSources(
	pluginService PluginRuntimeService,
	pluginID string,
	schemaJSON map[string]any,
	metadata *registryPluginMetadata,
	includeSchemaSettings bool,
	includeBackendSettings bool,
) (pluginContributionSources, bool, error) {
	parseResult := pluginUISettingParseResult{
		InvalidSettingErrors: map[string]SettingError{},
	}
	if includeSchemaSettings {
		parsed, err := parsePluginUISettingDefinitions(pluginID, schemaJSON)
		if err != nil {
			return pluginContributionSources{}, false, nil
		}
		parseResult = parsed
	}
	var backendRegistrations []plugins.PluginRegisteredUISetting
	if includeBackendSettings {
		var err error
		backendRegistrations, err = pluginService.GetBackendUISettings(pluginID)
		if err != nil {
			return pluginContributionSources{}, false, err
		}
	}
	validBackendRegistrations := collectValidBackendRegistrations(pluginID, backendRegistrations, metadata)
	return pluginContributionSources{
		parseResult:               parseResult,
		validBackendRegistrations: validBackendRegistrations,
		contributionCount:         countPluginSettingContributions(parseResult.Definitions, validBackendRegistrations),
	}, true, nil
}

func collectValidBackendRegistrations(
	pluginID string,
	backendRegistrations []plugins.PluginRegisteredUISetting,
	metadata *registryPluginMetadata,
) []plugins.PluginRegisteredUISetting {
	validBackendRegistrations := make([]plugins.PluginRegisteredUISetting, 0, len(backendRegistrations))
	for _, registration := range backendRegistrations {
		if _, err := parseExplicitPluginValueSchema(pluginID, registration.LocalSettingID, registration.ValueSchema); err != nil {
			recordInvalidPluginSetting(
				metadata,
				pluginID,
				registration.LocalSettingID,
				"Plugin %s setting %s is unavailable for UI setting access (%s).",
				pluginID,
				registration.LocalSettingID,
				err.Error(),
			)
			continue
		}
		validBackendRegistrations = append(validBackendRegistrations, registration)
	}
	return validBackendRegistrations
}

func countPluginSettingContributions(
	definitions []pluginUISettingDefinition,
	registrations []plugins.PluginRegisteredUISetting,
) map[string]int {
	contributionCount := map[string]int{}
	for _, definition := range definitions {
		contributionCount[definition.LocalSettingID]++
	}
	for _, registration := range registrations {
		contributionCount[registration.LocalSettingID]++
	}
	return contributionCount
}

func recordInvalidPluginSettingErrors(
	metadata *registryPluginMetadata,
	pluginID string,
	invalidSettingErrors map[string]SettingError,
) {
	for localSettingID, settingErr := range invalidSettingErrors {
		metadata.invalidPluginSettings[buildPluginSettingID(pluginID, localSettingID)] = settingErr
	}
}

func appendSchemaDefinedPluginEntries(
	entries *[]RuntimeEntry,
	metadata *registryPluginMetadata,
	pluginService PluginRuntimeService,
	pluginID string,
	sources pluginContributionSources,
) {
	for _, definition := range sources.parseResult.Definitions {
		if pluginSettingDuplicatedAcrossSources(sources.contributionCount, definition.LocalSettingID) {
			recordPluginSourceConflict(metadata, pluginID, definition.LocalSettingID)
			continue
		}
		recordKnownPluginSettingID(metadata, pluginID, definition.LocalSettingID)
		*entries = append(*entries, buildPluginRuntimeEntry(pluginService, pluginID, definition))
	}
}

func appendBackendRegisteredPluginEntries(
	entries *[]RuntimeEntry,
	metadata *registryPluginMetadata,
	pluginService PluginRuntimeService,
	pluginID string,
	sources pluginContributionSources,
	hasRegisterPane bool,
) {
	for _, registration := range sources.validBackendRegistrations {
		if pluginSettingDuplicatedAcrossSources(sources.contributionCount, registration.LocalSettingID) {
			recordPluginSourceConflict(metadata, pluginID, registration.LocalSettingID)
			continue
		}
		recordKnownPluginSettingID(metadata, pluginID, registration.LocalSettingID)
		*entries = append(*entries, buildPluginBackendRuntimeEntry(pluginService, registration, hasRegisterPane))
	}
}

func pluginSettingDuplicatedAcrossSources(contributionCount map[string]int, localSettingID string) bool {
	return contributionCount[localSettingID] > 1
}

func recordPluginSourceConflict(metadata *registryPluginMetadata, pluginID string, localSettingID string) {
	recordInvalidPluginSetting(
		metadata,
		pluginID,
		localSettingID,
		"Plugin %s setting %s is unavailable for UI setting access (declared in both schema and backend registration).",
		pluginID,
		localSettingID,
	)
}

func recordKnownPluginSettingID(metadata *registryPluginMetadata, pluginID string, localSettingID string) {
	metadata.knownPluginSettingIDs[pluginSettingKey(pluginID, localSettingID)] = struct{}{}
}

func recordInvalidPluginSetting(metadata *registryPluginMetadata, pluginID string, localSettingID string, format string, args ...any) {
	metadata.invalidPluginSettings[buildPluginSettingID(pluginID, localSettingID)] = newSettingErrorValue(
		ErrorCodePluginUnavailable,
		format,
		args...,
	)
}

func buildPluginRegistryMetadata(runtime plugins.PluginRuntimeResponse) registryPluginMetadata {
	metadata := registryPluginMetadata{
		knownPluginIDs:         map[string]struct{}{},
		knownPluginSettingIDs:  map[string]struct{}{},
		invalidPluginSettings:  map[string]SettingError{},
		pluginStatusByPluginID: map[string]pluginRegistryStatus{},
	}
	for _, statusEntry := range runtime.Status.Plugins {
		pluginID := strings.TrimSpace(statusEntry.PluginID)
		if pluginID == "" {
			continue
		}
		metadata.knownPluginIDs[pluginID] = struct{}{}
		status := metadata.pluginStatusByPluginID[pluginID]
		status.ObservedStates = append(status.ObservedStates, string(statusEntry.State))
		if pluginHasAnyUISettingsCapability(statusEntry.EffectiveCapabilities) {
			status.SupportsUISettings = true
		}
		metadata.pluginStatusByPluginID[pluginID] = status
	}
	return metadata
}
