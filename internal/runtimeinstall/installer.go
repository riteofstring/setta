package runtimeinstall

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path"
	"strconv"
	"strings"
	"time"
	"unicode"

	"setta/internal/httpapi"
	"setta/internal/runtimeprovider"
	"setta/internal/runtimesetup"
)

const (
	installedReleaseSchemaVersion = 1
	defaultHealthAttempts         = 1
	defaultHealthInterval         = time.Second
	trustedRuntimeUser            = "root"
	trustedRuntimeGroup           = "root"
	ordinaryWorkloadUser          = "sprite"
	ordinaryWorkloadGroup         = "sprite"
	defaultRemoteVerifierPath     = "/usr/bin/minisign"
)

var ErrHealthCheckFailed = errors.New("runtime release health check failed")

// Layout describes the provider-neutral filesystem and service layout used by
// the developer install loop. Defaults keep release bytes and runtime state on
// the persistent filesystem rather than /tmp.
type Layout struct {
	ReleaseRoot            string
	RuntimeStateDir        string
	MetadataPath           string
	ServiceName            string
	TrustedRuntimeIdentity runtimeprovider.ServiceIdentity
	WorkloadIdentity       runtimeprovider.ServiceIdentity
	HealthHost             string
	HealthPort             int
	HealthPath             string
}

// DefaultLayout returns the protected persistent paths used by the Phase 2
// developer loop.
func DefaultLayout() Layout {
	return Layout{
		ReleaseRoot:     "/var/lib/setta/runtime-install/releases",
		RuntimeStateDir: "/var/lib/setta/runtime",
		MetadataPath:    "/var/lib/setta/runtime-install/current.json",
		ServiceName:     "setta-runtime",
		TrustedRuntimeIdentity: runtimeprovider.ServiceIdentity{
			User:  trustedRuntimeUser,
			Group: trustedRuntimeGroup,
		},
		WorkloadIdentity: runtimeprovider.ServiceIdentity{
			User:  ordinaryWorkloadUser,
			Group: ordinaryWorkloadGroup,
		},
		HealthHost: "127.0.0.1",
		HealthPort: 7345,
		HealthPath: "/health",
	}
}

// Loop installs signed Setta runtime releases through runtimeprovider.Provider
// only. Provider-specific behavior belongs behind the adapter.
type Loop struct {
	Provider runtimeprovider.Provider
	Verifier SignatureVerifier
	// RemoteVerifierPath selects the argv-only command used to verify the
	// uploaded release. The empty value preserves the historical
	// /usr/bin/minisign behavior. A custom path must be an absolute, clean,
	// portable path below the protected release or runtime-state
	// layout; it is passed directly through Provider.Exec and never through a
	// shell. The custom-verifier trust model is that the controller builds and
	// hashes the binary locally, uploads it over the same authenticated
	// management channel used for installation, then checks the recorded SHA256
	// after upload and before making it executable or selecting this path.
	RemoteVerifierPath string
	Now                func() time.Time
	Sleep              func(context.Context, time.Duration) error
}

type InstallRequest struct {
	RuntimeName    string
	Desired        ReleaseArtifact
	Rollback       *ReleaseArtifact
	SetupSeed      *runtimesetup.Seed
	Layout         Layout
	HealthAttempts int
	HealthInterval time.Duration
}

type InstallStatus string

const (
	InstallStatusFresh          InstallStatus = "fresh_install"
	InstallStatusUpdated        InstallStatus = "updated"
	InstallStatusAlreadyCurrent InstallStatus = "already_current"
)

type InstallResult struct {
	RuntimeName string
	Status      InstallStatus
	Previous    *InstalledRelease
	Installed   InstalledRelease
	Health      HealthCheck
	Rollback    *RollbackResult
}

type RollbackResult struct {
	Release InstalledRelease
	Health  HealthCheck
}

type InstalledRelease struct {
	SchemaVersion int       `json:"schemaVersion"`
	Version       string    `json:"version"`
	OS            string    `json:"os"`
	Arch          string    `json:"arch"`
	ArchiveName   string    `json:"archiveName"`
	ArtifactDir   string    `json:"artifactDir"`
	BinaryName    string    `json:"binaryName"`
	ArchiveSHA256 string    `json:"archiveSha256"`
	BinarySHA256  string    `json:"binarySha256"`
	BinaryPath    string    `json:"binaryPath"`
	InstalledAt   time.Time `json:"installedAt"`
}

type HealthCheck struct {
	OK        bool                               `json:"ok"`
	Attempt   int                                `json:"attempt"`
	Service   runtimeprovider.ServiceObservation `json:"service"`
	Backend   httpapi.BackendHealth              `json:"backend"`
	Identity  RuntimeIdentityProof               `json:"identity"`
	Release   InstalledRelease                   `json:"release"`
	CheckedAt time.Time                          `json:"checkedAt"`
	Failure   string                             `json:"failure,omitempty"`
}

