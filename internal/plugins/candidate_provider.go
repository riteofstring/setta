package plugins

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"setta/internal/buildinfo"
	"setta/internal/pythonenv"
)

const (
	defaultGitHubBaseURL      = "https://github.com"
	defaultGitHubCloneTimeout = 30 * time.Second
)

type commandResult struct {
	Stdout string
	Stderr string
}

type commandRunner func(ctx context.Context, name string, args []string, env []string) (commandResult, error)

type ProductionCandidateProviderOptions struct {
	PackageManagerRuntime *pythonenv.Runtime
	SettaFilesRoot        string
	SettaVersion          string
	GitHubBaseURL         string
	GitHubBinary          string
	GitHubCloneTimeout    time.Duration
}

type ProductionCandidateProvider struct {
	packageManagerRuntime *pythonenv.Runtime
	settaFilesRoot        string
	settaVersion          string
	gitHubBaseURL         string
	gitBinary             string
	gitHubCloneTimeout    time.Duration
	lookPath              func(string) (string, error)
	runCommand            commandRunner
}

func NewProductionCandidateProvider(options ProductionCandidateProviderOptions) *ProductionCandidateProvider {
	gitHubBaseURL := strings.TrimSpace(options.GitHubBaseURL)
	if gitHubBaseURL == "" {
		gitHubBaseURL = defaultGitHubBaseURL
	}
	gitBinary := strings.TrimSpace(options.GitHubBinary)
	if gitBinary == "" {
		gitBinary = "git"
	}
	gitHubCloneTimeout := options.GitHubCloneTimeout
	if gitHubCloneTimeout <= 0 {
		gitHubCloneTimeout = defaultGitHubCloneTimeout
	}
	return &ProductionCandidateProvider{
		packageManagerRuntime: options.PackageManagerRuntime,
		settaFilesRoot:        strings.TrimSpace(options.SettaFilesRoot),
		settaVersion:          resolvedCandidateProviderSettaVersion(options.SettaVersion),
		gitHubBaseURL:         gitHubBaseURL,
		gitBinary:             gitBinary,
		gitHubCloneTimeout:    gitHubCloneTimeout,
		lookPath:              exec.LookPath,
		runCommand:            defaultCommandRunner,
	}
}

func resolvedCandidateProviderSettaVersion(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed != "" {
		return trimmed
	}
	return buildinfo.HostPackageVersion()
}

