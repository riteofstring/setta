package settajsonrenderappgenbackend

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"

	"setta/internal/projectstate"
	"setta/plugins/setta-json-render-app-gen/backend/appspec"
)

const defaultAppSpecVersion = "v1"

type AppDefinitionService struct {
	runtime *projectstate.Runtime
}

var _ projectstate.AppDefinitionRuntime = (*AppDefinitionService)(nil)

func NewAppDefinitionService(runtime *projectstate.Runtime) projectstate.AppDefinitionRuntime {
	if runtime == nil {
		return nil
	}
	return &AppDefinitionService{runtime: runtime}
}

func (s *AppDefinitionService) GetAppDefinition(
	ctx context.Context,
) (projectstate.AppDefinitionReadResult, error) {
	_ = ctx
	if s == nil || s.runtime == nil {
		return projectstate.AppDefinitionReadResult{}, projectstate.ErrRuntimeClosed
	}

	snapshot := s.runtime.Snapshot()
	result := projectstate.AppDefinitionReadResult{
		AppDefinition: cloneAppDefinitionPointer(snapshot.Document.AppDefinition),
	}
	if result.AppDefinition == nil || strings.TrimSpace(result.AppDefinition.AppSpecPath) == "" {
		return result, nil
	}

	projectRoot, err := s.runtime.ProjectRoot()
	if err != nil {
		return projectstate.AppDefinitionReadResult{}, err
	}
	appSpec, err := appspec.Read(projectRoot, result.AppDefinition.AppSpecPath)
	if err != nil {
		return projectstate.AppDefinitionReadResult{}, err
	}
	result.AppSpec = cloneJSONValue(appSpec)
	return result, nil
}

func (s *AppDefinitionService) ValidateAppDefinition(
	ctx context.Context,
	input projectstate.ValidateAppDefinitionInput,
) (projectstate.AppDefinitionValidationResult, error) {
	_ = ctx
	if s == nil || s.runtime == nil {
		return projectstate.AppDefinitionValidationResult{}, projectstate.ErrRuntimeClosed
	}

	current := effectiveAppDefinition(s.runtime.Snapshot().Document)
	updated, err := applyValidateAppDefinitionInput(current, input)
	if err != nil {
		return projectstate.AppDefinitionValidationResult{}, err
	}

	validationDefinition, err := appspecDefinition(updated)
	if err != nil {
		return projectstate.AppDefinitionValidationResult{}, err
	}
	validationErrors, warnings := appspec.ValidateDefinitionPayload(input.AppSpec, validationDefinition)
	if validationErrors == nil {
		validationErrors = []appspec.AppValidationIssue{}
	}
	if warnings == nil {
		warnings = []appspec.AppValidationIssue{}
	}

	return projectstate.AppDefinitionValidationResult{
		Errors:       validationErrors,
		Warnings:     warnings,
		Capabilities: appspec.BuildCapabilities(validationDefinition),
	}, nil
}

func (s *AppDefinitionService) SetAppDefinition(
	ctx context.Context,
	input projectstate.SetAppDefinitionInput,
) (projectstate.Snapshot, projectstate.AppDefinitionMutationResult, error) {
	if s == nil || s.runtime == nil {
		return projectstate.Snapshot{}, projectstate.AppDefinitionMutationResult{}, projectstate.ErrRuntimeClosed
	}

	projectRoot, err := s.runtime.ProjectRoot()
	if err != nil {
		return projectstate.Snapshot{}, projectstate.AppDefinitionMutationResult{}, err
	}

	var nextAppSpec any
	snapshot, err := s.runtime.MutatePersistedWithContext(ctx, func(document projectstate.Document) (projectstate.PersistedMutationPlan, error) {
		current := effectiveAppDefinition(document)
		targetPath := appspec.DefaultPath()
		if trimmed := strings.TrimSpace(current.AppSpecPath); trimmed != "" {
			targetPath = trimmed
		}
		if input.AppSpecPath != nil && strings.TrimSpace(*input.AppSpecPath) != "" {
			targetPath = *input.AppSpecPath
		}
		normalizedPath, err := appspec.NormalizePath(projectRoot, targetPath)
		if err != nil {
			return projectstate.PersistedMutationPlan{}, err
		}

		previousAppSpec, err := appspec.Read(projectRoot, normalizedPath)
		if err != nil {
			return projectstate.PersistedMutationPlan{}, err
		}

		nextDocument, appSpec, err := setAppDefinitionDocument(document, input, normalizedPath)
		if err != nil {
			return projectstate.PersistedMutationPlan{}, err
		}
		nextAppSpec = appSpec

		return projectstate.PersistedMutationPlan{
			NextDocument: nextDocument,
			ApplyExternalChanges: func() error {
				return appspec.Write(projectRoot, normalizedPath, appSpec)
			},
			RollbackExternalChanges: func() error {
				return rollbackAppSpecWrite(projectRoot, normalizedPath, previousAppSpec)
			},
		}, nil
	})
	if err != nil {
		return projectstate.Snapshot{}, projectstate.AppDefinitionMutationResult{}, err
	}

	return snapshot, projectstate.AppDefinitionMutationResult{
		AppSpec:       cloneJSONValue(nextAppSpec),
		AppDefinition: cloneAppDefinitionPointer(snapshot.Document.AppDefinition),
	}, nil
}

