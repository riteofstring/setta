package httpapi

import (
	"setta/internal/modes"
	"setta/plugins/setta-json-render-app-gen/backend/appdefinition"
)

const (
	RouteGetAppDefinition      = "/getAppDefinition"
	RouteSetAppDefinition      = "/setAppDefinition"
	RouteValidateAppDefinition = "/validateAppDefinition"
	RouteGetAppCatalog         = "/getAppCatalog"
)

type AppDefinitionRouteDependencies struct {
	ModePolicy modes.Policy
	Service    appdefinition.Runtime
}