type RuntimeIdentityProof struct {
	RuntimeID       string    `json:"runtimeId"`
	DisplayName     string    `json:"displayName"`
	RuntimeName     string    `json:"runtimeName"`
	BackendName     string    `json:"backendName"`
	ReleaseVersion  string    `json:"releaseVersion"`
	ProtocolVersion int       `json:"protocolVersion"`
	CheckedAt       time.Time `json:"checkedAt"`
}

func (loop Loop) Install(ctx context.Context, request InstallRequest) (InstallResult, error) {
	loop = loop.withDefaults()
	layout, desired, rollback, healthAttempts, healthInterval, err := loop.prepareInstall(ctx, request)
	if err != nil {
		return InstallResult{}, err
	}
	result := InstallResult{RuntimeName: request.RuntimeName}
	current, found, err := loop.readInstalledRelease(ctx, request.RuntimeName, layout.MetadataPath)
	if err != nil {
		return result, err
	}
	if found {
		result.Previous = &current
		if sameInstalledRelease(current, desired) {
			return loop.finishAlreadyCurrent(ctx, request, layout, current, result, healthAttempts, healthInterval)
		}
	}

	installed, err := loop.installVerifiedRelease(ctx, request.RuntimeName, layout, desired)
	if err != nil {
		return result, err
	}
	result.Installed = installed
	if found {
		result.Status = InstallStatusUpdated
	} else {
		result.Status = InstallStatusFresh
	}
	if err := loop.writeOptionalSetupSeed(ctx, request, layout, installed.Version); err != nil {
		return result, err
	}

	health, err := loop.ensureAndVerifyHealth(
		ctx,
		request.RuntimeName,
		layout,
		installed,
		healthAttempts,
		healthInterval,
	)
	result.Health = health
	if err == nil {
		return result, nil
	}
	if rollback == nil {
		return result, err
	}

	return loop.rollbackFailedInstall(ctx, request.RuntimeName, layout, installed, *rollback, result, healthAttempts, healthInterval)
}

func (loop Loop) prepareInstall(
	ctx context.Context,
	request InstallRequest,
) (Layout, verifiedArtifact, *verifiedArtifact, int, time.Duration, error) {
	layout, err := normalizeLayout(request.Layout)
	if err != nil {
		return Layout{}, verifiedArtifact{}, nil, 0, 0, err
	}
	if err := validateRemoteVerifierPath(loop.RemoteVerifierPath, layout); err != nil {
		return Layout{}, verifiedArtifact{}, nil, 0, 0, err
	}
	if loop.Provider == nil {
		return Layout{}, verifiedArtifact{}, nil, 0, 0, fmt.Errorf("%w: provider is required", runtimeprovider.ErrInvalidContract)
	}
	if err := runtimeprovider.ValidateManagedName(request.RuntimeName); err != nil {
		return Layout{}, verifiedArtifact{}, nil, 0, 0, err
	}
	healthAttempts, healthInterval, err := normalizeHealthWait(request.HealthAttempts, request.HealthInterval)
	if err != nil {
		return Layout{}, verifiedArtifact{}, nil, 0, 0, err
	}
	desired, err := verifyReleaseArtifact(ctx, request.Desired, loop.Verifier)
	if err != nil {
		return Layout{}, verifiedArtifact{}, nil, 0, 0, err
	}
	rollback, err := verifyOptionalRollback(ctx, request.Rollback, loop.Verifier)
	return layout, desired, rollback, healthAttempts, healthInterval, err
}

func verifyOptionalRollback(ctx context.Context, artifact *ReleaseArtifact, verifier SignatureVerifier) (*verifiedArtifact, error) {
	if artifact == nil {
		return nil, nil
	}
	verified, err := verifyReleaseArtifact(ctx, *artifact, verifier)
	if err != nil {
		return nil, err
	}
	return &verified, nil
}

func (loop Loop) finishAlreadyCurrent(
	ctx context.Context,
	request InstallRequest,
	layout Layout,
	current InstalledRelease,
	result InstallResult,
	healthAttempts int,
	healthInterval time.Duration,
) (InstallResult, error) {
	if err := loop.writeOptionalSetupSeed(ctx, request, layout, current.Version); err != nil {
		return result, err
	}
	health, err := loop.ensureAndVerifyHealth(ctx, request.RuntimeName, layout, current, healthAttempts, healthInterval)
	result.Status = InstallStatusAlreadyCurrent
	result.Installed = current
	result.Health = health
	return result, err
}

