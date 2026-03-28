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
	Runtime(options plugins.RuntimeOptions) (plugins.RuntimeResponse, error)
	WriteConfig(ctx context.Context, options plugins.ConfigWriteOptions) (plugins.PluginConfigWriteResult, error)
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

func NewScopedRegistry(options ScopedRegistryOptions) (*Registry, error) {
	coreRegistry, err := NewCoreRegistry(options.Runtime, options.WorkspaceRoot)
	if err != nil {
		return nil, err
	}
	entries := make([]RuntimeEntry, 0, len(coreRegistry.entriesByID))
	for _, entry := range coreRegistry.entriesByID {
		entries = append(entries, entry)
	}
	entries = append(entries, buildProjectAISettingEntries(options.ProjectAISettings)...)

	pluginService := options.PluginService
	if pluginService == nil {
		return New(entries)
	}

	pluginRuntime, err := pluginService.Runtime(plugins.RuntimeOptions{})
	if err != nil {
		return nil, err
	}

	metadata := buildPluginRegistryMetadata(pluginRuntime)
	for _, pluginEntry := range pluginRuntime.List.Plugins {
		pluginID := strings.TrimSpace(pluginEntry.PluginID)
		if pluginID == "" {
			continue
		}

		status := metadata.pluginStatusByPluginID[pluginID]
		status.RuntimeEntryAvailable = true
		if pluginHasRegisterPaneCapability(pluginEntry.EffectiveCapabilities) {
			status.SupportsUISettings = true
		}
		metadata.pluginStatusByPluginID[pluginID] = status

		if !pluginHasRegisterPaneCapability(pluginEntry.EffectiveCapabilities) {
			continue
		}
		parseResult, err := parsePluginUISettingDefinitions(pluginID, pluginEntry.Config.SchemaJSON)
		if err != nil {
			continue
		}
		backendRegistrations, err := pluginService.GetBackendUISettings(pluginID)
		if err != nil {
			return nil, err
		}
		validBackendRegistrations := make([]plugins.PluginRegisteredUISetting, 0, len(backendRegistrations))
		for _, registration := range backendRegistrations {
			if _, err := parseExplicitPluginValueSchema(pluginID, registration.LocalSettingID, registration.ValueSchema); err != nil {
				metadata.invalidPluginSettings[buildPluginSettingID(pluginID, registration.LocalSettingID)] = newSettingErrorValue(
					ErrorCodePluginUnavailable,
					"Plugin %s setting %s is unavailable for UI setting access (%s).",
					pluginID,
					registration.LocalSettingID,
					err.Error(),
				)
				continue
			}
			validBackendRegistrations = append(validBackendRegistrations, registration)
		}
		contributionCount := map[string]int{}
		for localSettingID, settingErr := range parseResult.InvalidSettingErrors {
			metadata.invalidPluginSettings[buildPluginSettingID(pluginID, localSettingID)] = settingErr
		}
		for _, definition := range parseResult.Definitions {
			contributionCount[definition.LocalSettingID]++
		}
		for _, registration := range validBackendRegistrations {
			contributionCount[registration.LocalSettingID]++
		}
		for _, definition := range parseResult.Definitions {
			if contributionCount[definition.LocalSettingID] > 1 {
				metadata.invalidPluginSettings[buildPluginSettingID(pluginID, definition.LocalSettingID)] = newSettingErrorValue(
					ErrorCodePluginUnavailable,
					"Plugin %s setting %s is unavailable for UI setting access (declared in both schema and backend registration).",
					pluginID,
					definition.LocalSettingID,
				)
				continue
			}
			metadata.knownPluginSettingIDs[pluginSettingKey(pluginID, definition.LocalSettingID)] = struct{}{}
			entries = append(entries, buildPluginRuntimeEntry(pluginService, pluginID, definition))
		}
		for _, registration := range validBackendRegistrations {
			if contributionCount[registration.LocalSettingID] > 1 {
				metadata.invalidPluginSettings[buildPluginSettingID(pluginID, registration.LocalSettingID)] = newSettingErrorValue(
					ErrorCodePluginUnavailable,
					"Plugin %s setting %s is unavailable for UI setting access (declared in both schema and backend registration).",
					pluginID,
					registration.LocalSettingID,
				)
				continue
			}
			metadata.knownPluginSettingIDs[pluginSettingKey(pluginID, registration.LocalSettingID)] = struct{}{}
			entries = append(entries, buildPluginBackendRuntimeEntry(pluginService, registration))
		}
	}

	return newRegistry(entries, metadata)
}

