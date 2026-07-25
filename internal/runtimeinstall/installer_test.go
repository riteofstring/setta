package runtimeinstall

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"setta/internal/controlplane"
	"setta/internal/credissuer"
	"setta/internal/httpapi"
	"setta/internal/runtimecapability"
	"setta/internal/runtimeprovider"
	"setta/internal/runtimeprovider/runtimetest"
	"setta/internal/runtimesetup"
)

func TestInstallFreshReleaseUploadsInstallsAndVerifiesHealth(t *testing.T) {
	tempDir := t.TempDir()
	artifact := makeTestReleaseArtifact(t, tempDir, "v1.0.0")
	provider := newFakeProvider(t)
	loop := testLoop(provider)
	identity := testRuntimeIdentity(t, "fresh-install")

	result, err := loop.Install(context.Background(), InstallRequest{
		RuntimeName: identity.Name,
		Desired:     artifact,
	})
	if err != nil {
		t.Fatalf("Install: %v", err)
	}
	if result.Status != InstallStatusFresh {
		t.Fatalf("status = %s, want %s", result.Status, InstallStatusFresh)
	}
	if result.Installed.Version != "v1.0.0" || result.Installed.BinaryPath == "" {
		t.Fatalf("installed release = %#v", result.Installed)
	}
	if !result.Health.OK {
		t.Fatalf("health = %#v", result.Health)
	}
	service := provider.LastService()
	if service.Spec.Path != result.Installed.BinaryPath {
		t.Fatalf("service path = %s, want %s", service.Spec.Path, result.Installed.BinaryPath)
	}
	if service.Spec.RunAs != DefaultLayout().TrustedRuntimeIdentity {
		t.Fatalf("service identity = %#v, want %#v", service.Spec.RunAs, DefaultLayout().TrustedRuntimeIdentity)
	}
	if slices.Contains(service.Spec.Arguments, "--sprites-workload-leases") {
		t.Fatalf("unconfigured runtime service enabled workload leases: %q", service.Spec.Arguments)
	}
	if !provider.hasFile("/var/lib/setta/runtime-install/releases/.incoming-v1.0.0-" + result.Installed.ArchiveSHA256[:16] + "/SHA256SUMS.minisig") {
		t.Fatal("signature file was not uploaded with the release candidate")
	}
	if !slices.Equal(provider.installedVersions, []string{"v1.0.0"}) {
		t.Fatalf("installed versions = %v", provider.installedVersions)
	}
}

func TestInstallProvisionsPrivateRuntimeAccountingCredentialAndServiceArguments(t *testing.T) {
	artifact := makeTestReleaseArtifact(t, t.TempDir(), "v1.0.0-reporting")
	provider := newFakeProvider(t)
	credential, err := controlplane.NewRuntimeReportingCredential()
	if err != nil {
		t.Fatal(err)
	}
	accounting := &WorkloadAccountingConfig{
		BaseURL:    "https://control.setta.example",
		Credential: credential,
	}
	result, err := testLoop(provider).Install(context.Background(), InstallRequest{
		RuntimeName:        testRuntimeIdentity(t, "reporting-install").Name,
		Desired:            artifact,
		WorkloadAccounting: accounting,
	})
	if err != nil {
		t.Fatal(err)
	}
	credentialPath := workloadAccountingCredentialPath(DefaultLayout())
	stored, found := provider.File(credentialPath)
	if !found {
		t.Fatal("runtime reporting credential was not provisioned")
	}
	var storedCredential controlplane.RuntimeReportingCredential
	if err := json.Unmarshal(stored, &storedCredential); err != nil ||
		storedCredential != credential {
		t.Fatalf("stored runtime reporting credential = %+v, %v", storedCredential, err)
	}
	if provider.identityCanWrite(credentialPath, DefaultLayout().WorkloadIdentity) {
		t.Fatal("ordinary workload identity can write the runtime reporting credential")
	}
	wantArguments := []string{
		"serve",
		"--app-data-dir", DefaultLayout().RuntimeStateDir,
		"--port", strconv.Itoa(DefaultLayout().HealthPort),
		"--sprites-workload-leases",
		"--workload-accounting-url", accounting.BaseURL,
		"--workload-accounting-credential-file", credentialPath,
	}
	if service := provider.LastService(); service.Spec.Path != result.Installed.BinaryPath ||
		!slices.Equal(service.Spec.Arguments, wantArguments) {
		t.Fatalf("runtime reporting service = %+v, want arguments %q", service.Spec, wantArguments)
	}
}

func TestInstallHealthyVerifyReturnsStructuredBackendHealth(t *testing.T) {
	tempDir := t.TempDir()
	artifact := makeTestReleaseArtifact(t, tempDir, "v1.2.3")
	provider := newFakeProvider(t)
	loop := testLoop(provider)
	identity := testRuntimeIdentity(t, "healthy-verify")

	result, err := loop.Install(context.Background(), InstallRequest{
		RuntimeName: identity.Name,
		Desired:     artifact,
	})
	if err != nil {
		t.Fatalf("Install: %v", err)
	}
	if result.Health.Backend.Name != httpapi.BackendName {
		t.Fatalf("backend name = %q", result.Health.Backend.Name)
	}
	if result.Health.Backend.Version != "v1.2.3" {
		t.Fatalf("backend version = %q", result.Health.Backend.Version)
	}
	if result.Health.Backend.ProtocolVersion != httpapi.ProtocolVersion {
		t.Fatalf("protocol version = %d", result.Health.Backend.ProtocolVersion)
	}
	if result.Health.Identity.RuntimeID != "0123456789abcdef0123456789abcdef" {
		t.Fatalf("runtime identity proof = %#v", result.Health.Identity)
	}
	if result.Health.Identity.ReleaseVersion != "v1.2.3" || result.Health.Identity.RuntimeName != identity.Name {
		t.Fatalf("runtime identity proof = %#v", result.Health.Identity)
	}
}

