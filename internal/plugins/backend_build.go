package plugins

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"setta/internal/pythonenv"
)

const (
	BackendBuildRootName      = "plugin_backend_builds"
	backendExecutableFileName = "plugin-backend"
)

type PluginBackendLaunch struct {
	Command     string
	Args        []string
	Environment map[string]string
}

const pythonBackendSitePackagesDirName = ".setta-python-site-packages"

func ValidateGoBackendBuild(pluginRoot string, manifest PluginManifest) error {
	if manifest.Backend == nil {
		return nil
	}

	buildRoot, err := os.MkdirTemp("", "setta-plugin-backend-build-*")
	if err != nil {
		return fmt.Errorf("create plugin backend build temp dir: %w", err)
	}
	defer os.RemoveAll(buildRoot)

	launch, err := ResolvePluginBackendLaunch(pluginRoot, manifest, buildRoot)
	if err != nil {
		return err
	}
	if !backendProbeRequired(manifest.Capabilities) {
		return nil
	}
	_, err = probePluginBackendRegistrations(pluginRoot, manifest, launch)
	return err
}

func ResolvePluginBackendLaunch(pluginRoot string, manifest PluginManifest, outputRoot string) (PluginBackendLaunch, error) {
	if manifest.Backend == nil {
		return PluginBackendLaunch{}, fmt.Errorf("plugins: backend manifest is required")
	}

	entrypointPath, err := ResolvePluginBackendEntrypoint(pluginRoot, manifest)
	if err != nil {
		return PluginBackendLaunch{}, newServiceError(ServiceErrorCodeBackendBuildFailed, "%s", err.Error())
	}

	switch strings.ToLower(filepath.Ext(entrypointPath)) {
	case ".go":
		executablePath, err := buildPluginGoBackendExecutable(pluginRoot, manifest, entrypointPath, outputRoot)
		if err != nil {
			return PluginBackendLaunch{}, err
		}
		return PluginBackendLaunch{Command: executablePath}, nil
	case ".py":
		pythonBinary, err := pythonenv.ResolveCurrentProcessInterpreter(os.LookupEnv)
		if err != nil {
			return PluginBackendLaunch{}, newServiceError(
				ServiceErrorCodeBackendBuildFailed,
				"Python interpreter is required to launch backend plugin %s: %s",
				manifest.ID,
				err.Error(),
			)
		}
		environment, err := pythonBackendLaunchEnvironment(pluginRoot)
		if err != nil {
			return PluginBackendLaunch{}, newServiceError(
				ServiceErrorCodeBackendBuildFailed,
				"Python backend environment is invalid for plugin %s: %s",
				manifest.ID,
				err.Error(),
			)
		}
		return PluginBackendLaunch{
			Command:     pythonBinary,
			Args:        []string{entrypointPath},
			Environment: environment,
		}, nil
	default:
		return PluginBackendLaunch{}, newServiceError(
			ServiceErrorCodeBackendBuildFailed,
			"Plugin backend entrypoint must be a Go or Python source file: %s",
			entrypointPath,
		)
	}
}

func buildPluginGoBackendExecutable(
	pluginRoot string,
	manifest PluginManifest,
	entrypointPath string,
	outputRoot string,
) (string, error) {
	if strings.TrimSpace(outputRoot) == "" {
		return "", fmt.Errorf("plugins: backend build output root is required")
	}
	if err := validateGoBackendEntrypoint(entrypointPath); err != nil {
		return "", err
	}
	digest, err := computeDirectoryDigest(pluginRoot)
	if err != nil {
		return "", err
	}
	buildDir := filepath.Join(outputRoot, manifest.ID, digest)
	if err := os.MkdirAll(buildDir, 0o755); err != nil {
		return "", fmt.Errorf("create plugin backend build dir %s: %w", buildDir, err)
	}
	outputPath := filepath.Join(buildDir, backendExecutableNameForPlatform())
	if _, err := os.Stat(outputPath); err == nil {
		return outputPath, nil
	} else if !os.IsNotExist(err) {
		return "", fmt.Errorf("stat plugin backend executable %s: %w", outputPath, err)
	}

	if err := buildGoBackendBinary(entrypointPath, outputPath, manifest.ID); err != nil {
		return "", err
	}
	return outputPath, nil
}

func validateGoBackendEntrypoint(entrypointPath string) error {
	if filepath.Ext(entrypointPath) != ".go" {
		return newServiceError(
			ServiceErrorCodeBackendBuildFailed,
			"Plugin backend entrypoint must be a Go source file: %s",
			entrypointPath,
		)
	}

	sourceSet := token.NewFileSet()
	entrypointFile, err := parser.ParseFile(sourceSet, entrypointPath, nil, parser.SkipObjectResolution)
	if err != nil {
		return newServiceError(
			ServiceErrorCodeBackendBuildFailed,
			"Plugin backend entrypoint must be valid Go source: %s",
			entrypointPath,
		)
	}
	if entrypointFile.Name == nil || entrypointFile.Name.Name != "main" {
		return newServiceError(
			ServiceErrorCodeBackendBuildFailed,
			"Plugin backend entrypoint must declare package main: %s",
			entrypointPath,
		)
	}
	if !goFileDeclaresMainFunction(entrypointFile) {
		return newServiceError(
			ServiceErrorCodeBackendBuildFailed,
			"Plugin backend entrypoint must declare func main(): %s",
			entrypointPath,
		)
	}
	return nil
}

