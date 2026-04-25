package packagedsetta

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/buildinfo"
)

var runtimeModuleRelativePaths = []string{
	"__init__.py",
	"entrypoint.py",
	"local_core_client.py",
	"runtime_compat.py",
	"plugin_runtime/__init__.py",
	"plugin_runtime/app_subsystem.py",
	"plugin_runtime/local_core.py",
	"sdk_contracts/constants.py",
	"types/generated/go_shared_constants.py",
}

var runtimeNamespaceInitPaths = []string{
	"sdk_contracts/__init__.py",
	"types/__init__.py",
	"types/generated/__init__.py",
}

func InstallRuntimeSitePackages(t *testing.T, repoRoot string, sitePackages string) {
	t.Helper()

	packageRoot := filepath.Join(sitePackages, "setta")
	copyRuntimePackage(t, repoRoot, packageRoot)

	version := runtimeVersion(t)
	distInfoName := "setta-" + version + ".dist-info"
	distInfoRoot := filepath.Join(sitePackages, distInfoName)
	writeFile(
		t,
		filepath.Join(distInfoRoot, "METADATA"),
		strings.Join([]string{
			"Metadata-Version: 2.1",
			"Name: setta",
			"Version: " + version,
			"Summary: Setta runtime test fixture",
			"",
		}, "\n"),
	)
	writeRecord(t, sitePackages, distInfoName, packageRoot, distInfoRoot)
}

func BuildRuntimeProject(t *testing.T, repoRoot string, projectRoot string) {
	t.Helper()

	packageRoot := filepath.Join(projectRoot, "setta")
	copyRuntimePackage(t, repoRoot, packageRoot)

	version := runtimeVersion(t)
	writeFile(
		t,
		filepath.Join(projectRoot, "pyproject.toml"),
		strings.Join([]string{
			"[build-system]",
			`requires = ["setuptools==80.9.0", "wheel==0.45.1"]`,
			`build-backend = "setuptools.build_meta"`,
			"",
			"[project]",
			`name = "setta"`,
			`version = "` + version + `"`,
			`requires-python = ">=3.12"`,
			"",
			"[tool.setuptools]",
			`packages = ["setta", "setta.plugin_runtime", "setta.sdk_contracts", "setta.types", "setta.types.generated"]`,
			"",
		}, "\n"),
	)
}

func copyRuntimePackage(t *testing.T, repoRoot string, packageRoot string) {
	t.Helper()

	for _, relativePath := range runtimeModuleRelativePaths {
		sourcePath := filepath.Join(repoRoot, "backend", "setta", relativePath)
		payload, err := os.ReadFile(sourcePath)
		if err != nil {
			t.Fatalf("read packaged Setta runtime module %s: %v", sourcePath, err)
		}
		writeFile(t, filepath.Join(packageRoot, relativePath), string(payload))
	}
	for _, relativePath := range runtimeNamespaceInitPaths {
		writeFile(t, filepath.Join(packageRoot, relativePath), "")
	}
}

func runtimeVersion(t *testing.T) string {
	t.Helper()

	version := strings.TrimSpace(buildinfo.HostPackageVersion())
	if version == "" || version == "dev" {
		t.Fatalf("resolve packaged Setta version for test runtime fixture: %q", version)
	}
	return version
}

func writeRecord(
	t *testing.T,
	sitePackages string,
	distInfoName string,
	roots ...string,
) {
	t.Helper()

	recordLines := make([]string, 0)
	for _, root := range roots {
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
			t.Fatalf("walk packaged Setta runtime fixture: %v", err)
		}
	}
	recordLines = append(recordLines, filepath.ToSlash(filepath.Join(distInfoName, "RECORD"))+",,")
	writeFile(
		t,
		filepath.Join(sitePackages, distInfoName, "RECORD"),
		strings.Join(append(recordLines, ""), "\n"),
	)
}

func writeFile(t *testing.T, path string, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
