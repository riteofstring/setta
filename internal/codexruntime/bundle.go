package codexruntime

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const PackagedRuntimeManifestFileName = "codex-runtime-manifest.json"

type PackagedRuntimeManifest struct {
	Strategy                string   `json:"strategy"`
	CodexSourceCommit       string   `json:"codexSourceCommit"`
	ProtocolSchemaCommit    string   `json:"protocolSchemaCommit"`
	ArtifactName            string   `json:"artifactName"`
	Platform                string   `json:"platform"`
	SHA256                  string   `json:"sha256"`
	VersionOutput           string   `json:"versionOutput"`
	AppServerEntrypoint     string   `json:"appServerEntrypoint"`
	AppServerArgs           []string `json:"appServerArgs"`
	RequiredSessionSource   string   `json:"requiredSessionSource"`
	DevelopmentOverrideEnv  string   `json:"developmentOverrideEnv"`
	ManagedRuntimeDirectory string   `json:"managedRuntimeDirectory"`
}

func BundleRuntime(ctx context.Context, sourcePath string, resourcesDir string, platform string) (PackagedRuntimeManifest, string, error) {
	if platform == "" {
		platform = Platform()
	}
	if resourcesDir == "" {
		return PackagedRuntimeManifest{}, "", fmt.Errorf("resources directory is required")
	}
	resolved, err := resolveRuntimeCandidate(ctx, "bundle-source", sourcePath, bundleManifestNotRequired)
	if err != nil {
		return PackagedRuntimeManifest{}, "", err
	}
	targetPath := RuntimeBundleExecutablePath(resourcesDir, platform)
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		return PackagedRuntimeManifest{}, "", fmt.Errorf("create runtime bundle directory: %w", err)
	}
	if err := copyExecutable(resolved.Process.Command, targetPath); err != nil {
		return PackagedRuntimeManifest{}, "", err
	}
	manifest := packagedRuntimeManifest(resolved.Identity, platform)
	manifestPath := RuntimeBundleManifestPath(targetPath)
	if err := writePackagedRuntimeManifest(manifestPath, manifest); err != nil {
		return PackagedRuntimeManifest{}, "", err
	}
	return manifest, targetPath, nil
}

func RuntimeBundleExecutablePath(resourcesDir string, platform string) string {
	return filepath.Join(
		resourcesDir,
		ManagedRuntimeDirectoryName,
		platformDirectoryNameForPlatform(platform),
		platformExecutableNameForPlatform(RequiredArtifactName, platform),
	)
}

func RuntimeBundleManifestPath(binaryPath string) string {
	return filepath.Join(filepath.Dir(binaryPath), PackagedRuntimeManifestFileName)
}

func readPackagedRuntimeManifest(binaryPath string) (PackagedRuntimeManifest, error) {
	path := RuntimeBundleManifestPath(binaryPath)
	raw, err := os.ReadFile(path)
	if err != nil {
		return PackagedRuntimeManifest{}, fmt.Errorf("read packaged runtime manifest %s: %w", path, err)
	}
	var manifest PackagedRuntimeManifest
	if err := json.Unmarshal(raw, &manifest); err != nil {
		return PackagedRuntimeManifest{}, fmt.Errorf("decode packaged runtime manifest %s: %w", path, err)
	}
	return manifest, nil
}

func validatePackagedRuntimeManifestBeforeExecution(identity RuntimeIdentity) (PackagedRuntimeManifest, error) {
	manifest, err := readPackagedRuntimeManifest(identity.BinaryPath)
	if err != nil {
		return PackagedRuntimeManifest{}, err
	}
	if err := validatePackagedRuntimeManifestPreExecutionFields(manifest, identity); err != nil {
		return PackagedRuntimeManifest{}, fmt.Errorf("validate packaged runtime manifest %s: %w", RuntimeBundleManifestPath(identity.BinaryPath), err)
	}
	return manifest, nil
}

func validatePackagedRuntimeManifestAfterExecution(manifest PackagedRuntimeManifest, identity RuntimeIdentity) error {
	if err := validatePackagedRuntimeManifestPostExecutionFields(manifest, identity); err != nil {
		return fmt.Errorf("validate packaged runtime manifest %s: %w", RuntimeBundleManifestPath(identity.BinaryPath), err)
	}
	return nil
}

