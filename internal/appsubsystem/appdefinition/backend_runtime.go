package appdefinition

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"setta/internal/appsubsystem/appspec"
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

var ErrProviderCompareAndSetResultMismatch = errors.New("provider compare-and-set result does not match owner result")

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
	owner, err := r.ownerAppDefinitionService()
	if err != nil {
		return projectstate.Snapshot{}, MutationResult{}, err
	}
	return owner.setAppDefinition(
		ctx,
		input,
		r.validateProviderMutationWithDocument(backendruntime.ListenerEndpointSetAppDefinition, input),
	)
}

func (r *BackendRuntime) StreamAppDefinition(
	ctx context.Context,
	input StreamInput,
) (projectstate.Snapshot, MutationResult, error) {
	owner, err := r.ownerAppDefinitionService()
	if err != nil {
		return projectstate.Snapshot{}, MutationResult{}, err
	}
	return owner.streamAppDefinition(
		ctx,
		input,
		r.validateProviderMutationWithDocument(backendruntime.ListenerEndpointStreamAppDefinition, input),
	)
}

func (r *BackendRuntime) UpdateAppDefinition(
	ctx context.Context,
	patch any,
) (projectstate.Snapshot, MutationResult, error) {
	owner, err := r.ownerAppDefinitionService()
	if err != nil {
		return projectstate.Snapshot{}, MutationResult{}, err
	}
	payload := backendruntime.UpdateAppDefinitionRequest{Patch: patch}
	return owner.updateAppDefinition(
		ctx,
		patch,
		r.validateProviderMutationWithDocument(backendruntime.ListenerEndpointUpdateAppDefinition, payload),
	)
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
		(*AppDefinitionService).compareAndSetAppDefinitionCatalogID,
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
		(*AppDefinitionService).compareAndSetAppDefinitionSpecVersion,
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
		(*AppDefinitionService).compareAndSetAppDefinitionSpecPath,
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
		(*AppDefinitionService).compareAndSetAppDefinitionThemeMode,
	)
}

func invokeCompareAndSetString(
	r *BackendRuntime,
	ctx context.Context,
	endpointName string,
	value string,
	expectedOldValue *string,
	commit func(*AppDefinitionService, context.Context, string, *string, queuedCompareAndSetValidator) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error),
) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error) {
	owner, err := r.ownerAppDefinitionService()
	if err != nil {
		return projectstate.Snapshot{}, projectstate.CompareAndSetResult[string]{}, err
	}
	payload := backendruntime.CompareAndSetStringRequest{
		Value:            value,
		ExpectedOldValue: expectedOldValue,
	}
	return commit(
		owner,
		ctx,
		value,
		expectedOldValue,
		r.validateProviderCompareAndSetWithDocument(endpointName, payload),
	)
}

func invokeBackendResult[T any](
	r *BackendRuntime,
	ctx context.Context,
	endpointName string,
	payload any,
) (T, error) {
	return invokeBackendResultWithDocument[T](r, ctx, endpointName, payload, nil)
}

func invokeBackendResultWithDocument[T any](
	r *BackendRuntime,
	ctx context.Context,
	endpointName string,
	payload any,
	document *projectstate.Document,
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
	if document != nil {
		encodedPayload["projectStateDocument"] = document.Clone()
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

func (r *BackendRuntime) validateProviderMutationWithDocument(
	endpointName string,
	payload any,
) queuedDocumentValidator {
	return func(ctx context.Context, document projectstate.Document) error {
		result, err := invokeBackendResultWithDocument[MutationResult](
			r,
			ctx,
			endpointName,
			payload,
			&document,
		)
		if err != nil {
			return err
		}
		return r.validateProviderMutationResult(result)
	}
}

func (r *BackendRuntime) validateProviderCompareAndSetWithDocument(
	endpointName string,
	payload any,
) queuedCompareAndSetValidator {
	return func(ctx context.Context, document projectstate.Document, ownerResult projectstate.CompareAndSetResult[string]) error {
		result, err := invokeBackendResultWithDocument[CompareAndSetMutationResult](
			r,
			ctx,
			endpointName,
			payload,
			&document,
		)
		if err != nil {
			return err
		}
		providerResult := result.CompareResult.projectStateResult()
		if providerResult != ownerResult {
			return fmt.Errorf(
				"%w: owner old=%q new=%q, provider old=%q new=%q",
				ErrProviderCompareAndSetResultMismatch,
				ownerResult.OldValue,
				ownerResult.NewValue,
				providerResult.OldValue,
				providerResult.NewValue,
			)
		}
		return r.validateProviderCompareAndSetMutationResult(result)
	}
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

func (r *BackendRuntime) ownerAppDefinitionService() (*AppDefinitionService, error) {
	if r == nil || r.projectRuntime == nil {
		return nil, projectstate.ErrRuntimeClosed
	}
	storage, err := StorageForPlugin(r.pluginID)
	if err != nil {
		return nil, err
	}
	return &AppDefinitionService{
		runtime:      r.projectRuntime,
		storage:      storage,
		appSpecStore: appspec.MustForPlugin(r.pluginID),
	}, nil
}

func (r *BackendRuntime) validateProviderCompareAndSetMutationResult(
	result CompareAndSetMutationResult,
) error {
	compareResult := result.CompareResult.projectStateResult()
	if compareResult.OldValue == compareResult.NewValue {
		return nil
	}
	return r.validateProviderMutationResult(MutationResult{
		AppSpec:       result.AppSpec,
		AppDefinition: result.AppDefinition,
	})
}

func (r *BackendRuntime) validateProviderMutationResult(result MutationResult) error {
	if r == nil || r.projectRuntime == nil {
		return projectstate.ErrRuntimeClosed
	}
	if result.AppDefinition == nil {
		return fmt.Errorf("app subsystem backend mutation result is missing appDefinition")
	}
	if result.AppSpec == nil {
		return fmt.Errorf("app subsystem backend mutation result is missing appSpec")
	}

	projectRoot, err := r.projectRuntime.ProjectRoot()
	if err != nil {
		return err
	}
	appSpecStore := appspec.MustForPlugin(r.pluginID)
	definition := result.AppDefinition.Clone()
	normalizedPath, err := appSpecStore.NormalizePath(projectRoot, definition.AppSpecPath)
	if err != nil {
		return err
	}
	definition.AppSpecPath = normalizedPath
	return ValidatePersistedAppDefinitionWrite(definition, cloneJSONValue(result.AppSpec))
}
