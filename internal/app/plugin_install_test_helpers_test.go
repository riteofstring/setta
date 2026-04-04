package app

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func configureAppLocalPyPIFixture(t *testing.T, fixtureName string, packageName string, version string) string {
	t.Helper()

	artifactDir := t.TempDir()
	buildAppLocalPyPIWheelFromFixture(t, artifactDir, fixtureName, packageName, version)
	t.Setenv("PIP_NO_INDEX", "1")
	t.Setenv("PIP_FIND_LINKS", artifactDir)
	return fmt.Sprintf("pypi:%s==%s", packageName, version)
}

func buildAppLocalPyPIWheelFromFixture(t *testing.T, artifactDir string, fixtureName string, packageName string, version string) string {
	t.Helper()

	sourceRoot := filepath.Join(appPluginFixtureRepoRoot(t), "tests", "fixtures", "plugins", fixtureName)
	stagingRoot := filepath.Join(t.TempDir(), "wheel-source")
	if err := copyAppPluginFixtureDir(sourceRoot, stagingRoot); err != nil {
		t.Fatalf("copy fixture into wheel staging root: %v", err)
	}
	rewriteAppFrontendFixtureManifestPaths(t, stagingRoot)
	rewriteAppFixtureManifestVersion(t, stagingRoot, version)

	if err := os.MkdirAll(artifactDir, 0o755); err != nil {
		t.Fatalf("mkdir artifact dir: %v", err)
	}
	wheelName := fmt.Sprintf("%s-%s-py3-none-any.whl", strings.ReplaceAll(packageName, "-", "_"), version)
	artifactPath := filepath.Join(artifactDir, wheelName)

	file, err := os.Create(artifactPath)
	if err != nil {
		t.Fatalf("create wheel artifact: %v", err)
	}
	archive := zip.NewWriter(file)
	err = filepath.Walk(stagingRoot, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info.IsDir() {
			return nil
		}
		relativePath, err := filepath.Rel(stagingRoot, path)
		if err != nil {
			return err
		}
		writer, err := archive.Create(filepath.ToSlash(relativePath))
		if err != nil {
			return err
		}
		payload, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		_, err = writer.Write(payload)
		return err
	})
	if err != nil {
		t.Fatalf("write fixture files into wheel: %v", err)
	}

	distInfoName := fmt.Sprintf("%s-%s.dist-info", strings.ReplaceAll(packageName, "-", "_"), version)
	writeAppWheelMetadataFile(t, archive, filepath.ToSlash(filepath.Join(distInfoName, "METADATA")), strings.Join([]string{
		"Metadata-Version: 2.1",
		"Name: " + packageName,
		"Version: " + version,
		"Summary: Setta fixture plugin",
		"",
	}, "\n"))
	writeAppWheelMetadataFile(t, archive, filepath.ToSlash(filepath.Join(distInfoName, "WHEEL")), strings.Join([]string{
		"Wheel-Version: 1.0",
		"Generator: setta-tests",
		"Root-Is-Purelib: true",
		"Tag: py3-none-any",
		"",
	}, "\n"))
	writeAppWheelMetadataFile(t, archive, filepath.ToSlash(filepath.Join(distInfoName, "RECORD")), "")

	if err := archive.Close(); err != nil {
		t.Fatalf("close wheel archive: %v", err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("close wheel file: %v", err)
	}
	return artifactPath
}

func writeAppWheelMetadataFile(t *testing.T, archive *zip.Writer, path string, content string) {
	t.Helper()

	writer, err := archive.Create(path)
	if err != nil {
		t.Fatalf("create wheel metadata file %s: %v", path, err)
	}
	if _, err := writer.Write([]byte(content)); err != nil {
		t.Fatalf("write wheel metadata file %s: %v", path, err)
	}
}

func rewriteAppFrontendFixtureManifestPaths(t *testing.T, root string) {
	t.Helper()

	err := filepath.Walk(root, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info.IsDir() || info.Name() != "setta.plugin.json" {
			return nil
		}
		payload, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		manifestPathDir := filepath.Dir(path)
		manifest := string(payload)
		replacements := map[string]string{
			"frontend/dist/index.js":  "frontend/src/index.js",
			"frontend/dist/index.css": "frontend/src/index.css",
		}
		for oldPath, newPath := range replacements {
			if !strings.Contains(manifest, oldPath) {
				continue
			}
			if _, err := os.Stat(filepath.Join(manifestPathDir, newPath)); err == nil {
				manifest = strings.ReplaceAll(manifest, oldPath, newPath)
			}
		}
		return os.WriteFile(path, []byte(manifest), 0o644)
	})
	if err != nil {
		t.Fatalf("rewrite frontend fixture manifest paths under %s: %v", root, err)
	}
}

func rewriteAppFixtureManifestVersion(t *testing.T, root string, version string) {
	t.Helper()

	err := filepath.Walk(root, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info.IsDir() || info.Name() != "setta.plugin.json" {
			return nil
		}

		payload, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		var manifest map[string]any
		if err := json.Unmarshal(payload, &manifest); err != nil {
			return err
		}
		manifest["version"] = version

		encoded, err := json.MarshalIndent(manifest, "", "  ")
		if err != nil {
			return err
		}
		encoded = append(encoded, '\n')
		return os.WriteFile(path, encoded, 0o644)
	})
	if err != nil {
		t.Fatalf("rewrite manifest versions under %s: %v", root, err)
	}
}