func (p *ProductionCandidateProvider) ResolveCandidate(ctx context.Context, spec ParsedSourceSpec, installer PluginInstallerBackend) (CandidatePlugin, error) {
	if p == nil {
		return CandidatePlugin{}, newServiceError(ServiceErrorCodeSourceFetchFailed, "Plugin source provider is unavailable.")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	switch spec.Scheme {
	case PluginSourceSchemeGitHub:
		return p.resolveGitHubCandidate(ctx, spec)
	case PluginSourceSchemePyPI:
		return p.resolvePyPICandidate(ctx, spec, installer)
	default:
		return CandidatePlugin{}, newServiceError(ServiceErrorCodeSourceSchemeUnsupported, "Unsupported plugin source scheme: %s", spec.Scheme)
	}
}

func (p *ProductionCandidateProvider) resolveGitHubCandidate(ctx context.Context, spec ParsedSourceSpec) (CandidatePlugin, error) {
	if err := validateGitHubSourceSpec(spec); err != nil {
		return CandidatePlugin{}, err
	}

	tempRoot, cleanup, err := newCandidateTempRoot("setta-plugin-github-*", "GitHub plugin")
	if err != nil {
		return CandidatePlugin{}, err
	}

	cloneRoot, err := p.cloneGitHubSource(ctx, spec, tempRoot)
	if err != nil {
		_ = cleanup()
		return CandidatePlugin{}, err
	}

	manifestPath, err := requireCandidateManifestPath(cloneRoot, "GitHub source root must contain setta.plugin.json.")
	if err != nil {
		_ = cleanup()
		return CandidatePlugin{}, err
	}

	candidate, err := p.finalizeCandidateFromManifestPath(tempRoot, cloneRoot, cloneRoot, manifestPath, spec.CanonicalSourceKey, cleanup)
	if err != nil {
		_ = cleanup()
		return CandidatePlugin{}, err
	}
	return candidate, nil
}

func (p *ProductionCandidateProvider) resolvePyPICandidate(ctx context.Context, spec ParsedSourceSpec, requestedInstaller PluginInstallerBackend) (CandidatePlugin, error) {
	if p.packageManagerRuntime == nil {
		return CandidatePlugin{}, newServiceError(ServiceErrorCodeSourceFetchFailed, "Python runtime is unavailable for PyPI plugin source acquisition.")
	}
	if strings.TrimSpace(spec.Package) == "" {
		return CandidatePlugin{}, newServiceError(ServiceErrorCodeSourceInvalid, "PyPI source must be pypi:<package>[==version].")
	}

	tempRoot, cleanup, err := newCandidateTempRoot("setta-plugin-pypi-*", "PyPI plugin")
	if err != nil {
		return CandidatePlugin{}, err
	}

	packageSpec := buildPyPIPackageSpec(spec)
	resolvedInstaller, err := p.resolveInstallerBackend(requestedInstaller)
	if err != nil {
		_ = cleanup()
		return CandidatePlugin{}, err
	}

	installRoot := filepath.Join(tempRoot, "install")
	if err := p.populatePyPIInstallRoot(ctx, packageSpec, installRoot, spec.Raw, requestedInstaller, resolvedInstaller); err != nil {
		_ = cleanup()
		return CandidatePlugin{}, err
	}

	manifestPath, err := findSinglePluginManifestPath(installRoot)
	if err != nil {
		_ = cleanup()
		return CandidatePlugin{}, err
	}
	pluginRoot := filepath.Dir(manifestPath)
	candidate, err := p.finalizeCandidateFromManifestPath(tempRoot, installRoot, pluginRoot, manifestPath, spec.CanonicalSourceKey, cleanup)
	if err != nil {
		_ = cleanup()
		return CandidatePlugin{}, err
	}
	return candidate, nil
}

func (p *ProductionCandidateProvider) loadAndValidateCandidateManifest(pluginRoot string, manifestPath string) (PluginManifest, error) {
	manifest, err := loadPluginManifestFile(manifestPath)
	if err != nil {
		return PluginManifest{}, wrapManifestValidationError(err)
	}
	if err := ensureRuntimeManagedPluginFrontendAssets(pluginRoot, manifest, runtimeManagedFrontendSourceBuild); err != nil {
		return PluginManifest{}, err
	}
	if err := ValidatePluginManifestPaths(pluginRoot, manifest); err != nil {
		return PluginManifest{}, wrapManifestValidationError(err)
	}
	if err := validateSettaVersionRangeForHost(manifest, p.settaVersion); err != nil {
		return PluginManifest{}, err
	}
	return manifest, nil
}

func (p *ProductionCandidateProvider) finalizeCandidateFromManifestPath(tempRoot string, packageMetadataRoot string, pluginRoot string, manifestPath string, canonicalSourceKey string, cleanup func() error) (CandidatePlugin, error) {
	manifest, err := p.loadAndValidateCandidateManifest(pluginRoot, manifestPath)
	if err != nil {
		return CandidatePlugin{}, err
	}
	if err := validateMetadataIdentityFromRoots(packageMetadataRoot, pluginRoot, manifest); err != nil {
		return CandidatePlugin{}, err
	}
	if err := preservePythonBackendInstallPayload(packageMetadataRoot, pluginRoot, manifest); err != nil {
		return CandidatePlugin{}, err
	}
	return buildCandidatePlugin(tempRoot, pluginRoot, manifest, canonicalSourceKey, cleanup)
}

func (p *ProductionCandidateProvider) resolveInstallerBackend(installer PluginInstallerBackend) (PluginInstallerBackend, error) {
	lookPath := p.binaryLookup()
	switch installer {
	case PluginInstallerBackendPip:
		return PluginInstallerBackendPip, nil
	case PluginInstallerBackendUV:
		if _, err := lookPath("uv"); err != nil {
			return "", newServiceError(ServiceErrorCodeInstallerUnavailable, "Requested installer backend is unavailable: uv")
		}
		return PluginInstallerBackendUV, nil
	default:
		if _, err := lookPath("uv"); err == nil {
			return PluginInstallerBackendUV, nil
		}
		return PluginInstallerBackendPip, nil
	}
}

func (p *ProductionCandidateProvider) populatePyPIInstallRoot(ctx context.Context, packageSpec string, installRoot string, sourceSpec string, requestedInstaller PluginInstallerBackend, resolvedInstaller PluginInstallerBackend) error {
	if resolvedInstaller == PluginInstallerBackendPip {
		return p.installWithPip(ctx, packageSpec, installRoot, sourceSpec)
	}
	if err := p.installWithUV(ctx, packageSpec, installRoot, sourceSpec); err == nil {
		return nil
	} else if requestedInstaller != PluginInstallerBackendAuto {
		return err
	}
	if err := resetCandidateInstallRoot(installRoot); err != nil {
		return err
	}
	return p.installWithPip(ctx, packageSpec, installRoot, sourceSpec)
}

func (p *ProductionCandidateProvider) installWithPip(ctx context.Context, packageSpec string, installRoot string, sourceSpec string) error {
	if err := os.MkdirAll(installRoot, 0o755); err != nil {
		return fmt.Errorf("create pip install root: %w", err)
	}
	args := []string{
		"-m",
		"pip",
		"install",
		"--target",
		installRoot,
		packageSpec,
	}
	result, err := p.commandRunner()(ctx, p.packageManagerRuntime.InterpreterPath(), args, p.baseEnv())
	if err == nil {
		return nil
	}
	return newServiceError(
		ServiceErrorCodeSourceFetchFailed,
		"Failed to install PyPI plugin source: %s\n%s",
		sourceSpec,
		strings.TrimSpace(firstNonEmpty(result.Stderr, result.Stdout, err.Error())),
	)
}

func (p *ProductionCandidateProvider) installWithUV(ctx context.Context, packageSpec string, installRoot string, sourceSpec string) error {
	lookPath := p.binaryLookup()
	uvBinary, err := lookPath("uv")
	if err != nil {
		return newServiceError(ServiceErrorCodeInstallerUnavailable, "Requested installer backend is unavailable: uv")
	}
	if err := os.MkdirAll(installRoot, 0o755); err != nil {
		return fmt.Errorf("create uv install root: %w", err)
	}
	args := []string{
		"pip",
		"install",
		"--target",
		installRoot,
		packageSpec,
	}
	result, err := p.commandRunner()(ctx, uvBinary, args, buildUVInstallEnv(p.baseEnv(), p.settaFilesRoot))
	if err == nil {
		return nil
	}
	return newServiceError(
		ServiceErrorCodeSourceFetchFailed,
		"Failed to install PyPI plugin source with uv: %s\n%s",
		sourceSpec,
		strings.TrimSpace(firstNonEmpty(result.Stderr, result.Stdout, err.Error())),
	)
}

func buildGitHubCloneURL(baseURL string, owner string, repo string) string {
	trimmedBase := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	return trimmedBase + "/" + strings.TrimSpace(owner) + "/" + strings.TrimSpace(repo) + ".git"
}

func buildGitHubCloneArgs(spec ParsedSourceSpec, cloneURL string, cloneRoot string) []string {
	cloneArgs := []string{"clone", "--depth", "1"}
	if ref := strings.TrimSpace(spec.Ref); ref != "" {
		cloneArgs = append(cloneArgs, "--branch", ref)
	}
	return append(cloneArgs, cloneURL, cloneRoot)
}

func buildPyPIPackageSpec(spec ParsedSourceSpec) string {
	packageSpec := spec.Package
	if version := strings.TrimSpace(spec.Version); version != "" {
		return packageSpec + "==" + version
	}
	return packageSpec
}

func validateGitHubSourceSpec(spec ParsedSourceSpec) error {
	if strings.TrimSpace(spec.Owner) == "" || strings.TrimSpace(spec.Repo) == "" {
		return newServiceError(ServiceErrorCodeSourceInvalid, "GitHub source must be github:<owner>/<repo>[#ref] or github:<owner>/<repo>@ref.")
	}
	return nil
}

func newCandidateTempRoot(pattern string, label string) (string, func() error, error) {
	tempRoot, err := os.MkdirTemp("", pattern)
	if err != nil {
		return "", nil, fmt.Errorf("create %s temp root: %w", label, err)
	}
	return tempRoot, func() error {
		return os.RemoveAll(tempRoot)
	}, nil
}

func buildCandidatePlugin(tempRoot string, currentRoot string, manifest PluginManifest, canonicalSourceKey string, cleanup func() error) (CandidatePlugin, error) {
	finalRoot, err := relocateCandidateRoot(tempRoot, currentRoot, manifest.ID)
	if err != nil {
		return CandidatePlugin{}, err
	}

	digest, err := computeDirectoryDigest(finalRoot)
	if err != nil {
		return CandidatePlugin{}, err
	}
	return CandidatePlugin{
		Root:               finalRoot,
		Manifest:           manifest,
		CanonicalSourceKey: canonicalSourceKey,
		SourceDigestSHA256: stringPtr(digest),
		cleanup:            cleanup,
	}, nil
}

func requireCandidateManifestPath(pluginRoot string, notFoundMessage string) (string, error) {
	manifestPath := filepath.Join(pluginRoot, pluginManifestFileName)
	if _, err := os.Stat(manifestPath); err != nil {
		if os.IsNotExist(err) {
			return "", newServiceError(ServiceErrorCodeSourceManifestNotFound, "%s", notFoundMessage)
		}
		return "", fmt.Errorf("stat plugin manifest %s: %w", manifestPath, err)
	}
	return manifestPath, nil
}

func resetCandidateInstallRoot(installRoot string) error {
	if err := os.RemoveAll(installRoot); err != nil {
		return fmt.Errorf("reset failed uv install root: %w", err)
	}
	return nil
}

func wrapGitHubCloneError(sourceSpec string, result commandResult, runErr error, contextErr error) error {
	if errors.Is(contextErr, context.DeadlineExceeded) || errors.Is(runErr, context.DeadlineExceeded) {
		return newServiceError(
			ServiceErrorCodeSourceFetchFailed,
			"Failed to fetch GitHub plugin source: %s\nTimed out waiting for git clone.",
			sourceSpec,
		)
	}
	if isExecutableNotFoundError(runErr) {
		return newServiceError(
			ServiceErrorCodeSourceFetchFailed,
			"Failed to fetch GitHub plugin source: %s\ngit is not installed or not available on PATH.",
			sourceSpec,
		)
	}
	commandOutput := strings.TrimSpace(firstNonEmpty(result.Stderr, result.Stdout, runErr.Error()))
	return newServiceError(
		ServiceErrorCodeSourceFetchFailed,
		"Failed to fetch GitHub plugin source: %s\n%s",
		sourceSpec,
		commandOutput,
	)
}

func (p *ProductionCandidateProvider) cloneGitHubSource(ctx context.Context, spec ParsedSourceSpec, tempRoot string) (string, error) {
	cloneRoot := filepath.Join(tempRoot, "repo")
	cloneURL := buildGitHubCloneURL(p.gitHubBaseURL, spec.Owner, spec.Repo)
	cloneArgs := buildGitHubCloneArgs(spec, cloneURL, cloneRoot)

	cloneCtx, cancel := context.WithTimeout(ctx, p.gitHubCloneTimeout)
	defer cancel()

	env := withEnvValue(p.baseEnv(), "GIT_TERMINAL_PROMPT", "0")
	result, err := p.commandRunner()(cloneCtx, p.gitBinary, cloneArgs, env)
	if err != nil {
		return "", wrapGitHubCloneError(spec.Raw, result, err, cloneCtx.Err())
	}
	if err := stripGitMetadata(cloneRoot); err != nil {
		return "", err
	}
	return cloneRoot, nil
}

func relocateCandidateRoot(tempRoot string, currentRoot string, pluginID string) (string, error) {
	if filepath.Base(currentRoot) == pluginID {
		return currentRoot, nil
	}
	targetRoot := filepath.Join(tempRoot, pluginID)
	if err := os.RemoveAll(targetRoot); err != nil {
		return "", fmt.Errorf("clear candidate target root %s: %w", targetRoot, err)
	}
	if err := os.Rename(currentRoot, targetRoot); err != nil {
		return "", fmt.Errorf("move candidate root %s to %s: %w", currentRoot, targetRoot, err)
	}
	return targetRoot, nil
}

func stripGitMetadata(root string) error {
	gitPath := filepath.Join(root, ".git")
	info, err := os.Lstat(gitPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("stat git metadata path %s: %w", gitPath, err)
	}
	if info.IsDir() && info.Mode()&os.ModeSymlink == 0 {
		return os.RemoveAll(gitPath)
	}
	return os.Remove(gitPath)
}

func findSinglePluginManifestPath(root string) (string, error) {
	manifestPaths := make([]string, 0, 1)
	walkErr := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		if entry.Name() == pluginManifestFileName {
			manifestPaths = append(manifestPaths, path)
		}
		return nil
	})
	if walkErr != nil {
		return "", fmt.Errorf("walk extracted plugin root %s: %w", root, walkErr)
	}
	switch len(manifestPaths) {
	case 0:
		return "", newServiceError(ServiceErrorCodeSourceManifestNotFound, "PyPI artifact did not contain setta.plugin.json.")
	case 1:
		return manifestPaths[0], nil
	default:
		return "", newServiceError(ServiceErrorCodeSourceAmbiguousRoot, "PyPI artifact contained multiple setta.plugin.json files.")
	}
}