func TestInstallWritesSetupSeedUnderProtectedRuntimeState(t *testing.T) {
	tempDir := t.TempDir()
	artifact := makeTestReleaseArtifact(t, tempDir, "v1.2.3")
	provider := newFakeProvider(t)
	loop := testLoop(provider)
	identity := testRuntimeIdentity(t, "setup-seed")
	seed, err := runtimesetup.NewSeed(runtimesetup.SeedInput{
		RuntimeName:     identity.Name,
		SetupID:         "setup_install_012345",
		ReleaseVersion:  "v1.2.3",
		CredentialEpoch: 1,
		AttestationKey:  "attestation-key-5555555555555555",
	}, loop.Now())
	if err != nil {
		t.Fatalf("NewSeed: %v", err)
	}

	result, err := loop.Install(context.Background(), InstallRequest{
		RuntimeName: identity.Name,
		Desired:     artifact,
		SetupSeed:   &seed,
	})
	if err != nil {
		t.Fatalf("Install: %v", err)
	}
	seedPath := runtimesetup.RemoteSeedPath(DefaultLayout().RuntimeStateDir)
	seedData, ok := provider.File(seedPath)
	if !ok {
		t.Fatalf("setup seed was not written at %s", seedPath)
	}
	if !bytes.Contains(seedData, []byte(`"setupId": "setup_install_012345"`)) {
		t.Fatalf("setup seed payload = %s", seedData)
	}
	if !provider.hasInstallDirMode(runtimesetup.RemoteSeedDir(DefaultLayout().RuntimeStateDir), "0700") {
		t.Fatalf("protected setup seed directory was not created with mode 0700")
	}
	if provider.ChmodMode(seedPath) != "0600" {
		t.Fatalf("setup seed mode = %q, want 0600", provider.ChmodMode(seedPath))
	}
	if provider.FileOwner(seedPath) != DefaultLayout().TrustedRuntimeIdentity {
		t.Fatalf("setup seed owner = %#v, want %#v", provider.FileOwner(seedPath), DefaultLayout().TrustedRuntimeIdentity)
	}
	if !result.Health.OK || result.Health.Identity.RuntimeID == "" {
		t.Fatalf("health = %#v", result.Health)
	}
}

func TestInstallFreshReleaseSeedAttestsAndRejectsReplay(t *testing.T) {
	tempDir := t.TempDir()
	artifact := makeTestReleaseArtifact(t, tempDir, "v1.2.3")
	provider := newFakeProvider(t)
	loop := testLoop(provider)
	identity := testRuntimeIdentity(t, "bootstrap-attestation")
	seed, err := runtimesetup.NewSeed(runtimesetup.SeedInput{
		RuntimeName:     identity.Name,
		SetupID:         "setup_bootstrap_012345",
		ReleaseVersion:  "v1.2.3",
		CredentialEpoch: 1,
		AttestationKey:  "attestation-key-bootstrap-0123456789",
	}, loop.Now())
	if err != nil {
		t.Fatalf("NewSeed: %v", err)
	}

	result, err := loop.Install(context.Background(), InstallRequest{
		RuntimeName: identity.Name,
		Desired:     artifact,
		SetupSeed:   &seed,
	})
	if err != nil {
		t.Fatalf("Install: %v", err)
	}
	seedPath := runtimesetup.RemoteSeedPath(DefaultLayout().RuntimeStateDir)
	remoteSeed, ok := provider.File(seedPath)
	if !ok {
		t.Fatalf("setup seed was not written at %s", seedPath)
	}
	if provider.ChmodMode(seedPath) != "0600" {
		t.Fatalf("setup seed mode = %q, want 0600", provider.ChmodMode(seedPath))
	}
	store := newSetupStoreFromRemoteSeed(t, remoteSeed, loop.Now())
	challenge := runtimesetup.AttestationChallenge{
		BackendName:    httpapi.BackendName,
		RuntimeID:      result.Health.Identity.RuntimeID,
		SetupID:        seed.SetupID,
		ReleaseVersion: result.Installed.Version,
		FeatureSet:     runtimecapability.RuntimeFeatureSetIdentity(),
		Nonce:          "nonce-bootstrap-0123456789",
	}

	attestation, status, err := store.CreateAttestation(context.Background(), challenge)
	if err != nil {
		t.Fatalf("CreateAttestation: %v", err)
	}
	if status != runtimesetup.AttestationOK {
		t.Fatalf("attestation status = %s, want ok", status)
	}
	if attestation.CredentialEpoch != seed.CredentialEpoch {
		t.Fatalf("attestation epoch = %d, want %d", attestation.CredentialEpoch, seed.CredentialEpoch)
	}
	if err := runtimesetup.VerifyAttestation(attestation, seed.AttestationKey); err != nil {
		t.Fatalf("VerifyAttestation: %v", err)
	}

	_, status, err = store.CreateAttestation(context.Background(), challenge)
	if err != nil {
		t.Fatalf("replay CreateAttestation: %v", err)
	}
	if status != runtimesetup.AttestationReplayedNonce {
		t.Fatalf("replay status = %s, want replayed_nonce", status)
	}
}