func pythonBackendLaunchEnvironment(pluginRoot string) (map[string]string, error) {
	importRoots, err := pythonBackendImportRoots(pluginRoot)
	if err != nil {
		return nil, err
	}
	if len(importRoots) == 0 {
		return nil, nil
	}

	pythonPathEntries := append([]string{}, importRoots...)
	if currentPythonPath, ok := os.LookupEnv("PYTHONPATH"); ok {
		for _, entry := range filepath.SplitList(currentPythonPath) {
			trimmed := strings.TrimSpace(entry)
			if trimmed != "" {
				pythonPathEntries = append(pythonPathEntries, trimmed)
			}
		}
	}
	pythonPathEntries = dedupeNonEmptyPaths(pythonPathEntries)
	if len(pythonPathEntries) == 0 {
		return nil, nil
	}

	return map[string]string{
		"PYTHONPATH": strings.Join(pythonPathEntries, string(os.PathListSeparator)),
	}, nil
}

func pythonBackendImportRoots(pluginRoot string) ([]string, error) {
	roots := []string{pluginRoot}

	vendoredSitePackages := filepath.Join(pluginRoot, pythonBackendSitePackagesDirName)
	if directoryContainsFiles(vendoredSitePackages) {
		roots = append(roots, vendoredSitePackages)
	}

	if sourceCheckoutBackendRoot := resolveSourceCheckoutPythonBackendRoot(); sourceCheckoutBackendRoot != "" {
		roots = append(roots, sourceCheckoutBackendRoot)
	}

	parentRoot := filepath.Dir(pluginRoot)
	if parentRoot != "" && parentRoot != pluginRoot {
		hasDistInfo, err := directoryContainsDistInfo(parentRoot)
		if err != nil {
			return nil, err
		}
		if hasDistInfo {
			roots = append(roots, parentRoot)
		}
	}

	return dedupeNonEmptyPaths(roots), nil
}

func resolveSourceCheckoutPythonBackendRoot() string {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		return ""
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(file), "..", ".."))
	backendRoot := filepath.Join(repoRoot, "backend")
	if _, err := os.Stat(filepath.Join(backendRoot, "setta", "__init__.py")); err != nil {
		return ""
	}
	return backendRoot
}

func directoryContainsDistInfo(root string) (bool, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, fmt.Errorf("read python backend import root %s: %w", root, err)
	}
	for _, entry := range entries {
		if entry.IsDir() && strings.HasSuffix(strings.ToLower(entry.Name()), ".dist-info") {
			return true, nil
		}
	}
	return false, nil
}

func directoryContainsFiles(root string) bool {
	entries, err := os.ReadDir(root)
	if err != nil {
		return false
	}
	return len(entries) != 0
}

func dedupeNonEmptyPaths(paths []string) []string {
	if len(paths) == 0 {
		return nil
	}
	deduped := make([]string, 0, len(paths))
	seen := map[string]struct{}{}
	for _, rawPath := range paths {
		trimmed := strings.TrimSpace(rawPath)
		if trimmed == "" {
			continue
		}
		normalized := filepath.Clean(trimmed)
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		deduped = append(deduped, normalized)
	}
	if len(deduped) == 0 {
		return nil
	}
	return deduped
}

func mergePluginBackendCommandEnv(overrides map[string]string) []string {
	if len(overrides) == 0 {
		return nil
	}
	env := append([]string(nil), os.Environ()...)
	for key, value := range overrides {
		env = withEnvValue(env, key, value)
	}
	return env
}

func buildGoBackendBinary(entrypointPath string, outputPath string, pluginID string) error {
	goBinary, err := resolveGoBinary()
	if err != nil {
		return newServiceError(ServiceErrorCodeBackendBuildFailed, "%s", err.Error())
	}

	command := exec.Command(goBinary, "build", "-mod=readonly", "-o", outputPath, ".")
	command.Dir = filepath.Dir(entrypointPath)
	command.Env = os.Environ()
	output, err := command.CombinedOutput()
	if err != nil {
		message := strings.TrimSpace(string(output))
		if message == "" {
			message = err.Error()
		}
		return newServiceError(
			ServiceErrorCodeBackendBuildFailed,
			"Go backend build failed for plugin %s: %s",
			pluginID,
			message,
		)
	}
	return nil
}

func goFileDeclaresMainFunction(file *ast.File) bool {
	if file == nil {
		return false
	}
	for _, declaration := range file.Decls {
		function, ok := declaration.(*ast.FuncDecl)
		if !ok || function.Recv != nil || function.Name == nil {
			continue
		}
		if function.Name.Name == "main" {
			return true
		}
	}
	return false
}

func resolveGoBinary() (string, error) {
	candidates := []string{
		strings.TrimSpace(os.Getenv("SETTA_GO_BIN")),
		strings.TrimSpace(os.Getenv("GO")),
	}
	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
	}

	if path, err := exec.LookPath("go"); err == nil {
		return path, nil
	}

	gorootBinary := filepath.Join(runtime.GOROOT(), "bin", "go")
	if _, err := os.Stat(gorootBinary); err == nil {
		return gorootBinary, nil
	}

	return "", fmt.Errorf("Go toolchain is required to build backend plugins")
}

func backendExecutableNameForPlatform() string {
	if runtime.GOOS == "windows" {
		return backendExecutableFileName + ".exe"
	}
	return backendExecutableFileName
}
