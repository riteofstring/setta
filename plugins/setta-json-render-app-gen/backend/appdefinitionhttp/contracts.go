package appdefinitionhttp

import (
	"setta/internal/projectstate"
	"setta/plugins/setta-json-render-app-gen/backend/appspec"
)

type GetAppDefinitionRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
}

type SetAppDefinitionRequest struct {
	FrontendOpID   *string                  `json:"frontendOpId,omitempty"`
	AppSpec        any                      `json:"appSpec"`
	AppSpecPath    *string                  `json:"appSpecPath,omitempty"`
	AppSpecVersion *string                  `json:"appSpecVersion,omitempty"`
	CatalogID      *string                  `json:"catalogId,omitempty"`
	Routes         *[]projectstate.AppRoute `json:"routes,omitempty"`
	DataBindings   *map[string]any          `json:"dataBindings,omitempty"`
	Actions        *map[string]any          `json:"actions,omitempty"`
	Theme          *map[string]any          `json:"theme,omitempty"`
	Assets         *[]any                   `json:"assets,omitempty"`
}

type ValidateAppDefinitionRequest struct {
	FrontendOpID   *string                  `json:"frontendOpId,omitempty"`
	AppSpec        any                      `json:"appSpec"`
	AppSpecVersion *string                  `json:"appSpecVersion,omitempty"`
	CatalogID      *string                  `json:"catalogId,omitempty"`
	Routes         *[]projectstate.AppRoute `json:"routes,omitempty"`
	DataBindings   *map[string]any          `json:"dataBindings,omitempty"`
	Actions        *map[string]any          `json:"actions,omitempty"`
	Theme          *map[string]any          `json:"theme,omitempty"`
	Assets         *[]any                   `json:"assets,omitempty"`
}

type AppCatalogPropResponse struct {
	Type       appspec.PropType `json:"type"`
	Responsive bool             `json:"responsive,omitempty"`
	Required   bool             `json:"required,omitempty"`
	Min        *float64         `json:"min,omitempty"`
	Max        *float64         `json:"max,omitempty"`
	Enum       []any            `json:"enum,omitempty"`
	Default    any              `json:"default,omitempty"`
}

type AppCatalogComponentResponse struct {
	Type     string                            `json:"type"`
	Children bool                              `json:"children"`
	Props    map[string]AppCatalogPropResponse `json:"props,omitempty"`
}

type AppCatalogActionResponse struct {
	Name string `json:"name"`
}

type AppCatalogResponse struct {
	ID         string                        `json:"id"`
	Version    string                        `json:"version"`
	Components []AppCatalogComponentResponse `json:"components"`
	Actions    []AppCatalogActionResponse    `json:"actions"`
}
