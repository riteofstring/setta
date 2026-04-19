package app

import (
	"setta/internal/appsubsystem"
	"setta/internal/config"
	"setta/internal/deployments"
)

func NewDeploymentTypeRegistry(cfg config.Config) (*deployments.TypeRegistry, error) {
	return appsubsystem.NewDeploymentTypeRegistry(appsubsystem.DeploymentRuntimeOptions{
		Mode:           cfg.Server.Mode,
		DeploymentRoot: cfg.Paths.DeploymentRoot,
		RuntimeRoot:    cfg.Paths.RuntimeRoot,
	})
}
