package appdefinition

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"

	"setta/internal/appsubsystem/appspec"
	"setta/internal/projectstate"
)

const defaultAppSpecVersion = "v1"
const defaultAppThemeMode = "auto"

type AppDefinitionService struct {
	runtime      *projectstate.Runtime
	storage      DocumentStorage
	appSpecStore appspec.Store
}

var _ Runtime = (*AppDefinitionService)(nil)

func NewAppDefinitionService(runtime *projectstate.Runtime, pluginID string) Runtime {
	if runtime == nil {
		return nil
	}
	return &AppDefinitionService{
		runtime:      runtime,
		storage:      MustStorageForPlugin(pluginID),
		appSpecStore: appspec.MustForPlugin(pluginID),
	}
}

func (s *AppDefinitionService) GetAppDefinition(
	ctx context.Context,
) (ReadResult, error) {
	_ = ctx
	if s == nil || s.runtime == nil {
		return ReadResult{}, projectstate.ErrRuntimeClosed
	}

	snapshot := s.runtime.Snapshot()
	appDefinition, err := DecodeStoredAppDefinition(
		s.storage.StoredDocumentAppDefinitionRaw(snapshot.Document),
	)
	if err != nil {
		return ReadResult{}, err
	}
	result := ReadResult{AppDefinition: appDefinition}
	if result.AppDefinition == nil || strings.TrimSpace(result.AppDefinition.AppSpecPath) == "" {
		return result, nil
	}

	projectRoot, err := s.runtime.ProjectRoot()
	if err != nil {
		return ReadResult{}, err
	}
	appSpec, err := s.appSpecStore.Read(projectRoot, result.AppDefinition.AppSpecPath)
	if err != nil {
		return ReadResult{}, err
	}
	result.AppSpec = cloneJSONValue(appSpec)
	return result, nil
}

func (s *AppDefinitionService) GetEffectiveAppDefinition(
	ctx context.Context,
) (AppDefinition, error) {
	_ = ctx
	if s == nil || s.runtime == nil {
		return AppDefinition{}, projectstate.ErrRuntimeClosed
	}
	return effectiveAppDefinitionWithStorage(s.runtime.Snapshot().Document, s.storage)
}

func (s *AppDefinitionService) GetEffectiveAppSpecPath(
	ctx context.Context,
) (string, error) {
	_ = ctx
	if s == nil || s.runtime == nil {
		return "", projectstate.ErrRuntimeClosed
	}
	return effectiveAppSpecPathWithStore(
		s.runtime.Snapshot().Document,
		s.storage,
		s.appSpecStore,
	)
}

func (s *AppDefinitionService) GetEffectiveAppThemeMode(
	ctx context.Context,
) (string, error) {
	_ = ctx
	if s == nil || s.runtime == nil {
		return "", projectstate.ErrRuntimeClosed
	}
	return effectiveAppThemeModeWithStorage(s.runtime.Snapshot().Document, s.storage)
}

func (s *AppDefinitionService) ValidateAppDefinition(
	ctx context.Context,
	input ValidateInput,
) (ValidationResult, error) {
	_ = ctx
	if s == nil || s.runtime == nil {
		return ValidationResult{}, projectstate.ErrRuntimeClosed
	}

	current, err := effectiveAppDefinitionWithStorage(s.runtime.Snapshot().Document, s.storage)
	if err != nil {
		return ValidationResult{}, err
	}
	updated, err := applyValidateAppDefinitionInput(current, input)
	if err != nil {
		return ValidationResult{}, err
	}

	validationDefinition, err := appspecDefinition(updated)
	if err != nil {
		return ValidationResult{}, err
	}
	validationErrors, warnings := appspec.ValidateDefinitionPayload(input.AppSpec, validationDefinition)
	if validationErrors == nil {
		validationErrors = []appspec.AppValidationIssue{}
	}
	if warnings == nil {
		warnings = []appspec.AppValidationIssue{}
	}

	return ValidationResult{
		Errors:       validationIssues(validationErrors),
		Warnings:     validationIssues(warnings),
		Capabilities: validationCapabilities(appspec.BuildCapabilities(validationDefinition)),
	}, nil
}