func (loop Loop) writeOptionalSetupSeed(ctx context.Context, request InstallRequest, layout Layout, version string) error {
	if request.SetupSeed == nil {
		return nil
	}
	return loop.writeSetupSeed(ctx, request.RuntimeName, layout, *request.SetupSeed, version)
}

func (loop Loop) rollbackFailedInstall(
	ctx context.Context,
	runtimeName string,
	layout Layout,
	installed InstalledRelease,
	rollback verifiedArtifact,
	result InstallResult,
	healthAttempts int,
	healthInterval time.Duration,
) (InstallResult, error) {
	rollbackRelease, rollbackErr := loop.installVerifiedRelease(ctx, runtimeName, layout, rollback)
	if rollbackErr != nil {
		return result, fmt.Errorf("install %s failed health and rollback install failed: %w", installed.Version, rollbackErr)
	}
	rollbackHealth, rollbackHealthErr := loop.ensureAndVerifyHealth(
		ctx,
		runtimeName,
		layout,
		rollbackRelease,
		healthAttempts,
		healthInterval,
	)
	result.Rollback = &RollbackResult{Release: rollbackRelease, Health: rollbackHealth}
	if rollbackHealthErr != nil {
		return result, fmt.Errorf("install %s failed health and rollback health failed: %w", installed.Version, rollbackHealthErr)
	}
	return result, fmt.Errorf("%w: desired release %s failed health; rolled back to %s", ErrHealthCheckFailed, installed.Version, rollbackRelease.Version)
}

func (loop Loop) installVerifiedRelease(
	ctx context.Context,
	runtimeName string,
	layout Layout,
	artifact verifiedArtifact,
) (InstalledRelease, error) {
	releaseID := releaseID(artifact.Version, artifact.ArchiveSHA256)
	releaseDir := path.Join(layout.ReleaseRoot, releaseID)
	incomingDir := path.Join(layout.ReleaseRoot, ".incoming-"+releaseID)
	incomingArchive := path.Join(incomingDir, artifact.ArchiveName)
	incomingChecksums := path.Join(incomingDir, "SHA256SUMS")
	incomingSignature := path.Join(incomingDir, "SHA256SUMS.minisig")
	binaryPath := path.Join(releaseDir, artifact.BinaryName)
	if err := loop.prepareReleaseDirectories(ctx, runtimeName, layout, incomingDir, releaseDir); err != nil {
		return InstalledRelease{}, err
	}
	if err := loop.uploadAndVerifyRelease(ctx, runtimeName, artifact, incomingArchive, incomingChecksums, incomingSignature); err != nil {
		return InstalledRelease{}, err
	}
	if err := loop.extractAndProtectRelease(ctx, runtimeName, artifact, releaseDir, incomingArchive, binaryPath); err != nil {
		return InstalledRelease{}, err
	}
	release := installedReleaseFromArtifact(artifact, binaryPath, loop.Now().UTC())
	if err := validateInstalledRelease(release); err != nil {
		return InstalledRelease{}, err
	}
	rootOwner := runtimeprovider.ServiceIdentity{User: trustedRuntimeUser, Group: trustedRuntimeGroup}
	if err := loop.writeInstalledRelease(ctx, runtimeName, layout.MetadataPath, release, rootOwner); err != nil {
		return InstalledRelease{}, err
	}
	return release, nil
}

func (loop Loop) prepareReleaseDirectories(ctx context.Context, runtimeName string, layout Layout, incomingDir string, releaseDir string) error {
	runtimeOwner := layout.TrustedRuntimeIdentity
	if err := loop.execRequired(ctx, runtimeName, "/usr/bin/install", []string{
		"-d", "-m", "0755", "-o", "root", "-g", "root",
		layout.ReleaseRoot,
		path.Dir(layout.MetadataPath),
	}, nil, "create protected release directories"); err != nil {
		return err
	}
	if err := loop.execRequired(ctx, runtimeName, "/usr/bin/install", []string{
		"-d", "-m", "0700", "-o", runtimeOwner.User, "-g", runtimeOwner.Group,
		layout.RuntimeStateDir,
	}, nil, "create protected runtime state directory"); err != nil {
		return err
	}
	if err := loop.execRequired(ctx, runtimeName, "/bin/rm", []string{"-rf", incomingDir, releaseDir}, nil, "clear release staging directories"); err != nil {
		return err
	}
	if err := loop.execRequired(ctx, runtimeName, "/usr/bin/install", []string{
		"-d", "-m", "0700", "-o", "root", "-g", "root", incomingDir,
	}, nil, "create release staging directory"); err != nil {
		return err
	}
	return nil
}

