package appsubsystem

import (
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"testing"
)

const (
	disallowedAppSubsystemGoImportPrefix    = "setta/plugins/setta-json-render-app-gen/"
	disallowedAppSubsystemFrontendReference = "plugins/setta-json-render-app-gen/"
)

func TestRuntimeHostPackagesDoNotImportFirstPartyAppSubsystemProvider(t *testing.T) {
	t.Parallel()

	repoRoot := hostImportGuardRepoRoot(t)

	offenders := make([]string, 0)
	offenders = append(
		offenders,
		scanHostGoImports(
			t,
			repoRoot,
			filepath.Join(repoRoot, "cmd"),
			func(path string) bool {
				return strings.HasPrefix(filepath.Base(path), "setta-gen-")
			},
		)...,
	)
	offenders = append(
		offenders,
		scanHostGoImports(
			t,
			repoRoot,
			filepath.Join(repoRoot, "internal"),
			func(path string) bool {
				return filepath.Base(path) == "testutil"
			},
		)...,
	)
	offenders = append(
		offenders,
		scanHostFrontendReferences(
			t,
			repoRoot,
			filepath.Join(repoRoot, "frontend", "src"),
			func(path string) bool {
				return filepath.Base(path) == "openapi"
			},
		)...,
	)

	if len(offenders) == 0 {
		return
	}

	sort.Strings(offenders)
	t.Fatalf(
		"runtime host code must not reference plugins/setta-json-render-app-gen outside plugin-owned code and tests:\n%s",
		strings.Join(offenders, "\n"),
	)
}

func hostImportGuardRepoRoot(t *testing.T) string {
	t.Helper()

	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve app subsystem guard test file")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(currentFile), "..", ".."))
}

func scanHostGoImports(
	t *testing.T,
	repoRoot string,
	root string,
	skipDir func(path string) bool,
) []string {
	t.Helper()

	offenders := make([]string, 0)
	walkErr := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			if path != root && skipDir != nil && skipDir(path) {
				return filepath.SkipDir
			}
			return nil
		}
		if filepath.Ext(path) != ".go" {
			return nil
		}
		if strings.HasSuffix(path, "_test.go") || strings.HasSuffix(path, "_gen.go") {
			return nil
		}

		fset := token.NewFileSet()
		file, parseErr := parser.ParseFile(fset, path, nil, parser.ImportsOnly)
		if parseErr != nil {
			return parseErr
		}
		for _, spec := range file.Imports {
			importPath := strings.Trim(spec.Path.Value, `"`)
			if !strings.HasPrefix(importPath, disallowedAppSubsystemGoImportPrefix) {
				continue
			}
			relativePath, relErr := filepath.Rel(repoRoot, path)
			if relErr != nil {
				return relErr
			}
			offenders = append(offenders, relativePath+" imports "+importPath)
		}
		return nil
	})
	if walkErr != nil {
		t.Fatalf("scan host go imports: %v", walkErr)
	}
	return offenders
}

func scanHostFrontendReferences(
	t *testing.T,
	repoRoot string,
	root string,
	skipDir func(path string) bool,
) []string {
	t.Helper()

	offenders := make([]string, 0)
	walkErr := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			if path != root && skipDir != nil && skipDir(path) {
				return filepath.SkipDir
			}
			return nil
		}

		base := filepath.Base(path)
		if strings.Contains(base, ".test.") || strings.Contains(base, ".spec.") {
			return nil
		}
		switch filepath.Ext(path) {
		case ".ts", ".tsx", ".js", ".jsx":
		default:
			return nil
		}

		content, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		if !strings.Contains(string(content), disallowedAppSubsystemFrontendReference) {
			return nil
		}
		relativePath, relErr := filepath.Rel(repoRoot, path)
		if relErr != nil {
			return relErr
		}
		offenders = append(
			offenders,
			relativePath+" references "+disallowedAppSubsystemFrontendReference,
		)
		return nil
	})
	if walkErr != nil {
		t.Fatalf("scan host frontend references: %v", walkErr)
	}
	return offenders
}
