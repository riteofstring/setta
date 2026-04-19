package plugins

import (
	"archive/zip"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/pythonenv"
)

// GitHub candidate resolution should clone a local bare repo, strip VCS metadata, and return a validated plugin root.
func TestProductionCandidateProviderResolveGitHubCandidateFromLocalBareRepo(t *testing.T) {
	t.Parallel()

	roots := newFilesystemResolverTestRoots(t)
	baseURL, ref := buildLocalGitHubBareRepoFromFixture(t, t.TempDir(), "frontend", "acme", "setta-fixture-frontend")
	provider := NewProductionCandidateProvider(ProductionCandidateProviderOptions{
		SettaFilesRoot: roots.settaFilesRoot,
		SettaVersion:   "0.1.0",
		GitHubBaseURL:  baseURL,
	})

	spec, err := ParseSourceSpec(fmt.Sprintf("github:acme/setta-fixture-frontend#%s", ref))
	if err != nil {
		t.Fatalf("parse source spec: %v", err)
	}

	candidate, err := provider.ResolveCandidate(context.Background(), spec, PluginInstallerBackendAuto)
	if err != nil {
		t.Fatalf("resolve GitHub candidate: %v", err)
	}
	defer func() {
		if candidate.cleanup != nil {
			_ = candidate.cleanup()
		}
	}()

	if candidate.Manifest.ID != "setta-fixture-frontend" {
		t.Fatalf("unexpected plugin id %q", candidate.Manifest.ID)
	}
	if candidate.CanonicalSourceKey != "github:acme/setta-fixture-frontend" {
		t.Fatalf("unexpected canonical source key %q", candidate.CanonicalSourceKey)
	}
	if _, err := os.Stat(filepath.Join(candidate.Root, ".git")); !os.IsNotExist(err) {
		t.Fatalf("expected .git metadata to be removed, got err=%v", err)
	}
	if candidate.SourceDigestSHA256 == nil || strings.TrimSpace(*candidate.SourceDigestSHA256) == "" {
		t.Fatalf("expected source digest to be populated")
	}
}

// GitHub source fetch should surface a deterministic missing-git error.
func TestProductionCandidateProviderResolveGitHubCandidateReportsMissingGitBinary(t *testing.T) {
	t.Parallel()

	roots := newFilesystemResolverTestRoots(t)
	provider := NewProductionCandidateProvider(ProductionCandidateProviderOptions{
		SettaFilesRoot: roots.settaFilesRoot,
		SettaVersion:   "0.1.0",
		GitHubBaseURL:  t.TempDir(),
	})
	provider.runCommand = func(_ context.Context, name string, _ []string, _ []string) (commandResult, error) {
		return commandResult{}, &exec.Error{Name: name, Err: exec.ErrNotFound}
	}

	spec, err := ParseSourceSpec("github:acme/setta-fixture-frontend#main")
	if err != nil {
		t.Fatalf("parse source spec: %v", err)
	}

	_, err = provider.ResolveCandidate(context.Background(), spec, PluginInstallerBackendAuto)
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeSourceFetchFailed)
	if err == nil || !strings.Contains(err.Error(), "git is not installed or not available on PATH.") {
		t.Fatalf("expected missing git message, got %v", err)
	}
}

// GitHub source fetch should fail fast when clone exceeds the configured timeout.
func TestProductionCandidateProviderResolveGitHubCandidateReportsCloneTimeout(t *testing.T) {
	t.Parallel()

	roots := newFilesystemResolverTestRoots(t)
	provider := NewProductionCandidateProvider(ProductionCandidateProviderOptions{
		SettaFilesRoot:     roots.settaFilesRoot,
		SettaVersion:       "0.1.0",
		GitHubBaseURL:      t.TempDir(),
		GitHubCloneTimeout: 20 * time.Millisecond,
	})
	provider.runCommand = func(ctx context.Context, _ string, _ []string, _ []string) (commandResult, error) {
		<-ctx.Done()
		return commandResult{}, ctx.Err()
	}

	spec, err := ParseSourceSpec("github:acme/setta-fixture-frontend#main")
	if err != nil {
		t.Fatalf("parse source spec: %v", err)
	}

	_, err = provider.ResolveCandidate(context.Background(), spec, PluginInstallerBackendAuto)
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeSourceFetchFailed)
	if err == nil || !strings.Contains(err.Error(), "Timed out waiting for git clone.") {
		t.Fatalf("expected timeout message, got %v", err)
	}
}