func (loop Loop) uploadAndVerifyRelease(ctx context.Context, runtimeName string, artifact verifiedArtifact, incomingArchive string, incomingChecksums string, incomingSignature string) error {
	if err := loop.uploadFile(ctx, runtimeName, artifact.ArchivePath, incomingArchive, "upload release archive"); err != nil {
		return err
	}
	if err := loop.uploadFile(ctx, runtimeName, artifact.ChecksumsPath, incomingChecksums, "upload signed checksum manifest"); err != nil {
		return err
	}
	if err := loop.uploadFile(ctx, runtimeName, artifact.SignaturePath, incomingSignature, "upload checksum signature"); err != nil {
		return err
	}
	verifierArguments := []string{
		"-Vm", incomingChecksums, "-P", artifact.PublicKey, "-x", incomingSignature,
	}
	if loop.RemoteVerifierPath != defaultRemoteVerifierPath {
		verifierArguments = append(verifierArguments, "-f", incomingArchive)
	}
	if err := loop.execRequired(
		ctx,
		runtimeName,
		loop.RemoteVerifierPath,
		verifierArguments,
		nil,
		"verify uploaded release",
	); err != nil {
		return fmt.Errorf("%w: %v", ErrSignatureRejected, err)
	}
	if err := loop.requireRemoteSHA256(ctx, runtimeName, incomingArchive, artifact.ArchiveSHA256, "verify uploaded release archive"); err != nil {
		return err
	}
	return nil
}

func (loop Loop) extractAndProtectRelease(ctx context.Context, runtimeName string, artifact verifiedArtifact, releaseDir string, incomingArchive string, binaryPath string) error {
	if err := loop.execRequired(ctx, runtimeName, "/usr/bin/install", []string{
		"-d", "-m", "0755", "-o", "root", "-g", "root", releaseDir,
	}, nil, "create release directory"); err != nil {
		return err
	}
	if err := loop.execRequired(ctx, runtimeName, "/bin/tar", []string{
		"-xzf", incomingArchive, "-C", releaseDir,
	}, nil, "extract release archive"); err != nil {
		return err
	}
	if err := loop.requireRemoteSHA256(ctx, runtimeName, binaryPath, artifact.BinarySHA256, "verify extracted runtime binary"); err != nil {
		return err
	}
	if err := loop.execRequired(ctx, runtimeName, "/bin/chown", []string{"-R", "root:root", releaseDir}, nil, "protect release ownership"); err != nil {
		return err
	}
	if err := loop.execRequired(ctx, runtimeName, "/bin/chmod", []string{"0755", binaryPath}, nil, "make runtime binary executable"); err != nil {
		return err
	}
	return nil
}

func installedReleaseFromArtifact(artifact verifiedArtifact, binaryPath string, installedAt time.Time) InstalledRelease {
	return InstalledRelease{
		SchemaVersion: installedReleaseSchemaVersion,
		Version:       artifact.Version,
		OS:            artifact.OS,
		Arch:          artifact.Arch,
		ArchiveName:   artifact.ArchiveName,
		ArtifactDir:   artifact.ArtifactDir,
		BinaryName:    artifact.BinaryName,
		ArchiveSHA256: artifact.ArchiveSHA256,
		BinarySHA256:  artifact.BinarySHA256,
		BinaryPath:    binaryPath,
		InstalledAt:   installedAt,
	}
}

func (loop Loop) ensureAndVerifyHealth(
	ctx context.Context,
	runtimeName string,
	layout Layout,
	release InstalledRelease,
	attempts int,
	interval time.Duration,
) (HealthCheck, error) {
	health := HealthCheck{
		Release:   release,
		CheckedAt: loop.Now().UTC(),
	}
	port := layout.HealthPort
	service, err := loop.Provider.EnsureService(ctx, runtimeName, runtimeprovider.ServiceSpec{
		Name: layout.ServiceName,
		Path: release.BinaryPath,
		Arguments: []string{
			"serve",
			"--app-data-dir", layout.RuntimeStateDir,
			"--port", strconv.Itoa(layout.HealthPort),
			"--sprites-workload-leases",
		},
		HTTPPort: &port,
		RunAs:    layout.TrustedRuntimeIdentity,
	})
	health.Service = service
	if err != nil {
		health.Failure = err.Error()
		return health, fmt.Errorf("%w: ensure runtime service: %v", ErrHealthCheckFailed, err)
	}
	if service.State != runtimeprovider.ServiceStateRunning {
		health.Failure = fmt.Sprintf("service state is %s", service.State)
		return health, fmt.Errorf("%w: service state is %s", ErrHealthCheckFailed, service.State)
	}

	url := "http://" + layout.HealthHost + ":" + strconv.Itoa(layout.HealthPort) + layout.HealthPath
	infoURL := "http://" + layout.HealthHost + ":" + strconv.Itoa(layout.HealthPort) + "/runtime/info"
	var lastErr error
	for attempt := 1; attempt <= attempts; attempt++ {
		health.Attempt = attempt
		backend, err := loop.probeBackendHealth(ctx, runtimeName, url, release.Version)
		if err == nil {
			identity, identityErr := loop.probeRuntimeIdentity(ctx, runtimeName, infoURL, release.Version)
			if identityErr != nil {
				err = identityErr
			} else {
				health.OK = true
				health.Backend = backend
				health.Identity = identity
				health.Failure = ""
				return health, nil
			}
		}
		lastErr = err
		health.Failure = err.Error()
		if attempt < attempts {
			// EnsureService proves process state, not HTTP readiness. This is a
			// bounded post-install readiness wait for the developer loop only.
			if sleepErr := loop.Sleep(ctx, interval); sleepErr != nil {
				return health, fmt.Errorf("%w: %v", ErrHealthCheckFailed, sleepErr)
			}
		}
	}
	return health, fmt.Errorf("%w: %v", ErrHealthCheckFailed, lastErr)
}