func TestInstallPostRestoreRequiresCurrentCredentialEpochReattestation(t *testing.T) {
	tempDir := t.TempDir()
	artifact := makeTestReleaseArtifact(t, tempDir, "v1.2.3")
	provider := newFakeProvider(t)
	loop := testLoop(provider)
	identity := testRuntimeIdentity(t, "post-restore-epoch")
	oldSeed, err := runtimesetup.NewSeed(runtimesetup.SeedInput{
		RuntimeName:     identity.Name,
		SetupID:         "setup_restore_epoch_old",
		ReleaseVersion:  "v1.2.3",
		CredentialEpoch: 1,
		AttestationKey:  "attestation-key-restore-old-012345",
	}, loop.Now())
	if err != nil {
		t.Fatalf("NewSeed old: %v", err)
	}
	issuer := newInstallerCredentialIssuer(t, identity.Name, 1)
	if err := issuer.RegisterSetupSeed(context.Background(), oldSeed); err != nil {
		t.Fatalf("RegisterSetupSeed old: %v", err)
	}

	if _, err := loop.Install(context.Background(), InstallRequest{
		RuntimeName: identity.Name,
		Desired:     artifact,
		SetupSeed:   &oldSeed,
	}); err != nil {
		t.Fatalf("Install old seed: %v", err)
	}
	checkpoint, err := provider.CreateCheckpoint(context.Background(), identity.Name, "epoch-one-seed")
	if err != nil {
		t.Fatalf("CreateCheckpoint: %v", err)
	}

	if runtime, ok, err := issuer.BumpRuntimeEpoch(context.Background(), identity.Name); err != nil || !ok || runtime.CredentialEpoch != 2 {
		t.Fatalf("BumpRuntimeEpoch runtime=%+v ok=%v err=%v, want epoch 2", runtime, ok, err)
	}
	currentSeed, err := runtimesetup.NewSeed(runtimesetup.SeedInput{
		RuntimeName:     identity.Name,
		SetupID:         "setup_restore_epoch_current",
		ReleaseVersion:  "v1.2.3",
		CredentialEpoch: 2,
		AttestationKey:  "attestation-key-restore-current-012345",
	}, loop.Now())
	if err != nil {
		t.Fatalf("NewSeed current: %v", err)
	}
	if err := issuer.RegisterSetupSeed(context.Background(), currentSeed); err != nil {
		t.Fatalf("RegisterSetupSeed current: %v", err)
	}
	if _, err := loop.Install(context.Background(), InstallRequest{
		RuntimeName: identity.Name,
		Desired:     artifact,
		SetupSeed:   &currentSeed,
	}); err != nil {
		t.Fatalf("Install current seed: %v", err)
	}

	if err := provider.RestoreCheckpoint(context.Background(), identity.Name, checkpoint.ID); err != nil {
		t.Fatalf("RestoreCheckpoint: %v", err)
	}
	restoredSeedData, ok := provider.File(runtimesetup.RemoteSeedPath(DefaultLayout().RuntimeStateDir))
	if !ok {
		t.Fatal("restored setup seed is missing")
	}
	staleAttestation := createInstallAttestationFromRemoteSeed(t, restoredSeedData, "nonce-restored-stale")
	if _, _, err := issuer.AuthorizeRuntimeAccess(context.Background(), credissuer.AuthorizeRuntimeAccessRequest{
		DeviceID:    installerDeviceID,
		RuntimeName: identity.Name,
		Attestation: staleAttestation,
	}); !errors.Is(err, credissuer.ErrSetupSeedStale) {
		t.Fatalf("stale AuthorizeRuntimeAccess error = %v, want ErrSetupSeedStale", err)
	}

	if _, err := loop.Install(context.Background(), InstallRequest{
		RuntimeName: identity.Name,
		Desired:     artifact,
		SetupSeed:   &currentSeed,
	}); err != nil {
		t.Fatalf("reinstall current seed: %v", err)
	}
	currentSeedData, ok := provider.File(runtimesetup.RemoteSeedPath(DefaultLayout().RuntimeStateDir))
	if !ok {
		t.Fatal("current setup seed is missing")
	}
	currentAttestation := createInstallAttestationFromRemoteSeed(t, currentSeedData, "nonce-restored-current")
	grant, credential, err := issuer.AuthorizeRuntimeAccess(context.Background(), credissuer.AuthorizeRuntimeAccessRequest{
		DeviceID:    installerDeviceID,
		RuntimeName: identity.Name,
		Attestation: currentAttestation,
	})
	if err != nil {
		t.Fatalf("current AuthorizeRuntimeAccess: %v", err)
	}
	if grant.CredentialEpoch != 2 || credential.Claims.CredentialEpoch != 2 {
		t.Fatalf("grant=%+v credential=%+v, want epoch 2", grant, credential.Claims)
	}
}

