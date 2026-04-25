package appdefinition

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	backendruntime "setta/internal/appsubsystem/backendruntime"
	"setta/internal/plugins"
	"setta/internal/projectstate"
)

type BackendListenerInvoker interface {
	InvokeRegisteredListenerEndpoint(
		context.Context,
		plugins.BackendListenerEndpointRequest,
	) (any, bool, error)
}

type BackendRuntime struct {
	projectRuntime *projectstate.Runtime
	pluginID       string
	backend        BackendListenerInvoker
}

var _ Runtime = (*BackendRuntime)(nil)

func NewBackendRuntime(
	projectRuntime *projectstate.Runtime,
	pluginID string,
	backend BackendListenerInvoker,
) Runtime {
	if projectRuntime == nil || backend == nil || strings.TrimSpace(pluginID) == "" {
		return nil
	}
	return &BackendRuntime{
		projectRuntime: projectRuntime,
		pluginID:       strings.TrimSpace(pluginID),
		backend:        backend,
	}
}

func (r *BackendRuntime) GetAppDefinition(ctx context.Context) (ReadResult, error) {
	return invokeBackendResult[ReadResult](r, ctx, backendruntime.ListenerEndpointGetAppDefinition, struct{}{})
}

func (r *BackendRuntime) GetEffectiveAppDefinition(ctx context.Context) (AppDefinition, error) {
	return invokeBackendResult[AppDefinition](r, ctx, backendruntime.ListenerEndpointGetEffectiveAppDefinition, struct{}{})
}

func (r *BackendRuntime) GetEffectiveAppSpecPath(ctx context.Context) (string, error) {
	return invokeBackendResult[string](r, ctx, backendruntime.ListenerEndpointGetEffectiveAppSpecPath, struct{}{})
}

func (r *BackendRuntime) GetEffectiveAppThemeMode(ctx context.Context) (string, error) {
	return invokeBackendResult[string](r, ctx, backendruntime.ListenerEndpointGetEffectiveAppThemeMode, struct{}{})
}

func (r *BackendRuntime) ValidateAppDefinition(
	ctx context.Context,
	input ValidateInput,
) (ValidationResult, error) {
	return invokeBackendResult[ValidationResult](r, ctx, backendruntime.ListenerEndpointValidateAppDefinition, input)
}

func (r *BackendRuntime) SetAppDefinition(
	ctx context.Context,
	input SetInput,
) (projectstate.Snapshot, MutationResult, error) {
	result, err := invokeBackendResult[MutationResult](r, ctx, backendruntime.ListenerEndpointSetAppDefinition, input)
	if err != nil {
		return projectstate.Snapshot{}, MutationResult{}, err
	}
	snapshot, err := r.syncPersistedState(ctx, result.AppDefinition)
	if err != nil {
		return projectstate.Snapshot{}, MutationResult{}, err
	}
	return snapshot, result, nil
}

func (r *BackendRuntime) StreamAppDefinition(
	ctx context.Context,
	input StreamInput,
) (projectstate.Snapshot, MutationResult, error) {
	result, err := invokeBackendResult[MutationResult](r, ctx, backendruntime.ListenerEndpointStreamAppDefinition, input)
	if err != nil {
		return projectstate.Snapshot{}, MutationResult{}, err
	}
	snapshot, err := r.syncPersistedState(ctx, result.AppDefinition)
	if err != nil {
		return projectstate.Snapshot{}, MutationResult{}, err
	}
	return snapshot, result, nil
}

func (r *BackendRuntime) UpdateAppDefinition(
	ctx context.Context,
	patch any,
) (projectstate.Snapshot, MutationResult, error) {
	result, err := invokeBackendResult[MutationResult](
		r,
		ctx,
		backendruntime.ListenerEndpointUpdateAppDefinition,
		backendruntime.UpdateAppDefinitionRequest{Patch: patch},
	)
	if err != nil {
		return projectstate.Snapshot{}, MutationResult{}, err
	}
	snapshot, err := r.syncPersistedState(ctx, result.AppDefinition)
	if err != nil {
		return projectstate.Snapshot{}, MutationResult{}, err
	}
	return snapshot, result, nil
}

func (r *BackendRuntime) CompareAndSetAppDefinitionCatalogID(
	ctx context.Context,
	catalogID string,
	expectedOldValue *string,
) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error) {
	return invokeCompareAndSetString(
		r,
		ctx,
		backendruntime.ListenerEndpointCompareAndSetCatalogID,
		catalogID,
		expectedOldValue,
	)
}

func (r *BackendRuntime) CompareAndSetAppDefinitionSpecVersion(
	ctx context.Context,
	appSpecVersion string,
	expectedOldValue *string,
) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error) {
	return invokeCompareAndSetString(
		r,
		ctx,
		backendruntime.ListenerEndpointCompareAndSetSpecVersion,
		appSpecVersion,
		expectedOldValue,
	)
}

func (r *BackendRuntime) CompareAndSetAppDefinitionSpecPath(
	ctx context.Context,
	appSpecPath string,
	expectedOldValue *string,
) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error) {
	return invokeCompareAndSetString(
		r,
		ctx,
		backendruntime.ListenerEndpointCompareAndSetSpecPath,
		appSpecPath,
		expectedOldValue,
	)
}

func (r *BackendRuntime) CompareAndSetAppDefinitionThemeMode(
	ctx context.Context,
	themeMode string,
	expectedOldValue *string,
) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error) {
	return invokeCompareAndSetString(
		r,
		ctx,
		backendruntime.ListenerEndpointCompareAndSetThemeMode,
		themeMode,
		expectedOldValue,
	)
}