func (s *AppDefinitionService) StreamAppDefinition(
	ctx context.Context,
	input projectstate.StreamAppDefinitionInput,
) (projectstate.Snapshot, projectstate.AppDefinitionMutationResult, error) {
	if s == nil || s.runtime == nil {
		return projectstate.Snapshot{}, projectstate.AppDefinitionMutationResult{}, projectstate.ErrRuntimeClosed
	}

	projectRoot, err := s.runtime.ProjectRoot()
	if err != nil {
		return projectstate.Snapshot{}, projectstate.AppDefinitionMutationResult{}, err
	}
	ops, err := parseStreamAppDefinitionPatches(input.Patches)
	if err != nil {
		return projectstate.Snapshot{}, projectstate.AppDefinitionMutationResult{}, err
	}

	var nextAppSpec any
	snapshot, err := s.runtime.MutatePersistedWithContext(ctx, func(document projectstate.Document) (projectstate.PersistedMutationPlan, error) {
		current := effectiveAppDefinition(document)
		baseSpec, err := resolveStreamAppDefinitionBaseSpec(projectRoot, current, input.BaseAppSpec)
		if err != nil {
			return projectstate.PersistedMutationPlan{}, err
		}

		appSpec, err := appspec.ApplyPatchOps(ops, baseSpec)
		if err != nil {
			return projectstate.PersistedMutationPlan{}, newAppSpecPatchInvalidError(err)
		}

		targetPath, err := resolveStreamAppDefinitionTargetPath(projectRoot, current, input.AppSpecPath)
		if err != nil {
			return projectstate.PersistedMutationPlan{}, err
		}
		previousAppSpec, err := appspec.Read(projectRoot, targetPath)
		if err != nil {
			return projectstate.PersistedMutationPlan{}, err
		}

		nextDocument, nextSpec, err := setAppDefinitionDocument(document, projectstate.SetAppDefinitionInput{
			AppSpec:     appSpec,
			AppSpecPath: input.AppSpecPath,
		}, targetPath)
		if err != nil {
			return projectstate.PersistedMutationPlan{}, err
		}
		nextAppSpec = nextSpec

		return projectstate.PersistedMutationPlan{
			NextDocument: nextDocument,
			ApplyExternalChanges: func() error {
				return appspec.Write(projectRoot, targetPath, nextSpec)
			},
			RollbackExternalChanges: func() error {
				return rollbackAppSpecWrite(projectRoot, targetPath, previousAppSpec)
			},
		}, nil
	})
	if err != nil {
		return projectstate.Snapshot{}, projectstate.AppDefinitionMutationResult{}, err
	}

	return snapshot, projectstate.AppDefinitionMutationResult{
		AppSpec:       cloneJSONValue(nextAppSpec),
		AppDefinition: cloneAppDefinitionPointer(snapshot.Document.AppDefinition),
	}, nil
}

func parseStreamAppDefinitionPatches(patches string) ([]appspec.PatchOp, error) {
	if strings.TrimSpace(patches) == "" {
		return nil, newAppSpecPatchInvalidError(errors.New("patches must be non-empty."))
	}

	ops, err := appspec.ParsePatchLines(patches)
	if err != nil {
		return nil, newAppSpecPatchInvalidError(err)
	}
	return ops, nil
}

