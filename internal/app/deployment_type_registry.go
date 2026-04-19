package app

import (
	"setta/internal/deployments"
	appsubsystemplugin "setta/plugins/setta-json-render-app-gen/backend"
)

func NewDeploymentTypeRegistry() (*deployments.TypeRegistry, error) {
	return deployments.NewTypeRegistry([]deployments.TypeRegistration{
		deployments.ShareTypeRegistration(),
		appsubsystemplugin.AppDeploymentTypeRegistration(),
	})
}