func TestInstallProtectsRuntimeStateForTrustedRuntimeIdentity(t *testing.T) {
	tempDir := t.TempDir()
	artifact := makeTestReleaseArtifact(t, tempDir, "v1.2.3")
	provider := newFakeProvider(t)
	loop := testLoop(provider)
	identity := testRuntimeIdentity(t, "trusted-runtime-owner")
	layout := DefaultLayout()
	layout.TrustedRuntimeIdentity = runtimeprovider.ServiceIdentity{
		User:  "setta-runtime",
		Group: "setta-runtime",
	}
	seed, err := runtimesetup.NewSeed(runtimesetup.SeedInput{
		RuntimeName:     identity.Name,
		SetupID:         "setup_install_777777",
		ReleaseVersion:  "v1.2.3",
		CredentialEpoch: 1,
		AttestationKey:  "attestation-key-7777777777777777",
	}, loop.Now())
	if err != nil {
		t.Fatalf("NewSeed: %v", err)
	}

	result, err := loop.Install(context.Background(), InstallRequest{
		RuntimeName: identity.Name,
		Desired:     artifact,
		SetupSeed:   &seed,
		Layout:      layout,
	})
	if err != nil {
		t.Fatalf("Install: %v", err)
	}
	if result.Health.Service.Spec.RunAs != layout.TrustedRuntimeIdentity {
		t.Fatalf("service identity = %#v, want %#v", result.Health.Service.Spec.RunAs, layout.TrustedRuntimeIdentity)
	}

	seedDir := runtimesetup.RemoteSeedDir(layout.RuntimeStateDir)
	seedPath := runtimesetup.RemoteSeedPath(layout.RuntimeStateDir)
	protectedDirs := []string{layout.RuntimeStateDir, seedDir}
	for _, remotePath := range protectedDirs {
		if provider.InstallDirMode(remotePath) != "0700" {
			t.Fatalf("%s mode = %q, want 0700", remotePath, provider.InstallDirMode(remotePath))
		}
		if provider.DirOwner(remotePath) != layout.TrustedRuntimeIdentity {
			t.Fatalf("%s owner = %#v, want %#v", remotePath, provider.DirOwner(remotePath), layout.TrustedRuntimeIdentity)
		}
		if provider.identityCanWrite(remotePath, layout.WorkloadIdentity) {
			t.Fatalf("workload identity can write protected directory %s", remotePath)
		}
		if !provider.identityCanWrite(remotePath, layout.TrustedRuntimeIdentity) {
			t.Fatalf("trusted runtime identity cannot write protected directory %s", remotePath)
		}
	}
	if provider.ChmodMode(seedPath) != "0600" {
		t.Fatalf("setup seed mode = %q, want 0600", provider.ChmodMode(seedPath))
	}
	if provider.FileOwner(seedPath) != layout.TrustedRuntimeIdentity {
		t.Fatalf("setup seed owner = %#v, want %#v", provider.FileOwner(seedPath), layout.TrustedRuntimeIdentity)
	}
	if provider.identityCanWrite(seedPath, layout.WorkloadIdentity) {
		t.Fatalf("workload identity can write protected seed %s", seedPath)
	}
	if provider.ChmodMode(layout.MetadataPath) != "0600" {
		t.Fatalf("installed metadata mode = %q, want 0600", provider.ChmodMode(layout.MetadataPath))
	}
	if provider.FileOwner(layout.MetadataPath) != DefaultLayout().TrustedRuntimeIdentity {
		t.Fatalf("installed metadata owner = %#v, want %#v", provider.FileOwner(layout.MetadataPath), DefaultLayout().TrustedRuntimeIdentity)
	}
}

func TestInstallRejectsLayoutWhereWorkloadIdentityOwnsProtectedState(t *testing.T) {
	tempDir := t.TempDir()
	artifact := makeTestReleaseArtifact(t, tempDir, "v1.2.3")
	provider := newFakeProvider(t)
	loop := testLoop(provider)
	identity := testRuntimeIdentity(t, "workload-owner-rejected")
	layout := DefaultLayout()
	layout.TrustedRuntimeIdentity = layout.WorkloadIdentity

	_, err := loop.Install(context.Background(), InstallRequest{
		RuntimeName: identity.Name,
		Desired:     artifact,
		Layout:      layout,
	})
	if !errors.Is(err, runtimeprovider.ErrInvalidContract) {
		t.Fatalf("Install error = %v, want ErrInvalidContract", err)
	}
	if provider.ExecCalls() != 0 || provider.EnsureServiceCalls() != 0 {
		t.Fatalf("provider calls = exec %d ensure %d, want none", provider.ExecCalls(), provider.EnsureServiceCalls())
	}
}

func TestInstallUsesConfiguredRemoteVerifierPathAsArgv(t *testing.T) {
	tempDir := t.TempDir()
	artifact := makeTestReleaseArtifact(t, tempDir, "v1.2.3")
	provider := newFakeProvider(t)
	loop := testLoop(provider)
	loop.RemoteVerifierPath = DefaultLayout().ReleaseRoot + "/setta-release-verify"
	provider.remoteVerifierPath = loop.RemoteVerifierPath
	identity := testRuntimeIdentity(t, "custom-remote-verifier")

	if _, err := loop.Install(context.Background(), InstallRequest{
		RuntimeName: identity.Name,
		Desired:     artifact,
	}); err != nil {
		t.Fatalf("Install: %v", err)
	}
	if len(provider.remoteVerifierRequests) != 1 {
		t.Fatalf("remote verifier requests = %d, want 1", len(provider.remoteVerifierRequests))
	}
	request := provider.remoteVerifierRequests[0]
	if request.Path != loop.RemoteVerifierPath {
		t.Fatalf("remote verifier path = %q, want %q", request.Path, loop.RemoteVerifierPath)
	}
	if len(request.Arguments) != 8 {
		t.Fatalf("remote verifier arguments = %q, want 8 arguments", request.Arguments)
	}
	if !slices.Equal(request.Arguments, []string{
		"-Vm", request.Arguments[1], "-P", artifact.PublicKey, "-x", request.Arguments[5],
		"-f", request.Arguments[7],
	}) {
		t.Fatalf("remote verifier arguments = %q", request.Arguments)
	}
	if filepath.Base(request.Arguments[7]) != filepath.Base(artifact.ArchivePath) {
		t.Fatalf("remote verifier release path = %q", request.Arguments[7])
	}
}

