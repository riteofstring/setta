package codexruntime

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	osexec "os/exec"
	"path/filepath"
	"strings"
	"time"

	"setta/internal/codexapp"
)

const runtimeCommandTimeout = 10 * time.Second

type bundleManifestRequirement bool

const (
	bundleManifestNotRequired bundleManifestRequirement = false
	bundleManifestRequired    bundleManifestRequirement = true
)

type AppServerEntrypoint string

const (
	AppServerEntrypointDirect        AppServerEntrypoint = "direct-app-server"
	AppServerEntrypointCLISubcommand AppServerEntrypoint = "codex-cli-subcommand"
)

type RuntimeIdentity struct {
	Selection            string
	BinaryPath           string
	ResolvedBinaryPath   string
	VersionOutput        string
	AppServerEntrypoint  string
	AppServerArgs        []string
	ArtifactSHA256       string
	CodexSourceCommit    string
	ProtocolSchemaCommit string
}

type ResolvedRuntime struct {
	Identity RuntimeIdentity
	Process  codexapp.ProcessConfig
}

type ResolveOptions struct {
	Getenv     func(string) string
	Executable func() (string, error)
}

func Resolve(ctx context.Context, options ResolveOptions) (ResolvedRuntime, error) {
	getenv := options.Getenv
	if getenv == nil {
		getenv = os.Getenv
	}
	if override := strings.TrimSpace(getenv(DevelopmentOverrideEnv)); override != "" {
		return resolveRuntimeCandidate(ctx, "override:"+DevelopmentOverrideEnv, override, bundleManifestNotRequired)
	}

	executable := options.Executable
	if executable == nil {
		executable = os.Executable
	}
	executablePath, err := executable()
	if err != nil {
		identity := RuntimeIdentity{Selection: "bundled"}
		return ResolvedRuntime{}, incompatibleError(CapabilityRuntimeResolution, identity, "resolve Setta executable path for bundled Codex runtime", err)
	}
	candidates := bundledRuntimeCandidates(executablePath)
	for _, candidate := range candidates {
		if isExecutableFile(candidate) {
			return resolveRuntimeCandidate(ctx, "bundled", candidate, bundleManifestRequired)
		}
	}
	identity := RuntimeIdentity{
		Selection:          "bundled",
		BinaryPath:         strings.Join(candidates, ", "),
		ResolvedBinaryPath: strings.Join(candidates, ", "),
	}
	return ResolvedRuntime{}, incompatibleError(
		CapabilityRuntimeResolution,
		identity,
		"managed Codex app-server runtime is not bundled for "+Platform(),
		nil,
	)
}

func resolveRuntimeCandidate(ctx context.Context, selection string, rawPath string, manifestRequirement bundleManifestRequirement) (ResolvedRuntime, error) {
	path, err := resolveExplicitPath(rawPath)
	identity := RuntimeIdentity{
		Selection:            selection,
		BinaryPath:           rawPath,
		CodexSourceCommit:    RequiredCodexSourceCommit,
		ProtocolSchemaCommit: RequiredProtocolSchemaCommit,
	}
	if err != nil {
		return ResolvedRuntime{}, incompatibleError(CapabilityRuntimeExecutable, identity, "resolve selected Codex runtime executable", err)
	}
	identity.BinaryPath = path
	identity.ResolvedBinaryPath = resolvedSymlinkPath(path)
	sha, err := fileSHA256(path)
	if err != nil {
		return ResolvedRuntime{}, incompatibleError(CapabilityRuntimeExecutable, identity, "hash selected Codex runtime executable", err)
	}
	identity.ArtifactSHA256 = sha

	var packagedManifest *PackagedRuntimeManifest
	if manifestRequirement == bundleManifestRequired {
		manifest, err := validatePackagedRuntimeManifestBeforeExecution(identity)
		if err != nil {
			return ResolvedRuntime{}, incompatibleError(CapabilityRuntimeIntegrity, identity, "validate bundled Codex runtime manifest before execution", err)
		}
		packagedManifest = &manifest
	}

	version, err := runRuntimeCommand(ctx, path, "--version")
	if err != nil {
		return ResolvedRuntime{}, incompatibleError(CapabilityRuntimeVersion, identity, "read Codex runtime version", err)
	}
	identity.VersionOutput = strings.TrimSpace(version)
	if identity.VersionOutput == "" {
		return ResolvedRuntime{}, incompatibleError(CapabilityRuntimeVersion, identity, "Codex runtime returned an empty version", nil)
	}

	entrypoint, help, err := detectAppServerEntrypoint(ctx, path)
	if err != nil {
		return ResolvedRuntime{}, incompatibleError(CapabilityAppServerEntrypoint, identity, "detect app-server entrypoint", err)
	}
	identity.AppServerEntrypoint = string(entrypoint)
	if !strings.Contains(help, "--session-source") {
		return ResolvedRuntime{}, incompatibleError(
			CapabilityExplicitSessionSource,
			identity,
			"Codex app-server entrypoint does not support --session-source app-server",
			nil,
		)
	}
	identity.AppServerArgs = appServerArgs(entrypoint)
	if packagedManifest != nil {
		if err := validatePackagedRuntimeManifestAfterExecution(*packagedManifest, identity); err != nil {
			return ResolvedRuntime{}, incompatibleError(CapabilityRuntimeIntegrity, identity, "validate bundled Codex runtime manifest", err)
		}
	}
	return ResolvedRuntime{
		Identity: identity,
		Process: codexapp.ProcessConfig{
			Command: path,
			Args:    append([]string{}, identity.AppServerArgs...),
		},
	}, nil
}

