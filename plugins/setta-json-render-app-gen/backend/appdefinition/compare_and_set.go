package appdefinition

import (
	"context"
	"reflect"
	"strings"

	"setta/internal/projectstate"
	"setta/plugins/setta-json-render-app-gen/backend/appspec"
)

func (s *AppDefinitionService) projectRoot() (string, error) {
	if s == nil || s.runtime == nil {
		return "", projectstate.ErrRuntimeClosed
	}
	return s.runtime.ProjectRoot()
}

func (s *AppDefinitionService) CompareAndSetAppDefinitionCatalogID(
	ctx context.Context,
	catalogID string,
	expectedOldValue *string,
) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error) {
	projectRoot, err := s.projectRoot()
	if err != nil {
		return projectstate.Snapshot{}, projectstate.CompareAndSetResult[string]{}, err
	}
	return s.compareAndSetAppDefinitionStringSetting(
		ctx,
		projectRoot,
		"core.app.catalog_id",
		expectedOldValue,
		catalogID,
		func(document projectstate.Document) string {
			return effectiveAppDefinition(document).CatalogID
		},
		func(document projectstate.Document, projectRoot string) (projectstate.Document, any, string, error) {
			current := effectiveAppDefinition(document)
			normalizedPath, currentAppSpec, err := resolveCurrentAppSpecForMetadataUpdate(projectRoot, current)
			if err != nil {
				return projectstate.Document{}, nil, "", err
			}
			current.AppSpecPath = normalizedPath
			current.CatalogID = catalogID
			nextDocument, nextAppSpec, err := setAppDefinitionDocument(document, projectstate.SetAppDefinitionInput{
				AppSpec:        currentAppSpec,
				AppSpecPath:    &normalizedPath,
				AppSpecVersion: &current.AppSpecVersion,
				CatalogID:      &current.CatalogID,
				Routes:         &current.Routes,
			}, normalizedPath)
			return nextDocument, nextAppSpec, normalizedPath, err
		},
	)
}

func (s *AppDefinitionService) CompareAndSetAppDefinitionSpecVersion(
	ctx context.Context,
	appSpecVersion string,
	expectedOldValue *string,
) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error) {
	projectRoot, err := s.projectRoot()
	if err != nil {
		return projectstate.Snapshot{}, projectstate.CompareAndSetResult[string]{}, err
	}
	return s.compareAndSetAppDefinitionStringSetting(
		ctx,
		projectRoot,
		"core.app.spec_version",
		expectedOldValue,
		appSpecVersion,
		func(document projectstate.Document) string {
			return effectiveAppDefinition(document).AppSpecVersion
		},
		func(document projectstate.Document, projectRoot string) (projectstate.Document, any, string, error) {
			current := effectiveAppDefinition(document)
			normalizedPath, currentAppSpec, err := resolveCurrentAppSpecForMetadataUpdate(projectRoot, current)
			if err != nil {
				return projectstate.Document{}, nil, "", err
			}
			current.AppSpecPath = normalizedPath
			current.AppSpecVersion = appSpecVersion
			nextDocument, nextAppSpec, err := setAppDefinitionDocument(document, projectstate.SetAppDefinitionInput{
				AppSpec:        currentAppSpec,
				AppSpecPath:    &normalizedPath,
				AppSpecVersion: &current.AppSpecVersion,
				CatalogID:      &current.CatalogID,
				Routes:         &current.Routes,
			}, normalizedPath)
			return nextDocument, nextAppSpec, normalizedPath, err
		},
	)
}

func (s *AppDefinitionService) CompareAndSetAppDefinitionSpecPath(
	ctx context.Context,
	appSpecPath string,
	expectedOldValue *string,
) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error) {
	projectRoot, err := s.projectRoot()
	if err != nil {
		return projectstate.Snapshot{}, projectstate.CompareAndSetResult[string]{}, err
	}
	normalizedPath, err := appspec.NormalizePath(projectRoot, appSpecPath)
	if err != nil {
		return projectstate.Snapshot{}, projectstate.CompareAndSetResult[string]{}, err
	}
	return s.compareAndSetAppDefinitionStringSetting(
		ctx,
		projectRoot,
		"core.app.spec_path",
		expectedOldValue,
		normalizedPath,
		func(document projectstate.Document) string {
			return projectstate.EffectiveAppSpecPath(document)
		},
		func(document projectstate.Document, projectRoot string) (projectstate.Document, any, string, error) {
			current := effectiveAppDefinition(document)
			normalizedPath, err := appspec.NormalizePath(projectRoot, appSpecPath)
			if err != nil {
				return projectstate.Document{}, nil, "", err
			}
			_, currentAppSpec, err := resolveCurrentAppSpecForMetadataUpdate(projectRoot, current)
			if err != nil {
				return projectstate.Document{}, nil, "", err
			}
			current.AppSpecPath = normalizedPath
			nextDocument, nextAppSpec, err := setAppDefinitionDocument(document, projectstate.SetAppDefinitionInput{
				AppSpec:        currentAppSpec,
				AppSpecPath:    &normalizedPath,
				AppSpecVersion: &current.AppSpecVersion,
				CatalogID:      &current.CatalogID,
				Routes:         &current.Routes,
			}, normalizedPath)
			return nextDocument, nextAppSpec, normalizedPath, err
		},
	)
}

