package evalharness

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

type phase0BundleManifest struct {
	LayoutVersion int    `json:"layoutVersion"`
	Version       string `json:"version"`
	Target        string `json:"target"`
	Variant       string `json:"variant"`
	Entrypoint    string `json:"entrypoint"`
	ResourcesDir  string `json:"resourcesDir"`
	PathDir       string `json:"pathDir"`
}

type phase0PreparedBuild struct {
	contextDir  string
	hostVersion string
	manifest    phase0BundleManifest
	fileSHA256  map[string]string
}

func preparePhase0BuildContext(
	ctx context.Context,
	config phase0ProbeConfig,
) (phase0PreparedBuild, error) {
	manifest, err := readPhase0BundleManifest(config.codexLinuxBundle)
	if err != nil {
		return phase0PreparedBuild{}, err
	}
	if err := validatePhase0BundleManifest(manifest); err != nil {
		return phase0PreparedBuild{}, err
	}
	hostVersion, err := readPhase0HostCodexVersion(ctx, config)
	if err != nil {
		return phase0PreparedBuild{}, err
	}
	if hostVersion != manifest.Version {
		return phase0PreparedBuild{}, fmt.Errorf(
			"host Codex %s does not match Linux bundle %s",
			hostVersion,
			manifest.Version,
		)
	}
	contextDir, err := os.MkdirTemp("", "setta-eval-phase0-build-")
	if err != nil {
		return phase0PreparedBuild{}, fmt.Errorf("create Phase 0 build context: %w", err)
	}
	prepared := phase0PreparedBuild{
		contextDir:  contextDir,
		hostVersion: hostVersion,
		manifest:    manifest,
		fileSHA256:  map[string]string{},
	}
	if err := populatePhase0BuildContext(ctx, config, &prepared); err != nil {
		_ = os.RemoveAll(contextDir)
		return phase0PreparedBuild{}, err
	}
	return prepared, nil
}