func (loop Loop) probeRuntimeIdentity(
	ctx context.Context,
	runtimeName string,
	url string,
	wantVersion string,
) (RuntimeIdentityProof, error) {
	result, err := loop.Provider.Exec(ctx, runtimeprovider.ExecRequest{
		RuntimeName: runtimeName,
		Path:        "/usr/bin/curl",
		Arguments:   []string{"-fsS", url},
	})
	if err != nil {
		return RuntimeIdentityProof{}, err
	}
	if result.ExitCode != 0 {
		return RuntimeIdentityProof{}, fmt.Errorf("curl runtime info exit=%d stderr=%q", result.ExitCode, strings.TrimSpace(string(result.Stderr)))
	}
	var info httpapi.RuntimeInfoResponse
	if err := json.Unmarshal(result.Stdout, &info); err != nil {
		return RuntimeIdentityProof{}, fmt.Errorf("decode runtime info: %w", err)
	}
	if strings.TrimSpace(info.RuntimeID) == "" {
		return RuntimeIdentityProof{}, errors.New("runtime info runtimeId is empty")
	}
	if strings.TrimSpace(info.DisplayName) == "" {
		return RuntimeIdentityProof{}, errors.New("runtime info displayName is empty")
	}
	if info.BackendName != httpapi.BackendName {
		return RuntimeIdentityProof{}, fmt.Errorf("runtime info backend name = %q, want %q", info.BackendName, httpapi.BackendName)
	}
	if info.BackendVersion != wantVersion {
		return RuntimeIdentityProof{}, fmt.Errorf("runtime info backend version = %q, want %q", info.BackendVersion, wantVersion)
	}
	if info.ProtocolVersion <= 0 {
		return RuntimeIdentityProof{}, fmt.Errorf("runtime info protocol version is invalid: %d", info.ProtocolVersion)
	}
	return RuntimeIdentityProof{
		RuntimeID:       info.RuntimeID,
		DisplayName:     info.DisplayName,
		RuntimeName:     runtimeName,
		BackendName:     info.BackendName,
		ReleaseVersion:  info.BackendVersion,
		ProtocolVersion: info.ProtocolVersion,
		CheckedAt:       loop.Now().UTC(),
	}, nil
}

func (loop Loop) probeBackendHealth(
	ctx context.Context,
	runtimeName string,
	url string,
	wantVersion string,
) (httpapi.BackendHealth, error) {
	result, err := loop.Provider.Exec(ctx, runtimeprovider.ExecRequest{
		RuntimeName: runtimeName,
		Path:        "/usr/bin/curl",
		Arguments:   []string{"-fsS", url},
	})
	if err != nil {
		return httpapi.BackendHealth{}, err
	}
	if result.ExitCode != 0 {
		return httpapi.BackendHealth{}, fmt.Errorf("curl health exit=%d stderr=%q", result.ExitCode, strings.TrimSpace(string(result.Stderr)))
	}
	var health httpapi.BackendHealth
	if err := json.Unmarshal(result.Stdout, &health); err != nil {
		return httpapi.BackendHealth{}, fmt.Errorf("decode backend health: %w", err)
	}
	if !health.OK {
		return httpapi.BackendHealth{}, errors.New("backend health ok=false")
	}
	if health.Name != httpapi.BackendName {
		return httpapi.BackendHealth{}, fmt.Errorf("backend name = %q, want %q", health.Name, httpapi.BackendName)
	}
	if health.Version != wantVersion {
		return httpapi.BackendHealth{}, fmt.Errorf("backend version = %q, want %q", health.Version, wantVersion)
	}
	if health.ProtocolVersion <= 0 {
		return httpapi.BackendHealth{}, fmt.Errorf("backend protocol version is invalid: %d", health.ProtocolVersion)
	}
	return health, nil
}