func validateSettaVersionRangeForHost(manifest PluginManifest, settaVersion string) error {
	return (&Service{settaVersion: settaVersion}).validateSettaVersionRange(manifest)
}

func validateMetadataIdentityFromRoots(packageMetadataRoot string, pyprojectRoot string, manifest PluginManifest) error {
	packageName, packageVersion := readPackageMetadataOptional(packageMetadataRoot, manifest.ID)
	if packageName == "" || packageVersion == "" {
		pyprojectName, pyprojectVersion := readPyprojectMetadataOptional(pyprojectRoot)
		if packageName == "" {
			packageName = pyprojectName
		}
		if packageVersion == "" {
			packageVersion = pyprojectVersion
		}
	}
	if packageName == "" && packageVersion == "" {
		return nil
	}
	if packageName != "" && normalizeIdentityValue(packageName) != normalizeIdentityValue(manifest.ID) {
		return newServiceError(ServiceErrorCodeSourceIdentityMismatch, "Package name %q does not match manifest id %q in %s", packageName, manifest.ID, packageMetadataRoot)
	}
	if packageVersion != "" && packageVersion != manifest.Version {
		return newServiceError(ServiceErrorCodeSourceVersionMismatch, "Package version %q does not match manifest version %q in %s", packageVersion, manifest.Version, packageMetadataRoot)
	}
	return nil
}