func (s *AppDefinitionService) UpdateAppDefinition(
	ctx context.Context,
	patch any,
) (projectstate.Snapshot, projectstate.AppDefinitionMutationResult, error) {
	if s == nil || s.runtime == nil {
		return projectstate.Snapshot{}, projectstate.AppDefinitionMutationResult{}, projectstate.ErrRuntimeClosed
	}

	projectRoot, err := s.runtime.ProjectRoot()
	if err != nil {
		return projectstate.Snapshot{}, projectstate.AppDefinitionMutationResult{}, err
	}

	var nextAppSpec any
	snapshot, err := s.runtime.MutatePersistedWithContext(ctx, func(document projectstate.Document) (projectstate.PersistedMutationPlan, error) {
		currentDefinition := document.AppDefinition
		if currentDefinition == nil || strings.TrimSpace(currentDefinition.AppSpecPath) == "" {
			return projectstate.PersistedMutationPlan{}, projectstate.ErrAppSpecPathUnconfigured
		}

		appSpecPath := currentDefinition.AppSpecPath
		existing, err := appspec.Read(projectRoot, appSpecPath)
		if err != nil {
			return projectstate.PersistedMutationPlan{}, err
		}
		if existing == nil {
			return projectstate.PersistedMutationPlan{}, projectstate.ErrAppSpecNotFound
		}

		nextDocument, appSpec, err := updateAppDefinitionDocument(document, patch, existing)
		if err != nil {
			return projectstate.PersistedMutationPlan{}, err
		}
		nextAppSpec = appSpec

		return projectstate.PersistedMutationPlan{
			NextDocument: nextDocument,
			ApplyExternalChanges: func() error {
				return appspec.Write(projectRoot, appSpecPath, appSpec)
			},
			RollbackExternalChanges: func() error {
				return rollbackAppSpecWrite(projectRoot, appSpecPath, existing)
			},
		}, nil
	})
	if err != nil {
		return projectstate.Snapshot{}, projectstate.AppDefinitionMutationResult{}, err
	}

	return snapshot, projectstate.AppDefinitionMutationResult{
		AppSpec:       cloneJSONValue(nextAppSpec),
		AppDefinition: cloneAppDefinitionPointer(snapshot.Document.AppDefinition),
	}, nil
}

type appSpecPatchInvalidError struct {
	cause error
}

func (e *appSpecPatchInvalidError) Error() string {
	if e == nil || e.cause == nil {
		return projectstate.ErrAppSpecPatchInvalid.Error()
	}
	return e.cause.Error()
}

func (e *appSpecPatchInvalidError) Unwrap() error {
	return projectstate.ErrAppSpecPatchInvalid
}

func newAppSpecPatchInvalidError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, projectstate.ErrAppSpecPatchInvalid) {
		return err
	}
	return &appSpecPatchInvalidError{cause: err}
}

func setAppDefinitionDocument(
	document projectstate.Document,
	input projectstate.SetAppDefinitionInput,
	normalizedAppSpecPath string,
) (projectstate.Document, any, error) {
	current := effectiveAppDefinition(document)
	updated, err := applySetAppDefinitionInput(current, input, normalizedAppSpecPath)
	if err != nil {
		return projectstate.Document{}, nil, err
	}

	validationDefinition, err := appspecDefinition(updated)
	if err != nil {
		return projectstate.Document{}, nil, err
	}
	appSpec := cloneJSONValue(input.AppSpec)
	if err := appspec.ValidatePersistedWrite(appSpec, validationDefinition); err != nil {
		return projectstate.Document{}, nil, err
	}

	nextDocument := document.Clone()
	nextDocument.AppDefinition = cloneAppDefinitionPointer(&updated)
	return nextDocument, appSpec, nil
}

func updateAppDefinitionDocument(
	document projectstate.Document,
	patch any,
	existing any,
) (projectstate.Document, any, error) {
	current := effectiveAppDefinition(document)
	validationDefinition, err := appspecDefinition(current)
	if err != nil {
		return projectstate.Document{}, nil, err
	}

	merged := applyJSONMergePatch(existing, patch)
	if err := appspec.ValidatePersistedWrite(merged, validationDefinition); err != nil {
		return projectstate.Document{}, nil, err
	}

	nextDocument := document.Clone()
	nextDocument.AppDefinition = cloneAppDefinitionPointer(&current)
	return nextDocument, merged, nil
}

func resolveStreamAppDefinitionTargetPath(
	projectRoot string,
	current projectstate.AppDefinition,
	inputAppSpecPath *string,
) (string, error) {
	targetPath := appspec.DefaultPath()
	if trimmed := strings.TrimSpace(current.AppSpecPath); trimmed != "" {
		targetPath = trimmed
	}
	if inputAppSpecPath != nil && strings.TrimSpace(*inputAppSpecPath) != "" {
		targetPath = *inputAppSpecPath
	}
	return appspec.NormalizePath(projectRoot, targetPath)
}