func (loop Loop) readInstalledRelease(
	ctx context.Context,
	runtimeName string,
	metadataPath string,
) (InstalledRelease, bool, error) {
	exists, err := loop.remoteFileExists(ctx, runtimeName, metadataPath)
	if err != nil || !exists {
		return InstalledRelease{}, exists, err
	}
	result, err := loop.Provider.Exec(ctx, runtimeprovider.ExecRequest{
		RuntimeName: runtimeName,
		Path:        "/usr/bin/cat",
		Arguments:   []string{metadataPath},
	})
	if err != nil {
		return InstalledRelease{}, false, err
	}
	if result.ExitCode != 0 {
		return InstalledRelease{}, false, fmt.Errorf("read installed release exit=%d stderr=%q", result.ExitCode, strings.TrimSpace(string(result.Stderr)))
	}
	var release InstalledRelease
	if err := json.Unmarshal(result.Stdout, &release); err != nil {
		return InstalledRelease{}, false, fmt.Errorf("decode installed release metadata: %w", err)
	}
	if err := validateInstalledRelease(release); err != nil {
		return InstalledRelease{}, false, err
	}
	return release, true, nil
}

func (loop Loop) writeInstalledRelease(
	ctx context.Context,
	runtimeName string,
	metadataPath string,
	release InstalledRelease,
	owner runtimeprovider.ServiceIdentity,
) error {
	payload, err := json.MarshalIndent(release, "", "  ")
	if err != nil {
		return fmt.Errorf("encode installed release metadata: %w", err)
	}
	payload = append(payload, '\n')
	tempPath := metadataPath + ".tmp"
	if err := loop.writeRemoteBytes(ctx, runtimeName, tempPath, payload, "write installed release metadata"); err != nil {
		return err
	}
	if err := loop.execRequired(ctx, runtimeName, "/bin/chmod", []string{"0600", tempPath}, nil, "protect installed release metadata"); err != nil {
		return err
	}
	if err := loop.execRequired(ctx, runtimeName, "/bin/chown", []string{ownerGroup(owner), tempPath}, nil, "own installed release metadata"); err != nil {
		return err
	}
	return loop.execRequired(ctx, runtimeName, "/bin/mv", []string{tempPath, metadataPath}, nil, "publish installed release metadata")
}

func (loop Loop) writeSetupSeed(
	ctx context.Context,
	runtimeName string,
	layout Layout,
	seed runtimesetup.Seed,
	releaseVersion string,
) error {
	if seed.RuntimeName != runtimeName {
		return fmt.Errorf("%w: setup seed runtimeName %s does not match %s", runtimeprovider.ErrInvalidContract, seed.RuntimeName, runtimeName)
	}
	if seed.ReleaseVersion != releaseVersion {
		return fmt.Errorf("%w: setup seed releaseVersion %s does not match %s", runtimeprovider.ErrInvalidContract, seed.ReleaseVersion, releaseVersion)
	}
	payload, err := runtimesetup.MarshalSeed(seed)
	if err != nil {
		return err
	}
	seedDir := runtimesetup.RemoteSeedDir(layout.RuntimeStateDir)
	seedPath := runtimesetup.RemoteSeedPath(layout.RuntimeStateDir)
	tempPath := seedPath + ".tmp"
	runtimeOwner := layout.TrustedRuntimeIdentity
	if err := loop.execRequired(ctx, runtimeName, "/usr/bin/install", []string{
		"-d", "-m", "0700", "-o", runtimeOwner.User, "-g", runtimeOwner.Group, seedDir,
	}, nil, "create protected setup seed directory"); err != nil {
		return err
	}
	if err := loop.writeRemoteBytes(ctx, runtimeName, tempPath, payload, "write setup seed"); err != nil {
		return err
	}
	if err := loop.execRequired(ctx, runtimeName, "/bin/chmod", []string{"0600", tempPath}, nil, "protect setup seed"); err != nil {
		return err
	}
	if err := loop.execRequired(ctx, runtimeName, "/bin/chown", []string{ownerGroup(runtimeOwner), tempPath}, nil, "own setup seed"); err != nil {
		return err
	}
	return loop.execRequired(ctx, runtimeName, "/bin/mv", []string{tempPath, seedPath}, nil, "publish setup seed")
}

func (loop Loop) uploadFile(
	ctx context.Context,
	runtimeName string,
	localPath string,
	remotePath string,
	operation string,
) error {
	data, err := osReadFile(localPath)
	if err != nil {
		return fmt.Errorf("%s: %w", operation, err)
	}
	return loop.writeRemoteBytes(ctx, runtimeName, remotePath, data, operation)
}

