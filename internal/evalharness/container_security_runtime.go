package evalharness

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"os/user"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"

	"setta/internal/jsonio"
)

const (
	containerSecurityDatabaseMaximumBytes = 2 * 1024 * 1024 * 1024
	containerSecurityMetadataMaximumBytes = 64 * 1024
	containerSecurityContainerMemory      = "2g"
	containerSecurityContainerCPUs        = "2"
	containerSecurityContainerPIDs        = "256"
)

type containerSecurityRuntime struct {
	client phase0DockerClient
	pin    containerSecurityPolicyPin
	root   string
	cache  string
	ignore string
	user   string
	suffix string
}

type containerSecurityMount struct {
	source   string
	target   string
	readOnly bool
}

type containerSecurityImageTarget struct {
	name      string
	reference string
	imageID   string
}

type containerSecurityImageScan struct {
	result   ContainerSecurityImageResult
	findings []ContainerSecurityFinding
	raw      map[string][]byte
}

type trivyDatabaseMetadata struct {
	Version      int       `json:"Version,omitempty"`
	NextUpdate   time.Time `json:"NextUpdate"`
	UpdatedAt    time.Time `json:"UpdatedAt"`
	DownloadedAt time.Time `json:"DownloadedAt"`
}

func newContainerSecurityRuntime(
	client phase0DockerClient,
	pin containerSecurityPolicyPin,
) (*containerSecurityRuntime, error) {
	root, err := os.MkdirTemp("", "setta-container-security-")
	if err != nil {
		return nil, fmt.Errorf("create container security workspace: %w", err)
	}
	remove := true
	defer func() {
		if remove {
			_ = os.RemoveAll(root)
		}
	}()
	cache := filepath.Join(root, "cache")
	if err := os.Mkdir(cache, 0o700); err != nil {
		return nil, fmt.Errorf("create container security database cache: %w", err)
	}
	ignore := filepath.Join(root, "empty.trivyignore")
	if err := os.WriteFile(ignore, []byte{}, 0o400); err != nil {
		return nil, fmt.Errorf("create empty Trivy ignore policy: %w", err)
	}
	userID, err := currentContainerSecurityUser()
	if err != nil {
		return nil, err
	}
	suffix, err := phase0RandomHex(6)
	if err != nil {
		return nil, err
	}
	remove = false
	return &containerSecurityRuntime{
		client: client,
		pin:    pin,
		root:   root,
		cache:  cache,
		ignore: ignore,
		user:   userID,
		suffix: suffix,
	}, nil
}

func currentContainerSecurityUser() (string, error) {
	current, err := user.Current()
	if err != nil {
		return "", fmt.Errorf("identify container security host user: %w", err)
	}
	uid, uidErr := strconv.Atoi(current.Uid)
	gid, gidErr := strconv.Atoi(current.Gid)
	if uidErr != nil || gidErr != nil || uid < 1 || gid < 0 {
		return "", fmt.Errorf(
			"container security scan requires a non-root numeric host user, found %q:%q",
			current.Uid,
			current.Gid,
		)
	}
	return fmt.Sprintf("%d:%d", uid, gid), nil
}

func (runtime *containerSecurityRuntime) cleanup() error {
	if runtime == nil || runtime.root == "" {
		return nil
	}
	root := runtime.root
	if err := os.RemoveAll(root); err != nil {
		return fmt.Errorf("remove container security workspace: %w", err)
	}
	if _, err := os.Stat(root); !errors.Is(err, os.ErrNotExist) {
		return errors.New("container security workspace remains after cleanup")
	}
	runtime.root = ""
	runtime.cache = ""
	runtime.ignore = ""
	return nil
}

func (runtime *containerSecurityRuntime) validateScanner(ctx context.Context) error {
	if err := inspectPhase1Image(
		ctx,
		runtime.client,
		runtime.pin.Scanner.Image,
		runtime.pin.Scanner.ImageID,
	); err != nil {
		return fmt.Errorf(
			"inspect pinned Trivy image; install it with `docker pull --platform %s %s`: %w",
			runtime.pin.Platform,
			runtime.pin.Scanner.Image,
			err,
		)
	}
	result, err := runtime.runScanner(ctx, "none", nil, []string{"version"})
	if err != nil {
		return fmt.Errorf("run pinned Trivy version check: %w", err)
	}
	want := "Version: " + runtime.pin.Scanner.Version
	if strings.TrimSpace(result.stdout) != want {
		return fmt.Errorf("pinned Trivy reported %q, want %q", result.stdout, want)
	}
	return nil
}