func TestInstallKeepsDefaultMinisignRemoteVerifierArgv(t *testing.T) {
	artifact := makeTestReleaseArtifact(t, t.TempDir(), "v1.2.3")
	provider := newFakeProvider(t)
	provider.remoteVerifierPath = defaultRemoteVerifierPath
	loop := testLoop(provider)
	identity := testRuntimeIdentity(t, "default-remote-verifier")

	if _, err := loop.Install(context.Background(), InstallRequest{
		RuntimeName: identity.Name,
		Desired:     artifact,
	}); err != nil {
		t.Fatalf("Install: %v", err)
	}
	if len(provider.remoteVerifierRequests) != 1 {
		t.Fatalf("remote verifier requests = %d, want 1", len(provider.remoteVerifierRequests))
	}
	request := provider.remoteVerifierRequests[0]
	if request.Path != defaultRemoteVerifierPath || len(request.Arguments) != 6 {
		t.Fatalf("default remote verifier request = %#v", request)
	}
	if request.Arguments[0] != "-Vm" || request.Arguments[2] != "-P" ||
		request.Arguments[4] != "-x" {
		t.Fatalf("default remote verifier arguments = %q", request.Arguments)
	}
}

func TestInstallRejectsUnsafeRemoteVerifierPathBeforeProviderCalls(t *testing.T) {
	testCases := map[string]string{
		"relative":               "setta-release-verify",
		"unclean":                DefaultLayout().ReleaseRoot + "/tools/../setta-release-verify",
		"outside protected root": "/tmp/setta-release-verify",
		"root itself":            DefaultLayout().ReleaseRoot,
		"prefix sibling":         DefaultLayout().ReleaseRoot + "-other/setta-release-verify",
		"shell metacharacter":    DefaultLayout().ReleaseRoot + "/setta-release-verify;$PATH",
	}
	for name, verifierPath := range testCases {
		t.Run(name, func(t *testing.T) {
			artifact := makeTestReleaseArtifact(t, t.TempDir(), "v1.2.3")
			provider := newFakeProvider(t)
			loop := testLoop(provider)
			loop.RemoteVerifierPath = verifierPath
			identity := testRuntimeIdentity(t, "unsafe-remote-verifier-"+name)

			_, err := loop.Install(context.Background(), InstallRequest{
				RuntimeName: identity.Name,
				Desired:     artifact,
			})
			if !errors.Is(err, runtimeprovider.ErrInvalidContract) {
				t.Fatalf("Install error = %v, want ErrInvalidContract", err)
			}
			if provider.ExecCalls() != 0 || provider.EnsureServiceCalls() != 0 {
				t.Fatalf("provider calls = exec %d ensure %d, want none", provider.ExecCalls(), provider.EnsureServiceCalls())
			}
		})
	}
}

func TestInstallRejectsSetupSeedForDifferentRelease(t *testing.T) {
	tempDir := t.TempDir()
	artifact := makeTestReleaseArtifact(t, tempDir, "v1.2.3")
	provider := newFakeProvider(t)
	loop := testLoop(provider)
	identity := testRuntimeIdentity(t, "setup-seed-mismatch")
	seed, err := runtimesetup.NewSeed(runtimesetup.SeedInput{
		RuntimeName:     identity.Name,
		SetupID:         "setup_install_mismatch",
		ReleaseVersion:  "v9.9.9",
		CredentialEpoch: 1,
		AttestationKey:  "attestation-key-6666666666666666",
	}, loop.Now())
	if err != nil {
		t.Fatalf("NewSeed: %v", err)
	}

	_, err = loop.Install(context.Background(), InstallRequest{
		RuntimeName: identity.Name,
		Desired:     artifact,
		SetupSeed:   &seed,
	})
	if !errors.Is(err, runtimeprovider.ErrInvalidContract) {
		t.Fatalf("Install error = %v, want ErrInvalidContract", err)
	}
}