func buildPluginRegistryMetadata(runtime plugins.RuntimeResponse) registryPluginMetadata {
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
	overviewTabKey := buildPluginPaneOverviewTabKey(pluginID, definition.PaneID)
	metadata := Entry{
		SettingID:   settingID,
		Title:       definition.Title,
		Synonyms:    append([]string(nil), definition.Synonyms...),
		Description: definition.Description,
		Location: Location{
			Side:           SideLeft,
			OverviewTabKey: overviewTabKey,
			PluginID:       pluginID,
			PaneID:         definition.PaneID,
		},
		Highlight: Highlight{
			Strategy:        HighlightStrategyPluginHandler,
			PluginRevealKey: definition.RevealKey,
		},
		Source:      SourcePlugin,
		PluginID:    pluginID,
		Mutability:  definition.Mutability,
		ValueSchema: cloneValueSchema(definition.ValueSchema),
	}
	entry := RuntimeEntry{
		Metadata: metadata,
		ReadValue: func(_ context.Context, _ string) (any, error) {
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
		},
	}
	if definition.Mutability == MutabilityWritable {
		entry.WriteValue = func(ctx context.Context, _ string, value any, expectedOldValue any) (MutationResult, error) {
			if err := ValidateValue(definition.ValueSchema, value); err != nil {
				return MutationResult{}, err
			}
			if expectedOldValue != nil {
				if err := ValidateValue(definition.ValueSchema, expectedOldValue); err != nil {
					return MutationResult{}, err
				}
			}

			pluginEntry, err := requireActivePluginRuntimeEntry(pluginService, pluginID)
			if err != nil {
				return MutationResult{}, err
			}

			oldValue, err := readPluginConfigPathValue(
				pluginEntry.Config.CurrentConfig,
				definition.ConfigPath,
				definition.DefaultValue,
				pluginID,
			)
			if err != nil {
				return MutationResult{}, err
			}
			if err := ValidateValue(definition.ValueSchema, oldValue); err != nil {
				return MutationResult{}, err
			}
			if expectedOldValue != nil && !reflect.DeepEqual(cloneJSONValue(expectedOldValue), cloneJSONValue(oldValue)) {
				return MutationResult{}, newSettingError(
					ErrorCodeMutationFailed,
					"%s changed since pre-write validation.",
					settingID,
				)
			}

			nextConfig, err := writePluginConfigPathValue(pluginEntry.Config.CurrentConfig, definition.ConfigPath, value, pluginID)
			if err != nil {
				return MutationResult{}, err
			}
			if _, err := pluginService.WriteConfig(ctx, plugins.ConfigWriteOptions{
				PluginID:              pluginID,
				Config:                nextConfig,
				ExpectedCurrentConfig: cloneStringAnyMap(pluginEntry.Config.CurrentConfig),
				SkipWriteIfCurrentMatchesExpected: reflect.DeepEqual(
					cloneJSONValue(oldValue),
					cloneJSONValue(value),
				),
			}); err != nil {
				return MutationResult{}, normalizePluginConfigMutationError(pluginID, settingID, err)
			}
			return MutationResult{
				OldValue:        cloneJSONValue(oldValue),
				NewValue:        cloneJSONValue(value),
				NormalizedValue: cloneJSONValue(value),
				Changed:         !reflect.DeepEqual(oldValue, value),
			}, nil
		}
	}
	return entry
}

