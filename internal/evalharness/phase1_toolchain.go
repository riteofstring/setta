package evalharness

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/jsonio"
)

const (
	phase1ToolchainPinSchemaVersion       = 1
	phase1ToolchainPinMaximumBytes        = 16 * 1024
	phase1ToolchainPinRelativePath        = "evals/sandbox/phase1-toolchain.json"
	phase1PNPMPackageManifestMaximumBytes = 64 * 1024
	phase1PNPMBundleMaximumBytes          = 16 * 1024 * 1024
	phase1PNPMLicenseMaximumBytes         = 64 * 1024
)

type phase1ToolchainPin struct {
	SchemaVersion     int    `json:"schemaVersion"`
	Platform          string `json:"platform"`
	BaseImage         string `json:"baseImage"`
	BaseImageID       string `json:"baseImageId"`
	NodeVersion       string `json:"nodeVersion"`
	PNPMVersion       string `json:"pnpmVersion"`
	PNPMBundleSHA256  string `json:"pnpmBundleSha256"`
	PNPMLicenseSHA256 string `json:"pnpmLicenseSha256"`
}

type phase1PNPMBundle struct {
	bundlePath  string
	licensePath string
}

type phase1PNPMPackage struct {
	Version string `json:"version"`
}

func loadPhase1ToolchainPin(repoRoot string) (phase1ToolchainPin, error) {
	path := filepath.Join(repoRoot, filepath.FromSlash(phase1ToolchainPinRelativePath))
	info, err := os.Lstat(path)
	if err != nil {
		return phase1ToolchainPin{}, fmt.Errorf("inspect Phase 1 toolchain pin: %w", err)
	}
	if !info.Mode().IsRegular() {
		return phase1ToolchainPin{}, errors.New("Phase 1 toolchain pin must be a regular file")
	}
	if info.Size() > phase1ToolchainPinMaximumBytes {
		return phase1ToolchainPin{}, fmt.Errorf(
			"Phase 1 toolchain pin is %d bytes, maximum is %d",
			info.Size(),
			phase1ToolchainPinMaximumBytes,
		)
	}
	file, err := os.Open(path)
	if err != nil {
		return phase1ToolchainPin{}, fmt.Errorf("open Phase 1 toolchain pin: %w", err)
	}
	defer file.Close()
	var pin phase1ToolchainPin
	if err := jsonio.DecodeSingle(file, &pin); err != nil {
		return phase1ToolchainPin{}, fmt.Errorf("decode Phase 1 toolchain pin: %w", err)
	}
	if err := pin.validate(); err != nil {
		return phase1ToolchainPin{}, fmt.Errorf("validate Phase 1 toolchain pin: %w", err)
	}
	return pin, nil
}

func (pin phase1ToolchainPin) validate() error {
	if pin.SchemaVersion != phase1ToolchainPinSchemaVersion {
		return fmt.Errorf(
			"schemaVersion is %d, want %d",
			pin.SchemaVersion,
			phase1ToolchainPinSchemaVersion,
		)
	}
	if pin.Platform != phase1ImagePlatform {
		return fmt.Errorf("platform is %q, want %q", pin.Platform, phase1ImagePlatform)
	}
	if !validPhase1PinnedImageReference(pin.BaseImage) {
		return errors.New("baseImage must be the exact docker.io/library/node ARM64 manifest digest")
	}
	if !validPhase1ImageID(pin.BaseImageID) {
		return errors.New("baseImageId must be an exact lowercase sha256 image id")
	}
	if !validPhase1ToolVersion(pin.NodeVersion) {
		return errors.New("nodeVersion must be an exact numeric version")
	}
	if !validPhase1ToolVersion(pin.PNPMVersion) {
		return errors.New("pnpmVersion must be an exact numeric version")
	}
	if !validPhase1SHA256(pin.PNPMBundleSHA256) {
		return errors.New("pnpmBundleSha256 must be an exact lowercase SHA-256 digest")
	}
	if !validPhase1SHA256(pin.PNPMLicenseSHA256) {
		return errors.New("pnpmLicenseSha256 must be an exact lowercase SHA-256 digest")
	}
	return nil
}

func validPhase1PinnedImageReference(value string) bool {
	const prefix = "docker.io/library/node@sha256:"
	return strings.HasPrefix(value, prefix) && validPhase1SHA256(strings.TrimPrefix(value, prefix))
}

func validPhase1SHA256(value string) bool {
	if len(value) != 64 {
		return false
	}
	for _, character := range value {
		if character >= '0' && character <= '9' || character >= 'a' && character <= 'f' {
			continue
		}
		return false
	}
	return true
}

func validPhase1ToolVersion(value string) bool {
	parts := strings.Split(value, ".")
	if len(parts) != 3 {
		return false
	}
	for _, part := range parts {
		if part == "" {
			return false
		}
		for _, character := range part {
			if character < '0' || character > '9' {
				return false
			}
		}
	}
	return true
}