// GitHub clone timeout should default and honor explicit typed overrides on the provider constructor.
func TestNewProductionCandidateProviderUsesDefaultAndExplicitGitHubCloneTimeout(t *testing.T) {
	t.Parallel()

	defaultProvider := NewProductionCandidateProvider(ProductionCandidateProviderOptions{})
	if defaultProvider.gitHubCloneTimeout != defaultGitHubCloneTimeout {
		t.Fatalf("expected default clone timeout %s, got %s", defaultGitHubCloneTimeout, defaultProvider.gitHubCloneTimeout)
	}

	override := 45 * time.Second
	overrideProvider := NewProductionCandidateProvider(ProductionCandidateProviderOptions{
		GitHubCloneTimeout: override,
	})
	if overrideProvider.gitHubCloneTimeout != override {
		t.Fatalf("expected explicit clone timeout %s, got %s", override, overrideProvider.gitHubCloneTimeout)
	}
}

// UV install env should inherit pip index flags when uv-specific vars are absent.
func TestBuildUVInstallEnvMapsPIPEnvVars(t *testing.T) {
	t.Parallel()

	envToMap := func(entries []string) map[string]string {
		result := map[string]string{}
		for _, entry := range entries {
			name, value, ok := strings.Cut(entry, "=")
			if !ok {
				continue
			}
			result[name] = value
		}
		return result
	}

	mapped := envToMap(buildUVInstallEnv([]string{
		"PIP_NO_INDEX=1",
		"PIP_FIND_LINKS=/tmp/fixtures",
	}, ""))
	if mapped["UV_NO_INDEX"] != "1" {
		t.Fatalf("expected UV_NO_INDEX to inherit pip flag, got %#v", mapped["UV_NO_INDEX"])
	}
	if mapped["UV_FIND_LINKS"] != "/tmp/fixtures" {
		t.Fatalf("expected UV_FIND_LINKS to inherit pip flag, got %#v", mapped["UV_FIND_LINKS"])
	}

	preserved := envToMap(buildUVInstallEnv([]string{
		"PIP_NO_INDEX=1",
		"PIP_FIND_LINKS=/tmp/fixtures",
		"UV_NO_INDEX=0",
		"UV_FIND_LINKS=keep-existing",
	}, ""))
	if preserved["UV_NO_INDEX"] != "0" {
		t.Fatalf("expected UV_NO_INDEX override to win, got %#v", preserved["UV_NO_INDEX"])
	}
	if preserved["UV_FIND_LINKS"] != "keep-existing" {
		t.Fatalf("expected UV_FIND_LINKS override to win, got %#v", preserved["UV_FIND_LINKS"])
	}
}

// PyPI candidate resolution should install from a local wheel artifact using pip and return a validated plugin root.
func TestProductionCandidateProviderResolvePyPICandidateFromLocalWheel(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	artifactDir := t.TempDir()
	buildLocalPyPIWheelFromFixture(t, artifactDir, "frontend", "setta-fixture-frontend", "0.1.0")

	t.Setenv("PIP_NO_INDEX", "1")
	t.Setenv("PIP_FIND_LINKS", artifactDir)

	provider := NewProductionCandidateProvider(ProductionCandidateProviderOptions{
		PackageManagerRuntime: mustNewPythonRuntime(t),
		SettaFilesRoot:        roots.settaFilesRoot,
		SettaVersion:          "0.1.0",
	})
	spec, err := ParseSourceSpec("pypi:setta-fixture-frontend==0.1.0")
	if err != nil {
		t.Fatalf("parse source spec: %v", err)
	}

	candidate, err := provider.ResolveCandidate(context.Background(), spec, PluginInstallerBackendPip)
	if err != nil {
		t.Fatalf("resolve PyPI candidate: %v", err)
	}
	defer func() {
		if candidate.cleanup != nil {
			_ = candidate.cleanup()
		}
	}()

	if candidate.Manifest.ID != "setta-fixture-frontend" {
		t.Fatalf("unexpected plugin id %q", candidate.Manifest.ID)
	}
	if candidate.CanonicalSourceKey != "pypi:setta-fixture-frontend" {
		t.Fatalf("unexpected canonical source key %q", candidate.CanonicalSourceKey)
	}
	if candidate.SourceDigestSHA256 == nil || strings.TrimSpace(*candidate.SourceDigestSHA256) == "" {
		t.Fatalf("expected source digest to be populated")
	}
	if _, err := os.Stat(filepath.Join(candidate.Root, "setta.plugin.json")); err != nil {
		t.Fatalf("expected candidate plugin root to contain manifest: %v", err)
	}
}