func (loop Loop) writeRemoteBytes(
	ctx context.Context,
	runtimeName string,
	remotePath string,
	data []byte,
	operation string,
) error {
	return loop.execRequired(ctx, runtimeName, "/usr/bin/dd", []string{"of=" + remotePath, "status=none"}, data, operation)
}

func (loop Loop) requireRemoteSHA256(
	ctx context.Context,
	runtimeName string,
	remotePath string,
	want string,
	operation string,
) error {
	result, err := loop.Provider.Exec(ctx, runtimeprovider.ExecRequest{
		RuntimeName: runtimeName,
		Path:        "/usr/bin/sha256sum",
		Arguments:   []string{remotePath},
	})
	if err != nil {
		return err
	}
	if result.ExitCode != 0 {
		return fmt.Errorf("%s exit=%d stderr=%q", operation, result.ExitCode, strings.TrimSpace(string(result.Stderr)))
	}
	got := strings.Fields(string(result.Stdout))
	if len(got) == 0 || got[0] != want {
		return fmt.Errorf("%s checksum = %q, want %q", operation, strings.TrimSpace(string(result.Stdout)), want)
	}
	return nil
}

func (loop Loop) remoteFileExists(ctx context.Context, runtimeName string, remotePath string) (bool, error) {
	result, err := loop.Provider.Exec(ctx, runtimeprovider.ExecRequest{
		RuntimeName: runtimeName,
		Path:        "/usr/bin/test",
		Arguments:   []string{"-f", remotePath},
	})
	if err != nil {
		return false, err
	}
	switch result.ExitCode {
	case 0:
		return true, nil
	case 1:
		return false, nil
	default:
		return false, fmt.Errorf("test -f %s exit=%d stderr=%q", remotePath, result.ExitCode, strings.TrimSpace(string(result.Stderr)))
	}
}

func (loop Loop) execRequired(
	ctx context.Context,
	runtimeName string,
	commandPath string,
	arguments []string,
	stdin []byte,
	operation string,
) error {
	result, err := loop.Provider.Exec(ctx, runtimeprovider.ExecRequest{
		RuntimeName: runtimeName,
		Path:        commandPath,
		Arguments:   arguments,
		Stdin:       stdin,
	})
	if err != nil {
		return fmt.Errorf("%s: %w", operation, err)
	}
	if result.ExitCode != 0 {
		return fmt.Errorf("%s exit=%d stderr=%q", operation, result.ExitCode, strings.TrimSpace(string(result.Stderr)))
	}
	return nil
}

func (loop Loop) withDefaults() Loop {
	if loop.RemoteVerifierPath == "" {
		loop.RemoteVerifierPath = defaultRemoteVerifierPath
	}
	if loop.Now == nil {
		loop.Now = time.Now
	}
	if loop.Sleep == nil {
		loop.Sleep = sleepWithContext
	}
	return loop
}