func (s *AppDefinitionService) CompareAndSetAppDefinitionThemeMode(
	ctx context.Context,
	themeMode string,
	expectedOldValue *string,
) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error) {
	projectRoot, err := s.projectRoot()
	if err != nil {
		return projectstate.Snapshot{}, projectstate.CompareAndSetResult[string]{}, err
	}
	return s.compareAndSetAppDefinitionStringSetting(
		ctx,
		projectRoot,
		"core.app.theme_mode",
		expectedOldValue,
		themeMode,
		func(document projectstate.Document) string {
			return projectstate.EffectiveAppThemeMode(document)
		},
		func(document projectstate.Document, projectRoot string) (projectstate.Document, any, string, error) {
			current := effectiveAppDefinition(document)
			normalizedPath, currentAppSpec, err := resolveCurrentAppSpecForMetadataUpdate(projectRoot, current)
			if err != nil {
				return projectstate.Document{}, nil, "", err
			}
			theme, err := decodeAppDefinitionJSONObject(current.Theme, "appDefinition.theme")
			if err != nil {
				return projectstate.Document{}, nil, "", err
			}
			if theme == nil {
				theme = map[string]any{}
			}
			theme["mode"] = themeMode
			current.AppSpecPath = normalizedPath
			nextDocument, nextAppSpec, err := setAppDefinitionDocument(document, projectstate.SetAppDefinitionInput{
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
			return nextDocument, nextAppSpec, normalizedPath, err
		},
	)
}

func (s *AppDefinitionService) compareAndSetAppDefinitionStringSetting(
	ctx context.Context,
	projectRoot string,
	settingID string,
	expectedOldValue *string,
	requestedNewValue string,
	readValue func(projectstate.Document) string,
	mutate func(projectstate.Document, string) (projectstate.Document, any, string, error),
) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error) {
	if s == nil || s.runtime == nil {
		return projectstate.Snapshot{}, projectstate.CompareAndSetResult[string]{}, projectstate.ErrRuntimeClosed
	}
	if readValue == nil || mutate == nil {
		return projectstate.Snapshot{}, projectstate.CompareAndSetResult[string]{}, projectstate.ErrMutationMissing
	}

	currentSnapshot := s.runtime.Snapshot()
	currentOldValue := readValue(currentSnapshot.Document)
	if err := assertAppDefinitionExpectedOldValueMatches(settingID, optionalStringAny(expectedOldValue), currentOldValue); err != nil {
		return currentSnapshot, projectstate.CompareAndSetResult[string]{}, err
	}
	if currentOldValue == requestedNewValue {
		return currentSnapshot, projectstate.CompareAndSetResult[string]{
			OldValue: currentOldValue,
			NewValue: currentOldValue,
		}, nil
	}

	var result projectstate.CompareAndSetResult[string]
	snapshot, err := s.runtime.MutatePersistedWithContext(ctx, func(document projectstate.Document) (projectstate.PersistedMutationPlan, error) {
		oldValue := readValue(document)
		if err := assertAppDefinitionExpectedOldValueMatches(settingID, optionalStringAny(expectedOldValue), oldValue); err != nil {
			return projectstate.PersistedMutationPlan{}, err
		}

		nextDocument, nextAppSpec, appSpecPath, err := mutate(document.Clone(), projectRoot)
		if err != nil {
			return projectstate.PersistedMutationPlan{}, err
		}
		previousAppSpec, err := appspec.Read(projectRoot, appSpecPath)
		if err != nil {
			return projectstate.PersistedMutationPlan{}, err
		}
		result = projectstate.CompareAndSetResult[string]{
			OldValue: oldValue,
			NewValue: readValue(nextDocument),
		}
		return projectstate.PersistedMutationPlan{
			NextDocument: nextDocument,
			ApplyExternalChanges: func() error {
				return appspec.Write(projectRoot, appSpecPath, nextAppSpec)
			},
			RollbackExternalChanges: func() error {
				return rollbackAppSpecWrite(projectRoot, appSpecPath, previousAppSpec)
			},
		}, nil
	})
	return snapshot, result, err
}

func assertAppDefinitionExpectedOldValueMatches(settingID string, expectedOldValue any, observedOldValue any) error {
	if expectedOldValue == nil {
		return nil
	}
	if reflect.DeepEqual(expectedOldValue, observedOldValue) {
		return nil
	}
	return &projectstate.ExpectedOldValueMismatchError{
		SettingID:        settingID,
		ExpectedOldValue: expectedOldValue,
		ObservedOldValue: observedOldValue,
	}
}

func resolveCurrentAppSpecForMetadataUpdate(projectRoot string, appDefinition projectstate.AppDefinition) (string, any, error) {
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

func cloneJSONObjectPointerFromRawJSON(raw projectstate.RawJSON) *map[string]any {
	value, err := decodeAppDefinitionJSONObject(raw, "appDefinition.raw")
	if err != nil || value == nil {
		return nil
	}
	cloned := cloneJSONValue(value).(map[string]any)
	return &cloned
}

func cloneJSONArrayPointerFromRawJSON(raw projectstate.RawJSON) *[]any {
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