func TestInstallFailedVerifyTriggersRollbackToPriorBuild(t *testing.T) {
	tempDir := t.TempDir()
	prior := makeTestReleaseArtifact(t, tempDir, "v1.0.0")
	next := makeTestReleaseArtifact(t, tempDir, "v2.0.0")
	provider := newFakeProvider(t)
	loop := testLoop(provider)
	identity := testRuntimeIdentity(t, "rollback")

	if _, err := loop.Install(context.Background(), InstallRequest{
		RuntimeName: identity.Name,
		Desired:     prior,
	}); err != nil {
		t.Fatalf("install prior: %v", err)
	}
	provider.installedVersions = nil
	provider.unhealthyVersions["v2.0.0"] = true

	result, err := loop.Install(context.Background(), InstallRequest{
		RuntimeName: identity.Name,
		Desired:     next,
		Rollback:    &prior,
	})
	if !errors.Is(err, ErrHealthCheckFailed) {
		t.Fatalf("Install error = %v, want ErrHealthCheckFailed", err)
	}
	if result.Rollback == nil {
		t.Fatal("rollback result is nil")
	}
	if result.Rollback.Release.Version != "v1.0.0" || !result.Rollback.Health.OK {
		t.Fatalf("rollback = %#v", result.Rollback)
	}
	if !slices.Equal(provider.installedVersions, []string{"v2.0.0", "v1.0.0"}) {
		t.Fatalf("installed versions = %v", provider.installedVersions)
	}
	current := provider.mustReadInstalledRelease(t)
	if current.Version != "v1.0.0" {
		t.Fatalf("current release = %s, want rollback version", current.Version)
	}
	if provider.LastService().Spec.Path != result.Rollback.Release.BinaryPath {
		t.Fatalf("service path = %s, want rollback path %s", provider.LastService().Spec.Path, result.Rollback.Release.BinaryPath)
	}
}

func TestInstallRuntimeInfoReleaseMismatchTriggersRollback(t *testing.T) {
	tempDir := t.TempDir()
	prior := makeTestReleaseArtifact(t, tempDir, "v1.0.0")
	next := makeTestReleaseArtifact(t, tempDir, "v2.0.0")
	provider := newFakeProvider(t)
	loop := testLoop(provider)
	identity := testRuntimeIdentity(t, "runtime-info-mismatch")

	if _, err := loop.Install(context.Background(), InstallRequest{
		RuntimeName: identity.Name,
		Desired:     prior,
	}); err != nil {
		t.Fatalf("install prior: %v", err)
	}
	provider.installedVersions = nil
	provider.runtimeInfoVersionOverrides["v2.0.0"] = "v9.9.9"

	result, err := loop.Install(context.Background(), InstallRequest{
		RuntimeName: identity.Name,
		Desired:     next,
		Rollback:    &prior,
	})
	if !errors.Is(err, ErrHealthCheckFailed) {
		t.Fatalf("Install error = %v, want ErrHealthCheckFailed", err)
	}
	if !strings.Contains(result.Health.Failure, `runtime info backend version = "v9.9.9"`) {
		t.Fatalf("health failure = %q, want runtime info version mismatch", result.Health.Failure)
	}
	if result.Rollback == nil || result.Rollback.Release.Version != "v1.0.0" || !result.Rollback.Health.OK {
		t.Fatalf("rollback = %#v", result.Rollback)
	}
	current := provider.mustReadInstalledRelease(t)
	if current.Version != "v1.0.0" {
		t.Fatalf("current release = %s, want rollback version", current.Version)
	}
	if !slices.Equal(provider.installedVersions, []string{"v2.0.0", "v1.0.0"}) {
		t.Fatalf("installed versions = %v", provider.installedVersions)
	}
}

func TestInstallRejectsBadSignatureBeforeProviderCalls(t *testing.T) {
	tempDir := t.TempDir()
	artifact := makeTestReleaseArtifact(t, tempDir, "v1.0.0")
	provider := newFakeProvider(t)
	verifier := &fakeSignatureVerifier{reject: true}
	loop := testLoop(provider)
	loop.Verifier = verifier
	identity := testRuntimeIdentity(t, "signature-rejection")

	_, err := loop.Install(context.Background(), InstallRequest{
		RuntimeName: identity.Name,
		Desired:     artifact,
	})
	if !errors.Is(err, ErrSignatureRejected) {
		t.Fatalf("Install error = %v, want ErrSignatureRejected", err)
	}
	if provider.ExecCalls() != 0 || provider.EnsureServiceCalls() != 0 {
		t.Fatalf("provider calls = exec %d ensure %d, want none", provider.ExecCalls(), provider.EnsureServiceCalls())
	}
}

func TestInstallIdempotentReinstallVerifiesCurrentReleaseWithoutUploading(t *testing.T) {
	tempDir := t.TempDir()
	artifact := makeTestReleaseArtifact(t, tempDir, "v1.0.0")
	provider := newFakeProvider(t)
	loop := testLoop(provider)
	identity := testRuntimeIdentity(t, "idempotent")

	if _, err := loop.Install(context.Background(), InstallRequest{
		RuntimeName: identity.Name,
		Desired:     artifact,
	}); err != nil {
		t.Fatalf("initial Install: %v", err)
	}
	provider.installedVersions = nil
	provider.ResetTransferCounters()

	result, err := loop.Install(context.Background(), InstallRequest{
		RuntimeName: identity.Name,
		Desired:     artifact,
	})
	if err != nil {
		t.Fatalf("second Install: %v", err)
	}
	if result.Status != InstallStatusAlreadyCurrent {
		t.Fatalf("status = %s, want %s", result.Status, InstallStatusAlreadyCurrent)
	}
	if provider.Uploads() != 0 || provider.TarExtracts() != 0 || len(provider.installedVersions) != 0 {
		t.Fatalf("reinstall performed upload/extract/install: uploads=%d extracts=%d installed=%v", provider.Uploads(), provider.TarExtracts(), provider.installedVersions)
	}
	if !result.Health.OK {
		t.Fatalf("health = %#v", result.Health)
	}
}

