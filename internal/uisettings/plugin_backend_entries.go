package uisettings

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"strings"

	"setta/internal/plugins"
)

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
		return buildMutationResult(oldValue, oldValue, oldValue), nil
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
	return buildMutationResult(oldValue, newValue, newValue), nil
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
	if pluginHasAnyUISettingsCapability(s.pluginEntry.EffectiveCapabilities) {
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