func (runtime *containerSecurityRuntime) updateDatabase(
	ctx context.Context,
) (ContainerSecurityDatabaseEvidence, error) {
	_, err := runtime.runScanner(
		ctx,
		"bridge",
		[]containerSecurityMount{{source: runtime.cache, target: "/cache"}},
		[]string{
			"image",
			"--cache-dir", "/cache",
			"--db-repository", runtime.pin.Database.Repository,
			"--download-db-only",
			"--disable-telemetry",
			"--skip-version-check",
			"--no-progress",
			"--quiet",
		},
	)
	if err != nil {
		return ContainerSecurityDatabaseEvidence{}, fmt.Errorf("download Trivy vulnerability database: %w", err)
	}
	return inspectContainerSecurityDatabase(
		runtime.cache,
		runtime.pin.Database,
		time.Now().UTC(),
		true,
	)
}

func inspectContainerSecurityDatabase(
	cache string,
	policy containerSecurityDatabase,
	now time.Time,
	requireRecentDownload bool,
) (ContainerSecurityDatabaseEvidence, error) {
	databasePath := filepath.Join(cache, "db", "trivy.db")
	metadataPath := filepath.Join(cache, "db", "metadata.json")
	metadataFile, err := os.Open(metadataPath)
	if err != nil {
		return ContainerSecurityDatabaseEvidence{}, fmt.Errorf("open Trivy database metadata: %w", err)
	}
	defer metadataFile.Close()
	var metadata trivyDatabaseMetadata
	if err := jsonio.DecodeSingle(metadataFile, &metadata); err != nil {
		return ContainerSecurityDatabaseEvidence{}, fmt.Errorf("decode Trivy database metadata: %w", err)
	}
	maximumAge := time.Duration(policy.MaximumAgeHours) * time.Hour
	if metadata.Version != policy.SchemaVersion || metadata.UpdatedAt.IsZero() ||
		metadata.UpdatedAt.Before(now.Add(-maximumAge)) || metadata.UpdatedAt.After(now.Add(5*time.Minute)) {
		return ContainerSecurityDatabaseEvidence{}, fmt.Errorf(
			"Trivy database schema/update is %d/%s, want %d within %s",
			metadata.Version,
			metadata.UpdatedAt.Format(time.RFC3339),
			policy.SchemaVersion,
			maximumAge,
		)
	}
	if metadata.DownloadedAt.IsZero() || metadata.DownloadedAt.After(now.Add(5*time.Minute)) ||
		(requireRecentDownload && metadata.DownloadedAt.Before(now.Add(-time.Hour))) ||
		metadata.NextUpdate.IsZero() {
		return ContainerSecurityDatabaseEvidence{}, errors.New(
			"Trivy database download and next-update timestamps are invalid",
		)
	}
	databaseSHA256, err := hashContainerSecurityFile(
		databasePath,
		containerSecurityDatabaseMaximumBytes,
	)
	if err != nil {
		return ContainerSecurityDatabaseEvidence{}, err
	}
	metadataSHA256, err := hashContainerSecurityFile(
		metadataPath,
		containerSecurityMetadataMaximumBytes,
	)
	if err != nil {
		return ContainerSecurityDatabaseEvidence{}, err
	}
	return ContainerSecurityDatabaseEvidence{
		Repository:     policy.Repository,
		SchemaVersion:  metadata.Version,
		UpdatedAt:      metadata.UpdatedAt,
		DownloadedAt:   metadata.DownloadedAt,
		NextUpdate:     metadata.NextUpdate,
		DatabaseSHA256: databaseSHA256,
		MetadataSHA256: metadataSHA256,
	}, nil
}