func TestProductionCandidateProviderResolvePyPICandidatePreservesPythonBackendDependencyEnvironment(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	artifactDir := t.TempDir()
	buildLocalBuiltPyPIWheelFromFirstPartyBasedpyright(t, artifactDir)
	buildLocalBuiltPyPIWheelFromRoot(
		t,
		artifactDir,
		buildDummyBasedpyrightPackageRoot(t),
	)

	t.Setenv("PIP_NO_INDEX", "1")
	t.Setenv("PIP_FIND_LINKS", artifactDir)

	provider := NewProductionCandidateProvider(ProductionCandidateProviderOptions{
		PackageManagerRuntime: mustNewPythonRuntime(t),
		SettaFilesRoot:        roots.settaFilesRoot,
		SettaVersion:          "0.1.0",
	})
	spec, err := ParseSourceSpec("pypi:setta-basedpyright==0.1.0")
	if err != nil {
		t.Fatalf("parse source spec: %v", err)
	}

	candidate, err := provider.ResolveCandidate(context.Background(), spec, PluginInstallerBackendPip)
	if err != nil {
		t.Fatalf("resolve first-party basedpyright candidate: %v", err)
	}
	defer func() {
		if candidate.cleanup != nil {
			_ = candidate.cleanup()
		}
	}()

	dependencyRoot := filepath.Join(candidate.Root, pythonBackendSitePackagesDirName, "basedpyright")
	if _, err := os.Stat(filepath.Join(dependencyRoot, "__init__.py")); err != nil {
		t.Fatalf("expected vendored basedpyright package in candidate root: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dependencyRoot, "langserver.py")); err != nil {
		t.Fatalf("expected vendored basedpyright langserver in candidate root: %v", err)
	}
}

// Auto installer mode should fall back to pip when uv exists but the uv install command fails.
func TestProductionCandidateProviderResolvePyPICandidateFallsBackToPipAfterUVFailure(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	artifactDir := t.TempDir()
	buildLocalPyPIWheelFromFixture(t, artifactDir, "frontend", "setta-fixture-frontend", "0.1.0")

	t.Setenv("PIP_NO_INDEX", "1")
	t.Setenv("PIP_FIND_LINKS", artifactDir)

	provider := NewProductionCandidateProvider(ProductionCandidateProviderOptions{
		PackageManagerRuntime: mustNewPythonRuntime(t),
		SettaFilesRoot:        roots.settaFilesRoot,
		SettaVersion:          "0.1.0",
	})
	fakeUVBinary := filepath.Join(t.TempDir(), "uv")
	provider.lookPath = func(binary string) (string, error) {
		if binary == "uv" {
			return fakeUVBinary, nil
		}
		return exec.LookPath(binary)
	}
	defaultRunner := provider.runCommand
	uvCalled := 0
	provider.runCommand = func(ctx context.Context, name string, args []string, env []string) (commandResult, error) {
		if name == fakeUVBinary {
			uvCalled++
			return commandResult{Stderr: "uv failed"}, errors.New("uv failed")
		}
		return defaultRunner(ctx, name, args, env)
	}

	spec, err := ParseSourceSpec("pypi:setta-fixture-frontend==0.1.0")
	if err != nil {
		t.Fatalf("parse source spec: %v", err)
	}

	candidate, err := provider.ResolveCandidate(context.Background(), spec, PluginInstallerBackendAuto)
	if err != nil {
		t.Fatalf("resolve PyPI candidate with auto installer: %v", err)
	}
	defer func() {
		if candidate.cleanup != nil {
			_ = candidate.cleanup()
		}
	}()

	if uvCalled != 1 {
		t.Fatalf("expected one uv attempt before pip fallback, got %d", uvCalled)
	}
	if candidate.Manifest.ID != "setta-fixture-frontend" {
		t.Fatalf("unexpected plugin id %q", candidate.Manifest.ID)
	}
}

// PyPI candidate resolution should reject artifacts whose package metadata name does not match the manifest id.
func TestProductionCandidateProviderResolvePyPICandidateRejectsMetadataIdentityMismatch(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	artifactDir := t.TempDir()
	buildLocalPyPIWheelFromFixture(t, artifactDir, "metadata-mismatch-id", "setta-fixture-metadata-id-package", "0.1.0")

	t.Setenv("PIP_NO_INDEX", "1")
	t.Setenv("PIP_FIND_LINKS", artifactDir)

	provider := NewProductionCandidateProvider(ProductionCandidateProviderOptions{
		PackageManagerRuntime: mustNewPythonRuntime(t),
		SettaFilesRoot:        roots.settaFilesRoot,
		SettaVersion:          "0.1.0",
	})
	spec, err := ParseSourceSpec("pypi:setta-fixture-metadata-id-package==0.1.0")
	if err != nil {
		t.Fatalf("parse source spec: %v", err)
	}

	_, err = provider.ResolveCandidate(context.Background(), spec, PluginInstallerBackendPip)
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeSourceIdentityMismatch)
}

