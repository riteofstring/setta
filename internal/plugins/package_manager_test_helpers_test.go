package plugins

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/pythonenv"
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

	pluginRoot := filepath.Join(sitePackages, strings.ReplaceAll(packageName, "-", "_"))
	repoRoot := workerRPCTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", fixtureName)
	copyBackendCodegenFixtureDir(t, sourceRoot, pluginRoot)
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