func preservePythonBackendInstallPayload(packageMetadataRoot string, pluginRoot string, manifest PluginManifest) error {
	if !manifestUsesPythonBackend(manifest) {
		return nil
	}
	return transferPythonBackendInstallPayload(
		packageMetadataRoot,
		pluginRoot,
		pluginRoot,
		"move",
		os.Rename,
	)
}

func copyPythonBackendInstallPayload(
	packageMetadataRoot string,
	pluginRoot string,
	targetPluginRoot string,
) error {
	return transferPythonBackendInstallPayload(
		packageMetadataRoot,
		pluginRoot,
		targetPluginRoot,
		"copy",
		copyFilesystemPath,
	)
}

func transferPythonBackendInstallPayload(
	packageMetadataRoot string,
	pluginRoot string,
	targetPluginRoot string,
	action string,
	transfer func(string, string) error,
) error {
	if sameDirectoryPath(packageMetadataRoot, pluginRoot) {
		return nil
	}

	entries, err := os.ReadDir(packageMetadataRoot)
	if err != nil {
		return fmt.Errorf("read python backend install root %s: %w", packageMetadataRoot, err)
	}

	vendorRoot := filepath.Join(targetPluginRoot, pythonBackendSitePackagesDirName)
	transferredAny := false
	for _, entry := range entries {
		if entry.Name() == filepath.Base(pluginRoot) {
			continue
		}
		sourcePath := filepath.Join(packageMetadataRoot, entry.Name())
		targetPath := filepath.Join(vendorRoot, entry.Name())
		if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
			return fmt.Errorf("create python backend vendor root %s: %w", filepath.Dir(targetPath), err)
		}
		if err := transfer(sourcePath, targetPath); err != nil {
			return fmt.Errorf("%s python backend dependency payload %s to %s: %w", action, sourcePath, targetPath, err)
		}
		transferredAny = true
	}
	if !transferredAny {
		_ = os.Remove(vendorRoot)
	}
	return nil
}

