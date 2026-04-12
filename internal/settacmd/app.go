package settacmd

import (
	"io"

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
}

func runApp(args []string, global globalFlags, stdin io.Reader, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	return runAppWithDeps(args, global, stdin, stdout, stderr, envLookup, cwd, defaultStartCommandDependencies())
}

func runAppWithDeps(args []string, global globalFlags, stdin io.Reader, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string, deps startCommandDependencies) error {
	return runDeploymentCommandWithDeps(args, global, stdin, stdout, stderr, envLookup, cwd, deps, appCommandSpec)
}
