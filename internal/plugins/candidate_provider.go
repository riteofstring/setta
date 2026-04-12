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

	extractRoot := filepath.Join(tempRoot, "extract")
	if err := p.populatePyPIExtractRoot(ctx, packageSpec, tempRoot, extractRoot, spec.Raw, requestedInstaller, resolvedInstaller); err != nil {
		_ = cleanup()
		return CandidatePlugin{}, err
	}

	manifestPath, err := findSinglePluginManifestPath(extractRoot)
	if err != nil {
		_ = cleanup()
		return CandidatePlugin{}, err
	}
	pluginRoot := filepath.Dir(manifestPath)
	candidate, err := p.finalizeCandidateFromManifestPath(tempRoot, extractRoot, pluginRoot, manifestPath, spec.CanonicalSourceKey, cleanup)
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

func (p *ProductionCandidateProvider) populatePyPIExtractRoot(ctx context.Context, packageSpec string, tempRoot string, extractRoot string, sourceSpec string, requestedInstaller PluginInstallerBackend, resolvedInstaller PluginInstallerBackend) error {
	if resolvedInstaller == PluginInstallerBackendPip {
		return p.downloadAndExtractPyPIArtifact(ctx, packageSpec, tempRoot, extractRoot, sourceSpec)
	}
	if err := p.installWithUV(ctx, packageSpec, extractRoot, sourceSpec); err == nil {
		return nil
	} else if requestedInstaller != PluginInstallerBackendAuto {
		return err
	}
	if err := resetCandidateExtractRoot(extractRoot); err != nil {
		return err
	}
	return p.downloadAndExtractPyPIArtifact(ctx, packageSpec, tempRoot, extractRoot, sourceSpec)
}

func (p *ProductionCandidateProvider) downloadAndExtractPyPIArtifact(ctx context.Context, packageSpec string, tempRoot string, extractRoot string, sourceSpec string) error {
	if err := p.downloadWithPip(ctx, packageSpec, tempRoot, sourceSpec); err != nil {
		return err
	}
	return extractFirstDownloadedArtifact(tempRoot, extractRoot)
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

func resetCandidateExtractRoot(extractRoot string) error {
	if err := os.RemoveAll(extractRoot); err != nil {
		return fmt.Errorf("reset failed uv extract root: %w", err)
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

	artifactName := filepath.Base(artifactPath)
	for _, file := range archive.File {
		if err := extractZipArchiveMember(file, extractRoot, artifactName); err != nil {
			return err
		}
	}
	return nil
}

func extractZipArchiveMember(file *zip.File, extractRoot string, artifactName string) error {
	if file.Mode()&os.ModeSymlink != 0 {
		return newServiceError(
			ServiceErrorCodeSourceArchiveTraversal,
			"Plugin archive contains symbolic link entries which are not allowed: %q",
			file.Name,
		)
	}
	targetPath, skip, err := resolveArchiveMemberPath(extractRoot, file.Name, artifactName)
	if err != nil || skip {
		return err
	}
	if file.FileInfo().IsDir() {
		if err := os.MkdirAll(targetPath, 0o755); err != nil {
			return fmt.Errorf("create extracted directory %s: %w", targetPath, err)
		}
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		return fmt.Errorf("create extracted parent directory %s: %w", filepath.Dir(targetPath), err)
	}
	return writeZipArchiveFile(targetPath, file)
}

func writeZipArchiveFile(targetPath string, file *zip.File) error {
	reader, err := file.Open()
	if err != nil {
		return fmt.Errorf("open zip member %s: %w", file.Name, err)
	}
	if err := writeArchiveRegularFile(targetPath, reader); err != nil {
		_ = reader.Close()
		return err
	}
	if err := reader.Close(); err != nil {
		return fmt.Errorf("close zip member %s: %w", file.Name, err)
	}
	return nil
}

func extractTarGzArtifact(artifactPath string, extractRoot string) error {
	reader, cleanup, err := openTarGzArtifactReader(artifactPath)
	if err != nil {
		return err
	}
	defer cleanup()

	for {
		header, done, err := nextTarGzHeader(reader, artifactPath)
		if err != nil {
			return err
		}
		if done {
			return nil
		}
		if err := extractTarArchiveEntry(header, reader, extractRoot, filepath.Base(artifactPath)); err != nil {
			return err
		}
	}
}

func openTarGzArtifactReader(artifactPath string) (*tar.Reader, func(), error) {
	file, err := os.Open(artifactPath)
	if err != nil {
		return nil, nil, fmt.Errorf("open tar artifact %s: %w", artifactPath, err)
	}
	gzipReader, err := gzip.NewReader(file)
	if err != nil {
		_ = file.Close()
		return nil, nil, fmt.Errorf("open gzip reader for %s: %w", artifactPath, err)
	}
	return tar.NewReader(gzipReader), func() {
		_ = gzipReader.Close()
		_ = file.Close()
	}, nil
}

func nextTarGzHeader(reader *tar.Reader, artifactPath string) (*tar.Header, bool, error) {
	header, err := reader.Next()
	if errors.Is(err, io.EOF) {
		return nil, true, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("read tar entry from %s: %w", artifactPath, err)
	}
	return header, false, nil
}

func extractTarArchiveEntry(header *tar.Header, reader *tar.Reader, extractRoot string, sourceName string) error {
	switch header.Typeflag {
	case tar.TypeSymlink, tar.TypeLink:
		return newServiceError(
			ServiceErrorCodeSourceArchiveTraversal,
			"Plugin archive contains symbolic/hard link entries which are not allowed: %q",
			header.Name,
		)
	}
	targetPath, skip, err := resolveArchiveMemberPath(extractRoot, header.Name, sourceName)
	if err != nil {
		return err
	}
	if skip {
		return nil
	}
	return writeTarArchiveEntryTarget(header, reader, targetPath)
}

func writeTarArchiveEntryTarget(header *tar.Header, reader io.Reader, targetPath string) error {
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
	return nil
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