// PyPI candidate resolution should reject artifacts whose package metadata version does not match the manifest version.
func TestProductionCandidateProviderResolvePyPICandidateRejectsMetadataVersionMismatch(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	artifactDir := t.TempDir()
	buildLocalPyPIWheelFromFixture(t, artifactDir, "metadata-mismatch-version", "setta-fixture-metadata-version", "0.1.0")

	t.Setenv("PIP_NO_INDEX", "1")
	t.Setenv("PIP_FIND_LINKS", artifactDir)

	provider := NewProductionCandidateProvider(ProductionCandidateProviderOptions{
		PackageManagerRuntime: mustNewPythonRuntime(t),
		SettaFilesRoot:        roots.settaFilesRoot,
		SettaVersion:          "0.1.0",
	})
	spec, err := ParseSourceSpec("pypi:setta-fixture-metadata-version==0.1.0")
	if err != nil {
		t.Fatalf("parse source spec: %v", err)
	}

	_, err = provider.ResolveCandidate(context.Background(), spec, PluginInstallerBackendPip)
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeSourceVersionMismatch)
}

// PyPI candidate resolution should reject artifacts that contain multiple plugin manifests.
func TestProductionCandidateProviderResolvePyPICandidateRejectsAmbiguousPluginRoots(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	artifactDir := t.TempDir()
	buildLocalPyPIWheelFromFixture(t, artifactDir, "metadata-mismatch-layout", "setta-fixture-layout-bundle", "0.1.0")

	t.Setenv("PIP_NO_INDEX", "1")
	t.Setenv("PIP_FIND_LINKS", artifactDir)

	provider := NewProductionCandidateProvider(ProductionCandidateProviderOptions{
		PackageManagerRuntime: mustNewPythonRuntime(t),
		SettaFilesRoot:        roots.settaFilesRoot,
		SettaVersion:          "0.1.0",
	})
	spec, err := ParseSourceSpec("pypi:setta-fixture-layout-bundle==0.1.0")
	if err != nil {
		t.Fatalf("parse source spec: %v", err)
	}

	_, err = provider.ResolveCandidate(context.Background(), spec, PluginInstallerBackendPip)
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeSourceAmbiguousRoot)
}

// Auto installer mode should fall back to pip when uv is not available on PATH.
func TestProductionCandidateProviderResolvePyPICandidateFallsBackToPipWhenUVUnavailable(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	artifactDir := t.TempDir()
	buildLocalPyPIWheelFromFixture(t, artifactDir, "frontend", "setta-fixture-frontend", "0.1.0")

	t.Setenv("PIP_NO_INDEX", "1")
	t.Setenv("PIP_FIND_LINKS", artifactDir)

	provider := NewProductionCandidateProvider(ProductionCandidateProviderOptions{
		PackageManagerRuntime: mustNewPythonRuntime(t),
		SettaFilesRoot:        roots.settaFilesRoot,
		SettaVersion:          "0.1.0",
	})
	provider.lookPath = func(binary string) (string, error) {
		if binary == "uv" {
			return "", exec.ErrNotFound
		}
		return exec.LookPath(binary)
	}

	spec, err := ParseSourceSpec("pypi:setta-fixture-frontend==0.1.0")
	if err != nil {
		t.Fatalf("parse source spec: %v", err)
	}

	candidate, err := provider.ResolveCandidate(context.Background(), spec, PluginInstallerBackendAuto)
	if err != nil {
		t.Fatalf("resolve PyPI candidate with auto installer fallback: %v", err)
	}
	defer func() {
		if candidate.cleanup != nil {
			_ = candidate.cleanup()
		}
	}()

	if candidate.Manifest.ID != "setta-fixture-frontend" {
		t.Fatalf("unexpected plugin id %q", candidate.Manifest.ID)
	}
}

