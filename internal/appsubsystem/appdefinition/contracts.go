package appdefinition

import (
	"context"

	"setta/internal/projectstate"
)

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

type ValidateInput struct {
	AppSpec        any
	AppSpecVersion *string
	CatalogID      *string
	Routes         *[]AppRoute
	DataBindings   *map[string]any
	Actions        *map[string]any
	Theme          *map[string]any
	Assets         *[]any
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

type SetInput struct {
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

type MutationResult struct {
	AppSpec       any            `json:"appSpec"`
	AppDefinition *AppDefinition `json:"appDefinition,omitempty"`
}

type CompareAndSetStringResult struct {
	OldValue string `json:"oldValue"`
	NewValue string `json:"newValue"`
}

func compareAndSetStringResultFromProjectState(result projectstate.CompareAndSetResult[string]) CompareAndSetStringResult {
	return CompareAndSetStringResult{
		OldValue: result.OldValue,
		NewValue: result.NewValue,
	}
}

func (r CompareAndSetStringResult) projectStateResult() projectstate.CompareAndSetResult[string] {
	return projectstate.CompareAndSetResult[string]{
		OldValue: r.OldValue,
		NewValue: r.NewValue,
	}
}

type CompareAndSetMutationResult struct {
	CompareResult CompareAndSetStringResult `json:"compareResult"`
	AppSpec       any                       `json:"appSpec,omitempty"`
	AppDefinition *AppDefinition            `json:"appDefinition,omitempty"`
}

type StreamInput struct {
	Patches     string
	AppSpecPath *string
	BaseAppSpec *map[string]any
}

type Runtime interface {
	GetAppDefinition(ctx context.Context) (ReadResult, error)
	GetEffectiveAppDefinition(ctx context.Context) (AppDefinition, error)
	GetEffectiveAppSpecPath(ctx context.Context) (string, error)
	GetEffectiveAppThemeMode(ctx context.Context) (string, error)
	ValidateAppDefinition(ctx context.Context, input ValidateInput) (ValidationResult, error)
	SetAppDefinition(ctx context.Context, input SetInput) (projectstate.Snapshot, MutationResult, error)
	StreamAppDefinition(ctx context.Context, input StreamInput) (projectstate.Snapshot, MutationResult, error)
	UpdateAppDefinition(ctx context.Context, patch any) (projectstate.Snapshot, MutationResult, error)
	CompareAndSetAppDefinitionCatalogID(ctx context.Context, catalogID string, expectedOldValue *string) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error)
	CompareAndSetAppDefinitionSpecVersion(ctx context.Context, appSpecVersion string, expectedOldValue *string) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error)
	CompareAndSetAppDefinitionSpecPath(ctx context.Context, appSpecPath string, expectedOldValue *string) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error)
	CompareAndSetAppDefinitionThemeMode(ctx context.Context, themeMode string, expectedOldValue *string) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error)
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