func sleepWithContext(ctx context.Context, duration time.Duration) error {
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func normalizeLayout(layout Layout) (Layout, error) {
	layout = layoutWithDefaults(layout)
	if err := validateLayoutPaths(layout); err != nil {
		return Layout{}, err
	}
	if err := validateLayoutServiceAndIdentities(layout); err != nil {
		return Layout{}, err
	}
	if err := validateLayoutHealthEndpoint(layout); err != nil {
		return Layout{}, err
	}
	return layout, nil
}

func layoutWithDefaults(layout Layout) Layout {
	defaults := DefaultLayout()
	if layout.ReleaseRoot == "" {
		layout.ReleaseRoot = defaults.ReleaseRoot
	}
	if layout.RuntimeStateDir == "" {
		layout.RuntimeStateDir = defaults.RuntimeStateDir
	}
	if layout.MetadataPath == "" {
		layout.MetadataPath = defaults.MetadataPath
	}
	if layout.ServiceName == "" {
		layout.ServiceName = defaults.ServiceName
	}
	if layout.TrustedRuntimeIdentity.IsZero() {
		layout.TrustedRuntimeIdentity = defaults.TrustedRuntimeIdentity
	}
	if layout.WorkloadIdentity.IsZero() {
		layout.WorkloadIdentity = defaults.WorkloadIdentity
	}
	if layout.HealthHost == "" {
		layout.HealthHost = defaults.HealthHost
	}
	if layout.HealthPort == 0 {
		layout.HealthPort = defaults.HealthPort
	}
	if layout.HealthPath == "" {
		layout.HealthPath = defaults.HealthPath
	}
	return layout
}

func validateLayoutPaths(layout Layout) error {
	for label, remotePath := range map[string]string{
		"release root":      layout.ReleaseRoot,
		"runtime state dir": layout.RuntimeStateDir,
		"metadata path":     layout.MetadataPath,
		"health path":       layout.HealthPath,
	} {
		if err := validateRemotePath(label, remotePath); err != nil {
			return err
		}
	}
	return nil
}

func validateLayoutServiceAndIdentities(layout Layout) error {
	if !releaseFieldPattern.MatchString(layout.ServiceName) || strings.Contains(layout.ServiceName, "_") || strings.Contains(layout.ServiceName, ".") {
		return fmt.Errorf("%w: malformed service name", runtimeprovider.ErrInvalidContract)
	}
	if err := layout.TrustedRuntimeIdentity.Validate(); err != nil {
		return err
	}
	if err := layout.WorkloadIdentity.Validate(); err != nil {
		return err
	}
	if layout.TrustedRuntimeIdentity.User == layout.WorkloadIdentity.User {
		return fmt.Errorf("%w: trusted runtime user must differ from workload user", runtimeprovider.ErrInvalidContract)
	}
	return nil
}

func validateLayoutHealthEndpoint(layout Layout) error {
	if strings.TrimSpace(layout.HealthHost) == "" || strings.ContainsAny(layout.HealthHost, "/ \t") {
		return fmt.Errorf("%w: malformed health host", runtimeprovider.ErrInvalidContract)
	}
	if layout.HealthPort < 1 || layout.HealthPort > 65535 {
		return fmt.Errorf("%w: health port is out of range", runtimeprovider.ErrInvalidContract)
	}
	return nil
}

func ownerGroup(identity runtimeprovider.ServiceIdentity) string {
	return identity.User + ":" + identity.Group
}

func normalizeHealthWait(attempts int, interval time.Duration) (int, time.Duration, error) {
	if attempts == 0 {
		attempts = defaultHealthAttempts
	}
	if interval == 0 {
		interval = defaultHealthInterval
	}
	if attempts < 1 {
		return 0, 0, fmt.Errorf("%w: health attempts must be positive", runtimeprovider.ErrInvalidContract)
	}
	if interval < 0 {
		return 0, 0, fmt.Errorf("%w: health interval must not be negative", runtimeprovider.ErrInvalidContract)
	}
	return attempts, interval, nil
}

func validateRemotePath(label string, remotePath string) error {
	if !path.IsAbs(remotePath) || path.Clean(remotePath) != remotePath {
		return fmt.Errorf("%w: %s must be an absolute clean path: %s", runtimeprovider.ErrInvalidContract, label, remotePath)
	}
	for _, character := range remotePath {
		if unicode.IsControl(character) || unicode.IsSpace(character) {
			return fmt.Errorf("%w: %s contains unsupported character %q", runtimeprovider.ErrInvalidContract, label, character)
		}
	}
	return nil
}

func validateInstalledRelease(release InstalledRelease) error {
	if release.SchemaVersion != installedReleaseSchemaVersion {
		return fmt.Errorf("%w: unsupported installed release schema version %d", runtimeprovider.ErrInvalidContract, release.SchemaVersion)
	}
	for label, value := range map[string]string{
		"version":      release.Version,
		"os":           release.OS,
		"arch":         release.Arch,
		"archive name": release.ArchiveName,
		"artifact dir": release.ArtifactDir,
	} {
		if !releaseFieldPattern.MatchString(value) {
			return fmt.Errorf("%w: installed release %s contains unsupported characters", runtimeprovider.ErrInvalidContract, label)
		}
	}
	if release.BinaryName != release.ArtifactDir+"/setta" {
		return fmt.Errorf("%w: installed release binary name does not match artifact directory", runtimeprovider.ErrInvalidContract)
	}
	if !sha256HexPattern.MatchString(release.ArchiveSHA256) || !sha256HexPattern.MatchString(release.BinarySHA256) {
		return fmt.Errorf("%w: installed release has malformed checksums", runtimeprovider.ErrInvalidContract)
	}
	if err := validateRemotePath("binary path", release.BinaryPath); err != nil {
		return err
	}
	if release.InstalledAt.IsZero() {
		return fmt.Errorf("%w: installed release timestamp is zero", runtimeprovider.ErrInvalidContract)
	}
	return nil
}

func sameInstalledRelease(current InstalledRelease, desired verifiedArtifact) bool {
	return current.Version == desired.Version &&
		current.OS == desired.OS &&
		current.Arch == desired.Arch &&
		current.ArchiveName == desired.ArchiveName &&
		current.ArtifactDir == desired.ArtifactDir &&
		current.BinaryName == desired.BinaryName &&
		current.ArchiveSHA256 == desired.ArchiveSHA256 &&
		current.BinarySHA256 == desired.BinarySHA256
}

func releaseID(version string, archiveSHA string) string {
	return version + "-" + archiveSHA[:16]
}

var osReadFile = func(name string) ([]byte, error) {
	data, err := os.ReadFile(name)
	if err != nil {
		return nil, err
	}
	return bytes.Clone(data), nil
}