func (s *AppDefinitionService) SetAppDefinition(
	ctx context.Context,
	input SetInput,
) (projectstate.Snapshot, MutationResult, error) {
	if s == nil || s.runtime == nil {
		return projectstate.Snapshot{}, MutationResult{}, projectstate.ErrRuntimeClosed
	}

	projectRoot, err := s.runtime.ProjectRoot()
	if err != nil {
		return projectstate.Snapshot{}, MutationResult{}, err
	}

	var nextAppSpec any
	snapshot, err := s.runtime.MutatePersistedWithContext(ctx, func(document projectstate.Document) (projectstate.PersistedMutationPlan, error) {
		plan, appSpec, err := buildSetAppDefinitionPlan(
			document,
			projectRoot,
			input,
			s.storage,
			s.appSpecStore,
		)
		nextAppSpec = appSpec
		return plan, err
	})
	if err != nil {
		return projectstate.Snapshot{}, MutationResult{}, err
	}

	appDefinitionResult, err := DecodeStoredAppDefinition(
		s.storage.StoredDocumentAppDefinitionRaw(snapshot.Document),
	)
	if err != nil {
		return projectstate.Snapshot{}, MutationResult{}, err
	}

	return snapshot, MutationResult{
		AppSpec:       cloneJSONValue(nextAppSpec),
		AppDefinition: appDefinitionResult,
	}, nil
}

