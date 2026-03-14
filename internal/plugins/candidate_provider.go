package plugins

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
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
	if strings.TrimSpace(spec.Owner) == "" || strings.TrimSpace(spec.Repo) == "" {
		return CandidatePlugin{}, newServiceError(ServiceErrorCodeSourceInvalid, "GitHub source must be github:<owner>/<repo>[#ref] or github:<owner>/<repo>@ref.")
	}

	tempRoot, err := os.MkdirTemp("", "setta-plugin-github-*")
	if err != nil {
		return CandidatePlugin{}, fmt.Errorf("create GitHub plugin temp root: %w", err)
	}
	cleanup := func() error {
		return os.RemoveAll(tempRoot)
	}

	cloneRoot := filepath.Join(tempRoot, "repo")
	cloneURL := buildGitHubCloneURL(p.gitHubBaseURL, spec.Owner, spec.Repo)
	cloneArgs := []string{"clone", "--depth", "1"}
	if strings.TrimSpace(spec.Ref) != "" {
		cloneArgs = append(cloneArgs, "--branch", strings.TrimSpace(spec.Ref))
	}
	cloneArgs = append(cloneArgs, cloneURL, cloneRoot)

	cloneCtx, cancel := context.WithTimeout(ctx, p.gitHubCloneTimeout)
	defer cancel()

	env := withEnvValue(p.baseEnv(), "GIT_TERMINAL_PROMPT", "0")
	result, err := p.commandRunner()(cloneCtx, p.gitBinary, cloneArgs, env)
	if err != nil {
		_ = cleanup()
		if errors.Is(cloneCtx.Err(), context.DeadlineExceeded) || errors.Is(err, context.DeadlineExceeded) {
			return CandidatePlugin{}, newServiceError(
				ServiceErrorCodeSourceFetchFailed,
				"Failed to fetch GitHub plugin source: %s\nTimed out waiting for git clone.",
				spec.Raw,
			)
		}
		if isExecutableNotFoundError(err) {
			return CandidatePlugin{}, newServiceError(
				ServiceErrorCodeSourceFetchFailed,
				"Failed to fetch GitHub plugin source: %s\ngit is not installed or not available on PATH.",
				spec.Raw,
			)
		}
		commandOutput := strings.TrimSpace(firstNonEmpty(result.Stderr, result.Stdout, err.Error()))
		return CandidatePlugin{}, newServiceError(
			ServiceErrorCodeSourceFetchFailed,
			"Failed to fetch GitHub plugin source: %s\n%s",
			spec.Raw,
			commandOutput,
		)
	}

	if err := stripGitMetadata(cloneRoot); err != nil {
		_ = cleanup()
		return CandidatePlugin{}, err
	}

	manifestPath := filepath.Join(cloneRoot, pluginManifestFileName)
	if _, err := os.Stat(manifestPath); err != nil {
		_ = cleanup()
		if os.IsNotExist(err) {
			return CandidatePlugin{}, newServiceError(ServiceErrorCodeSourceManifestNotFound, "GitHub source root must contain setta.plugin.json.")
		}
		return CandidatePlugin{}, fmt.Errorf("stat plugin manifest %s: %w", manifestPath, err)
	}
	manifest, err := p.loadAndValidateCandidateManifest(cloneRoot, manifestPath)
	if err != nil {
		_ = cleanup()
		return CandidatePlugin{}, err
	}
	if err := validateMetadataIdentityFromRoots(cloneRoot, cloneRoot, manifest); err != nil {
		_ = cleanup()
		return CandidatePlugin{}, err
	}
	finalRoot, err := relocateCandidateRoot(tempRoot, cloneRoot, manifest.ID)
	if err != nil {
		_ = cleanup()
		return CandidatePlugin{}, err
	}

	digest, err := computeDirectoryDigest(finalRoot)
	if err != nil {
		_ = cleanup()
		return CandidatePlugin{}, err
	}
	return CandidatePlugin{
		Root:               finalRoot,
		Manifest:           manifest,
		CanonicalSourceKey: spec.CanonicalSourceKey,
		SourceDigestSHA256: stringPtr(digest),
		cleanup:            cleanup,
	}, nil
}