func (runtime *containerSecurityRuntime) scanImage(
	ctx context.Context,
	target containerSecurityImageTarget,
) (containerSecurityImageScan, error) {
	if err := inspectPhase1Image(ctx, runtime.client, target.reference, target.imageID); err != nil {
		return containerSecurityImageScan{}, fmt.Errorf("inspect %s scan target: %w", target.name, err)
	}
	exports := filepath.Join(runtime.root, "exports")
	if err := os.MkdirAll(exports, 0o700); err != nil {
		return containerSecurityImageScan{}, fmt.Errorf("create container image export directory: %w", err)
	}
	archivePath := filepath.Join(exports, target.name+".tar")
	if _, err := runtime.client.run(
		ctx,
		"image", "save", "--output", archivePath, target.reference,
	); err != nil {
		return containerSecurityImageScan{}, fmt.Errorf("export %s image without a scanner socket: %w", target.name, err)
	}
	archiveSHA256, err := hashContainerSecurityFile(
		archivePath,
		runtime.pin.Policy.MaximumImageBytes,
	)
	if err != nil {
		return containerSecurityImageScan{}, err
	}
	outputDirectory := filepath.Join(runtime.root, "output", target.name)
	if err := os.MkdirAll(outputDirectory, 0o700); err != nil {
		return containerSecurityImageScan{}, fmt.Errorf("create %s scan output directory: %w", target.name, err)
	}
	mounts := []containerSecurityMount{
		{source: runtime.cache, target: "/cache"},
		{source: archivePath, target: "/input/image.tar", readOnly: true},
		{source: runtime.ignore, target: "/policy/empty.trivyignore", readOnly: true},
		{source: outputDirectory, target: "/output"},
	}
	if _, err := runtime.runScanner(
		ctx,
		"none",
		mounts,
		runtime.vulnerabilityArguments(),
	); err != nil {
		return containerSecurityImageScan{}, fmt.Errorf("scan %s image: %w", target.name, err)
	}
	rawReport, err := readContainerSecurityFile(
		filepath.Join(outputDirectory, "scan.json"),
		runtime.pin.Policy.MaximumReportBytes,
	)
	if err != nil {
		return containerSecurityImageScan{}, err
	}
	parsed, err := parseContainerSecurityScan(
		target.name,
		target.imageID,
		runtime.pin.Scanner.Version,
		rawReport,
	)
	if err != nil {
		return containerSecurityImageScan{}, err
	}
	if _, err := runtime.runScanner(ctx, "none", mounts, runtime.sbomArguments()); err != nil {
		return containerSecurityImageScan{}, fmt.Errorf("generate %s CycloneDX SBOM: %w", target.name, err)
	}
	sbom, err := readContainerSecurityFile(
		filepath.Join(outputDirectory, "sbom.json"),
		runtime.pin.Policy.MaximumReportBytes,
	)
	if err != nil {
		return containerSecurityImageScan{}, err
	}
	if err := validateContainerSecuritySBOM(sbom); err != nil {
		return containerSecurityImageScan{}, fmt.Errorf("validate %s SBOM: %w", target.name, err)
	}
	postScanArchiveSHA256, err := hashContainerSecurityFile(
		archivePath,
		runtime.pin.Policy.MaximumImageBytes,
	)
	if err != nil {
		return containerSecurityImageScan{}, err
	}
	if postScanArchiveSHA256 != archiveSHA256 {
		return containerSecurityImageScan{}, fmt.Errorf(
			"%s image archive changed during its read-only scans",
			target.name,
		)
	}
	vulnerabilityName := target.name + ".trivy.json"
	sbomName := target.name + ".cdx.json"
	return containerSecurityImageScan{
		result: ContainerSecurityImageResult{
			Name:                      target.name,
			Reference:                 target.reference,
			ImageID:                   target.imageID,
			ArchiveSHA256:             archiveSHA256,
			VulnerabilityReport:       vulnerabilityName,
			VulnerabilityReportSHA256: containerSecurityBytesSHA256(parsed.artifact),
			SBOM:                      sbomName,
			SBOMSHA256:                containerSecurityBytesSHA256(sbom),
			FindingCount:              len(parsed.findings),
		},
		findings: parsed.findings,
		raw: map[string][]byte{
			vulnerabilityName: parsed.artifact,
			sbomName:          sbom,
		},
	}, nil
}

func (runtime *containerSecurityRuntime) vulnerabilityArguments() []string {
	return append(runtime.offlineImageArguments(),
		"--scanners", "vuln,secret",
		"--image-config-scanners", "misconfig,secret",
		"--severity", strings.Join(runtime.pin.Policy.FailSeverities, ","),
		"--format", "json",
		"--output", "/output/scan.json",
	)
}

func (runtime *containerSecurityRuntime) sbomArguments() []string {
	return append(runtime.offlineImageArguments(),
		"--scanners", "vuln",
		"--format", "cyclonedx",
		"--output", "/output/sbom.json",
	)
}

func (runtime *containerSecurityRuntime) offlineImageArguments() []string {
	return []string{
		"image",
		"--input", "/input/image.tar",
		"--cache-dir", "/cache",
		"--db-repository", runtime.pin.Database.Repository,
		"--skip-db-update",
		"--skip-check-update",
		"--skip-vex-repo-update",
		"--offline-scan",
		"--ignorefile", "/policy/empty.trivyignore",
		"--disable-telemetry",
		"--skip-version-check",
		"--no-progress",
		"--quiet",
		"--parallel", "2",
		"--timeout", "10m",
	}
}