func readPhase0BundleManifest(bundleRoot string) (phase0BundleManifest, error) {
	path := filepath.Join(bundleRoot, "codex-package.json")
	file, err := os.Open(path)
	if err != nil {
		return phase0BundleManifest{}, fmt.Errorf("open Codex bundle manifest: %w", err)
	}
	defer file.Close()
	decoder := json.NewDecoder(file)
	decoder.DisallowUnknownFields()
	var manifest phase0BundleManifest
	if err := decoder.Decode(&manifest); err != nil {
		return phase0BundleManifest{}, fmt.Errorf("decode Codex bundle manifest: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return phase0BundleManifest{}, fmt.Errorf("Codex bundle manifest contains trailing JSON")
	}
	return manifest, nil
}

func validatePhase0BundleManifest(manifest phase0BundleManifest) error {
	if manifest.LayoutVersion != phase0CodexLayoutVersion {
		return fmt.Errorf("Codex bundle layout is %d, want %d", manifest.LayoutVersion, phase0CodexLayoutVersion)
	}
	if strings.TrimSpace(manifest.Version) == "" {
		return fmt.Errorf("Codex bundle version is required")
	}
	if manifest.Target != phase0CodexBundleTarget {
		return fmt.Errorf("Codex bundle target is %q, want %q", manifest.Target, phase0CodexBundleTarget)
	}
	if manifest.Variant != phase0CodexBundleVariant {
		return fmt.Errorf("Codex bundle variant is %q, want %q", manifest.Variant, phase0CodexBundleVariant)
	}
	if manifest.Entrypoint != "bin/codex" ||
		manifest.ResourcesDir != "codex-resources" ||
		manifest.PathDir != "codex-path" {
		return fmt.Errorf("Codex bundle has an unsupported layout")
	}
	return nil
}

func readPhase0HostCodexVersion(
	ctx context.Context,
	config phase0ProbeConfig,
) (string, error) {
	result, err := runPhase0Command(ctx, config.repoRoot, nil, config.codexCommand, "--version")
	if err != nil {
		return "", fmt.Errorf("inspect host Codex: %w", err)
	}
	fields := strings.Fields(result.stdout)
	if len(fields) != 2 || fields[0] != "codex-cli" || strings.TrimSpace(fields[1]) == "" {
		return "", fmt.Errorf("host Codex returned unsupported version output %q", result.stdout)
	}
	help, err := runPhase0Command(
		ctx,
		config.repoRoot,
		nil,
		config.codexCommand,
		"exec-server",
		"--help",
	)
	if err != nil {
		return "", fmt.Errorf("inspect host Codex exec-server support: %w", err)
	}
	if !strings.Contains(help.stdout, "--listen") {
		return "", fmt.Errorf("host Codex does not expose the supported exec-server listener")
	}
	return fields[1], nil
}

func populatePhase0BuildContext(
	ctx context.Context,
	config phase0ProbeConfig,
	prepared *phase0PreparedBuild,
) error {
	files := []struct {
		name        string
		source      string
		destination string
	}{
		{
			name:        "codex",
			source:      filepath.Join(config.codexLinuxBundle, prepared.manifest.Entrypoint),
			destination: filepath.Join(prepared.contextDir, "codex"),
		},
		{
			name:        "rg",
			source:      filepath.Join(config.codexLinuxBundle, prepared.manifest.PathDir, "rg"),
			destination: filepath.Join(prepared.contextDir, "rg"),
		},
		{
			name: "zsh",
			source: filepath.Join(
				config.codexLinuxBundle,
				prepared.manifest.ResourcesDir,
				"zsh",
				"bin",
				"zsh",
			),
			destination: filepath.Join(prepared.contextDir, "zsh"),
		},
		{
			name:        "Dockerfile",
			source:      filepath.Join(config.repoRoot, "evals", "sandbox", "phase0.Dockerfile"),
			destination: filepath.Join(prepared.contextDir, "Dockerfile"),
		},
	}
	for _, file := range files {
		digest, err := copyAndHashPhase0File(file.source, file.destination)
		if err != nil {
			return fmt.Errorf("prepare %s: %w", file.name, err)
		}
		prepared.fileSHA256[file.name] = digest
	}
	helperPath := filepath.Join(prepared.contextDir, "sandbox-helper")
	buildEnvironment := append(
		append([]string{}, os.Environ()...),
		"CGO_ENABLED=0",
		"GOARCH=arm64",
		"GOOS=linux",
	)
	if _, err := runPhase0Command(
		ctx,
		config.repoRoot,
		buildEnvironment,
		filepath.Join(config.repoRoot, "scripts", "go.sh"),
		"build",
		"-trimpath",
		"-o",
		helperPath,
		"./cmd/setta-eval-sandbox-helper",
	); err != nil {
		return fmt.Errorf("build sandbox helper: %w", err)
	}
	digest, err := hashPhase0File(helperPath)
	if err != nil {
		return fmt.Errorf("hash sandbox helper: %w", err)
	}
	prepared.fileSHA256["sandbox-helper"] = digest
	if err := os.WriteFile(
		filepath.Join(prepared.contextDir, "workspace-seed"),
		[]byte("setta Phase 0 workspace volume\n"),
		0o600,
	); err != nil {
		return fmt.Errorf("write workspace volume seed: %w", err)
	}
	return nil
}

func copyAndHashPhase0File(source string, destination string) (string, error) {
	info, err := os.Stat(source)
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("%s is not a regular file", source)
	}
	input, err := os.Open(source)
	if err != nil {
		return "", err
	}
	defer input.Close()
	output, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return "", err
	}
	hasher := sha256.New()
	_, copyErr := io.Copy(io.MultiWriter(output, hasher), input)
	closeErr := output.Close()
	if copyErr != nil {
		return "", copyErr
	}
	if closeErr != nil {
		return "", closeErr
	}
	return hex.EncodeToString(hasher.Sum(nil)), nil
}

func hashPhase0File(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hasher := sha256.New()
	if _, err := io.Copy(hasher, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hasher.Sum(nil)), nil
}
