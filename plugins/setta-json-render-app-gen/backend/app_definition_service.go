package settajsonrenderappgenbackend

import (
	"setta/internal/projectstate"
	"setta/plugins/setta-json-render-app-gen/backend/appdefinition"
)

func NewAppDefinitionService(
	runtime *projectstate.Runtime,
	pluginID string,
) appdefinition.Runtime {
	return appdefinition.NewAppDefinitionService(runtime, pluginID)
}