func manifestUsesPythonBackend(manifest PluginManifest) bool {
	if manifest.Backend == nil {
		return false
	}
	return strings.EqualFold(filepath.Ext(strings.TrimSpace(manifest.Backend.Entrypoint)), ".py")
}

func sameDirectoryPath(left string, right string) bool {
	return filepath.Clean(strings.TrimSpace(left)) == filepath.Clean(strings.TrimSpace(right))
}

func wrapManifestValidationError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, ErrPluginManifestUnsupported):
		return newServiceError(ServiceErrorCodeManifestUnsupported, "%s", err.Error())
	case errors.Is(err, ErrPluginManifestInvalid):
		return newServiceError(ServiceErrorCodeManifestInvalid, "%s", err.Error())
	case errors.Is(err, ErrPluginManifestNotFound):
		return newServiceError(ServiceErrorCodeSourceManifestNotFound, "%s", err.Error())
	default:
		return err
	}
}

func buildUVInstallEnv(baseEnv []string, settaFilesRoot string) []string {
	envMap := map[string]string{}
	for _, entry := range baseEnv {
		name, value, ok := strings.Cut(entry, "=")
		if !ok {
			continue
		}
		envMap[name] = value
	}
	if _, ok := envMap["UV_CACHE_DIR"]; !ok && strings.TrimSpace(settaFilesRoot) != "" {
		cacheDir := filepath.Join(settaFilesRoot, ".cache", "uv")
		if err := os.MkdirAll(cacheDir, 0o755); err == nil {
			envMap["UV_CACHE_DIR"] = cacheDir
		}
	}
	if value, ok := envMap["PIP_NO_INDEX"]; ok {
		if _, exists := envMap["UV_NO_INDEX"]; !exists {
			envMap["UV_NO_INDEX"] = value
		}
	}
	if value, ok := envMap["PIP_FIND_LINKS"]; ok {
		if _, exists := envMap["UV_FIND_LINKS"]; !exists {
			envMap["UV_FIND_LINKS"] = value
		}
	}
	result := make([]string, 0, len(envMap))
	for name, value := range envMap {
		result = append(result, name+"="+value)
	}
	return result
}

