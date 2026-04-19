package appsubsystemprovider

import settajsonrenderappgenbackend "setta/plugins/setta-json-render-app-gen/backend"

const PluginID = "setta-fixture-app-subsystem-provider"

func init() {
	settajsonrenderappgenbackend.RegisterBackendProvider(PluginID)
}
