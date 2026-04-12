package projectstate

import (
	"context"
	"errors"
	"reflect"
	"strings"

	"setta/internal/appspec"
)

const defaultAppThemeMode = "auto"

func DefaultAppSpecVersion() string {
	return defaultAppSpecVersion
}

func DefaultAppThemeMode() string {
	return defaultAppThemeMode
}

func EffectiveAppDefinition(document Document) AppDefinition {
	return effectiveAppDefinition(document)
}

func EffectiveAppSpecPath(document Document) string {
	return effectiveAppSpecPath(document)
}

func EffectiveAppThemeMode(document Document) string {
	return effectiveAppThemeMode(document)
}

func (r *Runtime) CompareAndSetAppDefinitionCatalogID(
	ctx context.Context,
	catalogID string,
	expectedOldValue *string,
) (Snapshot, CompareAndSetResult[string], error) {
	projectRoot, err := r.projectRoot()
	if err != nil {
		return Snapshot{}, CompareAndSetResult[string]{}, err
	}
	return compareAndSetAppDefinitionStringSetting(
		r,
		ctx,
		projectRoot,
		"core.app.catalog_id",
		expectedOldValue,
		catalogID,
		func(document Document) string {
			return effectiveAppDefinition(document).CatalogID
		},
		func(document Document, projectRoot string) (Document, any, string, error) {
			current := effectiveAppDefinition(document)
			normalizedPath, currentAppSpec, err := resolveCurrentAppSpecForMetadataUpdate(projectRoot, current)
			if err != nil {
				return Document{}, nil, "", err
			}
			current.AppSpecPath = normalizedPath
			current.CatalogID = catalogID
			_, err = document.SetAppDefinition(SetAppDefinitionInput{
				AppSpec:        currentAppSpec,
				AppSpecPath:    &normalizedPath,
				AppSpecVersion: &current.AppSpecVersion,
				CatalogID:      &current.CatalogID,
				Routes:         &current.Routes,
			}, normalizedPath)
			if err != nil {
				return Document{}, nil, "", err
			}
			return document, currentAppSpec, normalizedPath, nil
		},
	)
}

func (r *Runtime) CompareAndSetAppDefinitionSpecVersion(
	ctx context.Context,
	appSpecVersion string,
	expectedOldValue *string,
) (Snapshot, CompareAndSetResult[string], error) {
	projectRoot, err := r.projectRoot()
	if err != nil {
		return Snapshot{}, CompareAndSetResult[string]{}, err
	}
	return compareAndSetAppDefinitionStringSetting(
		r,
		ctx,
		projectRoot,
		"core.app.spec_version",
		expectedOldValue,
		appSpecVersion,
		func(document Document) string {
			return effectiveAppDefinition(document).AppSpecVersion
		},
		func(document Document, projectRoot string) (Document, any, string, error) {
			current := effectiveAppDefinition(document)
			normalizedPath, currentAppSpec, err := resolveCurrentAppSpecForMetadataUpdate(projectRoot, current)
			if err != nil {
				return Document{}, nil, "", err
			}
			current.AppSpecPath = normalizedPath
			current.AppSpecVersion = appSpecVersion
			_, err = document.SetAppDefinition(SetAppDefinitionInput{
				AppSpec:        currentAppSpec,
				AppSpecPath:    &normalizedPath,
				AppSpecVersion: &current.AppSpecVersion,
				CatalogID:      &current.CatalogID,
				Routes:         &current.Routes,
			}, normalizedPath)
			if err != nil {
				return Document{}, nil, "", err
			}
			return document, currentAppSpec, normalizedPath, nil
		},
	)
}

func (r *Runtime) CompareAndSetAppDefinitionSpecPath(
	ctx context.Context,
	appSpecPath string,
	expectedOldValue *string,
) (Snapshot, CompareAndSetResult[string], error) {
	projectRoot, err := r.projectRoot()
	if err != nil {
		return Snapshot{}, CompareAndSetResult[string]{}, err
	}
	normalizedPath, err := appspec.NormalizePath(projectRoot, appSpecPath)
	if err != nil {
		return Snapshot{}, CompareAndSetResult[string]{}, err
	}
	return compareAndSetAppDefinitionStringSetting(
		r,
		ctx,
		projectRoot,
		"core.app.spec_path",
		expectedOldValue,
		normalizedPath,
		func(document Document) string {
			return effectiveAppSpecPath(document)
		},
		func(document Document, projectRoot string) (Document, any, string, error) {
			current := effectiveAppDefinition(document)
			normalizedPath, err := appspec.NormalizePath(projectRoot, appSpecPath)
			if err != nil {
				return Document{}, nil, "", err
			}
			_, currentAppSpec, err := resolveCurrentAppSpecForMetadataUpdate(projectRoot, current)
			if err != nil {
				return Document{}, nil, "", err
			}
			current.AppSpecPath = normalizedPath
			_, err = document.SetAppDefinition(SetAppDefinitionInput{
				AppSpec:        currentAppSpec,
				AppSpecPath:    &normalizedPath,
				AppSpecVersion: &current.AppSpecVersion,
				CatalogID:      &current.CatalogID,
				Routes:         &current.Routes,
			}, normalizedPath)
			if err != nil {
				return Document{}, nil, "", err
			}
			return document, currentAppSpec, normalizedPath, nil
		},
	)
}