func resolveStreamAppDefinitionBaseSpec(
	projectRoot string,
	current projectstate.AppDefinition,
	baseAppSpec *map[string]any,
) (map[string]any, error) {
	if baseAppSpec != nil {
		cloned, ok := cloneJSONValue(*baseAppSpec).(map[string]any)
		if !ok {
			return nil, errors.New("baseAppSpec must be an object")
		}
		return cloned, nil
	}
	if strings.TrimSpace(current.AppSpecPath) == "" {
		return nil, nil
	}

	stored, err := appspec.Read(projectRoot, current.AppSpecPath)
	if err != nil {
		return nil, err
	}
	if stored == nil {
		return nil, nil
	}
	storedObject, ok := stored.(map[string]any)
	if !ok {
		return nil, nil
	}
	cloned, ok := cloneJSONValue(storedObject).(map[string]any)
	if !ok {
		return nil, nil
	}
	return cloned, nil
}

func effectiveAppDefinition(document projectstate.Document) projectstate.AppDefinition {
	if document.AppDefinition == nil {
		return projectstate.AppDefinition{
			AppSpecVersion: defaultAppSpecVersion,
			CatalogID:      appspec.DefaultCatalogID,
		}
	}

	current := document.AppDefinition.Clone()
	if strings.TrimSpace(current.AppSpecVersion) == "" {
		current.AppSpecVersion = defaultAppSpecVersion
	}
	if strings.TrimSpace(current.CatalogID) == "" {
		current.CatalogID = appspec.DefaultCatalogID
	}
	return current
}

func applyValidateAppDefinitionInput(
	current projectstate.AppDefinition,
	input projectstate.ValidateAppDefinitionInput,
) (projectstate.AppDefinition, error) {
	updated := current.Clone()
	applyOptionalAppDefinitionMetadata(&updated, input.AppSpecVersion, input.CatalogID, input.Routes)
	if err := applyOptionalAppDefinitionJSONField(&updated.DataBindings, input.DataBindings, "appDefinition.dataBindings"); err != nil {
		return projectstate.AppDefinition{}, err
	}
	if err := applyOptionalAppDefinitionJSONField(&updated.Actions, input.Actions, "appDefinition.actions"); err != nil {
		return projectstate.AppDefinition{}, err
	}
	if err := applyOptionalAppDefinitionJSONField(&updated.Theme, input.Theme, "appDefinition.theme"); err != nil {
		return projectstate.AppDefinition{}, err
	}
	if err := applyOptionalAppDefinitionJSONField(&updated.Assets, input.Assets, "appDefinition.assets"); err != nil {
		return projectstate.AppDefinition{}, err
	}
	return updated.Normalized()
}

func applySetAppDefinitionInput(
	current projectstate.AppDefinition,
	input projectstate.SetAppDefinitionInput,
	normalizedAppSpecPath string,
) (projectstate.AppDefinition, error) {
	updated := current.Clone()
	updated.AppSpecPath = normalizedAppSpecPath
	applyOptionalAppDefinitionMetadata(&updated, input.AppSpecVersion, input.CatalogID, input.Routes)
	if err := applyOptionalAppDefinitionJSONField(&updated.DataBindings, input.DataBindings, "appDefinition.dataBindings"); err != nil {
		return projectstate.AppDefinition{}, err
	}
	if err := applyOptionalAppDefinitionJSONField(&updated.Actions, input.Actions, "appDefinition.actions"); err != nil {
		return projectstate.AppDefinition{}, err
	}
	if err := applyOptionalAppDefinitionJSONField(&updated.Theme, input.Theme, "appDefinition.theme"); err != nil {
		return projectstate.AppDefinition{}, err
	}
	if err := applyOptionalAppDefinitionJSONField(&updated.Assets, input.Assets, "appDefinition.assets"); err != nil {
		return projectstate.AppDefinition{}, err
	}
	return updated, nil
}

func applyOptionalAppDefinitionMetadata(
	definition *projectstate.AppDefinition,
	appSpecVersion *string,
	catalogID *string,
	routes *[]projectstate.AppRoute,
) {
	if appSpecVersion != nil {
		definition.AppSpecVersion = *appSpecVersion
	}
	if catalogID != nil {
		definition.CatalogID = *catalogID
	}
	if routes != nil {
		definition.Routes = append([]projectstate.AppRoute(nil), (*routes)...)
	}
}

