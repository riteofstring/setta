package httpapi

import (
	"setta/internal/modes"
	"setta/internal/projectstate"
)

const (
	RouteGetAppDefinition      = "/getAppDefinition"
	RouteSetAppDefinition      = "/setAppDefinition"
	RouteValidateAppDefinition = "/validateAppDefinition"
	RouteGetAppCatalog         = "/getAppCatalog"
)

type AppDefinitionRouteDependencies struct {
	ModePolicy modes.Policy
	Service    projectstate.AppDefinitionRuntime
}
