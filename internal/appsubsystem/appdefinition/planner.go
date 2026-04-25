package appdefinition

import (
	"fmt"

	"setta/internal/appsubsystem/appspec"
	"setta/internal/projectstate"
)

type MutationPlanner struct {
	storage      DocumentStorage
	appSpecStore appspec.Store
}

func NewMutationPlanner(pluginID string) (MutationPlanner, error) {
	storage, err := StorageForPlugin(pluginID)
	if err != nil {
		return MutationPlanner{}, err
	}
	appSpecStore, err := appspec.ForPlugin(pluginID)
	if err != nil {
		return MutationPlanner{}, err
	}
	return MutationPlanner{
		storage:      storage,
		appSpecStore: appSpecStore,
	}, nil
}

func (p MutationPlanner) PlanSetAppDefinition(
	document projectstate.Document,
	projectRoot string,
	input SetInput,
) (MutationResult, error) {
	plan, appSpec, err := buildSetAppDefinitionPlan(
		document,
		projectRoot,
		input,
		p.storage,
		p.appSpecStore,
	)
	if err != nil {
		return MutationResult{}, err
	}
	return mutationResultFromPlannedDocument(plan.NextDocument, appSpec, p.storage)
}

func (p MutationPlanner) PlanStreamAppDefinition(
	document projectstate.Document,
	projectRoot string,
	input StreamInput,
) (MutationResult, error) {
	ops, err := parseStreamAppDefinitionPatches(input.Patches)
	if err != nil {
		return MutationResult{}, err
	}
	plan, appSpec, err := buildStreamAppDefinitionPlan(
		document,
		projectRoot,
		input,
		ops,
		p.storage,
		p.appSpecStore,
	)
	if err != nil {
		return MutationResult{}, err
	}
	return mutationResultFromPlannedDocument(plan.NextDocument, appSpec, p.storage)
}

func (p MutationPlanner) PlanUpdateAppDefinition(
	document projectstate.Document,
	projectRoot string,
	patch any,
) (MutationResult, error) {
	plan, appSpec, err := buildUpdateAppDefinitionPlan(
		document,
		projectRoot,
		patch,
		p.storage,
		p.appSpecStore,
	)
	if err != nil {
		return MutationResult{}, err
	}
	return mutationResultFromPlannedDocument(plan.NextDocument, appSpec, p.storage)
}

func (p MutationPlanner) PlanCompareAndSetCatalogID(
	document projectstate.Document,
	projectRoot string,
	catalogID string,
	expectedOldValue *string,
) (CompareAndSetMutationResult, error) {
	return p.planCompareAndSetString(
		document,
		projectRoot,
		"core.app.catalog_id",
		expectedOldValue,
		catalogID,
		func(document projectstate.Document) (string, error) {
			current, err := effectiveAppDefinitionWithStorage(document, p.storage)
			if err != nil {
				return "", err
			}
			return current.CatalogID, nil
		},
		func(document projectstate.Document, projectRoot string) (projectstate.Document, any, string, error) {
			current, err := effectiveAppDefinitionWithStorage(document, p.storage)
			if err != nil {
				return projectstate.Document{}, nil, "", err
			}
			normalizedPath, currentAppSpec, err := resolveCurrentAppSpecForMetadataUpdate(
				projectRoot,
				current,
				p.appSpecStore,
			)
			if err != nil {
				return projectstate.Document{}, nil, "", err
			}
			current.AppSpecPath = normalizedPath
			current.CatalogID = catalogID
			nextDocument, nextAppSpec, err := setAppDefinitionDocument(document, SetInput{
				AppSpec:        currentAppSpec,
				AppSpecPath:    &normalizedPath,
				AppSpecVersion: &current.AppSpecVersion,
				CatalogID:      &current.CatalogID,
				Routes:         &current.Routes,
			}, normalizedPath, p.storage)
			return nextDocument, nextAppSpec, normalizedPath, err
		},
	)
}

func (p MutationPlanner) PlanCompareAndSetSpecVersion(
	document projectstate.Document,
	projectRoot string,
	appSpecVersion string,
	expectedOldValue *string,
) (CompareAndSetMutationResult, error) {
	return p.planCompareAndSetString(
		document,
		projectRoot,
		"core.app.spec_version",
		expectedOldValue,
		appSpecVersion,
		func(document projectstate.Document) (string, error) {
			current, err := effectiveAppDefinitionWithStorage(document, p.storage)
			if err != nil {
				return "", err
			}
			return current.AppSpecVersion, nil
		},
		func(document projectstate.Document, projectRoot string) (projectstate.Document, any, string, error) {
			current, err := effectiveAppDefinitionWithStorage(document, p.storage)
			if err != nil {
				return projectstate.Document{}, nil, "", err
			}
			normalizedPath, currentAppSpec, err := resolveCurrentAppSpecForMetadataUpdate(
				projectRoot,
				current,
				p.appSpecStore,
			)
			if err != nil {
				return projectstate.Document{}, nil, "", err
			}
			current.AppSpecPath = normalizedPath
			current.AppSpecVersion = appSpecVersion
			nextDocument, nextAppSpec, err := setAppDefinitionDocument(document, SetInput{
				AppSpec:        currentAppSpec,
				AppSpecPath:    &normalizedPath,
				AppSpecVersion: &current.AppSpecVersion,
				CatalogID:      &current.CatalogID,
				Routes:         &current.Routes,
			}, normalizedPath, p.storage)
			return nextDocument, nextAppSpec, normalizedPath, err
		},
	)
}

