package plugins

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/pythonenv"
	"setta/internal/testutil/firstpartyplugin"
	"setta/internal/testutil/packagedsetta"
)

func mustNewPythonRuntime(t *testing.T) *pythonenv.Runtime {
	t.Helper()

	runtime, err := pythonenv.NewRuntime(pythonenv.RuntimeOptions{})
	if err != nil {
		t.Fatalf("new python runtime: %v", err)
	}
	return runtime
}

func installPackageManagerFixture(t *testing.T, fixtureName string, packageName string, version string, mutate func(string)) (string, string) {
	t.Helper()

	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	pluginRoot := installPackageManagerFixtureInSearchPath(t, sitePackages, fixtureName, packageName, version, mutate)
	return sitePackages, pluginRoot
}

func installPackageManagerFixtureInSearchPath(t *testing.T, sitePackages string, fixtureName string, packageName string, version string, mutate func(string)) string {
	t.Helper()

	packagedsetta.InstallRuntimeSitePackages(t, workerRPCTestRepoRoot(t), sitePackages)

	repoRoot := workerRPCTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", fixtureName)
	pluginRoot := filepath.Join(sitePackages, packageManagerFixturePluginRootName(t, sourceRoot))
	copyBackendCodegenFixtureDir(t, sourceRoot, pluginRoot)
	materializePackageManagerFixtureFrontendAssets(t, pluginRoot)
	if mutate != nil {
		mutate(pluginRoot)
	}

	distInfoName := strings.ReplaceAll(packageName, "-", "_") + "-" + version + ".dist-info"
	distInfoRoot := filepath.Join(sitePackages, distInfoName)
	writePackageManagerTestFile(t, filepath.Join(distInfoRoot, "METADATA"), strings.Join([]string{
		"Metadata-Version: 2.1",
		"Name: " + packageName,
		"Version: " + version,
		"Summary: Setta fixture plugin",
		"",
	}, "\n"))

	recordLines := make([]string, 0)
	for _, root := range []string{pluginRoot, distInfoRoot} {
		err := filepath.Walk(root, func(path string, info os.FileInfo, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if info.IsDir() {
				return nil
			}
			relativePath, err := filepath.Rel(sitePackages, path)
			if err != nil {
				return err
			}
			if filepath.Base(path) == "RECORD" {
				return nil
			}
			recordLines = append(recordLines, filepath.ToSlash(relativePath)+",,")
			return nil
		})
		if err != nil {
			t.Fatalf("walk package-manager fixture: %v", err)
		}
	}
	recordLines = append(recordLines, filepath.ToSlash(filepath.Join(distInfoName, "RECORD"))+",,")
	writePackageManagerTestFile(t, filepath.Join(distInfoRoot, "RECORD"), strings.Join(append(recordLines, ""), "\n"))
	return pluginRoot
}

func materializePackageManagerFixtureFrontendAssets(t *testing.T, pluginRoot string) {
	t.Helper()

	manifest, err := loadPluginManifestFile(filepath.Join(pluginRoot, pluginManifestFileName))
	if err != nil {
		t.Fatalf("load package-manager fixture manifest: %v", err)
	}
	if manifest.Frontend == nil || manifest.Frontend.Build == nil {
		return
	}
	if err := EnsureRuntimeManagedPluginFrontendAssetsForRoot(pluginRoot); err != nil {
		t.Fatalf("materialize package-manager fixture frontend assets: %v", err)
	}
	for _, relativePath := range []string{
		"build_backend.py",
		filepath.Join("frontend", "node_modules"),
		filepath.Join("frontend", "package.json"),
		filepath.Join("frontend", "scripts"),
		filepath.Join("frontend", "src"),
		filepath.Join("frontend", "pnpm-lock.yaml"),
		"pyproject.toml",
	} {
		if err := os.RemoveAll(filepath.Join(pluginRoot, relativePath)); err != nil {
			t.Fatalf("remove package-manager fixture build input %s: %v", relativePath, err)
		}
	}
}

func installFirstPartyBasedpyrightPackageManagerPluginInSearchPath(t *testing.T, sitePackages string) string {
	t.Helper()

	return installFirstPartyPackageManagerPluginInSearchPath(
		t,
		sitePackages,
		"setta-basedpyright",
		"Setta basedpyright defaults profile plugin",
	)
}

func installFirstPartyTyPackageManagerPluginInSearchPath(t *testing.T, sitePackages string) string {
	t.Helper()

	return installFirstPartyPackageManagerPluginInSearchPath(
		t,
		sitePackages,
		"setta-ty",
		"Setta ty first-party plugin",
	)
}

func installBuiltFirstPartyPackageManagerPluginInSearchPath(
	t *testing.T,
	sitePackages string,
	pluginID string,
) string {
	t.Helper()

	repoRoot := workerRPCTestRepoRoot(t)
	stagingRoot := filepath.Join(t.TempDir(), pluginID)
	if pluginID == firstpartyplugin.AppSubsystemPluginID {
		stagingRoot = stageFirstPartyAppSubsystemPluginSource(t)
	} else {
		copyBackendCodegenFixtureDir(
			t,
			filepath.Join(repoRoot, "plugins", pluginID),
			stagingRoot,
		)
	}
	findLinksRoot := filepath.Join(t.TempDir(), "find-links")
	settaWheelDir := filepath.Join(findLinksRoot, "setta")
	settaProjectRoot := filepath.Join(t.TempDir(), "setta")
	packagedsetta.BuildRuntimeProject(t, repoRoot, settaProjectRoot)
	buildLocalBuiltPyPIWheelFromRoot(t, settaWheelDir, settaProjectRoot)
	wheelPath := buildLocalBuiltPyPIWheelFromRoot(t, filepath.Join(findLinksRoot, "plugin"), stagingRoot)
	runTestCommand(
		t,
		repoRoot,
		mustNewPythonRuntime(t).InterpreterPath(),
		"-m",
		"pip",
		"install",
		"--no-index",
		"--find-links",
		settaWheelDir,
		"--target",
		sitePackages,
		wheelPath,
	)
	return filepath.Join(sitePackages, pluginID)
}

