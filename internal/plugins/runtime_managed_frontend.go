package plugins

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

const runtimeManagedAppSubsystemPluginID = "setta-json-render-app-gen"

type frontendBuildRunner func(frontendRoot string, args []string) error

var pluginFrontendBuildRunner frontendBuildRunner = runPluginFrontendCommand

// EnsureRuntimeManagedPluginFrontendAssetsForRoot materializes required frontend
// bundle assets for runtime-managed plugins that own their frontend build path.
func EnsureRuntimeManagedPluginFrontendAssetsForRoot(pluginRoot string) error {
	manifest, err := loadPluginManifestFile(filepath.Join(pluginRoot, pluginManifestFileName))
	if err != nil {
		return err
	}
	return ensureRuntimeManagedPluginFrontendAssets(pluginRoot, manifest)
}

func ensureRuntimeManagedPluginFrontendAssets(
	pluginRoot string,
	manifest PluginManifest,
) error {
	if manifest.ID != runtimeManagedAppSubsystemPluginID || manifest.Frontend == nil {
		return nil
	}

	frontendRoot := filepath.Join(pluginRoot, "frontend")
	packageJSONPath := filepath.Join(frontendRoot, "package.json")
	if _, err := os.Stat(packageJSONPath); err != nil {
		if os.IsNotExist(err) {
			return newServiceError(
				ServiceErrorCodeSourceInvalid,
				"Plugin %s frontend build metadata is missing: %s",
				manifest.ID,
				packageJSONPath,
			)
		}
		return fmt.Errorf("stat plugin frontend package metadata %s: %w", packageJSONPath, err)
	}

	if !directoryContainsFiles(filepath.Join(frontendRoot, "node_modules")) {
		if err := pluginFrontendBuildRunner(
			frontendRoot,
			[]string{"install", "--lockfile=false"},
		); err != nil {
			return newServiceError(
				ServiceErrorCodeSourceInvalid,
				"Plugin %s frontend dependency install failed: %s",
				manifest.ID,
				err.Error(),
			)
		}
	}
	if err := pluginFrontendBuildRunner(frontendRoot, []string{"run", "build"}); err != nil {
		return newServiceError(
			ServiceErrorCodeSourceInvalid,
			"Plugin %s frontend build failed: %s",
			manifest.ID,
			err.Error(),
		)
	}
	if err := validatePluginFrontendPaths(pluginRoot, manifest); err != nil {
		return err
	}
	return nil
}

func runPluginFrontendCommand(frontendRoot string, args []string) error {
	pnpmPath, err := exec.LookPath(runtimeManagedFrontendBuildCommandName())
	if err != nil {
		return fmt.Errorf("resolve pnpm for %s: %w", frontendRoot, err)
	}
	commandArgs := append([]string{"--dir", frontendRoot}, args...)
	command := exec.Command(pnpmPath, commandArgs...)
	output, err := command.CombinedOutput()
	if err == nil {
		return nil
	}
	trimmedOutput := strings.TrimSpace(string(output))
	if trimmedOutput == "" {
		return fmt.Errorf("%s %s: %w", pnpmPath, strings.Join(commandArgs, " "), err)
	}
	return fmt.Errorf(
		"%s %s: %w\n%s",
		pnpmPath,
		strings.Join(commandArgs, " "),
		err,
		trimmedOutput,
	)
}

func runtimeManagedFrontendBuildCommandName() string {
	if runtime.GOOS == "windows" {
		return "pnpm.cmd"
	}
	return "pnpm"
}