func (p MutationPlanner) PlanCompareAndSetSpecPath(
	document projectstate.Document,
	projectRoot string,
	appSpecPath string,
	expectedOldValue *string,
) (CompareAndSetMutationResult, error) {
	normalizedPath, err := p.appSpecStore.NormalizePath(projectRoot, appSpecPath)
	if err != nil {
		return CompareAndSetMutationResult{}, err
	}
	return p.planCompareAndSetString(
		document,
		projectRoot,
		"core.app.spec_path",
		expectedOldValue,
		normalizedPath,
		func(document projectstate.Document) (string, error) {
			return effectiveAppSpecPathWithStore(document, p.storage, p.appSpecStore)
		},
		func(document projectstate.Document, projectRoot string) (projectstate.Document, any, string, error) {
			current, err := effectiveAppDefinitionWithStorage(document, p.storage)
			if err != nil {
				return projectstate.Document{}, nil, "", err
			}
			normalizedPath, err := p.appSpecStore.NormalizePath(projectRoot, appSpecPath)
			if err != nil {
				return projectstate.Document{}, nil, "", err
			}
			_, currentAppSpec, err := resolveCurrentAppSpecForMetadataUpdate(
				projectRoot,
				current,
				p.appSpecStore,
			)
			if err != nil {
				return projectstate.Document{}, nil, "", err
			}
			current.AppSpecPath = normalizedPath
			nextDocument, nextAppSpec, err := setAppDefinitionDocument(document, SetInput{
				AppSpec:        currentAppSpec,
				AppSpecPath:    &normalizedPath,
				AppSpecVersion: &current.AppSpecVersion,
				CatalogID:      &current.CatalogID,
				Routes:         &current.Routes,
			}, normalizedPath, p.storage)
			return nextDocument, nextAppSpec, normalizedPath, err
		},
	)
}

func (p MutationPlanner) PlanCompareAndSetThemeMode(
	document projectstate.Document,
	projectRoot string,
	themeMode string,
	expectedOldValue *string,
) (CompareAndSetMutationResult, error) {
	return p.planCompareAndSetString(
		document,
		projectRoot,
		"core.app.theme_mode",
		expectedOldValue,
		themeMode,
		func(document projectstate.Document) (string, error) {
			return effectiveAppThemeModeWithStorage(document, p.storage)
		},
		func(document projectstate.Document, projectRoot string) (projectstate.Document, any, string, error) {
			current, err := effectiveAppDefinitionWithStorage(document, p.storage)
			if err != nil {
				return projectstate.Document{}, nil, "", err
			}
			normalizedPath, currentAppSpec, err := resolveCurrentAppSpecForMetadataUpdate(
				projectRoot,
				current,
				p.appSpecStore,
			)
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
			nextDocument, nextAppSpec, err := setAppDefinitionDocument(document, SetInput{
				AppSpec:        currentAppSpec,
				AppSpecPath:    &normalizedPath,
				AppSpecVersion: &current.AppSpecVersion,
				CatalogID:      &current.CatalogID,
				Routes:         &current.Routes,
				DataBindings:   cloneJSONObjectPointerFromRawJSON(current.DataBindings),
				Actions:        cloneJSONObjectPointerFromRawJSON(current.Actions),
				Theme:          &theme,
				Assets:         cloneJSONArrayPointerFromRawJSON(current.Assets),
			}, normalizedPath, p.storage)
			return nextDocument, nextAppSpec, normalizedPath, err
		},
	)
}

func (p MutationPlanner) planCompareAndSetString(
	document projectstate.Document,
	projectRoot string,
	settingID string,
	expectedOldValue *string,
	requestedNewValue string,
	readValue func(projectstate.Document) (string, error),
	mutate func(projectstate.Document, string) (projectstate.Document, any, string, error),
) (CompareAndSetMutationResult, error) {
	var compareResult projectstate.CompareAndSetResult[string]
	plan, appSpec, err := buildCompareAndSetAppDefinitionPlan(
		document,
		projectRoot,
		settingID,
		expectedOldValue,
		requestedNewValue,
		readValue,
		mutate,
		&compareResult,
		p.appSpecStore,
	)
	if err != nil {
		return CompareAndSetMutationResult{}, err
	}
	return compareAndSetMutationResultFromPlannedDocument(
		plan.NextDocument,
		appSpec,
		compareResult,
		p.storage,
	)
}

func mutationResultFromPlannedDocument(
	document projectstate.Document,
	appSpec any,
	storage DocumentStorage,
) (MutationResult, error) {
	appDefinition, err := DecodeStoredAppDefinition(
		storage.StoredDocumentAppDefinitionRaw(document),
	)
	if err != nil {
		return MutationResult{}, err
	}
	if appDefinition == nil {
		return MutationResult{}, fmt.Errorf("planned app definition mutation did not produce an app definition")
	}
	return MutationResult{
		AppSpec:       cloneJSONValue(appSpec),
		AppDefinition: appDefinition,
	}, nil
}

func compareAndSetMutationResultFromPlannedDocument(
	document projectstate.Document,
	appSpec any,
	compareResult projectstate.CompareAndSetResult[string],
	storage DocumentStorage,
) (CompareAndSetMutationResult, error) {
	result := CompareAndSetMutationResult{
		CompareResult: compareAndSetStringResultFromProjectState(compareResult),
	}
	if compareResult.OldValue == compareResult.NewValue {
		return result, nil
	}
	mutationResult, err := mutationResultFromPlannedDocument(document, appSpec, storage)
	if err != nil {
		return CompareAndSetMutationResult{}, err
	}
	result.AppSpec = mutationResult.AppSpec
	result.AppDefinition = mutationResult.AppDefinition
	return result, nil
}