func (p *ProductionCandidateProvider) resolvePyPICandidate(ctx context.Context, spec ParsedSourceSpec, requestedInstaller PluginInstallerBackend) (CandidatePlugin, error) {
	if p.packageManagerRuntime == nil {
		return CandidatePlugin{}, newServiceError(ServiceErrorCodeSourceFetchFailed, "Python runtime is unavailable for PyPI plugin source acquisition.")
	}
	if strings.TrimSpace(spec.Package) == "" {
		return CandidatePlugin{}, newServiceError(ServiceErrorCodeSourceInvalid, "PyPI source must be pypi:<package>[==version].")
	}

	tempRoot, err := os.MkdirTemp("", "setta-plugin-pypi-*")
	if err != nil {
		return CandidatePlugin{}, fmt.Errorf("create PyPI plugin temp root: %w", err)
	}
	cleanup := func() error {
		return os.RemoveAll(tempRoot)
	}

	packageSpec := spec.Package
	if strings.TrimSpace(spec.Version) != "" {
		packageSpec = packageSpec + "==" + strings.TrimSpace(spec.Version)
	}
	resolvedInstaller, err := p.resolveInstallerBackend(requestedInstaller)
	if err != nil {
		_ = cleanup()
		return CandidatePlugin{}, err
	}

	extractRoot := filepath.Join(tempRoot, "extract")
	if resolvedInstaller == PluginInstallerBackendPip {
		if err := p.downloadWithPip(ctx, packageSpec, tempRoot, spec.Raw); err != nil {
			_ = cleanup()
			return CandidatePlugin{}, err
		}
		if err := extractFirstDownloadedArtifact(tempRoot, extractRoot); err != nil {
			_ = cleanup()
			return CandidatePlugin{}, err
		}
	} else {
		if err := p.installWithUV(ctx, packageSpec, extractRoot, spec.Raw); err != nil {
			if requestedInstaller != PluginInstallerBackendAuto {
				_ = cleanup()
				return CandidatePlugin{}, err
			}
			if removeErr := os.RemoveAll(extractRoot); removeErr != nil {
				_ = cleanup()
				return CandidatePlugin{}, fmt.Errorf("reset failed uv extract root: %w", removeErr)
			}
			if err := p.downloadWithPip(ctx, packageSpec, tempRoot, spec.Raw); err != nil {
				_ = cleanup()
				return CandidatePlugin{}, err
			}
			if err := extractFirstDownloadedArtifact(tempRoot, extractRoot); err != nil {
				_ = cleanup()
				return CandidatePlugin{}, err
			}
		}
	}

	manifestPath, err := findSinglePluginManifestPath(extractRoot)
	if err != nil {
		_ = cleanup()
		return CandidatePlugin{}, err
	}
	pluginRoot := filepath.Dir(manifestPath)
	manifest, err := p.loadAndValidateCandidateManifest(pluginRoot, manifestPath)
	if err != nil {
		_ = cleanup()
		return CandidatePlugin{}, err
	}
	if err := validateMetadataIdentityFromRoots(extractRoot, pluginRoot, manifest); err != nil {
		_ = cleanup()
		return CandidatePlugin{}, err
	}
	finalRoot, err := relocateCandidateRoot(tempRoot, pluginRoot, manifest.ID)
	if err != nil {
		_ = cleanup()
		return CandidatePlugin{}, err
	}

	digest, err := computeDirectoryDigest(finalRoot)
	if err != nil {
		_ = cleanup()
		return CandidatePlugin{}, err
	}
	return CandidatePlugin{
		Root:               finalRoot,
		Manifest:           manifest,
		CanonicalSourceKey: spec.CanonicalSourceKey,
		SourceDigestSHA256: stringPtr(digest),
		cleanup:            cleanup,
	}, nil
}

