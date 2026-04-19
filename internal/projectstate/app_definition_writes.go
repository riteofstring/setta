package projectstate

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"

	"setta/internal/appspec"
)

const defaultAppSpecVersion = "v1"

var (
	ErrAppSpecStoreUnsupported = errors.New("app spec persistence requires a persisted project store")
	ErrAppSpecPathUnconfigured = errors.New("app spec path is not configured for this project")
	ErrAppSpecNotFound         = errors.New("app spec not found for this project")
)

type SetAppDefinitionInput struct {
	AppSpec        any
	AppSpecPath    *string
	AppSpecVersion *string
	CatalogID      *string
	Routes         *[]AppRoute
	DataBindings   *map[string]any
	Actions        *map[string]any
	Theme          *map[string]any
	Assets         *[]any
}

type AppDefinitionMutationResult struct {
	AppSpec       any            `json:"appSpec"`
	AppDefinition *AppDefinition `json:"appDefinition,omitempty"`
}

func (d *Document) SetAppDefinition(input SetAppDefinitionInput, normalizedAppSpecPath string) (AppDefinitionMutationResult, error) {
	if d == nil {
		return AppDefinitionMutationResult{}, ErrProjectNotFound
	}

	current := effectiveAppDefinition(*d)
	updated, err := applySetAppDefinitionInput(current, input, normalizedAppSpecPath)
	if err != nil {
		return AppDefinitionMutationResult{}, err
	}

	validationDefinition, err := appspecDefinition(updated)
	if err != nil {
		return AppDefinitionMutationResult{}, err
	}
	if err := appspec.ValidatePersistedWrite(input.AppSpec, validationDefinition); err != nil {
		return AppDefinitionMutationResult{}, err
	}

	d.AppDefinition = cloneAppDefinitionPointer(&updated)
	return AppDefinitionMutationResult{
		AppSpec:       cloneJSONValue(input.AppSpec),
		AppDefinition: cloneAppDefinitionPointer(d.AppDefinition),
	}, nil
}

func (d *Document) UpdateAppDefinition(patch any, appSpec any) (AppDefinitionMutationResult, error) {
	if d == nil {
		return AppDefinitionMutationResult{}, ErrProjectNotFound
	}
	if d.AppDefinition == nil || strings.TrimSpace(d.AppDefinition.AppSpecPath) == "" {
		return AppDefinitionMutationResult{}, ErrAppSpecPathUnconfigured
	}

	current := effectiveAppDefinition(*d)
	validationDefinition, err := appspecDefinition(current)
	if err != nil {
		return AppDefinitionMutationResult{}, err
	}
	merged := applyJSONMergePatch(appSpec, patch)
	if err := appspec.ValidatePersistedWrite(merged, validationDefinition); err != nil {
		return AppDefinitionMutationResult{}, err
	}

	// Keep the current metadata source of truth, but materialize defaulted fields.
	d.AppDefinition = cloneAppDefinitionPointer(&current)
	return AppDefinitionMutationResult{
		AppSpec:       cloneJSONValue(merged),
		AppDefinition: cloneAppDefinitionPointer(d.AppDefinition),
	}, nil
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

func applySetAppDefinitionInput(current AppDefinition, input SetAppDefinitionInput, normalizedAppSpecPath string) (AppDefinition, error) {
	updated := current.Clone()
	updated.AppSpecPath = normalizedAppSpecPath
	applyOptionalAppDefinitionMetadata(&updated, appDefinitionOptionalMetadata{
		AppSpecVersion: input.AppSpecVersion,
		CatalogID:      input.CatalogID,
		Routes:         input.Routes,
	})
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

	return updated, nil
}

func effectiveAppDefinition(document Document) AppDefinition {
	if document.AppDefinition == nil {
		return AppDefinition{
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

func marshalAppDefinitionRawJSON(value any, field string) (RawJSON, error) {
	if value == nil {
		return nil, nil
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("marshal %s: %w", field, err)
	}
	return normalizeRawJSON(encoded, field)
}

func decodeRawJSONObject(raw RawJSON, field string) (map[string]any, error) {
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

func decodeAppDefinitionJSONObject(raw RawJSON, field string) (map[string]any, error) {
	return decodeRawJSONObject(raw, field)
}

func decodeAppDefinitionJSONArray(raw RawJSON, field string) ([]any, error) {
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
