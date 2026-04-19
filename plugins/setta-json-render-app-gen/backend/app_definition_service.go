package settajsonrenderappgenbackend

import (
	"setta/internal/appsubsystem/appdefinition"
	"setta/internal/projectstate"
)

func NewAppDefinitionService(
	runtime *projectstate.Runtime,
	pluginID string,
) appdefinition.Runtime {
	return appdefinition.NewAppDefinitionService(runtime, pluginID)
}
