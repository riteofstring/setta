package appdefinition

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
const defaultAppThemeMode = "auto"

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
	appDefinition, err := DecodeStoredAppDefinition(StoredDocumentAppDefinitionRaw(snapshot.Document))
	if err != nil {
		return projectstate.AppDefinitionReadResult{}, err
	}
	result := projectstate.AppDefinitionReadResult{AppDefinition: appDefinition}
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

func (s *AppDefinitionService) GetEffectiveAppDefinition(
	ctx context.Context,
) (projectstate.AppDefinition, error) {
	_ = ctx
	if s == nil || s.runtime == nil {
		return projectstate.AppDefinition{}, projectstate.ErrRuntimeClosed
	}
	return effectiveAppDefinition(s.runtime.Snapshot().Document)
}

func (s *AppDefinitionService) GetEffectiveAppSpecPath(
	ctx context.Context,
) (string, error) {
	_ = ctx
	if s == nil || s.runtime == nil {
		return "", projectstate.ErrRuntimeClosed
	}
	return effectiveAppSpecPath(s.runtime.Snapshot().Document)
}

func (s *AppDefinitionService) GetEffectiveAppThemeMode(
	ctx context.Context,
) (string, error) {
	_ = ctx
	if s == nil || s.runtime == nil {
		return "", projectstate.ErrRuntimeClosed
	}
	return effectiveAppThemeMode(s.runtime.Snapshot().Document)
}

func (s *AppDefinitionService) ValidateAppDefinition(
	ctx context.Context,
	input projectstate.ValidateAppDefinitionInput,
) (projectstate.AppDefinitionValidationResult, error) {
	_ = ctx
	if s == nil || s.runtime == nil {
		return projectstate.AppDefinitionValidationResult{}, projectstate.ErrRuntimeClosed
	}

	current, err := effectiveAppDefinition(s.runtime.Snapshot().Document)
	if err != nil {
		return projectstate.AppDefinitionValidationResult{}, err
	}
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
		Errors:       projectstateValidationIssues(validationErrors),
		Warnings:     projectstateValidationIssues(warnings),
		Capabilities: projectstateValidationCapabilities(appspec.BuildCapabilities(validationDefinition)),
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
		plan, appSpec, err := buildSetAppDefinitionPlan(document, projectRoot, input)
		nextAppSpec = appSpec
		return plan, err
	})
	if err != nil {
		return projectstate.Snapshot{}, projectstate.AppDefinitionMutationResult{}, err
	}

	appDefinitionResult, err := DecodeStoredAppDefinition(StoredDocumentAppDefinitionRaw(snapshot.Document))
	if err != nil {
		return projectstate.Snapshot{}, projectstate.AppDefinitionMutationResult{}, err
	}

	return snapshot, projectstate.AppDefinitionMutationResult{
		AppSpec:       cloneJSONValue(nextAppSpec),
		AppDefinition: appDefinitionResult,
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
		plan, appSpec, err := buildStreamAppDefinitionPlan(document, projectRoot, input, ops)
		nextAppSpec = appSpec
		return plan, err
	})
	if err != nil {
		return projectstate.Snapshot{}, projectstate.AppDefinitionMutationResult{}, err
	}

	appDefinitionResult, err := DecodeStoredAppDefinition(StoredDocumentAppDefinitionRaw(snapshot.Document))
	if err != nil {
		return projectstate.Snapshot{}, projectstate.AppDefinitionMutationResult{}, err
	}

	return snapshot, projectstate.AppDefinitionMutationResult{
		AppSpec:       cloneJSONValue(nextAppSpec),
		AppDefinition: appDefinitionResult,
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

func buildSetAppDefinitionPlan(
	document projectstate.Document,
	projectRoot string,
	input projectstate.SetAppDefinitionInput,
) (projectstate.PersistedMutationPlan, any, error) {
	current, err := effectiveAppDefinition(document)
	if err != nil {
		return projectstate.PersistedMutationPlan{}, nil, err
	}
	normalizedPath, err := resolveSetAppDefinitionTargetPath(projectRoot, current, input.AppSpecPath)
	if err != nil {
		return projectstate.PersistedMutationPlan{}, nil, err
	}
	previousAppSpec, err := appspec.Read(projectRoot, normalizedPath)
	if err != nil {
		return projectstate.PersistedMutationPlan{}, nil, err
	}
	nextDocument, appSpec, err := setAppDefinitionDocument(document, input, normalizedPath)
	if err != nil {
		return projectstate.PersistedMutationPlan{}, nil, err
	}
	return projectstate.PersistedMutationPlan{
		NextDocument: nextDocument,
		ApplyExternalChanges: func() error {
			return appspec.Write(projectRoot, normalizedPath, appSpec)
		},
		RollbackExternalChanges: func() error {
			return rollbackAppSpecWrite(projectRoot, normalizedPath, previousAppSpec)
		},
	}, appSpec, nil
}

func buildStreamAppDefinitionPlan(
	document projectstate.Document,
	projectRoot string,
	input projectstate.StreamAppDefinitionInput,
	ops []appspec.PatchOp,
) (projectstate.PersistedMutationPlan, any, error) {
	current, err := effectiveAppDefinition(document)
	if err != nil {
		return projectstate.PersistedMutationPlan{}, nil, err
	}
	baseSpec, err := resolveStreamAppDefinitionBaseSpec(projectRoot, current, input.BaseAppSpec)
	if err != nil {
		return projectstate.PersistedMutationPlan{}, nil, err
	}
	appSpec, err := appspec.ApplyPatchOps(ops, baseSpec)
	if err != nil {
		return projectstate.PersistedMutationPlan{}, nil, newAppSpecPatchInvalidError(err)
	}
	targetPath, err := resolveStreamAppDefinitionTargetPath(projectRoot, current, input.AppSpecPath)
	if err != nil {
		return projectstate.PersistedMutationPlan{}, nil, err
	}
	previousAppSpec, err := appspec.Read(projectRoot, targetPath)
	if err != nil {
		return projectstate.PersistedMutationPlan{}, nil, err
	}
	nextDocument, nextSpec, err := setAppDefinitionDocument(document, projectstate.SetAppDefinitionInput{
		AppSpec:     appSpec,
		AppSpecPath: input.AppSpecPath,
	}, targetPath)
	if err != nil {
		return projectstate.PersistedMutationPlan{}, nil, err
	}
	return projectstate.PersistedMutationPlan{
		NextDocument: nextDocument,
		ApplyExternalChanges: func() error {
			return appspec.Write(projectRoot, targetPath, nextSpec)
		},
		RollbackExternalChanges: func() error {
			return rollbackAppSpecWrite(projectRoot, targetPath, previousAppSpec)
		},
	}, nextSpec, nil
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
		plan, appSpec, err := buildUpdateAppDefinitionPlan(document, projectRoot, patch)
		nextAppSpec = appSpec
		return plan, err
	})
	if err != nil {
		return projectstate.Snapshot{}, projectstate.AppDefinitionMutationResult{}, err
	}

	appDefinitionResult, err := DecodeStoredAppDefinition(StoredDocumentAppDefinitionRaw(snapshot.Document))
	if err != nil {
		return projectstate.Snapshot{}, projectstate.AppDefinitionMutationResult{}, err
	}

	return snapshot, projectstate.AppDefinitionMutationResult{
		AppSpec:       cloneJSONValue(nextAppSpec),
		AppDefinition: appDefinitionResult,
	}, nil
}