func resolvePhase1PNPMBundle(
	ctx context.Context,
	repoRoot string,
	pnpmCommand string,
	pin phase1ToolchainPin,
) (phase1PNPMBundle, error) {
	version, err := runPhase0Command(ctx, repoRoot, nil, pnpmCommand, "--version")
	if err != nil {
		return phase1PNPMBundle{}, fmt.Errorf("read Phase 1 host pnpm version: %w", err)
	}
	if version.stdout != pin.PNPMVersion {
		return phase1PNPMBundle{}, fmt.Errorf(
			"host pnpm is %s, want pinned %s",
			version.stdout,
			pin.PNPMVersion,
		)
	}
	rootResult, err := runPhase0Command(ctx, repoRoot, nil, pnpmCommand, "root", "--global")
	if err != nil {
		return phase1PNPMBundle{}, fmt.Errorf("locate Phase 1 host pnpm package: %w", err)
	}
	globalRoot, err := cleanExistingPhase1Directory("host pnpm global root", rootResult.stdout)
	if err != nil {
		return phase1PNPMBundle{}, err
	}
	packageRoot, err := cleanExistingPhase1Directory(
		"host pnpm package",
		filepath.Join(globalRoot, "pnpm"),
	)
	if err != nil {
		return phase1PNPMBundle{}, err
	}
	packageVersion, err := readPhase1PNPMPackageVersion(packageRoot)
	if err != nil {
		return phase1PNPMBundle{}, err
	}
	if packageVersion != pin.PNPMVersion {
		return phase1PNPMBundle{}, fmt.Errorf(
			"host pnpm package is %s, want pinned %s",
			packageVersion,
			pin.PNPMVersion,
		)
	}
	bundle := phase1PNPMBundle{
		bundlePath:  filepath.Join(packageRoot, "dist", "pnpm.cjs"),
		licensePath: filepath.Join(packageRoot, "LICENSE"),
	}
	if err := requirePhase1FileDigest(
		"pnpm bundle",
		bundle.bundlePath,
		pin.PNPMBundleSHA256,
		phase1PNPMBundleMaximumBytes,
	); err != nil {
		return phase1PNPMBundle{}, err
	}
	if err := requirePhase1FileDigest(
		"pnpm license",
		bundle.licensePath,
		pin.PNPMLicenseSHA256,
		phase1PNPMLicenseMaximumBytes,
	); err != nil {
		return phase1PNPMBundle{}, err
	}
	return bundle, nil
}

func readPhase1PNPMPackageVersion(packageRoot string) (string, error) {
	path := filepath.Join(packageRoot, "package.json")
	if err := inspectPhase1RegularFile(
		"host pnpm package manifest",
		path,
		phase1PNPMPackageManifestMaximumBytes,
	); err != nil {
		return "", err
	}
	payload, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read Phase 1 host pnpm package manifest: %w", err)
	}
	var manifest phase1PNPMPackage
	if err := json.Unmarshal(payload, &manifest); err != nil {
		return "", fmt.Errorf("decode Phase 1 host pnpm package manifest: %w", err)
	}
	if !validPhase1ToolVersion(manifest.Version) {
		return "", errors.New("Phase 1 host pnpm package manifest has no exact version")
	}
	return manifest.Version, nil
}

func requirePhase1FileDigest(label string, path string, want string, maximumBytes int64) error {
	if err := inspectPhase1RegularFile(label, path, maximumBytes); err != nil {
		return err
	}
	actual, err := hashPhase0File(path)
	if err != nil {
		return fmt.Errorf("hash Phase 1 %s: %w", label, err)
	}
	if actual != want {
		return fmt.Errorf("Phase 1 %s SHA-256 is %s, want %s", label, actual, want)
	}
	return nil
}

func inspectPhase1RegularFile(label string, path string, maximumBytes int64) error {
	info, err := os.Lstat(path)
	if err != nil {
		return fmt.Errorf("inspect Phase 1 %s: %w", label, err)
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("Phase 1 %s must be a regular file", label)
	}
	if info.Size() <= 0 || info.Size() > maximumBytes {
		return fmt.Errorf(
			"Phase 1 %s is %d bytes, want 1-%d",
			label,
			info.Size(),
			maximumBytes,
		)
	}
	return nil
}

func validatePhase1FixtureToolchain(
	fixture phase1FixturePackage,
	pin phase1ToolchainPin,
) error {
	if fixture.Engines.Node != pin.NodeVersion || fixture.Engines.PNPM != pin.PNPMVersion {
		return fmt.Errorf(
			"Phase 1 fixture requests node/pnpm %s/%s, pinned toolchain provides %s/%s",
			fixture.Engines.Node,
			fixture.Engines.PNPM,
			pin.NodeVersion,
			pin.PNPMVersion,
		)
	}
	return nil
}
