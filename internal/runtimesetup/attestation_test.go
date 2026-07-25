package runtimesetup

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"setta/internal/runtimecapability"
	"setta/internal/runtimeprovider"
)

func TestSetupSeedDefaultsToBoundedTTLAndWritesProtectedFile(t *testing.T) {
	now := mustParseTime(t, "2026-07-16T12:00:00Z")
	seed := testSeed(t, now)
	if seed.ExpiresAt != "2026-07-16T13:00:00Z" {
		t.Fatalf("seed expiresAt = %q, want one hour TTL", seed.ExpiresAt)
	}

	appDataDir := t.TempDir()
	seedPath := SeedPath(appDataDir)
	if err := WriteSeedFile(seedPath, seed); err != nil {
		t.Fatalf("WriteSeedFile: %v", err)
	}
	info, err := os.Stat(seedPath)
	if err != nil {
		t.Fatalf("stat seed: %v", err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("seed mode = %o, want 0600", info.Mode().Perm())
	}
	dirInfo, err := os.Stat(filepath.Dir(seedPath))
	if err != nil {
		t.Fatalf("stat seed dir: %v", err)
	}
	if dirInfo.Mode().Perm() != 0o700 {
		t.Fatalf("seed dir mode = %o, want 0700", dirInfo.Mode().Perm())
	}
}

func TestSetupSeedRejectsLongLivedExpiry(t *testing.T) {
	now := mustParseTime(t, "2026-07-16T12:00:00Z")
	_, err := NewSeed(SeedInput{
		RuntimeName:     testRuntimeName(t),
		SetupID:         "setup_0123456789abcdef",
		ReleaseVersion:  "v1.2.3",
		CredentialEpoch: 1,
		AttestationKey:  "attestation-key-0123456789abcdef",
		ExpiresAt:       now.Add(MaxSeedTTL + time.Nanosecond),
	}, now)
	if err == nil {
		t.Fatal("long-lived setup seed validated")
	}
}

func TestCreateAttestationUsesHMACRejectsReplayAndVerifies(t *testing.T) {
	now := mustParseTime(t, "2026-07-16T12:00:00Z")
	store := newTestStore(t, now)
	seed := testSeed(t, now)
	if err := WriteSeedFile(store.path, seed); err != nil {
		t.Fatalf("WriteSeedFile: %v", err)
	}

	challenge := testChallenge(seed.SetupID)
	attestation, status, err := store.CreateAttestation(context.Background(), challenge)
	if err != nil {
		t.Fatalf("CreateAttestation: %v", err)
	}
	if status != AttestationOK {
		t.Fatalf("status = %s, want ok", status)
	}
	if attestation.RuntimeName != seed.RuntimeName || attestation.ReleaseVersion != seed.ReleaseVersion {
		t.Fatalf("attestation = %+v, seed = %+v", attestation, seed)
	}
	if err := VerifyAttestation(attestation, seed.AttestationKey); err != nil {
		t.Fatalf("VerifyAttestation: %v", err)
	}
	if err := VerifyAttestation(attestation, "wrong-attestation-key-0123456789abcdef"); err == nil {
		t.Fatal("VerifyAttestation accepted wrong key")
	}

	_, status, err = store.CreateAttestation(context.Background(), challenge)
	if err != nil {
		t.Fatalf("replay CreateAttestation: %v", err)
	}
	if status != AttestationReplayedNonce {
		t.Fatalf("replay status = %s, want replayed_nonce", status)
	}
}

func TestCreateAttestationRejectsExpiredAndReleaseMismatch(t *testing.T) {
	now := mustParseTime(t, "2026-07-16T12:00:00Z")
	store := newTestStore(t, now.Add(time.Hour+time.Nanosecond))
	seed := testSeed(t, now)
	if err := WriteSeedFile(store.path, seed); err != nil {
		t.Fatalf("WriteSeedFile: %v", err)
	}

	_, status, err := store.CreateAttestation(context.Background(), testChallenge(seed.SetupID))
	if err != nil {
		t.Fatalf("expired CreateAttestation: %v", err)
	}
	if status != AttestationExpired {
		t.Fatalf("expired status = %s, want expired", status)
	}

	store = newTestStore(t, now)
	if err := WriteSeedFile(store.path, seed); err != nil {
		t.Fatalf("WriteSeedFile mismatch seed: %v", err)
	}
	challenge := testChallenge(seed.SetupID)
	challenge.ReleaseVersion = "v9.9.9"
	_, status, err = store.CreateAttestation(context.Background(), challenge)
	if err != nil {
		t.Fatalf("mismatch CreateAttestation: %v", err)
	}
	if status != AttestationReleaseMismatch {
		t.Fatalf("mismatch status = %s, want release_mismatch", status)
	}
}

func TestCreateAttestationReportsMissingSeed(t *testing.T) {
	store := newTestStore(t, mustParseTime(t, "2026-07-16T12:00:00Z"))

	_, status, err := store.CreateAttestation(context.Background(), testChallenge("setup_0123456789abcdef"))
	if err != nil {
		t.Fatalf("missing CreateAttestation: %v", err)
	}
	if status != AttestationNotFound {
		t.Fatalf("missing status = %s, want not_found", status)
	}
}

func TestCreateAttestationRejectsMismatchedSetupIDWithTypedStatus(t *testing.T) {
	now := mustParseTime(t, "2026-07-16T12:00:00Z")
	store := newTestStore(t, now)
	seed := testSeed(t, now)
	if err := WriteSeedFile(store.path, seed); err != nil {
		t.Fatalf("WriteSeedFile: %v", err)
	}

	_, status, err := store.CreateAttestation(context.Background(), testChallenge("setup_other_012345"))
	if err != nil {
		t.Fatalf("CreateAttestation: %v", err)
	}
	if status != AttestationNotFound {
		t.Fatalf("mismatched setup status = %s, want not_found", status)
	}
}

func TestCreateAttestationAfterFilesystemRollbackRequiresCurrentSetup(t *testing.T) {
	now := mustParseTime(t, "2026-07-16T12:00:00Z")
	appDataDir := t.TempDir()
	store, err := NewStore(appDataDir, WithClock(func() time.Time {
		return now
	}))
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	staleSeed, err := NewSeed(SeedInput{
		RuntimeName:     testRuntimeName(t),
		SetupID:         "setup_restore_old",
		ReleaseVersion:  "v1.2.3",
		CredentialEpoch: 1,
		AttestationKey:  "attestation-key-restore-0123456789",
	}, now)
	if err != nil {
		t.Fatalf("NewSeed stale: %v", err)
	}
	if err := WriteSeedFile(store.path, staleSeed); err != nil {
		t.Fatalf("WriteSeedFile stale: %v", err)
	}
	staleChallenge := testChallenge(staleSeed.SetupID)
	staleChallenge.ReleaseVersion = staleSeed.ReleaseVersion
	staleChallenge.Nonce = "nonce-restore-old-012345"
	if _, status, err := store.CreateAttestation(context.Background(), staleChallenge); err != nil || status != AttestationOK {
		t.Fatalf("stale CreateAttestation status=%s err=%v, want ok", status, err)
	}

	restoredStore, err := NewStore(appDataDir, WithClock(func() time.Time {
		return now
	}))
	if err != nil {
		t.Fatalf("NewStore restored: %v", err)
	}
	currentReleaseChallenge := staleChallenge
	currentReleaseChallenge.ReleaseVersion = "v2.0.0"
	currentReleaseChallenge.Nonce = "nonce-restore-new-release"
	_, status, err := restoredStore.CreateAttestation(context.Background(), currentReleaseChallenge)
	if err != nil {
		t.Fatalf("current release CreateAttestation: %v", err)
	}
	if status != AttestationReleaseMismatch {
		t.Fatalf("current release status = %s, want release_mismatch", status)
	}

	currentSetupChallenge := currentReleaseChallenge
	currentSetupChallenge.SetupID = "setup_restore_current"
	currentSetupChallenge.Nonce = "nonce-restore-new-setup"
	_, status, err = restoredStore.CreateAttestation(context.Background(), currentSetupChallenge)
	if err != nil {
		t.Fatalf("current setup CreateAttestation: %v", err)
	}
	if status != AttestationNotFound {
		t.Fatalf("current setup status = %s, want not_found", status)
	}
}

func TestStoreRejectsRelativeAppDataDir(t *testing.T) {
	_, err := NewStore(filepath.Join("relative", "app-data"))
	if err == nil {
		t.Fatal("relative app data directory validated")
	}
}

func TestCorruptSeedReportsTypedError(t *testing.T) {
	store := newTestStore(t, mustParseTime(t, "2026-07-16T12:00:00Z"))
	if err := os.MkdirAll(filepath.Dir(store.path), 0o700); err != nil {
		t.Fatalf("create seed dir: %v", err)
	}
	if err := os.WriteFile(store.path, []byte("{"), 0o600); err != nil {
		t.Fatalf("write corrupt seed: %v", err)
	}

	_, _, err := store.CreateAttestation(context.Background(), testChallenge("setup_0123456789abcdef"))
	if !errors.As(err, new(*CorruptStateError)) {
		t.Fatalf("CreateAttestation error = %T %v, want CorruptStateError", err, err)
	}
}

func testSeed(t *testing.T, now time.Time) Seed {
	t.Helper()
	seed, err := NewSeed(SeedInput{
		RuntimeName:     testRuntimeName(t),
		SetupID:         "setup_0123456789abcdef",
		ReleaseVersion:  "v1.2.3",
		CredentialEpoch: 1,
		AttestationKey:  "attestation-key-0123456789abcdef",
	}, now)
	if err != nil {
		t.Fatalf("NewSeed: %v", err)
	}
	return seed
}

func testRuntimeName(t *testing.T) string {
	t.Helper()
	identity, err := runtimeprovider.NewManagedIdentity("runtimesetup-test")
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	return identity.Name
}

func testChallenge(setupID string) AttestationChallenge {
	return AttestationChallenge{
		BackendName:    "setta-backend",
		RuntimeID:      "0123456789abcdef0123456789abcdef",
		SetupID:        setupID,
		ReleaseVersion: "v1.2.3",
		FeatureSet:     runtimecapability.RuntimeFeatureSetIdentity(),
		Nonce:          "nonce-0123456789abcdef",
	}
}

func newTestStore(t *testing.T, now time.Time) *Store {
	t.Helper()
	store, err := NewStore(t.TempDir(), WithClock(func() time.Time {
		return now
	}))
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	return store
}

func mustParseTime(t *testing.T, value string) time.Time {
	t.Helper()
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		t.Fatalf("parse time: %v", err)
	}
	return parsed
}