func installFirstPartyPackageManagerPluginAsIDInSearchPath(
	t *testing.T,
	sitePackages string,
	sourcePluginID string,
	targetPluginID string,
	summary string,
) string {
	t.Helper()

	packagedsetta.InstallRuntimeSitePackages(t, workerRPCTestRepoRoot(t), sitePackages)

	repoRoot := workerRPCTestRepoRoot(t)
	pluginRoot := filepath.Join(sitePackages, targetPluginID)
	copyBackendCodegenFixtureDir(t, filepath.Join(repoRoot, "plugins", sourcePluginID), pluginRoot)
	if err := os.RemoveAll(filepath.Join(pluginRoot, "build")); err != nil {
		t.Fatalf("remove copied plugin build dir: %v", err)
	}
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["id"] = targetPluginID
	})

	distInfoName := strings.ReplaceAll(targetPluginID, "-", "_") + "-0.1.0.dist-info"
	distInfoRoot := filepath.Join(sitePackages, distInfoName)
	writePackageManagerTestFile(t, filepath.Join(distInfoRoot, "METADATA"), strings.Join([]string{
		"Metadata-Version: 2.1",
		"Name: " + targetPluginID,
		"Version: 0.1.0",
		"Summary: " + summary,
		"",
	}, "\n"))

	recordLines := make([]string, 0)
	for _, root := range []string{pluginRoot, distInfoRoot} {
		err := filepath.Walk(root, func(path string, info os.FileInfo, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if info.IsDir() || filepath.Base(path) == "RECORD" {
				return nil
			}
			relativePath, err := filepath.Rel(sitePackages, path)
			if err != nil {
				return err
			}
			recordLines = append(recordLines, filepath.ToSlash(relativePath)+",,")
			return nil
		})
		if err != nil {
			t.Fatalf("walk package-manager plugin fixture: %v", err)
		}
	}
	recordLines = append(recordLines, filepath.ToSlash(filepath.Join(distInfoName, "RECORD"))+",,")
	writePackageManagerTestFile(t, filepath.Join(distInfoRoot, "RECORD"), strings.Join(append(recordLines, ""), "\n"))
	return pluginRoot
}

func installFirstPartyPackageManagerPluginInSearchPath(t *testing.T, sitePackages string, pluginID string, summary string) string {
	t.Helper()

	return installFirstPartyPackageManagerPluginAsIDInSearchPath(
		t,
		sitePackages,
		pluginID,
		pluginID,
		summary,
	)
}

func firstPartyBasedpyrightSitePackages(t *testing.T) string {
	t.Helper()

	pythonPath := firstpartyplugin.BasedpyrightPython(t)
	venvRoot := filepath.Dir(filepath.Dir(pythonPath))

	windowsSitePackages := filepath.Join(venvRoot, "Lib", "site-packages")
	if info, err := os.Stat(windowsSitePackages); err == nil && info.IsDir() {
		return windowsSitePackages
	}

	matches, err := filepath.Glob(filepath.Join(venvRoot, "lib", "python*", "site-packages"))
	if err != nil {
		t.Fatalf("glob basedpyright site-packages: %v", err)
	}
	for _, match := range matches {
		if info, err := os.Stat(match); err == nil && info.IsDir() {
			return match
		}
	}
	t.Fatalf("resolve basedpyright site-packages for %s", pythonPath)
	return ""
}

func packageManagerFixturePluginRootName(t *testing.T, sourceRoot string) string {
	t.Helper()

	manifest, err := loadPluginManifestFile(filepath.Join(sourceRoot, pluginManifestFileName))
	if err != nil {
		t.Fatalf("load package-manager fixture manifest: %v", err)
	}
	return manifest.ID
}

func mustNewDiscoveryServiceWithPackageManager(t *testing.T, roots filesystemResolverTestRoots, mode config.Mode, searchPaths []string) *DiscoveryService {
	t.Helper()

	service, err := NewDiscoveryService(DiscoveryServiceOptions{
		WorkspaceRoot:             roots.workspaceRoot,
		SettaFilesRoot:            roots.settaFilesRoot,
		SettaHome:                 roots.settaHome,
		ServerMode:                mode,
		PackageManagerRuntime:     mustNewPythonRuntime(t),
		PackageManagerSearchPaths: searchPaths,
	})
	if err != nil {
		t.Fatalf("new discovery service with package manager: %v", err)
	}
	return service
}

func mustNewPluginMutationServiceWithPackageManager(t *testing.T, roots filesystemResolverTestRoots, provider CandidateProvider, mode config.Mode, searchPaths []string) *Service {
	t.Helper()

	service, err := NewService(ServiceOptions{
		WorkspaceRoot:             roots.workspaceRoot,
		SettaFilesRoot:            roots.settaFilesRoot,
		SettaHome:                 roots.settaHome,
		ServerMode:                mode,
		CandidateProvider:         provider,
		PackageManagerRuntime:     mustNewPythonRuntime(t),
		PackageManagerSearchPaths: searchPaths,
	})
	if err != nil {
		t.Fatalf("new plugin mutation service with package manager: %v", err)
	}
	return service
}

func writePackageManagerTestFile(t *testing.T, path string, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
