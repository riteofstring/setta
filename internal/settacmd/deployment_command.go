package settacmd

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"setta/internal/config"
	"setta/internal/deployments"
)

const (
	defaultDeploymentStartHost = "127.0.0.1"
	defaultDeploymentStartPort = "0"
)

type deploymentFlags struct {
	deploymentRoot    string
	deploymentName    string
	deploymentVersion string
	latest            bool
}

type deploymentCommandSpec struct {
	subcommand          string
	mode                config.Mode
	deploymentType      deployments.Type
	rootHelp            string
	reloadError         string
	missingManifestText string
	wrongTypeText       string
}

func runDeploymentCommandWithDeps(args []string, global globalFlags, stdin io.Reader, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string, deps startCommandDependencies, spec deploymentCommandSpec) error {
	flags := flag.NewFlagSet(spec.subcommand, flag.ContinueOnError)
	flags.SetOutput(stderr)

	var parsed deploymentFlags
	flags.StringVar(&parsed.deploymentRoot, "deployment-root", "", spec.rootHelp)
	flags.StringVar(&parsed.deploymentName, "deployment-name", "", "Deployment name under setta_files/deployments.")
	flags.StringVar(&parsed.deploymentVersion, "version", "", "Deployment version (vN).")
	flags.BoolVar(&parsed.latest, "latest", false, "Use the latest deployment version.")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if len(flags.Args()) != 0 {
		return fmt.Errorf("%s does not accept positional arguments", spec.subcommand)
	}
	if global.reload {
		return &ExitError{
			Code: 2,
			Err:  errors.New(spec.reloadError),
		}
	}

	resolvedDeploymentRoot, err := resolveDeploymentCommandRoot(parsed, global, envLookup, cwd, spec)
	if err != nil {
		return &ExitError{Code: 2, Err: err}
	}

	currentExecutable, err := deps.resolveCurrentExecutable()
	if err != nil {
		return fmt.Errorf("resolve current executable: %w", err)
	}
	serverExecutable, err := deps.resolveServerExecutable(currentExecutable, envLookup)
	if err != nil {
		return err
	}

	return deps.runServer(serverExecutable, buildDeploymentStartArgs(global, resolvedDeploymentRoot, spec), stdin, stdout, stderr)
}

func resolveDeploymentCommandRoot(parsed deploymentFlags, global globalFlags, envLookup func(string) (string, bool), cwd string, spec deploymentCommandSpec) (string, error) {
	explicitDeploymentRoot := strings.TrimSpace(parsed.deploymentRoot)
	deploymentName := strings.TrimSpace(parsed.deploymentName)
	deploymentVersion := strings.TrimSpace(parsed.deploymentVersion)

	if explicitDeploymentRoot != "" {
		if deploymentName != "" || deploymentVersion != "" || parsed.latest {
			return "", fmt.Errorf("Use either --deployment-root or --deployment-name/--version/--latest.")
		}
		resolvedRoot, err := normalizeLaunchComparisonPath(explicitDeploymentRoot, cwd)
		if err != nil {
			return "", fmt.Errorf("resolve --deployment-root: %w", err)
		}
		if _, err := validateDeploymentCommandRoot(resolvedRoot, spec); err != nil {
			return "", err
		}
		return resolvedRoot, nil
	}
	if deploymentName == "" {
		return "", fmt.Errorf("Missing --deployment-name (or use --deployment-root).")
	}
	if deploymentVersion != "" && parsed.latest {
		return "", fmt.Errorf("Use either --version or --latest, not both.")
	}
	if deploymentVersion == "" && !parsed.latest {
		return "", fmt.Errorf("Missing --version or --latest.")
	}

	resolvedConfig, err := config.Load(config.LoadOptions{
		CWD:       cwd,
		EnvLookup: envLookup,
		CLI: config.CLIOptions{
			WorkspaceRoot:      strings.TrimSpace(global.workspaceRoot),
			SettaHome:          strings.TrimSpace(global.settaHome),
			ProfileLookupHome:  strings.TrimSpace(global.profileLookupHome),
			SettaFilesRoot:     strings.TrimSpace(global.settaFilesRoot),
			SettaFilesLocation: strings.TrimSpace(global.settaFilesLocation),
			Profile:            strings.TrimSpace(global.profile),
		},
	})
	if err != nil {
		return "", err
	}

	catalogRoot, err := deployments.DefaultCatalogRoot(resolvedConfig.Paths.SettaFilesRoot)
	if err != nil {
		return "", err
	}
	catalog, err := deployments.NewCatalog(deployments.CatalogOptions{Root: catalogRoot})
	if err != nil {
		return "", err
	}

	if parsed.latest {
		metadata, err := catalog.Latest(context.Background(), deploymentName, spec.deploymentType)
		if err != nil {
			if errors.Is(err, deployments.ErrDeploymentNotFound) {
				return "", fmt.Errorf("Deployment not found: %s", deploymentName)
			}
			return "", err
		}
		return metadata.DeploymentRoot, nil
	}

	if !isValidDeploymentVersion(deploymentVersion) {
		return "", fmt.Errorf("Invalid --version value. Expected vN (for example v3).")
	}

	versions, err := catalog.ListVersions(context.Background(), deploymentName, spec.deploymentType)
	if err != nil {
		return "", err
	}
	for _, metadata := range versions {
		if metadata.DeploymentVersion == deploymentVersion {
			return metadata.DeploymentRoot, nil
		}
	}
	return "", fmt.Errorf("Deployment not found: %s/%s", deploymentName, deploymentVersion)
}

func validateDeploymentCommandRoot(deploymentRoot string, spec deploymentCommandSpec) (deployments.Manifest, error) {
	info, err := os.Stat(deploymentRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return deployments.Manifest{}, fmt.Errorf("Deployment root not found: %s", deploymentRoot)
		}
		return deployments.Manifest{}, fmt.Errorf("stat deployment root: %w", err)
	}
	if !info.IsDir() {
		return deployments.Manifest{}, fmt.Errorf("Deployment root is not a directory: %s", deploymentRoot)
	}

	manifest, err := deployments.LoadManifest(deploymentRoot)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return deployments.Manifest{}, fmt.Errorf("%s: %s", spec.missingManifestText, filepath.Join(deploymentRoot, "manifest.json"))
		}
		return deployments.Manifest{}, err
	}
	if manifest.DeploymentType != spec.deploymentType {
		return deployments.Manifest{}, fmt.Errorf("%s: %s/%s", spec.wrongTypeText, manifest.DeploymentName, manifest.DeploymentVersion)
	}
	return manifest, nil
}

func isValidDeploymentVersion(raw string) bool {
	trimmedVersion := strings.TrimSpace(raw)
	if !strings.HasPrefix(trimmedVersion, "v") {
		return false
	}
	versionNumber, err := strconv.Atoi(strings.TrimPrefix(trimmedVersion, "v"))
	return err == nil && versionNumber > 0
}

func buildDeploymentStartArgs(global globalFlags, deploymentRoot string, spec deploymentCommandSpec) []string {
	args := []string{
		"--mode", string(spec.mode),
		"--deployment-root", deploymentRoot,
		"--host", defaultStartStringValue(global.host, defaultDeploymentStartHost),
		"--port", defaultStartStringValue(global.port, defaultDeploymentStartPort),
	}
	return appendStartRuntimeArgs(args, global)
}