// Explicit uv installer selection should fail deterministically when the uv binary is unavailable.
func TestProductionCandidateProviderResolvePyPICandidateRequiresExplicitUVBinary(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	provider := NewProductionCandidateProvider(ProductionCandidateProviderOptions{
		PackageManagerRuntime: mustNewPythonRuntime(t),
		SettaFilesRoot:        roots.settaFilesRoot,
		SettaVersion:          "0.1.0",
	})
	provider.lookPath = func(binary string) (string, error) {
		if binary == "uv" {
			return "", exec.ErrNotFound
		}
		return exec.LookPath(binary)
	}

	spec, err := ParseSourceSpec("pypi:setta-fixture-frontend==0.1.0")
	if err != nil {
		t.Fatalf("parse source spec: %v", err)
	}

	_, err = provider.ResolveCandidate(context.Background(), spec, PluginInstallerBackendUV)
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeInstallerUnavailable)
}

func buildLocalPyPIWheelFromFixture(t *testing.T, artifactDir string, fixtureName string, packageName string, version string) string {
	t.Helper()

	repoRoot := workerRPCTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", fixtureName)
	stagingRoot := filepath.Join(t.TempDir(), "wheel-source")
	copyBackendCodegenFixtureDir(t, sourceRoot, stagingRoot)
	rewriteFrontendFixtureManifestPaths(t, stagingRoot)
	return buildLocalPyPIWheelFromRoot(t, artifactDir, stagingRoot, packageName, version)
}

