package settacmd

import (
	"io"

	"setta/internal/appsubsystem"
	"setta/internal/config"
	"setta/internal/deployments"
)

var appCommandSpec = deploymentCommandSpec{
	subcommand:          "app",
	mode:                config.ModeApp,
	deploymentType:      deployments.TypeApp,
	rootHelp:            "Path to an app deployment root.",
	reloadError:         "App mode does not support --reload.",
	missingManifestText: "App deployment manifest not found",
	wrongTypeText:       "Deployment is not an app deployment",
	preflight:           requireAppModePluginEnabled,
}

func runApp(args []string, global globalFlags, stdin io.Reader, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	return runAppWithDeps(args, global, stdin, stdout, stderr, envLookup, cwd, defaultStartCommandDependencies())
}

func runAppWithDeps(args []string, global globalFlags, stdin io.Reader, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string, deps startCommandDependencies) error {
	return runDeploymentCommandWithDeps(args, global, stdin, stdout, stderr, envLookup, cwd, deps, appCommandSpec)
}

func requireAppModePluginEnabled(resolvedDeploymentRoot string, global globalFlags, envLookup func(string) (string, bool), cwd string) error {
	cfg, err := config.Load(config.LoadOptions{
		CWD:       cwd,
		EnvLookup: envLookup,
		CLI: config.CLIOptions{
			WorkspaceRoot:      global.workspaceRoot,
			DeploymentRoot:     resolvedDeploymentRoot,
			SettaHome:          global.settaHome,
			ProfileLookupHome:  global.profileLookupHome,
			SettaFilesRoot:     global.settaFilesRoot,
			SettaFilesLocation: global.settaFilesLocation,
			RuntimeRoot:        global.runtimeRoot,
			Profile:            global.profile,
			Mode:               string(config.ModeApp),
		},
	})
	if err != nil {
		return err
	}
	return appsubsystem.RequireAppModeRuntime(appsubsystem.DeploymentRuntimeOptions{
		Mode:           config.ModeApp,
		DeploymentRoot: cfg.Paths.DeploymentRoot,
		RuntimeRoot:    cfg.Paths.RuntimeRoot,
	})
}
