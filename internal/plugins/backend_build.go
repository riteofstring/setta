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
)

const backendExecutableFileName = "plugin-backend"

func ValidateGoBackendBuild(pluginRoot string, manifest PluginManifest) error {
	if manifest.Backend == nil {
		return nil
	}

	entrypointPath, err := ResolvePluginBackendEntrypoint(pluginRoot, manifest)
	if err != nil {
		return newServiceError(ServiceErrorCodeBackendBuildFailed, "%s", err.Error())
	}
	if err := validateGoBackendEntrypoint(entrypointPath); err != nil {
		return err
	}

	buildRoot, err := os.MkdirTemp("", "setta-plugin-backend-build-*")
	if err != nil {
		return fmt.Errorf("create plugin backend build temp dir: %w", err)
	}
	defer os.RemoveAll(buildRoot)

	outputPath := filepath.Join(buildRoot, backendExecutableFileName)
	return buildGoBackendBinary(entrypointPath, outputPath, manifest.ID)
}

func BuildGoBackendExecutable(pluginRoot string, manifest PluginManifest, outputRoot string) (string, error) {
	if manifest.Backend == nil {
		return "", fmt.Errorf("plugins: backend manifest is required")
	}
	if strings.TrimSpace(outputRoot) == "" {
		return "", fmt.Errorf("plugins: backend build output root is required")
	}

	entrypointPath, err := ResolvePluginBackendEntrypoint(pluginRoot, manifest)
	if err != nil {
		return "", err
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
