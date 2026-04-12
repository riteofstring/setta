package uisettings

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"slices"
	"strings"
	"unicode/utf8"

	"setta/internal/plugins"
)

const (
	pluginSettingPrefix          = "plugin::"
	pluginUISettingsSchemaKey    = "x-setta-ui-settings"
	pluginRegisterPaneCapability = "registerPane"
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

type ScopedRegistryOptions struct {
	Runtime           CoreProjectState
	WorkspaceRoot     string
	PluginService     PluginRuntimeService
	ProjectAISettings ProjectAISettingProviders
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
	if options.PluginService == nil {
		return New(entries)
	}

	pluginRuntime, err := options.PluginService.Runtime(plugins.RuntimeOptions{})
	if err != nil {
		return nil, err
	}

	metadata := buildPluginRegistryMetadata(pluginRuntime)
	if err := appendPluginRuntimeEntries(&entries, &metadata, options.PluginService, pluginRuntime.List.Plugins); err != nil {
		return nil, err
	}

	return newRegistry(entries, metadata)
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
	if !pluginHasRegisterPaneCapability(pluginEntry.EffectiveCapabilities) {
		return nil
	}

	sources, ok, err := loadPluginContributionSources(pluginService, pluginID, pluginEntry.Config.SchemaJSON, metadata)
	if err != nil || !ok {
		return err
	}
	recordInvalidPluginSettingErrors(metadata, pluginID, sources.parseResult.InvalidSettingErrors)
	appendSchemaDefinedPluginEntries(entries, metadata, pluginService, pluginID, sources)
	appendBackendRegisteredPluginEntries(entries, metadata, pluginService, pluginID, sources)
	return nil
}

func markPluginRuntimeEntryAvailable(metadata *registryPluginMetadata, pluginID string, capabilities []string) {
	status := metadata.pluginStatusByPluginID[pluginID]
	status.RuntimeEntryAvailable = true
	if pluginHasRegisterPaneCapability(capabilities) {
		status.SupportsUISettings = true
	}
	metadata.pluginStatusByPluginID[pluginID] = status
}

func loadPluginContributionSources(
	pluginService PluginRuntimeService,
	pluginID string,
	schemaJSON map[string]any,
	metadata *registryPluginMetadata,
) (pluginContributionSources, bool, error) {
	parseResult, err := parsePluginUISettingDefinitions(pluginID, schemaJSON)
	if err != nil {
		return pluginContributionSources{}, false, nil
	}
	backendRegistrations, err := pluginService.GetBackendUISettings(pluginID)
	if err != nil {
		return pluginContributionSources{}, false, err
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
) {
	for _, registration := range sources.validBackendRegistrations {
		if pluginSettingDuplicatedAcrossSources(sources.contributionCount, registration.LocalSettingID) {
			recordPluginSourceConflict(metadata, pluginID, registration.LocalSettingID)
			continue
		}
		recordKnownPluginSettingID(metadata, pluginID, registration.LocalSettingID)
		*entries = append(*entries, buildPluginBackendRuntimeEntry(pluginService, registration))
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
		if pluginHasRegisterPaneCapability(statusEntry.EffectiveCapabilities) {
			status.SupportsUISettings = true
		}
		metadata.pluginStatusByPluginID[pluginID] = status
	}
	return metadata
}

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

func buildPluginBackendRuntimeEntry(pluginService PluginRuntimeService, registration plugins.PluginRegisteredUISetting) RuntimeEntry {
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
) Entry {
	return Entry{
		SettingID:   buildPluginSettingID(pluginID, localSettingID),
		Title:       title,
		Synonyms:    append([]string(nil), synonyms...),
		Description: description,
		Location: Location{
			Side:           SideLeft,
			OverviewTabKey: buildPluginPaneOverviewTabKey(pluginID, paneID),
			PluginID:       pluginID,
			PaneID:         paneID,
		},
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

func newPluginBackendReadFunc(
	pluginService PluginRuntimeService,
	registration plugins.PluginRegisteredUISetting,
	valueSchema ValueSchema,
	settingID string,
) ReadFunc {
	return func(ctx context.Context, projectID string) (any, error) {
		value, err := readValidatedPluginBackendUISettingValue(
			ctx,
			pluginService,
			registration.PluginID,
			registration.ReadHandlerID,
			projectID,
			valueSchema,
			settingID,
			"returned an invalid value",
		)
		if err != nil {
			return nil, err
		}
		return cloneJSONValue(value), nil
	}
}

func newPluginBackendWriteFunc(
	pluginService PluginRuntimeService,
	registration plugins.PluginRegisteredUISetting,
	valueSchema ValueSchema,
	settingID string,
	writeHandlerID string,
) WriteFunc {
	return func(ctx context.Context, projectID string, value any, expectedOldValue any) (MutationResult, error) {
		return writePluginBackendRuntimeValue(
			ctx,
			pluginService,
			registration,
			valueSchema,
			settingID,
			writeHandlerID,
			projectID,
			value,
			expectedOldValue,
		)
	}
}

func writePluginBackendRuntimeValue(
	ctx context.Context,
	pluginService PluginRuntimeService,
	registration plugins.PluginRegisteredUISetting,
	valueSchema ValueSchema,
	settingID string,
	writeHandlerID string,
	projectID string,
	value any,
	expectedOldValue any,
) (MutationResult, error) {
	if err := validatePluginSettingWriteInput(valueSchema, value, expectedOldValue); err != nil {
		return MutationResult{}, err
	}
	oldValue, err := readValidatedPluginBackendUISettingValue(
		ctx,
		pluginService,
		registration.PluginID,
		registration.ReadHandlerID,
		projectID,
		valueSchema,
		settingID,
		"returned an invalid value during pre-write validation",
	)
	if err != nil {
		return MutationResult{}, err
	}
	if err := validateExpectedOldValue(settingID, expectedOldValue, oldValue); err != nil {
		return MutationResult{}, err
	}
	if valuesEqualJSON(oldValue, value) {
		return buildMutationResult(oldValue, oldValue, value), nil
	}

	if err := pluginService.WriteBackendUISettingValue(ctx, plugins.BackendUISettingWriteOptions{
		PluginID:        registration.PluginID,
		HandlerID:       writeHandlerID,
		ProjectConfigID: projectID,
		Value:           value,
	}); err != nil {
		return MutationResult{}, normalizePluginConfigMutationError(registration.PluginID, settingID, err)
	}

	newValue, err := readPluginBackendUISettingValue(ctx, pluginService, registration.PluginID, registration.ReadHandlerID, projectID, settingID)
	if err != nil {
		return MutationResult{}, err
	}
	if err := ValidateValue(valueSchema, newValue); err != nil {
		return MutationResult{}, handleInvalidPluginBackendWrite(
			ctx,
			pluginService,
			registration,
			writeHandlerID,
			projectID,
			oldValue,
			settingID,
			err,
		)
	}
	return buildMutationResult(oldValue, newValue, value), nil
}

func readValidatedPluginBackendUISettingValue(
	ctx context.Context,
	pluginService PluginRuntimeService,
	pluginID string,
	readHandlerID string,
	projectID string,
	valueSchema ValueSchema,
	settingID string,
	invalidPrefix string,
) (any, error) {
	if _, err := requireActivePluginRuntimeEntry(pluginService, pluginID); err != nil {
		return nil, err
	}
	value, err := readPluginBackendUISettingValue(ctx, pluginService, pluginID, readHandlerID, projectID, settingID)
	if err != nil {
		return nil, err
	}
	if err := ValidateValue(valueSchema, value); err != nil {
		return nil, wrapPluginBackendInvalidValueError(pluginID, settingID, invalidPrefix, err)
	}
	return value, nil
}

func readPluginBackendUISettingValue(
	ctx context.Context,
	pluginService PluginRuntimeService,
	pluginID string,
	readHandlerID string,
	projectID string,
	settingID string,
) (any, error) {
	value, err := pluginService.ReadBackendUISettingValue(ctx, plugins.BackendUISettingReadOptions{
		PluginID:        pluginID,
		HandlerID:       readHandlerID,
		ProjectConfigID: projectID,
	})
	if err != nil {
		return nil, normalizePluginConfigMutationError(pluginID, settingID, err)
	}
	return value, nil
}

func handleInvalidPluginBackendWrite(
	ctx context.Context,
	pluginService PluginRuntimeService,
	registration plugins.PluginRegisteredUISetting,
	writeHandlerID string,
	projectID string,
	oldValue any,
	settingID string,
	err error,
) error {
	rollbackErr := rollbackPluginBackendUISettingValue(
		ctx,
		pluginService,
		registration.PluginID,
		registration.ReadHandlerID,
		writeHandlerID,
		projectID,
		oldValue,
	)
	if rollbackErr != nil {
		return newSettingError(
			ErrorCodeMutationFailed,
			"Plugin backend ui setting write produced an invalid value for %s: %s. Rollback failed: %s",
			settingID,
			err.Error(),
			rollbackErr.Error(),
		)
	}
	return newSettingError(
		ErrorCodeMutationFailed,
		"Plugin backend ui setting write produced an invalid value for %s: %s. Rollback restored the previous value.",
		settingID,
		err.Error(),
	)
}

func requireActivePluginRuntimeEntry(pluginService PluginRuntimeService, pluginID string) (plugins.PluginListEntry, error) {
	if pluginService == nil {
		return plugins.PluginListEntry{}, newSettingError(ErrorCodePluginUnavailable, "Plugin runtime is unavailable for plugin UI setting access.")
	}

	snapshot, err := loadPluginRuntimeSnapshot(pluginService, pluginID)
	if err != nil {
		return plugins.PluginListEntry{}, err
	}
	if err := snapshot.requireOperationalState(); err != nil {
		return plugins.PluginListEntry{}, err
	}
	if err := snapshot.requireRuntimeEntry(); err != nil {
		return plugins.PluginListEntry{}, err
	}
	if err := snapshot.requireUISettingsCapability(); err != nil {
		return plugins.PluginListEntry{}, err
	}
	return snapshot.pluginEntry, nil
}

func loadPluginRuntimeSnapshot(pluginService PluginRuntimeService, pluginID string) (pluginRuntimeSnapshot, error) {
	runtimeResponse, err := pluginService.Runtime(plugins.RuntimeOptions{})
	if err != nil {
		return pluginRuntimeSnapshot{}, err
	}
	trimmedPluginID := strings.TrimSpace(pluginID)
	pluginEntry, hasRuntimeEntry := findPluginRuntimeEntry(runtimeResponse.List.Plugins, trimmedPluginID)
	return pluginRuntimeSnapshot{
		trimmedPluginID: trimmedPluginID,
		observedStates:  collectObservedPluginStates(runtimeResponse.Status.Plugins, trimmedPluginID),
		pluginEntry:     pluginEntry,
		hasRuntimeEntry: hasRuntimeEntry,
	}, nil
}

func collectObservedPluginStates(statusEntries []plugins.PluginStatusEntry, pluginID string) []string {
	observedStates := make([]string, 0, len(statusEntries))
	for _, statusEntry := range statusEntries {
		if strings.TrimSpace(statusEntry.PluginID) != pluginID {
			continue
		}
		observedStates = append(observedStates, string(statusEntry.State))
	}
	return observedStates
}

func findPluginRuntimeEntry(entries []plugins.PluginListEntry, pluginID string) (plugins.PluginListEntry, bool) {
	for _, candidate := range entries {
		if strings.TrimSpace(candidate.PluginID) != pluginID {
			continue
		}
		return candidate, true
	}
	return plugins.PluginListEntry{}, false
}

func (s pluginRuntimeSnapshot) requireOperationalState() error {
	if pluginStatesAreOperational(s.observedStates) {
		return nil
	}
	return newPluginUnavailableStateError(s.trimmedPluginID, s.describeObservedState())
}

func (s pluginRuntimeSnapshot) requireRuntimeEntry() error {
	if s.hasRuntimeEntry {
		return nil
	}
	return newPluginRuntimeEntryMissingError(s.trimmedPluginID, s.describeObservedState())
}

func (s pluginRuntimeSnapshot) requireUISettingsCapability() error {
	if pluginHasRegisterPaneCapability(s.pluginEntry.EffectiveCapabilities) {
		return nil
	}
	return newPluginUISettingsCapabilityError(s.trimmedPluginID)
}

func (s pluginRuntimeSnapshot) describeObservedState() string {
	return describeObservedPluginStates(s.observedStates)
}

func pluginStatesAreOperational(observedStates []string) bool {
	for _, observedState := range observedStates {
		if pluginStateIsOperational(observedState) {
			return true
		}
	}
	return false
}

func pluginStateIsOperational(observedState string) bool {
	switch strings.TrimSpace(observedState) {
	case "active", "pending_restart":
		return true
	default:
		return false
	}
}

func normalizePluginConfigMutationError(pluginID string, settingID string, err error) error {
	var serviceErr *plugins.ServiceError
	if !errors.As(err, &serviceErr) {
		return newSettingError(ErrorCodeMutationFailed, "Failed to write %s: %v", settingID, err)
	}
	switch serviceErr.Code {
	case plugins.ServiceErrorCodeNotFound:
		return newSettingError(ErrorCodePluginUnavailable, "Plugin %s is unavailable for UI setting access.", pluginID)
	case plugins.ServiceErrorCodeConfigChanged:
		return newSettingError(ErrorCodeMutationFailed, "%s changed since pre-write validation.", settingID)
	default:
		return newSettingError(ErrorCodeMutationFailed, "%s", serviceErr.Message)
	}
}

func wrapPluginBackendInvalidValueError(pluginID string, settingID string, prefix string, err error) error {
	var settingErr *SettingError
	if errors.As(err, &settingErr) {
		return newPluginBackendInvalidValueError(pluginID, settingID, prefix, settingErr.Code, settingErr.Message)
	}
	return newPluginBackendInvalidValueError(pluginID, settingID, prefix, ErrorCodeMutationFailed, fmt.Sprint(err))
}

func RecontextualizePluginBackendInvalidValueError(err error, prefix string) error {
	var backendErr *pluginBackendInvalidValueError
	if !errors.As(err, &backendErr) {
		return err
	}
	return newPluginBackendInvalidValueError(
		backendErr.pluginID,
		backendErr.settingID,
		prefix,
		backendErr.causeCode,
		backendErr.causeMessage,
	)
}

func rollbackPluginBackendUISettingValue(
	ctx context.Context,
	pluginService PluginRuntimeService,
	pluginID string,
	readHandlerID string,
	writeHandlerID string,
	projectID string,
	oldValue any,
) error {
	if err := pluginService.WriteBackendUISettingValue(ctx, plugins.BackendUISettingWriteOptions{
		PluginID:        pluginID,
		HandlerID:       writeHandlerID,
		ProjectConfigID: projectID,
		Value:           cloneJSONValue(oldValue),
	}); err != nil {
		return err
	}

	rolledBackValue, err := pluginService.ReadBackendUISettingValue(ctx, plugins.BackendUISettingReadOptions{
		PluginID:        pluginID,
		HandlerID:       readHandlerID,
		ProjectConfigID: projectID,
	})
	if err != nil {
		return err
	}
	if !reflect.DeepEqual(cloneJSONValue(rolledBackValue), cloneJSONValue(oldValue)) {
		return fmt.Errorf("rollback produced %#v", rolledBackValue)
	}
	return nil
}

func parsePluginUISettingDefinitions(pluginID string, schemaJSON map[string]any) (pluginUISettingParseResult, error) {
	result := pluginUISettingParseResult{
		Definitions:          nil,
		InvalidSettingErrors: map[string]SettingError{},
	}
	if len(schemaJSON) == 0 {
		return result, nil
	}
	rawDefinitions, ok := schemaJSON[pluginUISettingsSchemaKey]
	if !ok {
		return result, nil
	}
	items, ok := rawDefinitions.([]any)
	if !ok {
		return result, fmt.Errorf("plugin %s %s must be a list", pluginID, pluginUISettingsSchemaKey)
	}
	definitions := make([]pluginUISettingDefinition, 0, len(items))
	countBySettingID := make(map[string]int, len(items))
	for index, item := range items {
		definition, err := parsePluginUISettingDefinition(pluginID, schemaJSON, index, item)
		if err != nil {
			if localSettingID, ok := maybePluginLocalSettingID(item); ok {
				result.InvalidSettingErrors[localSettingID] = newSettingErrorValue(
					ErrorCodePluginUnavailable,
					"Plugin %s setting %s is unavailable for UI setting access (%s).",
					pluginID,
					localSettingID,
					err.Error(),
				)
				continue
			}
			return result, err
		}
		definitions = append(definitions, definition)
		countBySettingID[definition.LocalSettingID]++
	}
	filtered := make([]pluginUISettingDefinition, 0, len(definitions))
	for _, definition := range definitions {
		if countBySettingID[definition.LocalSettingID] > 1 {
			result.InvalidSettingErrors[definition.LocalSettingID] = newSettingErrorValue(
				ErrorCodePluginUnavailable,
				"Plugin %s setting %s is unavailable for UI setting access (duplicated ui settingId).",
				pluginID,
				definition.LocalSettingID,
			)
			continue
		}
		filtered = append(filtered, definition)
	}
	result.Definitions = filtered
	return result, nil
}

func maybePluginLocalSettingID(raw any) (string, bool) {
	definitionMap, ok := raw.(map[string]any)
	if !ok {
		return "", false
	}
	value, ok := definitionMap["settingId"]
	if !ok {
		return "", false
	}
	localSettingID, err := requireNonEmptyString(value)
	if err != nil {
		return "", false
	}
	if strings.Contains(localSettingID, "::") {
		return "", false
	}
	return localSettingID, true
}

func newSettingErrorValue(code ErrorCode, format string, args ...any) SettingError {
	return SettingError{
		Code:    code,
		Message: fmt.Sprintf(format, args...),
	}
}

func newPluginBackendInvalidValueError(pluginID string, settingID string, prefix string, causeCode ErrorCode, causeMessage string) *pluginBackendInvalidValueError {
	settingErr := newSettingErrorValue(
		causeCode,
		"Plugin %s setting %s %s: %s",
		pluginID,
		settingID,
		prefix,
		causeMessage,
	)
	return &pluginBackendInvalidValueError{
		pluginID:     pluginID,
		settingID:    settingID,
		prefix:       prefix,
		causeCode:    causeCode,
		causeMessage: causeMessage,
		settingErr:   &settingErr,
	}
}

func (e *pluginBackendInvalidValueError) Error() string {
	if e == nil || e.settingErr == nil {
		return ""
	}
	return e.settingErr.Message
}

func (e *pluginBackendInvalidValueError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.settingErr
}

func parsePluginUISettingDefinition(pluginID string, schemaJSON map[string]any, index int, raw any) (pluginUISettingDefinition, error) {
	definitionMap, ok := raw.(map[string]any)
	if !ok {
		return pluginUISettingDefinition{}, fmt.Errorf("plugin %s %s[%d] must be an object", pluginID, pluginUISettingsSchemaKey, index)
	}

	requiredFields, err := requirePluginUISettingFields(definitionMap, pluginID, index)
	if err != nil {
		return pluginUISettingDefinition{}, err
	}
	configPath, err := normalizePluginConfigPath(pluginID, index, definitionMap["configPath"])
	if err != nil {
		return pluginUISettingDefinition{}, err
	}
	synonyms, err := normalizePluginSynonyms(pluginID, index, definitionMap["synonyms"])
	if err != nil {
		return pluginUISettingDefinition{}, err
	}
	mutability, err := normalizePluginMutability(pluginID, index, definitionMap["mutability"])
	if err != nil {
		return pluginUISettingDefinition{}, err
	}
	valueSchema, err := resolvePluginValueSchema(pluginID, requiredFields.LocalSettingID, schemaJSON, definitionMap["valueSchema"], configPath)
	if err != nil {
		return pluginUISettingDefinition{}, err
	}
	defaultValue, err := resolvePluginUISettingDefaultValue(definitionMap, pluginID, requiredFields.LocalSettingID, valueSchema)
	if err != nil {
		return pluginUISettingDefinition{}, err
	}
	return pluginUISettingDefinition{
		LocalSettingID: requiredFields.LocalSettingID,
		Title:          requiredFields.Title,
		Description:    requiredFields.Description,
		Synonyms:       synonyms,
		PaneID:         requiredFields.PaneID,
		RevealKey:      requiredFields.RevealKey,
		ConfigPath:     configPath,
		Mutability:     mutability,
		ValueSchema:    valueSchema,
		DefaultValue:   cloneJSONValue(defaultValue),
	}, nil
}

func requirePluginUISettingFields(definitionMap map[string]any, pluginID string, index int) (pluginUISettingRequiredFields, error) {
	requiredFields := pluginUISettingRequiredFields{}

	localSettingID, err := requirePluginUISettingID(definitionMap, pluginID, index)
	if err != nil {
		return pluginUISettingRequiredFields{}, err
	}
	requiredFields.LocalSettingID = localSettingID

	stringFields := []struct {
		name   string
		target *string
	}{
		{name: "title", target: &requiredFields.Title},
		{name: "description", target: &requiredFields.Description},
		{name: "paneId", target: &requiredFields.PaneID},
		{name: "revealKey", target: &requiredFields.RevealKey},
	}
	for _, field := range stringFields {
		value, err := requirePluginUISettingStringField(definitionMap, pluginID, index, field.name)
		if err != nil {
			return pluginUISettingRequiredFields{}, err
		}
		*field.target = value
	}
	return requiredFields, nil
}

func requirePluginUISettingID(definitionMap map[string]any, pluginID string, index int) (string, error) {
	localSettingID, err := requirePluginUISettingStringField(definitionMap, pluginID, index, "settingId")
	if err != nil {
		return "", err
	}
	if strings.Contains(localSettingID, "::") {
		return "", fmt.Errorf("plugin %s settingId %s must not contain '::'", pluginID, localSettingID)
	}
	return localSettingID, nil
}

func requirePluginUISettingStringField(definitionMap map[string]any, pluginID string, index int, field string) (string, error) {
	value, err := requireNonEmptyString(definitionMap[field])
	if err != nil {
		return "", fmt.Errorf("plugin %s %s[%d] %s must be a non-empty string", pluginID, pluginUISettingsSchemaKey, index, field)
	}
	return value, nil
}

func resolvePluginUISettingDefaultValue(
	definitionMap map[string]any,
	pluginID string,
	localSettingID string,
	valueSchema ValueSchema,
) (any, error) {
	defaultValue, ok := definitionMap["defaultValue"]
	if !ok {
		return nil, fmt.Errorf("plugin %s setting %s must define defaultValue", pluginID, localSettingID)
	}
	if err := ValidateValue(valueSchema, defaultValue); err != nil {
		return nil, fmt.Errorf("plugin %s setting %s defaultValue is invalid: %w", pluginID, localSettingID, err)
	}
	return defaultValue, nil
}

func normalizePluginConfigPath(pluginID string, index int, raw any) ([]string, error) {
	items, ok := raw.([]any)
	if !ok || len(items) == 0 {
		return nil, fmt.Errorf(
			"plugin %s %s[%d] configPath must be a non-empty string array",
			pluginID,
			pluginUISettingsSchemaKey,
			index,
		)
	}
	configPath := make([]string, 0, len(items))
	for _, item := range items {
		segment, err := requireNonEmptyString(item)
		if err != nil {
			return nil, fmt.Errorf(
				"plugin %s %s[%d] configPath must be a non-empty string array",
				pluginID,
				pluginUISettingsSchemaKey,
				index,
			)
		}
		configPath = append(configPath, segment)
	}
	return configPath, nil
}

func normalizePluginSynonyms(pluginID string, index int, raw any) ([]string, error) {
	if raw == nil {
		return nil, nil
	}
	items, ok := raw.([]any)
	if !ok {
		return nil, fmt.Errorf("plugin %s %s[%d] synonyms must be a string array", pluginID, pluginUISettingsSchemaKey, index)
	}
	synonyms := make([]string, 0, len(items))
	for _, item := range items {
		synonym, err := requireNonEmptyString(item)
		if err != nil {
			return nil, fmt.Errorf("plugin %s %s[%d] synonyms must contain non-empty strings", pluginID, pluginUISettingsSchemaKey, index)
		}
		synonyms = append(synonyms, synonym)
	}
	return synonyms, nil
}

func normalizePluginMutability(pluginID string, index int, raw any) (Mutability, error) {
	if raw == nil {
		return MutabilityWritable, nil
	}
	value, ok := raw.(string)
	if !ok {
		return "", fmt.Errorf("plugin %s %s[%d] mutability must be readOnly or writable", pluginID, pluginUISettingsSchemaKey, index)
	}
	switch strings.TrimSpace(value) {
	case string(MutabilityReadOnly):
		return MutabilityReadOnly, nil
	case string(MutabilityWritable):
		return MutabilityWritable, nil
	default:
		return "", fmt.Errorf("plugin %s %s[%d] mutability must be readOnly or writable", pluginID, pluginUISettingsSchemaKey, index)
	}
}

func resolvePluginValueSchema(
	pluginID string,
	localSettingID string,
	schemaJSON map[string]any,
	rawValueSchema any,
	configPath []string,
) (ValueSchema, error) {
	if rawValueSchema != nil {
		schemaMap, ok := rawValueSchema.(map[string]any)
		if !ok {
			return ValueSchema{}, fmt.Errorf("plugin %s setting %s valueSchema must be an object", pluginID, localSettingID)
		}
		return parseExplicitPluginValueSchema(pluginID, localSettingID, schemaMap)
	}
	inferredSchema, ok := inferPluginValueSchema(schemaJSON, configPath)
	if !ok {
		return ValueSchema{}, fmt.Errorf("plugin %s setting %s must define valueSchema", pluginID, localSettingID)
	}
	return inferredSchema, nil
}

func parseExplicitPluginValueSchema(pluginID string, localSettingID string, schemaMap map[string]any) (ValueSchema, error) {
	encoded, err := json.Marshal(schemaMap)
	if err != nil {
		return ValueSchema{}, fmt.Errorf("plugin %s setting %s valueSchema is invalid: %w", pluginID, localSettingID, err)
	}
	var schema ValueSchema
	if err := json.Unmarshal(encoded, &schema); err != nil {
		return ValueSchema{}, fmt.Errorf("plugin %s setting %s valueSchema is invalid: %w", pluginID, localSettingID, err)
	}
	if !validValueType(schema.Type) {
		return ValueSchema{}, fmt.Errorf("plugin %s setting %s valueSchema type is invalid: %q", pluginID, localSettingID, schema.Type)
	}
	return schema, nil
}

func inferPluginValueSchema(schemaJSON map[string]any, configPath []string) (ValueSchema, bool) {
	schemaNode, ok := resolveSchemaNodeForConfigPath(schemaJSON, configPath)
	if !ok {
		return ValueSchema{}, false
	}
	return inferValueSchemaFromSchemaNode(schemaNode)
}

func resolveSchemaNodeForConfigPath(schemaJSON map[string]any, configPath []string) (map[string]any, bool) {
	current := schemaJSON
	for _, segment := range configPath {
		rawProperties, ok := current["properties"]
		if !ok {
			return nil, false
		}
		properties, ok := rawProperties.(map[string]any)
		if !ok {
			return nil, false
		}
		nextNode, ok := properties[segment]
		if !ok {
			return nil, false
		}
		nextMap, ok := nextNode.(map[string]any)
		if !ok {
			return nil, false
		}
		current = nextMap
	}
	return current, true
}

func inferValueSchemaFromSchemaNode(schemaNode map[string]any) (ValueSchema, bool) {
	rawType, ok := resolveSchemaNodeType(schemaNode)
	if !ok {
		return ValueSchema{}, false
	}

	schema := ValueSchema{Type: ValueType(rawType)}
	applySchemaNodeScalarConstraints(&schema, schemaNode)
	applySchemaNodeShapeConstraints(&schema, schemaNode)
	return schema, true
}

func applySchemaNodeScalarConstraints(schema *ValueSchema, schemaNode map[string]any) {
	if enumValues, ok := schemaNode["enum"].([]any); ok {
		schema.EnumValues = slices.Clone(enumValues)
	}
	if minimum, ok := asSchemaFloat(schemaNode["minimum"]); ok {
		schema.Minimum = &minimum
	}
	if maximum, ok := asSchemaFloat(schemaNode["maximum"]); ok {
		schema.Maximum = &maximum
	}
	if minLength, ok := asSchemaInt(schemaNode["minLength"]); ok {
		schema.MinLength = &minLength
	}
	if maxLength, ok := asSchemaInt(schemaNode["maxLength"]); ok {
		schema.MaxLength = &maxLength
	}
}

func applySchemaNodeShapeConstraints(schema *ValueSchema, schemaNode map[string]any) {
	switch schema.Type {
	case ValueTypeArray:
		applyArraySchemaNodeConstraints(schema, schemaNode)
	case ValueTypeObject:
		applyObjectSchemaNodeConstraints(schema, schemaNode)
	}
}

func applyArraySchemaNodeConstraints(schema *ValueSchema, schemaNode map[string]any) {
	rawItems, ok := schemaNode["items"].(map[string]any)
	if !ok {
		return
	}
	itemsSchema, ok := inferValueSchemaFromSchemaNode(rawItems)
	if !ok {
		return
	}
	schema.Items = valueSchemaPointer(itemsSchema)
}

func applyObjectSchemaNodeConstraints(schema *ValueSchema, schemaNode map[string]any) {
	if properties := inferObjectSchemaProperties(schemaNode); len(properties) > 0 {
		schema.Properties = properties
	}
	if requiredProperties := inferRequiredSchemaProperties(schemaNode); len(requiredProperties) > 0 {
		schema.RequiredProperties = requiredProperties
	}
	if additionalProperties, ok := schemaNode["additionalProperties"].(bool); ok {
		schema.AdditionalProperties = boolPointer(additionalProperties)
	}
}

func inferObjectSchemaProperties(schemaNode map[string]any) map[string]ValueSchema {
	rawProperties, ok := schemaNode["properties"].(map[string]any)
	if !ok {
		return nil
	}
	properties := make(map[string]ValueSchema, len(rawProperties))
	for propertyName, rawPropertySchema := range rawProperties {
		propertySchemaNode, ok := rawPropertySchema.(map[string]any)
		if !ok {
			continue
		}
		propertySchema, ok := inferValueSchemaFromSchemaNode(propertySchemaNode)
		if !ok {
			continue
		}
		properties[propertyName] = propertySchema
	}
	if len(properties) == 0 {
		return nil
	}
	return properties
}

func inferRequiredSchemaProperties(schemaNode map[string]any) []string {
	required, ok := schemaNode["required"].([]any)
	if !ok {
		return nil
	}
	requiredProperties := make([]string, 0, len(required))
	for _, item := range required {
		value, ok := item.(string)
		if !ok || strings.TrimSpace(value) == "" {
			continue
		}
		requiredProperties = append(requiredProperties, value)
	}
	if len(requiredProperties) == 0 {
		return nil
	}
	return requiredProperties
}

func resolveSchemaNodeType(schemaNode map[string]any) (string, bool) {
	switch typed := schemaNode["type"].(type) {
	case string:
		if validValueType(ValueType(typed)) {
			return typed, true
		}
		return "", false
	case []any:
		nonNullTypes := make([]string, 0, len(typed))
		for _, item := range typed {
			value, ok := item.(string)
			if !ok || value == "null" {
				continue
			}
			nonNullTypes = append(nonNullTypes, value)
		}
		nonNullTypes = slices.Compact(nonNullTypes)
		if len(nonNullTypes) != 1 || !validValueType(ValueType(nonNullTypes[0])) {
			return "", false
		}
		return nonNullTypes[0], true
	default:
		return "", false
	}
}

func validValueType(valueType ValueType) bool {
	switch valueType {
	case ValueTypeBoolean, ValueTypeString, ValueTypeNumber, ValueTypeInteger, ValueTypeArray, ValueTypeObject:
		return true
	default:
		return false
	}
}

func asSchemaFloat(raw any) (float64, bool) {
	value, ok := asFloat64(raw)
	if !ok {
		return 0, false
	}
	return value, true
}

func asSchemaInt(raw any) (int, bool) {
	switch typed := raw.(type) {
	case int:
		return typed, true
	case int8:
		return int(typed), true
	case int16:
		return int(typed), true
	case int32:
		return int(typed), true
	case int64:
		return int(typed), true
	case float64:
		if typed == float64(int(typed)) {
			return int(typed), true
		}
	case float32:
		if typed == float32(int(typed)) {
			return int(typed), true
		}
	}
	return 0, false
}

func requireNonEmptyString(raw any) (string, error) {
	value, ok := raw.(string)
	if !ok {
		return "", fmt.Errorf("expected non-empty string")
	}
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", fmt.Errorf("expected non-empty string")
	}
	return trimmed, nil
}

func readPluginConfigPathValue(config map[string]any, configPath []string, defaultValue any, pluginID string) (any, error) {
	currentValue := any(config)
	traversedSegments := make([]string, 0, len(configPath))
	for _, segment := range configPath {
		node, ok := currentValue.(map[string]any)
		if !ok {
			mismatchPath := "<root>"
			if len(traversedSegments) > 0 {
				mismatchPath = strings.Join(traversedSegments, ".")
			}
			return nil, newSettingError(
				ErrorCodeMutationFailed,
				"Plugin %s config path %s contains a non-object node at %s.",
				pluginID,
				strings.Join(configPath, "."),
				mismatchPath,
			)
		}
		value, ok := node[segment]
		if !ok {
			return cloneJSONValue(defaultValue), nil
		}
		traversedSegments = append(traversedSegments, segment)
		currentValue = value
	}
	return cloneJSONValue(currentValue), nil
}

func writePluginConfigPathValue(config map[string]any, configPath []string, value any, pluginID string) (map[string]any, error) {
	if len(configPath) == 0 {
		return nil, newSettingError(ErrorCodeMutationFailed, "Plugin %s config path must not be empty.", pluginID)
	}
	nextConfig := cloneStringAnyMap(config)
	current := nextConfig
	for index, segment := range configPath[:len(configPath)-1] {
		existing, ok := current[segment]
		if !ok || existing == nil {
			child := map[string]any{}
			current[segment] = child
			current = child
			continue
		}
		child, ok := existing.(map[string]any)
		if !ok {
			mismatchPath := "<root>"
			if index >= 0 {
				mismatchPath = strings.Join(configPath[:index+1], ".")
			}
			return nil, newSettingError(
				ErrorCodeMutationFailed,
				"Plugin %s config path %s contains a non-object node at %s.",
				pluginID,
				strings.Join(configPath, "."),
				mismatchPath,
			)
		}
		current = child
	}
	current[configPath[len(configPath)-1]] = cloneJSONValue(value)
	return nextConfig, nil
}

func cloneStringAnyMap(values map[string]any) map[string]any {
	if len(values) == 0 {
		return map[string]any{}
	}
	cloned, ok := cloneJSONValue(values).(map[string]any)
	if !ok {
		return map[string]any{}
	}
	return cloned
}

func buildPluginSettingID(pluginID string, localSettingID string) string {
	return pluginSettingPrefix + strings.TrimSpace(pluginID) + "::" + strings.TrimSpace(localSettingID)
}

func pluginSettingKey(pluginID string, localSettingID string) string {
	return strings.TrimSpace(pluginID) + "::" + strings.TrimSpace(localSettingID)
}

func parsePluginSettingID(settingID string) (string, string, bool) {
	if !strings.HasPrefix(settingID, pluginSettingPrefix) {
		return "", "", false
	}
	remainder := strings.TrimPrefix(settingID, pluginSettingPrefix)
	parts := strings.SplitN(remainder, "::", 2)
	if len(parts) != 2 {
		return "", "", false
	}
	pluginID := strings.TrimSpace(parts[0])
	localSettingID := strings.TrimSpace(parts[1])
	if pluginID == "" || localSettingID == "" {
		return "", "", false
	}
	return pluginID, localSettingID, true
}

func pluginHasRegisterPaneCapability(capabilities []string) bool {
	for _, capability := range capabilities {
		if strings.TrimSpace(capability) == pluginRegisterPaneCapability {
			return true
		}
	}
	return false
}

func buildPluginPaneOverviewTabKey(pluginID string, paneID string) string {
	return string(PluginOverviewTabPrefixValue) + ":" + encodeURIComponent(pluginID) + ":" + encodeURIComponent(paneID)
}

func encodeURIComponent(raw string) string {
	var builder strings.Builder
	builder.Grow(len(raw))
	for _, r := range raw {
		if isEncodeURIComponentSafe(r) {
			builder.WriteRune(r)
			continue
		}
		var buffer [utf8.UTFMax]byte
		size := utf8.EncodeRune(buffer[:], r)
		for _, b := range buffer[:size] {
			builder.WriteByte('%')
			builder.WriteString(fmt.Sprintf("%02X", b))
		}
	}
	return builder.String()
}

func isEncodeURIComponentSafe(r rune) bool {
	if r >= 'a' && r <= 'z' {
		return true
	}
	if r >= 'A' && r <= 'Z' {
		return true
	}
	if r >= '0' && r <= '9' {
		return true
	}
	switch r {
	case '-', '_', '.', '!', '~', '*', '\'', '(', ')':
		return true
	default:
		return false
	}
}