func (p *ProductionCandidateProvider) loadAndValidateCandidateManifest(pluginRoot string, manifestPath string) (PluginManifest, error) {
	manifest, err := loadPluginManifestFile(manifestPath)
	if err != nil {
		return PluginManifest{}, wrapManifestValidationError(err)
	}
	if err := ValidatePluginManifestPaths(pluginRoot, manifest); err != nil {
		return PluginManifest{}, wrapManifestValidationError(err)
	}
	if err := validateSettaVersionRangeForHost(manifest, p.settaVersion); err != nil {
		return PluginManifest{}, err
	}
	return manifest, nil
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

func (p *ProductionCandidateProvider) downloadWithPip(ctx context.Context, packageSpec string, tempRoot string, sourceSpec string) error {
	args := []string{
		"-m",
		"pip",
		"download",
		"--no-deps",
		"--dest",
		tempRoot,
		packageSpec,
	}
	result, err := p.commandRunner()(ctx, p.packageManagerRuntime.InterpreterPath(), args, p.baseEnv())
	if err == nil {
		return nil
	}
	return newServiceError(
		ServiceErrorCodeSourceFetchFailed,
		"Failed to download PyPI plugin source: %s\n%s",
		sourceSpec,
		strings.TrimSpace(firstNonEmpty(result.Stderr, result.Stdout, err.Error())),
	)
}

func (p *ProductionCandidateProvider) installWithUV(ctx context.Context, packageSpec string, extractRoot string, sourceSpec string) error {
	lookPath := p.binaryLookup()
	uvBinary, err := lookPath("uv")
	if err != nil {
		return newServiceError(ServiceErrorCodeInstallerUnavailable, "Requested installer backend is unavailable: uv")
	}
	if err := os.MkdirAll(extractRoot, 0o755); err != nil {
		return fmt.Errorf("create uv extract root: %w", err)
	}
	args := []string{
		"pip",
		"install",
		"--no-deps",
		"--target",
		extractRoot,
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

func extractFirstDownloadedArtifact(tempRoot string, extractRoot string) error {
	entries, err := os.ReadDir(tempRoot)
	if err != nil {
		return fmt.Errorf("read downloaded artifacts root %s: %w", tempRoot, err)
	}
	artifacts := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		artifacts = append(artifacts, filepath.Join(tempRoot, entry.Name()))
	}
	if len(artifacts) == 0 {
		return newServiceError(ServiceErrorCodeSourceFetchFailed, "No artifacts were downloaded for source extraction.")
	}
	slices.Sort(artifacts)
	if err := os.MkdirAll(extractRoot, 0o755); err != nil {
		return fmt.Errorf("create extract root %s: %w", extractRoot, err)
	}
	return extractPluginArtifact(artifacts[0], extractRoot)
}

func extractPluginArtifact(artifactPath string, extractRoot string) error {
	lowerName := strings.ToLower(filepath.Base(artifactPath))
	switch {
	case strings.HasSuffix(lowerName, ".whl"), strings.HasSuffix(lowerName, ".zip"):
		return extractZipArtifact(artifactPath, extractRoot)
	case strings.HasSuffix(lowerName, ".tar.gz"), strings.HasSuffix(lowerName, ".tgz"):
		return extractTarGzArtifact(artifactPath, extractRoot)
	default:
		return newServiceError(ServiceErrorCodeSourceFetchFailed, "Unsupported artifact type for plugin source: %s", filepath.Base(artifactPath))
	}
}

func extractZipArtifact(artifactPath string, extractRoot string) error {
	archive, err := zip.OpenReader(artifactPath)
	if err != nil {
		return fmt.Errorf("open zip artifact %s: %w", artifactPath, err)
	}
	defer archive.Close()

	for _, file := range archive.File {
		if file.Mode()&os.ModeSymlink != 0 {
			return newServiceError(
				ServiceErrorCodeSourceArchiveTraversal,
				"Plugin archive contains symbolic link entries which are not allowed: %q",
				file.Name,
			)
		}
		targetPath, skip, err := resolveArchiveMemberPath(extractRoot, file.Name, filepath.Base(artifactPath))
		if err != nil {
			return err
		}
		if skip {
			continue
		}
		if file.FileInfo().IsDir() {
			if err := os.MkdirAll(targetPath, 0o755); err != nil {
				return fmt.Errorf("create extracted directory %s: %w", targetPath, err)
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
			return fmt.Errorf("create extracted parent directory %s: %w", filepath.Dir(targetPath), err)
		}
		reader, err := file.Open()
		if err != nil {
			return fmt.Errorf("open zip member %s: %w", file.Name, err)
		}
		if err := writeArchiveRegularFile(targetPath, reader); err != nil {
			reader.Close()
			return err
		}
		if err := reader.Close(); err != nil {
			return fmt.Errorf("close zip member %s: %w", file.Name, err)
		}
	}
	return nil
}

func extractTarGzArtifact(artifactPath string, extractRoot string) error {
	file, err := os.Open(artifactPath)
	if err != nil {
		return fmt.Errorf("open tar artifact %s: %w", artifactPath, err)
	}
	defer file.Close()
	gzipReader, err := gzip.NewReader(file)
	if err != nil {
		return fmt.Errorf("open gzip reader for %s: %w", artifactPath, err)
	}
	defer gzipReader.Close()
	reader := tar.NewReader(gzipReader)

	for {
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("read tar entry from %s: %w", artifactPath, err)
		}
		switch header.Typeflag {
		case tar.TypeSymlink, tar.TypeLink:
			return newServiceError(
				ServiceErrorCodeSourceArchiveTraversal,
				"Plugin archive contains symbolic/hard link entries which are not allowed: %q",
				header.Name,
			)
		}
		targetPath, skip, err := resolveArchiveMemberPath(extractRoot, header.Name, filepath.Base(artifactPath))
		if err != nil {
			return err
		}
		if skip {
			continue
		}
		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(targetPath, 0o755); err != nil {
				return fmt.Errorf("create extracted directory %s: %w", targetPath, err)
			}
		case tar.TypeReg, tar.TypeRegA:
			if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
				return fmt.Errorf("create extracted parent directory %s: %w", filepath.Dir(targetPath), err)
			}
			if err := writeArchiveRegularFile(targetPath, reader); err != nil {
				return err
			}
		}
	}
}