func (s *AppDefinitionService) StreamAppDefinition(
	ctx context.Context,
	input StreamInput,
) (projectstate.Snapshot, MutationResult, error) {
	if s == nil || s.runtime == nil {
		return projectstate.Snapshot{}, MutationResult{}, projectstate.ErrRuntimeClosed
	}

	projectRoot, err := s.runtime.ProjectRoot()
	if err != nil {
		return projectstate.Snapshot{}, MutationResult{}, err
	}
	ops, err := parseStreamAppDefinitionPatches(input.Patches)
	if err != nil {
		return projectstate.Snapshot{}, MutationResult{}, err
	}

	var nextAppSpec any
	snapshot, err := s.runtime.MutatePersistedWithContext(ctx, func(document projectstate.Document) (projectstate.PersistedMutationPlan, error) {
		plan, appSpec, err := buildStreamAppDefinitionPlan(
			document,
			projectRoot,
			input,
			ops,
			s.storage,
			s.appSpecStore,
		)
		nextAppSpec = appSpec
		return plan, err
	})
	if err != nil {
		return projectstate.Snapshot{}, MutationResult{}, err
	}

	appDefinitionResult, err := DecodeStoredAppDefinition(
		s.storage.StoredDocumentAppDefinitionRaw(snapshot.Document),
	)
	if err != nil {
		return projectstate.Snapshot{}, MutationResult{}, err
	}

	return snapshot, MutationResult{
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
	input SetInput,
	storage DocumentStorage,
	appSpecStore appspec.Store,
) (projectstate.PersistedMutationPlan, any, error) {
	current, err := effectiveAppDefinitionWithStorage(document, storage)
	if err != nil {
		return projectstate.PersistedMutationPlan{}, nil, err
	}
	normalizedPath, err := resolveAppDefinitionTargetPath(
		projectRoot,
		current,
		input.AppSpecPath,
		appSpecStore,
	)
	if err != nil {
		return projectstate.PersistedMutationPlan{}, nil, err
	}
	previousAppSpec, err := appSpecStore.Read(projectRoot, normalizedPath)
	if err != nil {
		return projectstate.PersistedMutationPlan{}, nil, err
	}
	nextDocument, appSpec, err := setAppDefinitionDocument(
		document,
		input,
		normalizedPath,
		storage,
	)
	if err != nil {
		return projectstate.PersistedMutationPlan{}, nil, err
	}
	return projectstate.PersistedMutationPlan{
		NextDocument: nextDocument,
		ApplyExternalChanges: func() error {
			return appSpecStore.Write(projectRoot, normalizedPath, appSpec)
		},
		RollbackExternalChanges: func() error {
			return rollbackAppSpecWrite(projectRoot, normalizedPath, previousAppSpec, appSpecStore)
		},
	}, appSpec, nil
}

func buildStreamAppDefinitionPlan(
	document projectstate.Document,
	projectRoot string,
	input StreamInput,
	ops []appspec.PatchOp,
	storage DocumentStorage,
	appSpecStore appspec.Store,
) (projectstate.PersistedMutationPlan, any, error) {
	current, err := effectiveAppDefinitionWithStorage(document, storage)
	if err != nil {
		return projectstate.PersistedMutationPlan{}, nil, err
	}
	baseSpec, err := resolveStreamAppDefinitionBaseSpec(
		projectRoot,
		current,
		input.BaseAppSpec,
		appSpecStore,
	)
	if err != nil {
		return projectstate.PersistedMutationPlan{}, nil, err
	}
	appSpec, err := appspec.ApplyPatchOps(ops, baseSpec)
	if err != nil {
		return projectstate.PersistedMutationPlan{}, nil, newAppSpecPatchInvalidError(err)
	}
	targetPath, err := resolveAppDefinitionTargetPath(
		projectRoot,
		current,
		input.AppSpecPath,
		appSpecStore,
	)
	if err != nil {
		return projectstate.PersistedMutationPlan{}, nil, err
	}
	previousAppSpec, err := appSpecStore.Read(projectRoot, targetPath)
	if err != nil {
		return projectstate.PersistedMutationPlan{}, nil, err
	}
	nextDocument, nextSpec, err := setAppDefinitionDocument(document, SetInput{
		AppSpec:     appSpec,
		AppSpecPath: input.AppSpecPath,
	}, targetPath, storage)
	if err != nil {
		return projectstate.PersistedMutationPlan{}, nil, err
	}
	return projectstate.PersistedMutationPlan{
		NextDocument: nextDocument,
		ApplyExternalChanges: func() error {
			return appSpecStore.Write(projectRoot, targetPath, nextSpec)
		},
		RollbackExternalChanges: func() error {
			return rollbackAppSpecWrite(projectRoot, targetPath, previousAppSpec, appSpecStore)
		},
	}, nextSpec, nil
}

func (s *AppDefinitionService) UpdateAppDefinition(
	ctx context.Context,
	patch any,
) (projectstate.Snapshot, MutationResult, error) {
	if s == nil || s.runtime == nil {
		return projectstate.Snapshot{}, MutationResult{}, projectstate.ErrRuntimeClosed
	}

	projectRoot, err := s.runtime.ProjectRoot()
	if err != nil {
		return projectstate.Snapshot{}, MutationResult{}, err
	}

	var nextAppSpec any
	snapshot, err := s.runtime.MutatePersistedWithContext(ctx, func(document projectstate.Document) (projectstate.PersistedMutationPlan, error) {
		plan, appSpec, err := buildUpdateAppDefinitionPlan(
			document,
			projectRoot,
			patch,
			s.storage,
			s.appSpecStore,
		)
		nextAppSpec = appSpec
		return plan, err
	})
	if err != nil {
		return projectstate.Snapshot{}, MutationResult{}, err
	}

	appDefinitionResult, err := DecodeStoredAppDefinition(
		s.storage.StoredDocumentAppDefinitionRaw(snapshot.Document),
	)
	if err != nil {
		return projectstate.Snapshot{}, MutationResult{}, err
	}

	return snapshot, MutationResult{
		AppSpec:       cloneJSONValue(nextAppSpec),
		AppDefinition: appDefinitionResult,
	}, nil
}

func buildUpdateAppDefinitionPlan(
	document projectstate.Document,
	projectRoot string,
	patch any,
	storage DocumentStorage,
	appSpecStore appspec.Store,
) (projectstate.PersistedMutationPlan, any, error) {
	current, err := DecodeStoredAppDefinition(storage.StoredDocumentAppDefinitionRaw(document))
	if err != nil {
		return projectstate.PersistedMutationPlan{}, nil, err
	}
	if current == nil || strings.TrimSpace(current.AppSpecPath) == "" {
		return projectstate.PersistedMutationPlan{}, nil, ErrAppSpecPathUnconfigured
	}

	appSpecPath := current.AppSpecPath
	existing, err := appSpecStore.Read(projectRoot, appSpecPath)
	if err != nil {
		return projectstate.PersistedMutationPlan{}, nil, err
	}
	if existing == nil {
		return projectstate.PersistedMutationPlan{}, nil, ErrAppSpecNotFound
	}

	nextDocument, appSpec, err := updateAppDefinitionDocument(
		document,
		patch,
		existing,
		storage,
	)
	if err != nil {
		return projectstate.PersistedMutationPlan{}, nil, err
	}

	return projectstate.PersistedMutationPlan{
		NextDocument: nextDocument,
		ApplyExternalChanges: func() error {
			return appSpecStore.Write(projectRoot, appSpecPath, appSpec)
		},
		RollbackExternalChanges: func() error {
			return rollbackAppSpecWrite(projectRoot, appSpecPath, existing, appSpecStore)
		},
	}, appSpec, nil
}

type appSpecPatchInvalidError struct {
	cause error
}

func (e *appSpecPatchInvalidError) Error() string {
	if e == nil || e.cause == nil {
		return ErrAppSpecPatchInvalid.Error()
	}
	return e.cause.Error()
}

func (e *appSpecPatchInvalidError) Unwrap() error {
	return ErrAppSpecPatchInvalid
}

func newAppSpecPatchInvalidError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, ErrAppSpecPatchInvalid) {
		return err
	}
	return &appSpecPatchInvalidError{cause: err}
}