func validatePackagedRuntimeManifestPreExecutionFields(manifest PackagedRuntimeManifest, identity RuntimeIdentity) error {
	checks := []struct {
		name string
		got  string
		want string
	}{
		{name: "strategy", got: manifest.Strategy, want: StrategyBundledStandaloneAppServer},
		{name: "codexSourceCommit", got: manifest.CodexSourceCommit, want: RequiredCodexSourceCommit},
		{name: "protocolSchemaCommit", got: manifest.ProtocolSchemaCommit, want: RequiredProtocolSchemaCommit},
		{name: "artifactName", got: manifest.ArtifactName, want: platformExecutableName(RequiredArtifactName)},
		{name: "platform", got: manifest.Platform, want: Platform()},
		{name: "sha256", got: manifest.SHA256, want: identity.ArtifactSHA256},
		{name: "requiredSessionSource", got: manifest.RequiredSessionSource, want: RequiredAppServerSessionSource},
		{name: "developmentOverrideEnv", got: manifest.DevelopmentOverrideEnv, want: DevelopmentOverrideEnv},
		{name: "managedRuntimeDirectory", got: manifest.ManagedRuntimeDirectory, want: ManagedRuntimeDirectoryName},
	}
	for _, check := range checks {
		if check.got != check.want {
			return fmt.Errorf("%s = %q, want %q", check.name, check.got, check.want)
		}
	}
	return nil
}

func validatePackagedRuntimeManifestPostExecutionFields(manifest PackagedRuntimeManifest, identity RuntimeIdentity) error {
	checks := []struct {
		name string
		got  string
		want string
	}{
		{name: "versionOutput", got: manifest.VersionOutput, want: identity.VersionOutput},
		{name: "appServerEntrypoint", got: manifest.AppServerEntrypoint, want: identity.AppServerEntrypoint},
	}
	for _, check := range checks {
		if check.got != check.want {
			return fmt.Errorf("%s = %q, want %q", check.name, check.got, check.want)
		}
	}
	if strings.Join(manifest.AppServerArgs, "\x00") != strings.Join(identity.AppServerArgs, "\x00") {
		return fmt.Errorf("appServerArgs = %q, want %q", manifest.AppServerArgs, identity.AppServerArgs)
	}
	return nil
}

func packagedRuntimeManifest(identity RuntimeIdentity, platform string) PackagedRuntimeManifest {
	return PackagedRuntimeManifest{
		Strategy:                StrategyBundledStandaloneAppServer,
		CodexSourceCommit:       RequiredCodexSourceCommit,
		ProtocolSchemaCommit:    RequiredProtocolSchemaCommit,
		ArtifactName:            platformExecutableNameForPlatform(RequiredArtifactName, platform),
		Platform:                platform,
		SHA256:                  identity.ArtifactSHA256,
		VersionOutput:           identity.VersionOutput,
		AppServerEntrypoint:     identity.AppServerEntrypoint,
		AppServerArgs:           append([]string{}, identity.AppServerArgs...),
		RequiredSessionSource:   RequiredAppServerSessionSource,
		DevelopmentOverrideEnv:  DevelopmentOverrideEnv,
		ManagedRuntimeDirectory: ManagedRuntimeDirectoryName,
	}
}

func writePackagedRuntimeManifest(path string, manifest PackagedRuntimeManifest) error {
	raw, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return fmt.Errorf("encode packaged runtime manifest: %w", err)
	}
	raw = append(raw, '\n')
	if err := os.WriteFile(path, raw, 0o644); err != nil {
		return fmt.Errorf("write packaged runtime manifest %s: %w", path, err)
	}
	return nil
}

func copyExecutable(source string, target string) error {
	raw, err := os.ReadFile(source)
	if err != nil {
		return fmt.Errorf("read runtime executable %s: %w", source, err)
	}
	if err := os.WriteFile(target, raw, 0o755); err != nil {
		return fmt.Errorf("write runtime executable %s: %w", target, err)
	}
	return nil
}

func platformDirectoryNameForPlatform(platform string) string {
	return strings.ReplaceAll(platform, "/", "-")
}

func platformExecutableNameForPlatform(name string, platform string) string {
	if strings.HasSuffix(name, ".exe") || !strings.HasPrefix(platform, "windows/") {
		return name
	}
	return name + ".exe"
}