func (runtime *containerSecurityRuntime) runScanner(
	ctx context.Context,
	network string,
	mounts []containerSecurityMount,
	arguments []string,
) (phase0CommandResult, error) {
	if network != "none" && network != "bridge" {
		return phase0CommandResult{}, fmt.Errorf("unsupported Trivy network mode %q", network)
	}
	if network == "bridge" && (len(mounts) != 1 || mounts[0].source != runtime.cache ||
		mounts[0].target != "/cache" || mounts[0].readOnly) {
		return phase0CommandResult{}, errors.New(
			"networked Trivy turns may receive only the private database cache",
		)
	}
	identity, err := phase0RandomHex(4)
	if err != nil {
		return phase0CommandResult{}, err
	}
	name := "setta-container-security-" + runtime.suffix + "-" + identity
	create := []string{
		"container", "create",
		"--name", name,
		"--pull", "never",
		"--platform", runtime.pin.Platform,
		"--network", network,
		"--read-only",
		"--user", runtime.user,
		"--cap-drop", "ALL",
		"--security-opt", "no-new-privileges",
		"--pids-limit", containerSecurityContainerPIDs,
		"--memory", containerSecurityContainerMemory,
		"--cpus", containerSecurityContainerCPUs,
		"--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=1073741824,mode=1777",
		"--env", "HOME=/tmp",
		"--label", "com.setta.security.role=scanner",
		"--label", "com.setta.security.run=" + runtime.suffix,
	}
	for _, mount := range mounts {
		if !containerSecurityPathWithinRoot(runtime.root, mount.source) {
			return phase0CommandResult{}, fmt.Errorf(
				"container security mount source escapes the private workspace: %q",
				mount.source,
			)
		}
		specification, err := containerSecurityMountArgument(mount)
		if err != nil {
			return phase0CommandResult{}, err
		}
		create = append(create, "--mount", specification)
	}
	create = append(create, runtime.pin.Scanner.Image)
	create = append(create, arguments...)
	if _, err := runtime.client.run(ctx, create...); err != nil {
		cleanupErr := runtime.removeScannerContainer(name)
		return phase0CommandResult{}, errors.Join(
			fmt.Errorf("create restricted Trivy container: %w", err),
			cleanupErr,
		)
	}
	result, runErr := runtime.client.run(ctx, "container", "start", "--attach", name)
	removeErr := runtime.removeScannerContainer(name)
	if runErr != nil || removeErr != nil {
		return result, errors.Join(runErr, removeErr)
	}
	return result, nil
}

func (runtime *containerSecurityRuntime) removeScannerContainer(name string) error {
	removeErr := runPhase1Cleanup(func(cleanupContext context.Context) error {
		_, err := runtime.client.run(cleanupContext, "container", "rm", "--force", name)
		return err
	})
	if removeErr == nil {
		return nil
	}
	var exists bool
	inspectErr := runPhase1Cleanup(func(cleanupContext context.Context) error {
		var err error
		exists, err = runtime.client.containerExists(cleanupContext, name)
		return err
	})
	if inspectErr != nil {
		return errors.Join(
			fmt.Errorf("remove restricted Trivy container %s: %w", name, removeErr),
			fmt.Errorf("confirm restricted Trivy container removal: %w", inspectErr),
		)
	}
	if exists {
		return fmt.Errorf("remove restricted Trivy container %s: %w", name, removeErr)
	}
	return nil
}

func containerSecurityMountArgument(mount containerSecurityMount) (string, error) {
	allowedTarget := slices.Contains(
		[]string{"/cache", "/input/image.tar", "/output", "/policy/empty.trivyignore"},
		mount.target,
	)
	wantReadOnly := mount.target == "/input/image.tar" ||
		mount.target == "/policy/empty.trivyignore"
	if mount.source == "" || mount.target == "" || strings.ContainsAny(mount.source, ",\r\n") ||
		strings.ContainsAny(mount.target, ",\r\n") || !filepath.IsAbs(mount.source) ||
		!allowedTarget || mount.readOnly != wantReadOnly {
		return "", fmt.Errorf("container security mount is invalid: %q -> %q", mount.source, mount.target)
	}
	specification := "type=bind,src=" + mount.source + ",dst=" + mount.target
	if mount.readOnly {
		specification += ",readonly"
	}
	return specification, nil
}

func containerSecurityPathWithinRoot(root string, candidate string) bool {
	if root == "" || candidate == "" {
		return false
	}
	relative, err := filepath.Rel(root, candidate)
	return err == nil && relative != "." && relative != ".." &&
		!strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func containerSecurityBytesSHA256(value []byte) string {
	digest := sha256.Sum256(value)
	return hex.EncodeToString(digest[:])
}