func setAppDefinitionDocument(
	document projectstate.Document,
	input SetInput,
	normalizedAppSpecPath string,
	storage DocumentStorage,
) (projectstate.Document, any, error) {
	current, err := effectiveAppDefinitionWithStorage(document, storage)
	if err != nil {
		return projectstate.Document{}, nil, err
	}
	updated, err := applySetAppDefinitionInput(current, input, normalizedAppSpecPath)
	if err != nil {
		return projectstate.Document{}, nil, err
	}

	appSpec := cloneJSONValue(input.AppSpec)
	if err := ValidatePersistedAppDefinitionWrite(updated, appSpec); err != nil {
		return projectstate.Document{}, nil, err
	}

	encodedDefinition, err := EncodeStoredAppDefinition(&updated)
	if err != nil {
		return projectstate.Document{}, nil, err
	}
	nextDocument := storage.WithStoredDocumentAppDefinition(document, encodedDefinition)
	return nextDocument, appSpec, nil
}

func updateAppDefinitionDocument(
	document projectstate.Document,
	patch any,
	existing any,
	storage DocumentStorage,
) (projectstate.Document, any, error) {
	current, err := effectiveAppDefinitionWithStorage(document, storage)
	if err != nil {
		return projectstate.Document{}, nil, err
	}
	merged := applyJSONMergePatch(existing, patch)
	if err := ValidatePersistedAppDefinitionWrite(current, merged); err != nil {
		return projectstate.Document{}, nil, err
	}

	encodedDefinition, err := EncodeStoredAppDefinition(&current)
	if err != nil {
		return projectstate.Document{}, nil, err
	}
	nextDocument := storage.WithStoredDocumentAppDefinition(document, encodedDefinition)
	return nextDocument, merged, nil
}

func resolveAppDefinitionTargetPath(
	projectRoot string,
	current AppDefinition,
	inputAppSpecPath *string,
	appSpecStore appspec.Store,
) (string, error) {
	targetPath := appSpecStore.DefaultPath()
	if trimmed := strings.TrimSpace(current.AppSpecPath); trimmed != "" {
		targetPath = trimmed
	}
	if inputAppSpecPath != nil && strings.TrimSpace(*inputAppSpecPath) != "" {
		targetPath = *inputAppSpecPath
	}
	return appSpecStore.NormalizePath(projectRoot, targetPath)
}

