package appsubsystemprovider

import (
	"setta/internal/appsubsystem"
	settajsonrenderappgenbackend "setta/plugins/setta-json-render-app-gen/backend"
)

const PluginID = "setta-fixture-app-subsystem-provider"

func init() {
	appsubsystem.RegisterBackendProvider(
		PluginID,
		settajsonrenderappgenbackend.NewBackendProvider(),
	)
}