func buildPluginBackendRuntimeEntry(pluginService PluginRuntimeService, registration plugins.PluginRegisteredUISetting) RuntimeEntry {
	settingID := buildPluginSettingID(registration.PluginID, registration.LocalSettingID)
	overviewTabKey := buildPluginPaneOverviewTabKey(registration.PluginID, registration.PaneID)
	valueSchema, err := parseExplicitPluginValueSchema(registration.PluginID, registration.LocalSettingID, registration.ValueSchema)
	if err != nil {
		valueSchema = ValueSchema{}
	}
	metadata := Entry{
		SettingID:   settingID,
		Title:       registration.Title,
		Synonyms:    append([]string(nil), registration.Synonyms...),
		Description: registration.Description,
		Location: Location{
			Side:           SideLeft,
			OverviewTabKey: overviewTabKey,
			PluginID:       registration.PluginID,
			PaneID:         registration.PaneID,
		},
		Highlight: Highlight{
			Strategy:        HighlightStrategyPluginHandler,
			PluginRevealKey: registration.RevealKey,
		},
		Source:      SourcePlugin,
		PluginID:    registration.PluginID,
		Mutability:  Mutability(registration.Mutability),
		ValueSchema: cloneValueSchema(valueSchema),
	}
	entry := RuntimeEntry{
		Metadata: metadata,
		ReadValue: func(ctx context.Context, projectID string) (any, error) {
			if _, err := requireActivePluginRuntimeEntry(pluginService, registration.PluginID); err != nil {
				return nil, err
			}
			value, err := pluginService.ReadBackendUISettingValue(ctx, plugins.BackendUISettingReadOptions{
				PluginID:        registration.PluginID,
				HandlerID:       registration.ReadHandlerID,
				ProjectConfigID: projectID,
			})
			if err != nil {
				return nil, normalizePluginConfigMutationError(registration.PluginID, settingID, err)
			}
			if err := ValidateValue(metadata.ValueSchema, value); err != nil {
				return nil, wrapPluginBackendInvalidValueError(registration.PluginID, settingID, "returned an invalid value", err)
			}
			return cloneJSONValue(value), nil
		},
	}
	if metadata.Mutability == MutabilityWritable && registration.WriteHandlerID != nil {
		writeHandlerID := *registration.WriteHandlerID
		entry.WriteValue = func(ctx context.Context, projectID string, value any, expectedOldValue any) (MutationResult, error) {
			if err := ValidateValue(metadata.ValueSchema, value); err != nil {
				return MutationResult{}, err
			}
			if expectedOldValue != nil {
				if err := ValidateValue(metadata.ValueSchema, expectedOldValue); err != nil {
					return MutationResult{}, err
				}
			}
			if _, err := requireActivePluginRuntimeEntry(pluginService, registration.PluginID); err != nil {
				return MutationResult{}, err
			}

			oldValue, err := pluginService.ReadBackendUISettingValue(ctx, plugins.BackendUISettingReadOptions{
				PluginID:        registration.PluginID,
				HandlerID:       registration.ReadHandlerID,
				ProjectConfigID: projectID,
			})
			if err != nil {
				return MutationResult{}, normalizePluginConfigMutationError(registration.PluginID, settingID, err)
			}
			if err := ValidateValue(metadata.ValueSchema, oldValue); err != nil {
				return MutationResult{}, wrapPluginBackendInvalidValueError(registration.PluginID, settingID, "returned an invalid value during pre-write validation", err)
			}
			if expectedOldValue != nil && !reflect.DeepEqual(cloneJSONValue(expectedOldValue), cloneJSONValue(oldValue)) {
				return MutationResult{}, newSettingError(
					ErrorCodeMutationFailed,
					"%s changed since pre-write validation.",
					settingID,
				)
			}
			if reflect.DeepEqual(cloneJSONValue(oldValue), cloneJSONValue(value)) {
				return MutationResult{
					OldValue:        cloneJSONValue(oldValue),
					NewValue:        cloneJSONValue(oldValue),
					NormalizedValue: cloneJSONValue(value),
					Changed:         false,
				}, nil
			}

			if err := pluginService.WriteBackendUISettingValue(ctx, plugins.BackendUISettingWriteOptions{
				PluginID:        registration.PluginID,
				HandlerID:       writeHandlerID,
				ProjectConfigID: projectID,
				Value:           value,
			}); err != nil {
				return MutationResult{}, normalizePluginConfigMutationError(registration.PluginID, settingID, err)
			}

			newValue, err := pluginService.ReadBackendUISettingValue(ctx, plugins.BackendUISettingReadOptions{
				PluginID:        registration.PluginID,
				HandlerID:       registration.ReadHandlerID,
				ProjectConfigID: projectID,
			})
			if err != nil {
				return MutationResult{}, normalizePluginConfigMutationError(registration.PluginID, settingID, err)
			}
			if err := ValidateValue(metadata.ValueSchema, newValue); err != nil {
				if rollbackErr := rollbackPluginBackendUISettingValue(ctx, pluginService, registration.PluginID, registration.ReadHandlerID, writeHandlerID, projectID, oldValue); rollbackErr != nil {
					return MutationResult{}, newSettingError(
						ErrorCodeMutationFailed,
						"Plugin backend ui setting write produced an invalid value for %s: %s. Rollback failed: %s",
						settingID,
						err.Error(),
						rollbackErr.Error(),
					)
				}
				return MutationResult{}, newSettingError(
					ErrorCodeMutationFailed,
					"Plugin backend ui setting write produced an invalid value for %s: %s. Rollback restored the previous value.",
					settingID,
					err.Error(),
				)
			}

			return MutationResult{
				OldValue:        cloneJSONValue(oldValue),
				NewValue:        cloneJSONValue(newValue),
				NormalizedValue: cloneJSONValue(value),
				Changed:         !reflect.DeepEqual(oldValue, newValue),
			}, nil
		}
	}
	return entry
}