func resolveStreamAppDefinitionBaseSpec(
	projectRoot string,
	current AppDefinition,
	baseAppSpec *map[string]any,
	appSpecStore appspec.Store,
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

	stored, err := appSpecStore.Read(projectRoot, current.AppSpecPath)
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
	current AppDefinition,
	input ValidateInput,
) (AppDefinition, error) {
	updated := current.Clone()
	applyOptionalAppDefinitionMetadata(&updated, input.AppSpecVersion, input.CatalogID, input.Routes)
	if err := applyOptionalAppDefinitionJSONField(&updated.DataBindings, input.DataBindings, "appDefinition.dataBindings"); err != nil {
		return AppDefinition{}, err
	}
	if err := applyOptionalAppDefinitionJSONField(&updated.Actions, input.Actions, "appDefinition.actions"); err != nil {
		return AppDefinition{}, err
	}
	if err := applyOptionalAppDefinitionJSONField(&updated.Theme, input.Theme, "appDefinition.theme"); err != nil {
		return AppDefinition{}, err
	}
	if err := applyOptionalAppDefinitionJSONField(&updated.Assets, input.Assets, "appDefinition.assets"); err != nil {
		return AppDefinition{}, err
	}
	return normalizeAppDefinition(updated)
}

func applySetAppDefinitionInput(
	current AppDefinition,
	input SetInput,
	normalizedAppSpecPath string,
) (AppDefinition, error) {
	updated := current.Clone()
	updated.AppSpecPath = normalizedAppSpecPath
	applyOptionalAppDefinitionMetadata(&updated, input.AppSpecVersion, input.CatalogID, input.Routes)
	if err := applyOptionalAppDefinitionJSONField(&updated.DataBindings, input.DataBindings, "appDefinition.dataBindings"); err != nil {
		return AppDefinition{}, err
	}
	if err := applyOptionalAppDefinitionJSONField(&updated.Actions, input.Actions, "appDefinition.actions"); err != nil {
		return AppDefinition{}, err
	}
	if err := applyOptionalAppDefinitionJSONField(&updated.Theme, input.Theme, "appDefinition.theme"); err != nil {
		return AppDefinition{}, err
	}
	if err := applyOptionalAppDefinitionJSONField(&updated.Assets, input.Assets, "appDefinition.assets"); err != nil {
		return AppDefinition{}, err
	}
	return normalizeAppDefinition(updated)
}

func applyOptionalAppDefinitionMetadata(
	definition *AppDefinition,
	appSpecVersion *string,
	catalogID *string,
	routes *[]AppRoute,
) {
	if appSpecVersion != nil {
		definition.AppSpecVersion = *appSpecVersion
	}
	if catalogID != nil {
		definition.CatalogID = *catalogID
	}
	if routes != nil {
		definition.Routes = append([]AppRoute(nil), (*routes)...)
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

func appspecDefinition(definition AppDefinition) (appspec.Definition, error) {
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

func ValidatePersistedAppDefinitionWrite(definition AppDefinition, appSpec any) error {
	validationDefinition, err := appspecDefinition(definition)
	if err != nil {
		return err
	}
	return appspec.ValidatePersistedWrite(appSpec, validationDefinition)
}

func validationIssues(
	issues []appspec.AppValidationIssue,
) []ValidationIssue {
	if len(issues) == 0 {
		return []ValidationIssue{}
	}

	converted := make([]ValidationIssue, 0, len(issues))
	for _, issue := range issues {
		converted = append(converted, ValidationIssue{
			Message:     issue.Message,
			ElementKey:  issue.ElementKey,
			ElementType: issue.ElementType,
		})
	}
	return converted
}

func validationCapabilities(
	capabilities appspec.AppCapabilities,
) Capabilities {
	features := make(map[string]bool, len(capabilities.Features))
	for key, enabled := range capabilities.Features {
		features[key] = enabled
	}
	return Capabilities{
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

func cloneAppDefinitionPointer(appDefinition *AppDefinition) *AppDefinition {
	if appDefinition == nil {
		return nil
	}
	cloned := appDefinition.Clone()
	return &cloned
}

func rollbackAppSpecWrite(
	projectRoot string,
	appSpecPath string,
	previousAppSpec any,
	appSpecStore appspec.Store,
) error {
	if previousAppSpec != nil {
		return appSpecStore.Write(projectRoot, appSpecPath, previousAppSpec)
	}

	resolvedPath, err := appSpecStore.ResolvePath(projectRoot, appSpecPath)
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
