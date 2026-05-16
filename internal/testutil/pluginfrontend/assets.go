package pluginfrontend

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/plugins"
)

func MaterializeRuntimeManagedAssets(t testing.TB, pluginRoot string) {
	t.Helper()

	manifest, err := plugins.LoadPluginManifest(pluginRoot, filepath.Base(pluginRoot))
	if err != nil {
		t.Fatalf("load runtime-managed plugin manifest for %s: %v", pluginRoot, err)
	}
	if manifest.Frontend == nil || manifest.Frontend.Build == nil {
		return
	}

	frontendRoot := filepath.Join(pluginRoot, "frontend")
	packageJSONPath := filepath.Join(frontendRoot, "package.json")
	if _, err := os.Stat(packageJSONPath); err != nil {
		t.Fatalf("stat runtime-managed plugin frontend package metadata %s: %v", packageJSONPath, err)
	}
	runCommand(t, frontendRoot, manifest.Frontend.Build.PackageManager, "install", "--lockfile=false")
	runCommand(t, frontendRoot, manifest.Frontend.Build.PackageManager, "run", "build")
	if err := plugins.ValidatePluginManifestPaths(pluginRoot, manifest); err != nil {
		t.Fatalf("materialize runtime-managed plugin frontend assets for %s: %v", pluginRoot, err)
	}
}

func runCommand(t testing.TB, frontendRoot string, packageManager string, args ...string) {
	t.Helper()

	if packageManager != "pnpm" {
		t.Fatalf("unsupported runtime-managed plugin frontend package manager %q", packageManager)
	}
	toolPath, err := exec.LookPath(packageManager)
	if err != nil {
		t.Fatalf("resolve %s for %s: %v", packageManager, frontendRoot, err)
	}
	commandArgs := append([]string{"--dir", frontendRoot}, args...)
	command := exec.Command(toolPath, commandArgs...)
	output, err := command.CombinedOutput()
	if err == nil {
		return
	}
	trimmedOutput := strings.TrimSpace(string(output))
	if trimmedOutput == "" {
		t.Fatalf("%s %s: %v", toolPath, strings.Join(commandArgs, " "), err)
	}
	t.Fatalf("%s %s: %v\n%s", toolPath, strings.Join(commandArgs, " "), err, trimmedOutput)
}
