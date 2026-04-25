package plugins

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

const pluginFrontendBuildPackageManagerPNPM = "pnpm"

type frontendBuildRunner func(frontendRoot string, packageManager string, args []string) error

var pluginFrontendBuildRunner frontendBuildRunner = runPluginFrontendCommand

type runtimeManagedFrontendAssetMode int

const (
	runtimeManagedFrontendSourceBuild runtimeManagedFrontendAssetMode = iota
	runtimeManagedFrontendPackagedDeployment
)

// EnsureRuntimeManagedPluginFrontendAssetsForRoot materializes required frontend
// bundle assets for runtime-managed plugins that own their frontend build path.
func EnsureRuntimeManagedPluginFrontendAssetsForRoot(pluginRoot string) error {
	return ensureRuntimeManagedPluginFrontendAssetsForRootWithMode(
		pluginRoot,
		runtimeManagedFrontendSourceBuild,
	)
}

func ensureRuntimeManagedPluginFrontendAssetsForRootWithMode(
	pluginRoot string,
	mode runtimeManagedFrontendAssetMode,
) error {
	manifest, err := loadPluginManifestFile(filepath.Join(pluginRoot, pluginManifestFileName))
	if err != nil {
		return err
	}
	return ensureRuntimeManagedPluginFrontendAssets(pluginRoot, manifest, mode)
}

func ensureRuntimeManagedPluginFrontendAssets(
	pluginRoot string,
	manifest PluginManifest,
	mode runtimeManagedFrontendAssetMode,
) error {
	if manifest.Frontend == nil || manifest.Frontend.Build == nil {
		return nil
	}

	frontendRoot := filepath.Join(pluginRoot, "frontend")
	packageJSONPath := filepath.Join(frontendRoot, "package.json")
	switch _, err := os.Stat(packageJSONPath); {
	case err == nil:
	case !os.IsNotExist(err):
		return fmt.Errorf("stat plugin frontend package metadata %s: %w", packageJSONPath, err)
	case mode == runtimeManagedFrontendPackagedDeployment:
		return validatePluginFrontendPaths(pluginRoot, manifest)
	default:
		return newServiceError(
			ServiceErrorCodeSourceInvalid,
			"Plugin %s declares a plugin-owned frontend build but %s is missing",
			manifest.ID,
			packageJSONPath,
		)
	}

	if err := buildRuntimeManagedPluginFrontendAssets(frontendRoot, manifest); err != nil {
		return err
	}
	return validatePluginFrontendPaths(pluginRoot, manifest)
}

func buildRuntimeManagedPluginFrontendAssets(
	frontendRoot string,
	manifest PluginManifest,
) error {
	if err := pluginFrontendBuildRunner(
		frontendRoot,
		manifest.Frontend.Build.PackageManager,
		[]string{"install", "--lockfile=false"},
	); err != nil {
		return newServiceError(
			ServiceErrorCodeSourceInvalid,
			"Plugin %s frontend dependency install failed: %s",
			manifest.ID,
			err.Error(),
		)
	}
	if err := pluginFrontendBuildRunner(
		frontendRoot,
		manifest.Frontend.Build.PackageManager,
		[]string{"run", "build"},
	); err != nil {
		return newServiceError(
			ServiceErrorCodeSourceInvalid,
			"Plugin %s frontend build failed: %s",
			manifest.ID,
			err.Error(),
		)
	}
	return nil
}

func runPluginFrontendCommand(frontendRoot string, packageManager string, args []string) error {
	commandName, err := runtimeManagedFrontendBuildCommandName(packageManager)
	if err != nil {
		return err
	}
	toolPath, err := exec.LookPath(commandName)
	if err != nil {
		return fmt.Errorf("resolve %s for %s: %w", packageManager, frontendRoot, err)
	}
	commandArgs := append([]string{"--dir", frontendRoot}, args...)
	command := exec.Command(toolPath, commandArgs...)
	output, err := command.CombinedOutput()
	if err == nil {
		return nil
	}
	trimmedOutput := strings.TrimSpace(string(output))
	if trimmedOutput == "" {
		return fmt.Errorf("%s %s: %w", toolPath, strings.Join(commandArgs, " "), err)
	}
	return fmt.Errorf(
		"%s %s: %w\n%s",
		toolPath,
		strings.Join(commandArgs, " "),
		err,
		trimmedOutput,
	)
}

func runtimeManagedFrontendBuildCommandName(packageManager string) (string, error) {
	switch packageManager {
	case pluginFrontendBuildPackageManagerPNPM:
		if runtime.GOOS == "windows" {
			return "pnpm.cmd", nil
		}
		return "pnpm", nil
	default:
		return "", fmt.Errorf("unsupported plugin frontend package manager %q", packageManager)
	}
}
