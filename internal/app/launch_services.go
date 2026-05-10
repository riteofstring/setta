package app

import (
	"os"
	"time"

	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/frontendorigins"
	"setta/internal/launcher"
	"setta/internal/modes"
	"setta/internal/sshx"
	"setta/internal/workspacelaunch"
)

type launchServices struct {
	trustedOrigins        *frontendorigins.Service
	launchIntentService   *workspacelaunch.IntentService
	localLaunchService    *workspacelaunch.LocalLaunchService
	localSessionLauncher  *launcher.LocalIDESessionLauncher
	sshRuntime            *sshx.Service
	launcherHome          *launcher.HomeService
	launcherManagement    *launcher.ManagementService
	launcherOpenWorkspace *launcher.OpenWorkspaceService
}

func launcherSessionAuthExpiryResolver(
	authService *auth.Service,
) func(now time.Time) (int64, error) {
	return func(now time.Time) (int64, error) {
		_, payload, err := authService.MintAuthCookie(now)
		if err != nil {
			return 0, err
		}
		return payload.Exp, nil
	}
}

func initializeSessionLaunchServices(
	cfg config.Config,
	authService *auth.Service,
	services *launchServices,
) error {
	trustedOrigins, err := frontendorigins.NewService(frontendorigins.Options{
		RuntimeRoot: cfg.Paths.RuntimeRoot,
	})
	if err != nil {
		return err
	}
	services.trustedOrigins = trustedOrigins

	launchIntentService, err := workspacelaunch.NewIntentService(workspacelaunch.IntentServiceOptions{
		RuntimeRoot:    cfg.Paths.RuntimeRoot,
		TrustedOrigins: trustedOrigins,
	})
	if err != nil {
		return err
	}
	services.launchIntentService = launchIntentService

	executablePath, err := os.Executable()
	if err != nil {
		return err
	}
	localSessionLauncher, err := launcher.NewLocalIDESessionLauncher(launcher.LocalIDESessionLauncherOptions{
		ExecutablePath: executablePath,
	})
	if err != nil {
		return err
	}
	services.localSessionLauncher = localSessionLauncher

	sshRuntime, err := sshx.NewService(sshx.ServiceOptions{
		RuntimeRoot: cfg.Paths.RuntimeRoot,
	})
	if err != nil {
		return err
	}
	services.sshRuntime = sshRuntime

	localLaunchService, err := workspacelaunch.NewLocalLaunchService(workspacelaunch.LocalLaunchServiceOptions{
		DefaultSettaHome:         cfg.Paths.SettaHome,
		DefaultProfileLookupHome: cfg.Paths.ProfileLookupHome,
		Intents:                  launchIntentService,
		TrustedOrigins:           trustedOrigins,
		Sessions:                 localSessionLauncher,
		SSH:                      sshRuntime,
		ResolveLauncherSessionAuthExpiry: launcherSessionAuthExpiryResolver(
			authService,
		),
	})
	if err != nil {
		return err
	}
	services.localLaunchService = localLaunchService
	return nil
}

func initializeIDELaunchManagementService(services *launchServices) error {
	executablePath, err := os.Executable()
	if err != nil {
		return err
	}
	launcherManagement, err := launcher.NewManagementService(launcher.ManagementServiceOptions{
		ExecutablePath: executablePath,
	})
	if err != nil {
		return err
	}
	services.launcherManagement = launcherManagement
	return nil
}

func initializeLauncherOpenWorkspaceService(
	cfg config.Config,
	authService *auth.Service,
	services *launchServices,
) error {
	launcherOpenWorkspace, err := launcher.NewOpenWorkspaceService(launcher.OpenWorkspaceServiceOptions{
		DefaultSettaHome: cfg.Paths.SettaHome,
		Home:             services.launcherHome,
		Sessions:         services.localSessionLauncher,
		TrustedOrigins:   services.trustedOrigins,
		ResolveLauncherSessionAuthExpiry: launcherSessionAuthExpiryResolver(
			authService,
		),
	})
	if err != nil {
		return err
	}
	services.launcherOpenWorkspace = launcherOpenWorkspace
	return nil
}

func initializeLaunchServices(
	cfg config.Config,
	authService *auth.Service,
	modePolicy modes.Policy,
) (launchServices, error) {
	services := launchServices{
		launcherHome: launcher.NewHomeService(launcher.HomeServiceOptions{
			EnvLookup: os.LookupEnv,
		}),
	}

	if authService.SupportsSessionAuth() {
		if err := initializeSessionLaunchServices(cfg, authService, &services); err != nil {
			return launchServices{}, err
		}
	}

	if modePolicy.IsIDE() {
		if err := initializeIDELaunchManagementService(&services); err != nil {
			return launchServices{}, err
		}
	}

	if modePolicy.IsLauncher() {
		if err := initializeLauncherOpenWorkspaceService(cfg, authService, &services); err != nil {
			return launchServices{}, err
		}
	}

	return services, nil
}
