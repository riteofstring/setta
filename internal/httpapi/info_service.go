package httpapi

import (
	"context"

	"setta/internal/buildinfo"
	"setta/internal/config"
	"setta/internal/pythonsdkcontracts"
)

type configInfoService struct {
	config         config.Config
	authCookieName string
}

func NewConfigInfoService(cfg config.Config, authCookieName string) InfoService {
	return configInfoService{
		config:         cfg,
		authCookieName: authCookieName,
	}
}

func (s configInfoService) ServerMode(context.Context) string {
	return string(s.config.Server.Mode)
}

func (s configInfoService) RuntimeInfo(context.Context) RuntimeInfo {
	return RuntimeInfo{
		Mode: string(s.config.Server.Mode),
		Paths: RuntimePaths{
			WorkspaceRoot:      s.config.Paths.WorkspaceRoot,
			DeploymentRoot:     s.config.Paths.DeploymentRoot,
			SettaHome:          s.config.Paths.SettaHome,
			ProfileLookupHome:  s.config.Paths.ProfileLookupHome,
			Profile:            s.config.Paths.ProfileName,
			SettaFilesRoot:     s.config.Paths.SettaFilesRoot,
			SettaFilesLocation: s.config.Paths.ActiveSettaFilesLocation(),
			RuntimeRoot:        s.config.Paths.RuntimeRoot,
		},
		Policy: RuntimePathPolicy{
			GlobalSettaFilesBase: s.config.User.GlobalSettaFilesBase,
			AutoMode:             string(s.config.User.AutoMode),
		},
		Auth: RuntimeAuth{
			AuthCookieName: s.authCookieName,
		},
	}
}

func (s configInfoService) SDKRuntimeHandshake(context.Context) pythonsdkcontracts.RunningBackendVersionHandshake {
	return pythonsdkcontracts.RunningBackendVersionHandshake{
		SDKVersion:         buildinfo.HostPackageVersion(),
		CoreVersion:        buildinfo.Version(),
		SDKContractVersion: pythonsdkcontracts.SDKContractVersion,
	}
}
