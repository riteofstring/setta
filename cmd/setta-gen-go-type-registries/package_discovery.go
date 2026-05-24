package main

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
)

func frontendValueExportPackagePaths() ([]string, error) {
	repoRoot, err := generatorRepoRoot()
	if err != nil {
		return nil, err
	}
	return walkPackagePaths(
		repoRoot,
		filepath.Join(repoRoot, "internal"),
		filepath.Join(repoRoot, "plugins"),
	)
}

func walkPackagePaths(repoRoot string, roots ...string) ([]string, error) {
	packages := []string{}
	for _, root := range roots {
		if strings.TrimSpace(root) == "" {
			continue
		}
		if _, err := os.Stat(root); errors.Is(err, os.ErrNotExist) {
			continue
		} else if err != nil {
			return nil, err
		}
		if err := filepath.WalkDir(root, func(current string, entry fs.DirEntry, err error) error {
			return collectPackagePath(repoRoot, current, entry, err, &packages)
		}); err != nil {
			return nil, err
		}
	}
	sort.Strings(packages)
	return packages, nil
}

func collectPackagePath(
	repoRoot string,
	current string,
	entry fs.DirEntry,
	walkErr error,
	packages *[]string,
) error {
	if walkErr != nil {
		return walkErr
	}
	if !entry.IsDir() {
		return nil
	}
	if shouldSkipInternalPackageDir(entry.Name()) {
		return filepath.SkipDir
	}
	hasGoFiles, err := directoryHasNonTestGoFiles(current)
	if err != nil || !hasGoFiles {
		return err
	}
	packagePath, err := internalPackagePath(repoRoot, current)
	if err != nil {
		return err
	}
	*packages = append(*packages, packagePath)
	return nil
}

func shouldSkipInternalPackageDir(name string) bool {
	return name == "testdata" || strings.HasPrefix(name, ".")
}

func directoryHasNonTestGoFiles(dir string) (bool, error) {
	matches, err := filepath.Glob(filepath.Join(dir, "*.go"))
	if err != nil {
		return false, err
	}
	for _, match := range matches {
		if strings.HasSuffix(match, "_test.go") {
			continue
		}
		return true, nil
	}
	return false, nil
}

func internalPackagePath(repoRoot string, current string) (string, error) {
	relative, err := filepath.Rel(repoRoot, current)
	if err != nil {
		return "", err
	}
	return "setta/" + filepath.ToSlash(relative), nil
}

func generatorRepoRoot() (string, error) {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		return "", fmt.Errorf("resolve caller path")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(currentFile), "..", "..")), nil
}

func packagePathForPackageName(packageName string) string {
	return "setta/internal/" + packageName
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "setta-gen-go-type-registries: "+format+"\n", args...)
	os.Exit(1)
}