func testLoop(provider *fakeProvider) Loop {
	return Loop{
		Provider: provider,
		Verifier: &fakeSignatureVerifier{},
		Now:      testInstallNow,
		Sleep: func(context.Context, time.Duration) error {
			return nil
		},
	}
}

func testInstallNow() time.Time {
	return time.Date(2026, 7, 16, 12, 0, 0, 0, time.UTC)
}

const (
	installerUserID   = "user_runtimeinstall"
	installerDeviceID = "device_runtimeinstall"
)

func newInstallerCredentialIssuer(t *testing.T, runtimeName string, epoch uint64) *credissuer.Issuer {
	t.Helper()
	issuer, err := credissuer.NewIssuer(credissuer.Config{
		Issuer:   "setta-control-plane",
		Audience: "setta-runtime",
		Clock:    testInstallNow,
	})
	if err != nil {
		t.Fatalf("NewIssuer: %v", err)
	}
	if _, err := issuer.UpsertUser(context.Background(), installerUserID); err != nil {
		t.Fatalf("UpsertUser: %v", err)
	}
	if _, err := issuer.RegisterDevice(context.Background(), installerUserID, installerDeviceID); err != nil {
		t.Fatalf("RegisterDevice: %v", err)
	}
	if _, err := issuer.RegisterRuntime(context.Background(), installerUserID, runtimeName, epoch); err != nil {
		t.Fatalf("RegisterRuntime: %v", err)
	}
	return issuer
}

func testRuntimeIdentity(t *testing.T, suffix string) runtimeprovider.ManagedIdentity {
	t.Helper()
	identity, err := runtimeprovider.NewManagedIdentity("runtimeinstall-test:" + suffix)
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	return identity
}

func makeTestReleaseArtifact(t *testing.T, tempDir string, version string) ReleaseArtifact {
	t.Helper()
	artifactDir := fmt.Sprintf("setta_%s_linux_amd64", version)
	archiveName := artifactDir + ".tar.gz"
	archivePath := filepath.Join(tempDir, archiveName)
	binaryPayload := []byte("version:" + version + "\n")

	var archive bytes.Buffer
	gzipWriter := gzip.NewWriter(&archive)
	tarWriter := tar.NewWriter(gzipWriter)
	if err := tarWriter.WriteHeader(&tar.Header{
		Name: artifactDir + "/setta",
		Mode: 0o755,
		Size: int64(len(binaryPayload)),
	}); err != nil {
		t.Fatalf("write tar header: %v", err)
	}
	if _, err := tarWriter.Write(binaryPayload); err != nil {
		t.Fatalf("write tar payload: %v", err)
	}
	if err := tarWriter.Close(); err != nil {
		t.Fatalf("close tar: %v", err)
	}
	if err := gzipWriter.Close(); err != nil {
		t.Fatalf("close gzip: %v", err)
	}
	if err := os.WriteFile(archivePath, archive.Bytes(), 0o644); err != nil {
		t.Fatalf("write archive: %v", err)
	}

	checksumsPath := filepath.Join(tempDir, "SHA256SUMS-"+version)
	checksums := fmt.Sprintf(
		"%s  %s\n%s  %s/setta\n",
		sha256String(archive.Bytes()),
		archiveName,
		sha256String(binaryPayload),
		artifactDir,
	)
	if err := os.WriteFile(checksumsPath, []byte(checksums), 0o644); err != nil {
		t.Fatalf("write checksums: %v", err)
	}
	signaturePath := filepath.Join(tempDir, "SHA256SUMS-"+version+".minisig")
	if err := os.WriteFile(signaturePath, []byte("signed "+version+"\n"), 0o644); err != nil {
		t.Fatalf("write signature: %v", err)
	}
	return ReleaseArtifact{
		Version:       version,
		OS:            "linux",
		Arch:          "amd64",
		ArchivePath:   archivePath,
		ChecksumsPath: checksumsPath,
		SignaturePath: signaturePath,
		PublicKey:     "RWQtestminisignpublickey",
	}
}