func requireActivePluginRuntimeEntry(pluginService PluginRuntimeService, pluginID string) (plugins.ListEntry, error) {
	if pluginService == nil {
		return plugins.ListEntry{}, newSettingError(ErrorCodePluginUnavailable, "Plugin runtime is unavailable for plugin UI setting access.")
	}

	runtimeResponse, err := pluginService.Runtime(plugins.RuntimeOptions{})
	if err != nil {
		return plugins.ListEntry{}, err
	}

	trimmedPluginID := strings.TrimSpace(pluginID)
	var observedStates []string
	for _, statusEntry := range runtimeResponse.Status.Plugins {
		if strings.TrimSpace(statusEntry.PluginID) != trimmedPluginID {
			continue
		}
		observedStates = append(observedStates, string(statusEntry.State))
	}

	var pluginEntry plugins.ListEntry
	hasRuntimeEntry := false
	for _, candidate := range runtimeResponse.List.Plugins {
		if strings.TrimSpace(candidate.PluginID) != trimmedPluginID {
			continue
		}
		pluginEntry = candidate
		hasRuntimeEntry = true
		break
	}

	operational := false
	for _, observedState := range observedStates {
		switch strings.TrimSpace(observedState) {
		case "active", "pending_restart":
			operational = true
		}
	}
	if !operational {
		observedState := describeObservedPluginStates(observedStates)
		if observedState == "" {
			return plugins.ListEntry{}, newSettingError(ErrorCodePluginUnavailable, "Plugin %s is unavailable.", trimmedPluginID)
		}
		return plugins.ListEntry{}, newSettingError(
			ErrorCodePluginUnavailable,
			"Plugin %s is unavailable (state=%s).",
			trimmedPluginID,
			observedState,
		)
	}
	if !hasRuntimeEntry {
		observedState := describeObservedPluginStates(observedStates)
		if observedState == "" {
			observedState = "unknown"
		}
		return plugins.ListEntry{}, newSettingError(
			ErrorCodePluginUnavailable,
			"Plugin %s is unavailable (state=%s, runtime entry missing).",
			trimmedPluginID,
			observedState,
		)
	}
	if !pluginHasRegisterPaneCapability(pluginEntry.EffectiveCapabilities) {
		return plugins.ListEntry{}, newSettingError(
			ErrorCodePluginUnavailable,
			"Plugin %s is unavailable for UI setting access (registerPane capability not effective).",
			trimmedPluginID,
		)
	}
	return pluginEntry, nil
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

	localSettingID, err := requireNonEmptyString(definitionMap["settingId"])
	if err != nil {
		return pluginUISettingDefinition{}, fmt.Errorf("plugin %s %s[%d] settingId must be a non-empty string", pluginID, pluginUISettingsSchemaKey, index)
	}
	if strings.Contains(localSettingID, "::") {
		return pluginUISettingDefinition{}, fmt.Errorf("plugin %s settingId %s must not contain '::'", pluginID, localSettingID)
	}
	title, err := requireNonEmptyString(definitionMap["title"])
	if err != nil {
		return pluginUISettingDefinition{}, fmt.Errorf("plugin %s %s[%d] title must be a non-empty string", pluginID, pluginUISettingsSchemaKey, index)
	}
	description, err := requireNonEmptyString(definitionMap["description"])
	if err != nil {
		return pluginUISettingDefinition{}, fmt.Errorf("plugin %s %s[%d] description must be a non-empty string", pluginID, pluginUISettingsSchemaKey, index)
	}
	paneID, err := requireNonEmptyString(definitionMap["paneId"])
	if err != nil {
		return pluginUISettingDefinition{}, fmt.Errorf("plugin %s %s[%d] paneId must be a non-empty string", pluginID, pluginUISettingsSchemaKey, index)
	}
	revealKey, err := requireNonEmptyString(definitionMap["revealKey"])
	if err != nil {
		return pluginUISettingDefinition{}, fmt.Errorf("plugin %s %s[%d] revealKey must be a non-empty string", pluginID, pluginUISettingsSchemaKey, index)
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
	valueSchema, err := resolvePluginValueSchema(pluginID, localSettingID, schemaJSON, definitionMap["valueSchema"], configPath)
	if err != nil {
		return pluginUISettingDefinition{}, err
	}
	defaultValue, ok := definitionMap["defaultValue"]
	if !ok {
		return pluginUISettingDefinition{}, fmt.Errorf("plugin %s setting %s must define defaultValue", pluginID, localSettingID)
	}
	if err := ValidateValue(valueSchema, defaultValue); err != nil {
		return pluginUISettingDefinition{}, fmt.Errorf("plugin %s setting %s defaultValue is invalid: %w", pluginID, localSettingID, err)
	}
	return pluginUISettingDefinition{
		LocalSettingID: localSettingID,
		Title:          title,
		Description:    description,
		Synonyms:       synonyms,
		PaneID:         paneID,
		RevealKey:      revealKey,
		ConfigPath:     configPath,
		Mutability:     mutability,
		ValueSchema:    valueSchema,
		DefaultValue:   cloneJSONValue(defaultValue),
	}, nil
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
	if enumValues, ok := schemaNode["enum"].([]any); ok {
		schema.EnumValues = append([]any(nil), enumValues...)
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
	if schema.Type == ValueTypeArray {
		if rawItems, ok := schemaNode["items"].(map[string]any); ok {
			if itemsSchema, ok := inferValueSchemaFromSchemaNode(rawItems); ok {
				schema.Items = valueSchemaPointer(itemsSchema)
			}
		}
	}
	if schema.Type == ValueTypeObject {
		if rawProperties, ok := schemaNode["properties"].(map[string]any); ok {
			properties := map[string]ValueSchema{}
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
			if len(properties) > 0 {
				schema.Properties = properties
			}
		}
		if required, ok := schemaNode["required"].([]any); ok {
			requiredProperties := make([]string, 0, len(required))
			for _, item := range required {
				value, ok := item.(string)
				if !ok || strings.TrimSpace(value) == "" {
					continue
				}
				requiredProperties = append(requiredProperties, value)
			}
			if len(requiredProperties) > 0 {
				schema.RequiredProperties = requiredProperties
			}
		}
		if additionalProperties, ok := schemaNode["additionalProperties"].(bool); ok {
			schema.AdditionalProperties = boolPointer(additionalProperties)
		}
	}
	return schema, true
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
	return "PluginPane:" + encodeURIComponent(pluginID) + ":" + encodeURIComponent(paneID)
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