func applyOptionalAppDefinitionJSONField[T any](
	target *projectstate.RawJSON,
	value *T,
	field string,
) error {
	if value == nil {
		return nil
	}
	raw, err := marshalAppDefinitionRawJSON(*value, field)
	if err != nil {
		return err
	}
	*target = raw
	return nil
}

func appspecDefinition(definition projectstate.AppDefinition) (appspec.Definition, error) {
	dataBindings, err := decodeAppDefinitionJSONObject(definition.DataBindings, "appDefinition.dataBindings")
	if err != nil {
		return appspec.Definition{}, err
	}
	actions, err := decodeAppDefinitionJSONObject(definition.Actions, "appDefinition.actions")
	if err != nil {
		return appspec.Definition{}, err
	}
	theme, err := decodeAppDefinitionJSONObject(definition.Theme, "appDefinition.theme")
	if err != nil {
		return appspec.Definition{}, err
	}
	assets, err := decodeAppDefinitionJSONArray(definition.Assets, "appDefinition.assets")
	if err != nil {
		return appspec.Definition{}, err
	}
	return appspec.Definition{
		AppSpecVersion: definition.AppSpecVersion,
		CatalogID:      definition.CatalogID,
		ActionMap:      actions,
		DataBindings:   dataBindings,
		Theme:          theme,
		Assets:         assets,
	}, nil
}

func marshalAppDefinitionRawJSON(value any, field string) (projectstate.RawJSON, error) {
	if value == nil {
		return nil, nil
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("marshal %s: %w", field, err)
	}
	return projectstate.RawJSON(encoded), nil
}

func decodeAppDefinitionJSONObject(raw projectstate.RawJSON, field string) (map[string]any, error) {
	if len(strings.TrimSpace(string(raw))) == 0 {
		return nil, nil
	}

	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, fmt.Errorf("decode %s: %w", field, err)
	}
	if value == nil {
		return nil, nil
	}
	object, ok := value.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("%s must be a JSON object", field)
	}
	return object, nil
}

func decodeAppDefinitionJSONArray(raw projectstate.RawJSON, field string) ([]any, error) {
	if len(strings.TrimSpace(string(raw))) == 0 {
		return nil, nil
	}

	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, fmt.Errorf("decode %s: %w", field, err)
	}
	if value == nil {
		return nil, nil
	}
	array, ok := value.([]any)
	if !ok {
		return nil, fmt.Errorf("%s must be a JSON array", field)
	}
	return array, nil
}

func cloneAppDefinitionPointer(appDefinition *projectstate.AppDefinition) *projectstate.AppDefinition {
	if appDefinition == nil {
		return nil
	}
	cloned := appDefinition.Clone()
	return &cloned
}

func rollbackAppSpecWrite(projectRoot string, appSpecPath string, previousAppSpec any) error {
	if previousAppSpec != nil {
		return appspec.Write(projectRoot, appSpecPath, previousAppSpec)
	}

	resolvedPath, err := appspec.ResolvePath(projectRoot, appSpecPath)
	if err != nil {
		return err
	}
	if err := os.Remove(resolvedPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove app spec: %w", err)
	}
	return nil
}

func cloneJSONValue(value any) any {
	switch typed := value.(type) {
	case nil, bool, string, float64, float32, int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
		return typed
	case []any:
		cloned := make([]any, len(typed))
		for index, item := range typed {
			cloned[index] = cloneJSONValue(item)
		}
		return cloned
	case map[string]any:
		cloned := make(map[string]any, len(typed))
		for key, item := range typed {
			cloned[key] = cloneJSONValue(item)
		}
		return cloned
	default:
		encoded, err := json.Marshal(typed)
		if err != nil {
			return typed
		}
		var cloned any
		if err := json.Unmarshal(encoded, &cloned); err != nil {
			return typed
		}
		return cloned
	}
}

func applyJSONMergePatch(target any, patch any) any {
	patchObject, ok := patch.(map[string]any)
	if !ok {
		return cloneJSONValue(patch)
	}

	currentObject, ok := target.(map[string]any)
	if !ok {
		currentObject = map[string]any{}
	}
	cloned := make(map[string]any, len(currentObject))
	for key, value := range currentObject {
		cloned[key] = cloneJSONValue(value)
	}

	for key, patchValue := range patchObject {
		if patchValue == nil {
			delete(cloned, key)
			continue
		}
		cloned[key] = applyJSONMergePatch(cloned[key], patchValue)
	}
	return cloned
}