func (r *Runtime) CompareAndSetAppDefinitionThemeMode(
	ctx context.Context,
	themeMode string,
	expectedOldValue *string,
) (Snapshot, CompareAndSetResult[string], error) {
	projectRoot, err := r.projectRoot()
	if err != nil {
		return Snapshot{}, CompareAndSetResult[string]{}, err
	}
	return compareAndSetAppDefinitionStringSetting(
		r,
		ctx,
		projectRoot,
		"core.app.theme_mode",
		expectedOldValue,
		themeMode,
		func(document Document) string {
			return effectiveAppThemeMode(document)
		},
		func(document Document, projectRoot string) (Document, any, string, error) {
			current := effectiveAppDefinition(document)
			normalizedPath, currentAppSpec, err := resolveCurrentAppSpecForMetadataUpdate(projectRoot, current)
			if err != nil {
				return Document{}, nil, "", err
			}
			theme, err := decodeAppDefinitionJSONObject(current.Theme, "appDefinition.theme")
			if err != nil {
				return Document{}, nil, "", err
			}
			if theme == nil {
				theme = map[string]any{}
			}
			theme["mode"] = themeMode
			current.AppSpecPath = normalizedPath
			_, err = document.SetAppDefinition(SetAppDefinitionInput{
				AppSpec:        currentAppSpec,
				AppSpecPath:    &normalizedPath,
				AppSpecVersion: &current.AppSpecVersion,
				CatalogID:      &current.CatalogID,
				Routes:         &current.Routes,
				DataBindings:   cloneJSONObjectPointerFromRawJSON(current.DataBindings),
				Actions:        cloneJSONObjectPointerFromRawJSON(current.Actions),
				Theme:          &theme,
				Assets:         cloneJSONArrayPointerFromRawJSON(current.Assets),
			}, normalizedPath)
			if err != nil {
				return Document{}, nil, "", err
			}
			return document, currentAppSpec, normalizedPath, nil
		},
	)
}

func compareAndSetAppDefinitionStringSetting(
	r *Runtime,
	ctx context.Context,
	projectRoot string,
	settingID string,
	expectedOldValue *string,
	requestedNewValue string,
	readValue func(Document) string,
	mutate func(Document, string) (Document, any, string, error),
) (Snapshot, CompareAndSetResult[string], error) {
	if r == nil {
		return Snapshot{}, CompareAndSetResult[string]{}, ErrRuntimeClosed
	}
	if readValue == nil || mutate == nil {
		return Snapshot{}, CompareAndSetResult[string]{}, ErrMutationMissing
	}

	var result CompareAndSetResult[string]
	snapshot, err := r.submit(operation{
		frontendOpID: frontendOpIDFromContext(ctx),
		run: func(state *runtimeState) (Snapshot, error) {
			nextSnapshot, nextResult, err := runCompareAndSetAppDefinitionStringSetting(
				r,
				ctx,
				projectRoot,
				state,
				settingID,
				expectedOldValue,
				requestedNewValue,
				readValue,
				mutate,
			)
			if err != nil {
				return nextSnapshot, err
			}
			result = nextResult
			return nextSnapshot, nil
		},
	})
	return snapshot, result, err
}