func invokeCompareAndSetString(
	r *BackendRuntime,
	ctx context.Context,
	endpointName string,
	value string,
	expectedOldValue *string,
) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error) {
	result, err := invokeBackendResult[projectstate.CompareAndSetResult[string]](
		r,
		ctx,
		endpointName,
		backendruntime.CompareAndSetStringRequest{
			Value:            value,
			ExpectedOldValue: expectedOldValue,
		},
	)
	if err != nil {
		return projectstate.Snapshot{}, projectstate.CompareAndSetResult[string]{}, err
	}
	if result.OldValue == result.NewValue {
		snapshot, err := r.projectRuntime.MutateWithContext(
			ctx,
			func(document projectstate.Document) (projectstate.Document, error) {
				return document, nil
			},
		)
		if err != nil {
			return projectstate.Snapshot{}, projectstate.CompareAndSetResult[string]{}, err
		}
		return snapshot, result, nil
	}
	snapshot, err := r.syncPersistedState(ctx, nil)
	if err != nil {
		return projectstate.Snapshot{}, projectstate.CompareAndSetResult[string]{}, err
	}
	return snapshot, result, nil
}

func invokeBackendResult[T any](
	r *BackendRuntime,
	ctx context.Context,
	endpointName string,
	payload any,
) (T, error) {
	var zero T
	if r == nil || r.projectRuntime == nil {
		return zero, projectstate.ErrRuntimeClosed
	}
	if r.backend == nil {
		return zero, fmt.Errorf("app subsystem backend listener invoker is required")
	}

	encodedPayload, err := encodeBackendPayload(payload)
	if err != nil {
		return zero, err
	}
	result, handled, err := r.backend.InvokeRegisteredListenerEndpoint(
		ctx,
		plugins.BackendListenerEndpointRequest{
			Context:      plugins.BackendRequestContext{},
			PluginID:     r.pluginID,
			EndpointName: strings.TrimSpace(endpointName),
			Payload:      encodedPayload,
		},
	)
	if err != nil {
		return zero, mapBackendRuntimeError(err)
	}
	if !handled {
		return zero, fmt.Errorf(
			"app subsystem backend endpoint %q is unavailable for plugin %q",
			strings.TrimSpace(endpointName),
			r.pluginID,
		)
	}
	return decodeBackendResult[T](result)
}

func encodeBackendPayload(value any) (map[string]any, error) {
	if value == nil {
		return map[string]any{}, nil
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("encode app subsystem backend payload: %w", err)
	}
	if string(encoded) == "null" {
		return map[string]any{}, nil
	}
	var payload map[string]any
	if err := json.Unmarshal(encoded, &payload); err != nil {
		return nil, fmt.Errorf("decode app subsystem backend payload: %w", err)
	}
	if payload == nil {
		return map[string]any{}, nil
	}
	return payload, nil
}

func decodeBackendResult[T any](raw any) (T, error) {
	var result T
	encoded, err := json.Marshal(raw)
	if err != nil {
		return result, fmt.Errorf("encode app subsystem backend result: %w", err)
	}
	if err := json.Unmarshal(encoded, &result); err != nil {
		return result, fmt.Errorf("decode app subsystem backend result: %w", err)
	}
	return result, nil
}

func mapBackendRuntimeError(err error) error {
	var backendErr *plugins.BackendRuntimeError
	if !errors.As(err, &backendErr) {
		return err
	}

	switch strings.TrimSpace(backendErr.Code) {
	case backendruntime.ErrorCodeRuntimeClosed:
		return projectstate.ErrRuntimeClosed
	case backendruntime.ErrorCodeAppSpecPathUnconfigured:
		return ErrAppSpecPathUnconfigured
	case backendruntime.ErrorCodeAppSpecNotFound:
		return ErrAppSpecNotFound
	case backendruntime.ErrorCodeAppSpecPatchInvalid:
		message := strings.TrimSpace(backendErr.Message)
		if message == "" {
			return ErrAppSpecPatchInvalid
		}
		return fmt.Errorf("%w: %s", ErrAppSpecPatchInvalid, message)
	case backendruntime.ErrorCodeExpectedOldValueMismatch:
		details, decodeErr := decodeBackendResult[backendruntime.ExpectedOldValueMismatchDetails](backendErr.Details)
		if decodeErr != nil {
			return err
		}
		return &projectstate.ExpectedOldValueMismatchError{
			SettingID:        details.SettingID,
			ExpectedOldValue: details.ExpectedOldValue,
			ObservedOldValue: details.ObservedOldValue,
		}
	default:
		return err
	}
}

func (r *BackendRuntime) syncPersistedState(
	ctx context.Context,
	definition *AppDefinition,
) (projectstate.Snapshot, error) {
	if r == nil || r.projectRuntime == nil {
		return projectstate.Snapshot{}, projectstate.ErrRuntimeClosed
	}
	if definition == nil {
		readResult, err := r.GetAppDefinition(ctx)
		if err != nil {
			return projectstate.Snapshot{}, err
		}
		definition = readResult.AppDefinition
	}

	storage := MustStorageForPlugin(r.pluginID)
	encodedDefinition, err := EncodeStoredAppDefinition(definition)
	if err != nil {
		return projectstate.Snapshot{}, err
	}
	return r.projectRuntime.MutateAndSave(ctx, func(
		document projectstate.Document,
	) (projectstate.Document, error) {
		return storage.WithStoredDocumentAppDefinition(document, encodedDefinition), nil
	})
}