func sha256String(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func newSetupStoreFromRemoteSeed(t *testing.T, remoteSeed []byte, now time.Time) *runtimesetup.Store {
	t.Helper()
	var seed runtimesetup.Seed
	if err := json.Unmarshal(remoteSeed, &seed); err != nil {
		t.Fatalf("decode remote setup seed: %v", err)
	}
	store, err := runtimesetup.NewStore(t.TempDir(), runtimesetup.WithClock(func() time.Time {
		return now
	}))
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	if err := runtimesetup.WriteSeedFile(store.Path(), seed); err != nil {
		t.Fatalf("WriteSeedFile: %v", err)
	}
	return store
}

func createInstallAttestationFromRemoteSeed(t *testing.T, remoteSeed []byte, nonce string) runtimesetup.Attestation {
	t.Helper()
	store := newSetupStoreFromRemoteSeed(t, remoteSeed, testInstallNow())
	var seed runtimesetup.Seed
	if err := json.Unmarshal(remoteSeed, &seed); err != nil {
		t.Fatalf("decode remote setup seed: %v", err)
	}
	attestation, status, err := store.CreateAttestation(context.Background(), runtimesetup.AttestationChallenge{
		BackendName:    httpapi.BackendName,
		RuntimeID:      "0123456789abcdef0123456789abcdef",
		SetupID:        seed.SetupID,
		ReleaseVersion: seed.ReleaseVersion,
		FeatureSet:     runtimecapability.RuntimeFeatureSetIdentity(),
		Nonce:          nonce,
	})
	if err != nil {
		t.Fatalf("CreateAttestation: %v", err)
	}
	if status != runtimesetup.AttestationOK {
		t.Fatalf("attestation status = %s, want ok", status)
	}
	return attestation
}

type fakeSignatureVerifier struct {
	reject bool
	calls  []SignatureVerificationRequest
}

func (verifier *fakeSignatureVerifier) VerifyReleaseSignature(
	_ context.Context,
	request SignatureVerificationRequest,
) error {
	verifier.calls = append(verifier.calls, request)
	if verifier.reject {
		return ErrSignatureRejected
	}
	return nil
}

type fakeProvider struct {
	t *testing.T
	*runtimetest.Provider
	unhealthyVersions           map[string]bool
	installedVersions           []string
	runtimeInfoVersionOverrides map[string]string
	remoteVerifierPath          string
	remoteVerifierRequests      []runtimeprovider.ExecRequest
}

func newFakeProvider(t *testing.T) *fakeProvider {
	t.Helper()
	provider := &fakeProvider{
		t: t,
		Provider: runtimetest.NewProvider(runtimetest.Options{
			Now:                 testInstallNow,
			WorkloadIdentity:    DefaultLayout().WorkloadIdentity,
			AllowMissingRuntime: true,
		}),
		unhealthyVersions:           make(map[string]bool),
		runtimeInfoVersionOverrides: make(map[string]string),
	}
	provider.SetCurlHandler(provider.execCurl)
	provider.SetMoveHook(func(destination string, data []byte) error {
		if destination != DefaultLayout().MetadataPath {
			return nil
		}
		var release InstalledRelease
		if err := json.Unmarshal(data, &release); err != nil {
			return fmt.Errorf("decode metadata in fake mv: %w", err)
		}
		provider.installedVersions = append(provider.installedVersions, release.Version)
		return nil
	})
	return provider
}

func (provider *fakeProvider) Exec(
	ctx context.Context,
	request runtimeprovider.ExecRequest,
) (runtimeprovider.ExecResult, error) {
	if provider.remoteVerifierPath != "" && request.Path == provider.remoteVerifierPath {
		provider.remoteVerifierRequests = append(provider.remoteVerifierRequests, request)
		return runtimeprovider.ExecResult{}, nil
	}
	return provider.Provider.Exec(ctx, request)
}

func (provider *fakeProvider) hasFile(remotePath string) bool {
	return provider.HasFile(remotePath)
}

func (provider *fakeProvider) mustReadInstalledRelease(t *testing.T) InstalledRelease {
	t.Helper()
	data, ok := provider.File(DefaultLayout().MetadataPath)
	if !ok {
		t.Fatal("installed release metadata is missing")
	}
	var release InstalledRelease
	if err := json.Unmarshal(data, &release); err != nil {
		t.Fatalf("decode installed release: %v", err)
	}
	return release
}

func (provider *fakeProvider) hasInstallDirMode(remotePath string, mode string) bool {
	return provider.InstallDirMode(remotePath) == mode
}

func (provider *fakeProvider) identityCanWrite(remotePath string, identity runtimeprovider.ServiceIdentity) bool {
	canWrite, err := provider.IdentityCanWrite(remotePath, identity)
	if err != nil {
		provider.t.Fatalf("identityCanWrite %s: %v", remotePath, err)
	}
	return canWrite
}

func (provider *fakeProvider) execCurl(request runtimeprovider.ExecRequest) (runtimeprovider.ExecResult, bool, error) {
	service := provider.LastService()
	if service.Spec.Path == "" {
		return runtimeprovider.ExecResult{ExitCode: 7, Stderr: []byte("service not started")}, true, nil
	}
	version, ok := provider.VersionForBinary(service.Spec.Path)
	if !ok {
		return runtimeprovider.ExecResult{ExitCode: 7, Stderr: []byte("missing service binary")}, true, nil
	}
	if provider.unhealthyVersions[version] {
		return runtimeprovider.ExecResult{ExitCode: 22, Stderr: []byte("unhealthy")}, true, nil
	}
	var payload []byte
	var err error
	if len(request.Arguments) == 2 && strings.HasSuffix(request.Arguments[1], "/runtime/info") {
		infoVersion := version
		if override, ok := provider.runtimeInfoVersionOverrides[version]; ok {
			infoVersion = override
		}
		payload, err = json.Marshal(httpapi.RuntimeInfoResponse{
			RuntimeID:       "0123456789abcdef0123456789abcdef",
			DisplayName:     "setta-copper-lantern",
			BackendName:     httpapi.BackendName,
			BackendVersion:  infoVersion,
			ProtocolVersion: httpapi.ProtocolVersion,
		})
	} else {
		payload, err = json.Marshal(httpapi.BackendHealth{
			OK:              true,
			Name:            httpapi.BackendName,
			Version:         version,
			ProtocolVersion: httpapi.ProtocolVersion,
		})
	}
	if err != nil {
		return runtimeprovider.ExecResult{}, true, err
	}
	return runtimeprovider.ExecResult{Stdout: append(payload, '\n')}, true, nil
}