func buildUpdateAppDefinitionPlan(
	document projectstate.Document,
	projectRoot string,
	patch any,
) (projectstate.PersistedMutationPlan, any, error) {
	current, err := DecodeStoredAppDefinition(StoredDocumentAppDefinitionRaw(document))
	if err != nil {
		return projectstate.PersistedMutationPlan{}, nil, err
	}
	if current == nil || strings.TrimSpace(current.AppSpecPath) == "" {
		return projectstate.PersistedMutationPlan{}, nil, projectstate.ErrAppSpecPathUnconfigured
	}

	appSpecPath := current.AppSpecPath
	existing, err := appspec.Read(projectRoot, appSpecPath)
	if err != nil {
		return projectstate.PersistedMutationPlan{}, nil, err
	}
	if existing == nil {
		return projectstate.PersistedMutationPlan{}, nil, projectstate.ErrAppSpecNotFound
	}

	nextDocument, appSpec, err := updateAppDefinitionDocument(document, patch, existing)
	if err != nil {
		return projectstate.PersistedMutationPlan{}, nil, err
	}

	return projectstate.PersistedMutationPlan{
		NextDocument: nextDocument,
		ApplyExternalChanges: func() error {
			return appspec.Write(projectRoot, appSpecPath, appSpec)
		},
		RollbackExternalChanges: func() error {
			return rollbackAppSpecWrite(projectRoot, appSpecPath, existing)
		},
	}, appSpec, nil
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
	current, err := effectiveAppDefinition(document)
	if err != nil {
		return projectstate.Document{}, nil, err
	}
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

	encodedDefinition, err := EncodeStoredAppDefinition(&updated)
	if err != nil {
		return projectstate.Document{}, nil, err
	}
	nextDocument := WithStoredDocumentAppDefinition(document, encodedDefinition)
	return nextDocument, appSpec, nil
}

func updateAppDefinitionDocument(
	document projectstate.Document,
	patch any,
	existing any,
) (projectstate.Document, any, error) {
	current, err := effectiveAppDefinition(document)
	if err != nil {
		return projectstate.Document{}, nil, err
	}
	validationDefinition, err := appspecDefinition(current)
	if err != nil {
		return projectstate.Document{}, nil, err
	}

	merged := applyJSONMergePatch(existing, patch)
	if err := appspec.ValidatePersistedWrite(merged, validationDefinition); err != nil {
		return projectstate.Document{}, nil, err
	}

	encodedDefinition, err := EncodeStoredAppDefinition(&current)
	if err != nil {
		return projectstate.Document{}, nil, err
	}
	nextDocument := WithStoredDocumentAppDefinition(document, encodedDefinition)
	return nextDocument, merged, nil
}

func resolveSetAppDefinitionTargetPath(
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
	return normalizeAppDefinition(updated)
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
	return normalizeAppDefinition(updated)
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

func projectstateValidationIssues(
	issues []appspec.AppValidationIssue,
) []projectstate.AppDefinitionValidationIssue {
	if len(issues) == 0 {
		return []projectstate.AppDefinitionValidationIssue{}
	}

	converted := make([]projectstate.AppDefinitionValidationIssue, 0, len(issues))
	for _, issue := range issues {
		converted = append(converted, projectstate.AppDefinitionValidationIssue{
			Message:     issue.Message,
			ElementKey:  issue.ElementKey,
			ElementType: issue.ElementType,
		})
	}
	return converted
}

func projectstateValidationCapabilities(
	capabilities appspec.AppCapabilities,
) projectstate.AppDefinitionCapabilities {
	features := make(map[string]bool, len(capabilities.Features))
	for key, enabled := range capabilities.Features {
		features[key] = enabled
	}
	return projectstate.AppDefinitionCapabilities{
		CatalogID:          capabilities.CatalogID,
		CatalogVersion:     capabilities.CatalogVersion,
		AppSpecVersion:     capabilities.AppSpecVersion,
		ThemeSchemaVersion: capabilities.ThemeSchemaVersion,
		Features:           features,
	}
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