func runCompareAndSetAppDefinitionStringSetting(
	r *Runtime,
	ctx context.Context,
	projectRoot string,
	state *runtimeState,
	settingID string,
	expectedOldValue *string,
	requestedNewValue string,
	readValue func(Document) string,
	mutate func(Document, string) (Document, any, string, error),
) (Snapshot, CompareAndSetResult[string], error) {
	currentSnapshot := snapshotFromState(*state)
	oldValue := readValue(state.current)
	if err := assertUISettingExpectedOldValueMatches(settingID, optionalStringAny(expectedOldValue), oldValue); err != nil {
		return currentSnapshot, CompareAndSetResult[string]{}, err
	}
	if oldValue == requestedNewValue {
		return currentSnapshot, CompareAndSetResult[string]{
			OldValue: oldValue,
			NewValue: oldValue,
		}, nil
	}

	nextDocument, nextAppSpec, appSpecPath, err := mutate(state.current.Clone(), projectRoot)
	if err != nil {
		return currentSnapshot, CompareAndSetResult[string]{}, err
	}
	nextState, nextSnapshot, err := nextAppDefinitionRuntimeState(state.current, state.revision, nextDocument)
	if err != nil {
		return currentSnapshot, CompareAndSetResult[string]{}, err
	}
	if err := persistAppDefinitionMutationSnapshot(r, ctx, projectRoot, appSpecPath, nextAppSpec, nextSnapshot); err != nil {
		return currentSnapshot, CompareAndSetResult[string]{}, err
	}

	*state = nextState
	return nextSnapshot, CompareAndSetResult[string]{
		OldValue: oldValue,
		NewValue: readValue(nextSnapshot.Document),
	}, nil
}

func nextAppDefinitionRuntimeState(current Document, revision uint64, nextDocument Document) (runtimeState, Snapshot, error) {
	normalized, err := nextDocument.Normalized()
	if err != nil {
		return runtimeState{}, Snapshot{}, err
	}

	nextState := runtimeState{
		current:  current.Clone(),
		revision: revision,
	}
	if !reflect.DeepEqual(current, normalized) {
		nextState.current = normalized.Clone()
		nextState.revision++
	}
	return nextState, snapshotFromState(nextState), nil
}

func persistAppDefinitionMutationSnapshot(
	r *Runtime,
	ctx context.Context,
	projectRoot string,
	appSpecPath string,
	nextAppSpec any,
	nextSnapshot Snapshot,
) error {
	previousAppSpec, err := appspec.Read(projectRoot, appSpecPath)
	if err != nil {
		return err
	}
	if err := appspec.Write(projectRoot, appSpecPath, nextAppSpec); err != nil {
		return err
	}
	if err := r.persistSnapshot(ctx, nextSnapshot); err != nil {
		return rollbackAppDefinitionMutationSnapshot(projectRoot, appSpecPath, previousAppSpec, err)
	}
	return nil
}

func rollbackAppDefinitionMutationSnapshot(
	projectRoot string,
	appSpecPath string,
	previousAppSpec any,
	persistErr error,
) error {
	rollbackErr := rollbackAppSpecWrite(projectRoot, appSpecPath, previousAppSpec)
	if rollbackErr != nil {
		return errors.Join(persistErr, rollbackErr)
	}
	return persistErr
}

func resolveCurrentAppSpecForMetadataUpdate(projectRoot string, appDefinition AppDefinition) (string, any, error) {
	targetPath := appDefinition.AppSpecPath
	if strings.TrimSpace(targetPath) == "" {
		targetPath = appspec.DefaultPath()
	}
	normalizedPath, err := appspec.NormalizePath(projectRoot, targetPath)
	if err != nil {
		return "", nil, err
	}

	currentAppSpec, err := appspec.Read(projectRoot, normalizedPath)
	if err != nil {
		return "", nil, err
	}
	if currentAppSpec == nil {
		currentAppSpec = defaultMinimalAppSpec()
	}
	return normalizedPath, currentAppSpec, nil
}

func defaultMinimalAppSpec() any {
	return map[string]any{
		"key":      "root",
		"type":     "Stack",
		"props":    map[string]any{},
		"children": []any{},
	}
}

func effectiveAppSpecPath(document Document) string {
	current := effectiveAppDefinition(document)
	if trimmed := strings.TrimSpace(current.AppSpecPath); trimmed != "" {
		return trimmed
	}
	return appspec.DefaultPath()
}

func effectiveAppThemeMode(document Document) string {
	current := effectiveAppDefinition(document)
	theme, err := decodeAppDefinitionJSONObject(current.Theme, "appDefinition.theme")
	if err != nil || theme == nil {
		return defaultAppThemeMode
	}
	if mode, ok := theme["mode"].(string); ok && strings.TrimSpace(mode) != "" {
		return mode
	}
	return defaultAppThemeMode
}

func cloneJSONObjectPointerFromRawJSON(raw RawJSON) *map[string]any {
	value, err := decodeAppDefinitionJSONObject(raw, "appDefinition.raw")
	if err != nil || value == nil {
		return nil
	}
	cloned := cloneJSONValue(value).(map[string]any)
	return &cloned
}

func cloneJSONArrayPointerFromRawJSON(raw RawJSON) *[]any {
	value, err := decodeAppDefinitionJSONArray(raw, "appDefinition.raw")
	if err != nil || value == nil {
		return nil
	}
	cloned := cloneJSONValue(value).([]any)
	return &cloned
}

func optionalStringAny(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}
