package settajsonrenderappgenbackend

import (
	"setta/internal/projectstate"
	"setta/plugins/setta-json-render-app-gen/backend/appdefinition"
)

func NewAppDefinitionService(runtime *projectstate.Runtime) projectstate.AppDefinitionRuntime {
	return appdefinition.NewAppDefinitionService(runtime)
}
