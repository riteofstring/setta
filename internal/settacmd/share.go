package settacmd

import (
	"io"

	"setta/internal/config"
	"setta/internal/deployments"
)

type shareFlags = deploymentFlags

var shareCommandSpec = deploymentCommandSpec{
	subcommand:          "share",
	mode:                config.ModeShare,
	deploymentType:      deployments.TypeShare,
	rootHelp:            "Path to a share deployment root.",
	reloadError:         "Share mode does not support --reload.",
	missingManifestText: "Share deployment manifest not found",
	wrongTypeText:       "Deployment is not a share deployment",
}

func runShare(args []string, global globalFlags, stdin io.Reader, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	return runShareWithDeps(args, global, stdin, stdout, stderr, envLookup, cwd, defaultStartCommandDependencies())
}

func runShareWithDeps(args []string, global globalFlags, stdin io.Reader, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string, deps startCommandDependencies) error {
	return runDeploymentCommandWithDeps(args, global, stdin, stdout, stderr, envLookup, cwd, deps, shareCommandSpec)
}

func resolveShareDeploymentRoot(parsed shareFlags, global globalFlags, envLookup func(string) (string, bool), cwd string) (string, error) {
	return resolveDeploymentCommandRoot(parsed, global, envLookup, cwd, shareCommandSpec)
}

func validateShareDeploymentRoot(deploymentRoot string) (deployments.Manifest, error) {
	return validateDeploymentCommandRoot(deploymentRoot, shareCommandSpec)
}

func buildShareStartArgs(global globalFlags, deploymentRoot string) []string {
	return buildDeploymentStartArgs(global, deploymentRoot, shareCommandSpec)
}