func resolveExplicitPath(path string) (string, error) {
	if filepath.IsAbs(path) {
		return path, requireExecutableFile(path)
	}
	if strings.ContainsRune(path, filepath.Separator) {
		absolute, err := filepath.Abs(path)
		if err != nil {
			return "", err
		}
		return absolute, requireExecutableFile(absolute)
	}
	resolved, err := osexec.LookPath(path)
	if err != nil {
		return "", err
	}
	return resolved, requireExecutableFile(resolved)
}

func bundledRuntimeCandidates(executablePath string) []string {
	executableDir := filepath.Dir(executablePath)
	name := platformExecutableName(RequiredArtifactName)
	platform := platformDirectoryName()
	return uniqueCleanPaths([]string{
		filepath.Join(executableDir, ManagedRuntimeDirectoryName, platform, name),
		filepath.Join(executableDir, "Resources", ManagedRuntimeDirectoryName, platform, name),
		filepath.Join(executableDir, "..", "Resources", ManagedRuntimeDirectoryName, platform, name),
	})
}

func appServerArgs(entrypoint AppServerEntrypoint) []string {
	args := []string{}
	if entrypoint == AppServerEntrypointCLISubcommand {
		args = append(args, "app-server")
	}
	args = append(args, "--listen", "stdio://", "--session-source", RequiredAppServerSessionSource)
	return args
}

func detectAppServerEntrypoint(ctx context.Context, command string) (AppServerEntrypoint, string, error) {
	if help, err := runRuntimeCommand(ctx, command, "--help"); err == nil && strings.Contains(help, "--listen") {
		return AppServerEntrypointDirect, help, nil
	}
	if help, err := runRuntimeCommand(ctx, command, "app-server", "--help"); err == nil && strings.Contains(help, "--listen") {
		return AppServerEntrypointCLISubcommand, help, nil
	}
	return "", "", fmt.Errorf("%s does not expose an app-server --listen interface", command)
}

func runRuntimeCommand(ctx context.Context, command string, args ...string) (string, error) {
	commandCtx, cancel := context.WithTimeout(ctx, runtimeCommandTimeout)
	defer cancel()
	output, err := osexec.CommandContext(commandCtx, command, args...).CombinedOutput()
	text := strings.TrimSpace(string(output))
	if commandCtx.Err() != nil {
		return text, commandCtx.Err()
	}
	if err != nil {
		return text, fmt.Errorf("%s %s failed: %w; output=%s", command, strings.Join(args, " "), err, text)
	}
	return text, nil
}

func requireExecutableFile(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return fmt.Errorf("%s is a directory", path)
	}
	if info.Mode().Perm()&0o111 == 0 {
		return fmt.Errorf("%s is not executable", path)
	}
	return nil
}

func isExecutableFile(path string) bool {
	return requireExecutableFile(path) == nil
}

func resolvedSymlinkPath(path string) string {
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return path
	}
	return resolved
}

func fileSHA256(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func platformExecutableName(name string) string {
	return platformExecutableNameForPlatform(name, Platform())
}

func platformDirectoryName() string {
	return platformDirectoryNameForPlatform(Platform())
}

func uniqueCleanPaths(paths []string) []string {
	result := make([]string, 0, len(paths))
	seen := map[string]struct{}{}
	for _, path := range paths {
		clean := filepath.Clean(path)
		if _, ok := seen[clean]; ok {
			continue
		}
		seen[clean] = struct{}{}
		result = append(result, clean)
	}
	return result
}
