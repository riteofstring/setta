package appdefinition

import "setta/internal/projectstate"

type AppRoute struct {
	Path    string `json:"path"`
	Name    string `json:"name,omitempty"`
	RootKey string `json:"rootKey,omitempty"`
}

type AppDefinition struct {
	AppSpecVersion string               `json:"appSpecVersion,omitempty"`
	CatalogID      string               `json:"catalogId,omitempty"`
	AppSpecPath    string               `json:"appSpecPath,omitempty"`
	Routes         []AppRoute           `json:"routes,omitempty"`
	DataBindings   projectstate.RawJSON `json:"dataBindings,omitempty" ts_type:"Record<string, unknown>" shared_schema_map_value_ref:"RawMessage"`
	Actions        projectstate.RawJSON `json:"actions,omitempty" ts_type:"Record<string, unknown>" shared_schema_map_value_ref:"RawMessage"`
	Theme          projectstate.RawJSON `json:"theme,omitempty"`
	Assets         projectstate.RawJSON `json:"assets,omitempty"`
}

type ReadResult struct {
	AppSpec       any            `json:"appSpec"`
	AppDefinition *AppDefinition `json:"appDefinition,omitempty"`
}

type ValidationIssue struct {
	Message     string `json:"message"`
	ElementKey  string `json:"elementKey,omitempty"`
	ElementType string `json:"elementType,omitempty"`
}

type Capabilities struct {
	CatalogID          string          `json:"catalogId"`
	CatalogVersion     string          `json:"catalogVersion"`
	AppSpecVersion     string          `json:"appSpecVersion"`
	ThemeSchemaVersion string          `json:"themeSchemaVersion"`
	Features           map[string]bool `json:"features"`
}

type ValidationResult struct {
	Errors       []ValidationIssue `json:"errors"`
	Warnings     []ValidationIssue `json:"warnings"`
	Capabilities Capabilities      `json:"capabilities"`
}

type MutationResult struct {
	AppSpec       any            `json:"appSpec"`
	AppDefinition *AppDefinition `json:"appDefinition,omitempty"`
}

func (r AppRoute) Clone() AppRoute {
	return r
}

func (d AppDefinition) Clone() AppDefinition {
	cloned := d
	cloned.Routes = append([]AppRoute(nil), d.Routes...)
	cloned.DataBindings = cloneRawJSON(d.DataBindings)
	cloned.Actions = cloneRawJSON(d.Actions)
	cloned.Theme = cloneRawJSON(d.Theme)
	cloned.Assets = cloneRawJSON(d.Assets)
	return cloned
}

func FromProjectStateReadResult(result projectstate.AppDefinitionReadResult) ReadResult {
	return ReadResult{
		AppSpec:       cloneJSONValue(result.AppSpec),
		AppDefinition: DefinitionPointerFromProjectState(result.AppDefinition),
	}
}

func FromProjectStateMutationResult(result projectstate.AppDefinitionMutationResult) MutationResult {
	return MutationResult{
		AppSpec:       cloneJSONValue(result.AppSpec),
		AppDefinition: DefinitionPointerFromProjectState(result.AppDefinition),
	}
}

func FromProjectStateValidationResult(result projectstate.AppDefinitionValidationResult) ValidationResult {
	return ValidationResult{
		Errors:       ValidationIssuesFromProjectState(result.Errors),
		Warnings:     ValidationIssuesFromProjectState(result.Warnings),
		Capabilities: CapabilitiesFromProjectState(result.Capabilities),
	}
}

func DefinitionPointerFromProjectState(definition *projectstate.AppDefinition) *AppDefinition {
	if definition == nil {
		return nil
	}
	converted := DefinitionFromProjectState(*definition)
	return &converted
}

func DefinitionFromProjectState(definition projectstate.AppDefinition) AppDefinition {
	return AppDefinition{
		AppSpecVersion: definition.AppSpecVersion,
		CatalogID:      definition.CatalogID,
		AppSpecPath:    definition.AppSpecPath,
		Routes:         RoutesFromProjectState(definition.Routes),
		DataBindings:   cloneRawJSON(definition.DataBindings),
		Actions:        cloneRawJSON(definition.Actions),
		Theme:          cloneRawJSON(definition.Theme),
		Assets:         cloneRawJSON(definition.Assets),
	}
}

func RoutesFromProjectState(routes []projectstate.AppRoute) []AppRoute {
	if len(routes) == 0 {
		return nil
	}
	converted := make([]AppRoute, 0, len(routes))
	for _, route := range routes {
		converted = append(converted, AppRoute{
			Path:    route.Path,
			Name:    route.Name,
			RootKey: route.RootKey,
		})
	}
	return converted
}

func RoutesPointerToProjectState(routes *[]AppRoute) *[]projectstate.AppRoute {
	if routes == nil {
		return nil
	}
	converted := make([]projectstate.AppRoute, 0, len(*routes))
	for _, route := range *routes {
		converted = append(converted, projectstate.AppRoute{
			Path:    route.Path,
			Name:    route.Name,
			RootKey: route.RootKey,
		})
	}
	return &converted
}

func ValidationIssuesFromProjectState(issues []projectstate.AppDefinitionValidationIssue) []ValidationIssue {
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

func CapabilitiesFromProjectState(capabilities projectstate.AppDefinitionCapabilities) Capabilities {
	return Capabilities{
		CatalogID:          capabilities.CatalogID,
		CatalogVersion:     capabilities.CatalogVersion,
		AppSpecVersion:     capabilities.AppSpecVersion,
		ThemeSchemaVersion: capabilities.ThemeSchemaVersion,
		Features:           cloneFeatures(capabilities.Features),
	}
}

func cloneFeatures(features map[string]bool) map[string]bool {
	if len(features) == 0 {
		return nil
	}
	cloned := make(map[string]bool, len(features))
	for key, value := range features {
		cloned[key] = value
	}
	return cloned
}

func cloneRawJSON(raw projectstate.RawJSON) projectstate.RawJSON {
	if len(raw) == 0 {
		return nil
	}
	return append(projectstate.RawJSON(nil), raw...)
}