func defaultCommandRunner(ctx context.Context, name string, args []string, env []string) (commandResult, error) {
	command := exec.CommandContext(ctx, name, args...)
	if env != nil {
		command.Env = append([]string(nil), env...)
	}
	var stdout strings.Builder
	var stderr strings.Builder
	command.Stdout = &stdout
	command.Stderr = &stderr
	err := command.Run()
	return commandResult{
		Stdout: stdout.String(),
		Stderr: stderr.String(),
	}, err
}

func isExecutableNotFoundError(err error) bool {
	var execErr *exec.Error
	if errors.As(err, &execErr) {
		return errors.Is(execErr.Err, exec.ErrNotFound)
	}
	var pathErr *os.PathError
	if errors.As(err, &pathErr) {
		return errors.Is(pathErr.Err, exec.ErrNotFound) || errors.Is(pathErr.Err, os.ErrNotExist)
	}
	return false
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func withEnvValue(env []string, key string, value string) []string {
	output := append([]string(nil), env...)
	prefix := key + "="
	for index, entry := range output {
		if strings.HasPrefix(entry, prefix) {
			output[index] = prefix + value
			return output
		}
	}
	return append(output, prefix+value)
}

func (p *ProductionCandidateProvider) baseEnv() []string {
	if p.packageManagerRuntime != nil {
		return p.packageManagerRuntime.Environ()
	}
	return os.Environ()
}

func (p *ProductionCandidateProvider) binaryLookup() func(string) (string, error) {
	if p.lookPath != nil {
		return p.lookPath
	}
	return exec.LookPath
}

func (p *ProductionCandidateProvider) commandRunner() commandRunner {
	if p.runCommand != nil {
		return p.runCommand
	}
	return defaultCommandRunner
}