func buildLocalPyPIWheelFromRoot(t *testing.T, artifactDir string, sourceRoot string, packageName string, version string) string {
	t.Helper()

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
	err = filepath.Walk(sourceRoot, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info.IsDir() {
			return nil
		}
		relativePath, err := filepath.Rel(sourceRoot, path)
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
	writeWheelMetadataFile(t, archive, filepath.ToSlash(filepath.Join(distInfoName, "METADATA")), strings.Join([]string{
		"Metadata-Version: 2.1",
		"Name: " + packageName,
		"Version: " + version,
		"Summary: Setta fixture plugin",
		"",
	}, "\n"))
	writeWheelMetadataFile(t, archive, filepath.ToSlash(filepath.Join(distInfoName, "WHEEL")), strings.Join([]string{
		"Wheel-Version: 1.0",
		"Generator: setta-tests",
		"Root-Is-Purelib: true",
		"Tag: py3-none-any",
		"",
	}, "\n"))
	writeWheelMetadataFile(t, archive, filepath.ToSlash(filepath.Join(distInfoName, "RECORD")), "")

	if err := archive.Close(); err != nil {
		t.Fatalf("close wheel archive: %v", err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("close wheel file: %v", err)
	}
	return artifactPath
}

func buildLocalBuiltPyPIWheelFromFirstPartyBasedpyright(t *testing.T, artifactDir string) string {
	t.Helper()

	repoRoot := workerRPCTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "plugins", "setta-basedpyright")
	stagingRoot := filepath.Join(t.TempDir(), "setta-basedpyright")
	copyBackendCodegenFixtureDir(t, sourceRoot, stagingRoot)
	return buildLocalBuiltPyPIWheelFromRoot(t, artifactDir, stagingRoot)
}

func buildLocalBuiltPyPIWheelFromRoot(t *testing.T, artifactDir string, sourceRoot string) string {
	t.Helper()

	if err := os.MkdirAll(artifactDir, 0o755); err != nil {
		t.Fatalf("mkdir artifact dir: %v", err)
	}
	buildRuntime, err := pythonenv.NewRuntime(pythonenv.RuntimeOptions{
		LookupEnv: func(key string) (string, bool) {
			if key == pythonenv.InterpreterEnv {
				return "", false
			}
			return os.LookupEnv(key)
		},
	})
	if err != nil {
		t.Fatalf("new wheel-build python runtime: %v", err)
	}
	buildPython := buildRuntime.InterpreterPath()
	runTestCommand(t, sourceRoot, buildPython, "-m", "build", "--wheel", "--outdir", artifactDir)

	wheels, err := filepath.Glob(filepath.Join(artifactDir, "*.whl"))
	if err != nil {
		t.Fatalf("glob built wheels: %v", err)
	}
	if len(wheels) == 0 {
		t.Fatalf("expected built wheel in %s", artifactDir)
	}
	return wheels[len(wheels)-1]
}

func buildDummyBasedpyrightPackageRoot(t *testing.T) string {
	t.Helper()

	root := filepath.Join(t.TempDir(), "basedpyright")
	if err := os.MkdirAll(filepath.Join(root, "basedpyright"), 0o755); err != nil {
		t.Fatalf("mkdir dummy basedpyright package root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "pyproject.toml"), []byte(strings.Join([]string{
		"[build-system]",
		`requires = ["setuptools==80.9.0", "wheel==0.45.1"]`,
		`build-backend = "setuptools.build_meta"`,
		"",
		"[project]",
		`name = "basedpyright"`,
		`version = "1.25.0"`,
		`requires-python = ">=3.12"`,
		"",
		"[tool.setuptools]",
		`packages = ["basedpyright"]`,
		"",
	}, "\n")), 0o644); err != nil {
		t.Fatalf("write dummy basedpyright pyproject: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "basedpyright", "__init__.py"), []byte(""), 0o644); err != nil {
		t.Fatalf("write dummy basedpyright __init__: %v", err)
	}
	langserverPayload, err := os.ReadFile(filepath.Join(
		workerRPCTestRepoRoot(t),
		"tests",
		"fixtures",
		"lsp",
		"mini_basedpyright_language_server.py",
	))
	if err != nil {
		t.Fatalf("read dummy basedpyright langserver fixture: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "basedpyright", "langserver.py"), langserverPayload, 0o644); err != nil {
		t.Fatalf("write dummy basedpyright langserver: %v", err)
	}
	return root
}

func writeWheelMetadataFile(t *testing.T, archive *zip.Writer, path string, content string) {
	t.Helper()

	writer, err := archive.Create(path)
	if err != nil {
		t.Fatalf("create wheel metadata file %s: %v", path, err)
	}
	if _, err := writer.Write([]byte(content)); err != nil {
		t.Fatalf("write wheel metadata file %s: %v", path, err)
	}
}

func buildLocalGitHubBareRepoFromFixture(t *testing.T, tempRoot string, fixtureName string, owner string, repo string) (string, string) {
	t.Helper()

	repoRoot := workerRPCTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", fixtureName)
	workingRoot := filepath.Join(tempRoot, "working", repo)
	copyBackendCodegenFixtureDir(t, sourceRoot, workingRoot)
	rewriteFrontendFixtureManifestPaths(t, workingRoot)

	runTestCommand(t, workingRoot, "git", "init")
	runTestCommand(t, workingRoot, "git", "config", "user.email", "setta-tests@example.com")
	runTestCommand(t, workingRoot, "git", "config", "user.name", "Setta Tests")
	runTestCommand(t, workingRoot, "git", "add", ".")
	runTestCommand(t, workingRoot, "git", "commit", "-m", "fixture commit")
	runTestCommand(t, workingRoot, "git", "branch", "-M", "main")

	baseURL := filepath.Join(tempRoot, "github")
	bareRepoRoot := filepath.Join(baseURL, owner, repo+".git")
	if err := os.MkdirAll(filepath.Dir(bareRepoRoot), 0o755); err != nil {
		t.Fatalf("mkdir bare repo parent: %v", err)
	}
	runTestCommand(t, tempRoot, "git", "clone", "--bare", workingRoot, bareRepoRoot)
	return baseURL, "main"
}

func rewriteFrontendFixtureManifestPaths(t *testing.T, root string) {
	t.Helper()

	err := filepath.Walk(root, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info.IsDir() || info.Name() != pluginManifestFileName {
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

func runTestCommand(t *testing.T, cwd string, name string, args ...string) string {
	t.Helper()

	command := exec.Command(name, args...)
	command.Dir = cwd
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("run %s %s: %v\n%s", name, strings.Join(args, " "), err, string(output))
	}
	return string(output)
}