func writeArchiveRegularFile(targetPath string, reader io.Reader) error {
	file, err := os.OpenFile(targetPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		return fmt.Errorf("create extracted file %s: %w", targetPath, err)
	}
	defer file.Close()
	if _, err := io.Copy(file, reader); err != nil {
		return fmt.Errorf("write extracted file %s: %w", targetPath, err)
	}
	return nil
}

func resolveArchiveMemberPath(extractRoot string, memberPath string, sourceName string) (string, bool, error) {
	normalized := strings.TrimSpace(memberPath)
	if normalized == "" {
		return "", true, nil
	}
	if strings.HasPrefix(normalized, "/") || strings.HasPrefix(normalized, "\\") || filepath.IsAbs(normalized) {
		return "", false, newServiceError(
			ServiceErrorCodeSourceArchiveTraversal,
			"Plugin archive extraction refused absolute member path %q in %s.",
			memberPath,
			sourceName,
		)
	}
	targetPath := filepath.Join(extractRoot, filepath.Clean(normalized))
	relative, err := filepath.Rel(extractRoot, targetPath)
	if err != nil {
		return "", false, fmt.Errorf("resolve archive member path %s: %w", memberPath, err)
	}
	if relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", false, newServiceError(
			ServiceErrorCodeSourceArchiveTraversal,
			"Plugin archive extraction refused out-of-root member path %q in %s.",
			memberPath,
			sourceName,
		)
	}
	return targetPath, false, nil
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
	packageName, packageVersion := readPackageMetadataOptional(packageMetadataRoot)
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
