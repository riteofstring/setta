package appsubsystemprovider

import settajsonrenderappgenbackend "setta/internal/appsubsystemproviders/builtin"

const PluginID = "setta-fixture-app-subsystem-provider"

func init() {
	settajsonrenderappgenbackend.RegisterBackendProvider(PluginID)
}
