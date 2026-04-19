package projectstate

import "setta/plugins/setta-json-render-app-gen/backend/appspec"

type AppDefinitionReadResult struct {
	AppSpec       any            `json:"appSpec"`
	AppDefinition *AppDefinition `json:"appDefinition,omitempty"`
}

type ValidateAppDefinitionInput struct {
	AppSpec        any
	AppSpecVersion *string
	CatalogID      *string
	Routes         *[]AppRoute
	DataBindings   *map[string]any
	Actions        *map[string]any
	Theme          *map[string]any
	Assets         *[]any
}

type AppDefinitionValidationResult struct {
	Errors       []appspec.AppValidationIssue `json:"errors"`
	Warnings     []appspec.AppValidationIssue `json:"warnings"`
	Capabilities appspec.AppCapabilities      `json:"capabilities"`
}
