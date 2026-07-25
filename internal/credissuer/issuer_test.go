package credissuer

import (
	"context"
	"errors"
	"testing"
	"time"

	"setta/internal/runtimecapability"
	"setta/internal/runtimeprovider"
	"setta/internal/runtimesetup"
)

func TestIssueVerifyRoundTripAndRejectsAudienceRuntimeMismatch(t *testing.T) {
	authority := newTestAuthority(t)
	_, credential := authority.authorize(t, "nonce-round-trip-0001")

	verified, err := authority.issuer.VerifyCredential(context.Background(), credential.Token)
	if err != nil {
		t.Fatalf("VerifyCredential: %v", err)
	}
	if verified.Claims.DeviceID != authority.deviceID ||
		verified.Claims.RuntimeName != authority.runtimeName ||
		verified.Claims.CredentialEpoch != 1 ||
		verified.Claims.Issuer != "setta-control-plane" ||
		verified.Claims.Audience != "setta-runtime" {
		t.Fatalf("verified claims = %+v", verified.Claims)
	}

	wrongAudience, err := NewVerifier(VerifierConfig{
		Issuer:      "setta-control-plane",
		Audience:    "other-audience",
		RuntimeName: authority.runtimeName,
		KeySet:      authority.issuer.PublishedKeys(),
		Clock:       authority.clock.Now,
	})
	if err != nil {
		t.Fatalf("NewVerifier wrong audience: %v", err)
	}
	if _, err := wrongAudience.Verify(credential.Token); !errors.Is(err, ErrCredentialAudienceMismatch) {
		t.Fatalf("wrong audience verify error = %v, want ErrCredentialAudienceMismatch", err)
	}

	otherRuntime := testRuntimeName(t, "other-runtime")
	wrongRuntime, err := NewVerifier(VerifierConfig{
		Issuer:      "setta-control-plane",
		Audience:    "setta-runtime",
		RuntimeName: otherRuntime,
		KeySet:      authority.issuer.PublishedKeys(),
		Clock:       authority.clock.Now,
	})
	if err != nil {
		t.Fatalf("NewVerifier wrong runtime: %v", err)
	}
	if _, err := wrongRuntime.Verify(credential.Token); !errors.Is(err, ErrCredentialRuntimeMismatch) {
		t.Fatalf("wrong runtime verify error = %v, want ErrCredentialRuntimeMismatch", err)
	}
}

func TestCredentialExpiryAndControlPlaneUnavailableVerification(t *testing.T) {
	authority := newTestAuthority(t)
	_, credential := authority.authorize(t, "nonce-offline-0000001")
	offline, err := NewVerifier(VerifierConfig{
		Issuer:      "setta-control-plane",
		Audience:    "setta-runtime",
		RuntimeName: authority.runtimeName,
		KeySet:      authority.issuer.PublishedKeys(),
		Clock:       authority.clock.Now,
	})
	if err != nil {
		t.Fatalf("NewVerifier: %v", err)
	}

	if _, err := offline.Verify(credential.Token); err != nil {
		t.Fatalf("offline Verify before expiry: %v", err)
	}
	authority.clock.Advance(DefaultCredentialTTL + DefaultClockSkew + time.Nanosecond)
	if _, err := offline.Verify(credential.Token); !errors.Is(err, ErrCredentialExpired) {
		t.Fatalf("offline Verify after expiry error = %v, want ErrCredentialExpired", err)
	}
}

func TestEpochBumpInvalidatesUnexpiredCredential(t *testing.T) {
	authority := newTestAuthority(t)
	_, credential := authority.authorize(t, "nonce-epoch-bump-0001")

	if _, ok, err := authority.issuer.BumpRuntimeEpoch(context.Background(), authority.runtimeName); err != nil || !ok {
		t.Fatalf("BumpRuntimeEpoch ok=%v err=%v", ok, err)
	}
	if _, err := authority.issuer.VerifyCredential(context.Background(), credential.Token); !errors.Is(err, ErrCredentialEpochStale) {
		t.Fatalf("VerifyCredential after epoch bump error = %v, want ErrCredentialEpochStale", err)
	}
}

func TestSigningKeyRotationPublishesOverlap(t *testing.T) {
	authority := newTestAuthority(t)
	_, firstCredential := authority.authorize(t, "nonce-key-rotation-001")
	firstKey := firstCredential.KeyID

	secondKey, err := authority.issuer.RotateSigningKey(context.Background())
	if err != nil {
		t.Fatalf("RotateSigningKey: %v", err)
	}
	if secondKey.ID == firstKey {
		t.Fatal("rotation reused active signing key")
	}
	secondCredential, err := authority.issuer.IssueRuntimeAccessCredential(context.Background(), IssueRuntimeAccessCredentialRequest{
		DeviceID:    authority.deviceID,
		RuntimeName: authority.runtimeName,
	})
	if err != nil {
		t.Fatalf("IssueRuntimeAccessCredential after rotation: %v", err)
	}
	if secondCredential.KeyID != secondKey.ID {
		t.Fatalf("credential key = %s, want rotated key %s", secondCredential.KeyID, secondKey.ID)
	}

	overlap := authority.issuer.PublishedKeys()
	if !publishedKeyExists(overlap, firstKey) || !publishedKeyExists(overlap, secondKey.ID) {
		t.Fatalf("published key overlap = %+v, want old and new keys", overlap.Keys)
	}
	verifier, err := NewVerifier(VerifierConfig{
		Issuer:      "setta-control-plane",
		Audience:    "setta-runtime",
		RuntimeName: authority.runtimeName,
		KeySet:      overlap,
		Clock:       authority.clock.Now,
	})
	if err != nil {
		t.Fatalf("NewVerifier: %v", err)
	}
	if _, err := verifier.Verify(firstCredential.Token); err != nil {
		t.Fatalf("Verify old-key credential during overlap: %v", err)
	}
	if _, err := verifier.Verify(secondCredential.Token); err != nil {
		t.Fatalf("Verify new-key credential during overlap: %v", err)
	}
}

func TestGrantRevocationPreservesDeviceIdentity(t *testing.T) {
	authority := newTestAuthority(t)
	_, credential := authority.authorize(t, "nonce-grant-revoke-01")

	revoked, ok, err := authority.issuer.RevokeRuntimeAccessGrant(context.Background(), authority.deviceID, authority.runtimeName)
	if err != nil || !ok {
		t.Fatalf("RevokeRuntimeAccessGrant ok=%v err=%v", ok, err)
	}
	if revoked.RevokedAt == nil {
		t.Fatalf("revoked grant = %+v, want revokedAt", revoked)
	}
	device, ok := authority.issuer.Device(context.Background(), authority.deviceID)
	if !ok || device.RevokedAt != nil {
		t.Fatalf("device after grant revocation = %+v ok=%v, want surviving device identity", device, ok)
	}
	if _, err := authority.issuer.VerifyCredential(context.Background(), credential.Token); !errors.Is(err, ErrRuntimeAccessRevoked) {
		t.Fatalf("VerifyCredential after grant revoke error = %v, want ErrRuntimeAccessRevoked", err)
	}
}

func TestAccountAndRuntimeSuspensionRejectLiveCredentials(t *testing.T) {
	authority := newTestAuthority(t)
	_, credential := authority.authorize(t, "nonce-suspend-user-01")

	if _, ok, err := authority.issuer.SuspendUser(context.Background(), authority.userID); err != nil || !ok {
		t.Fatalf("SuspendUser ok=%v err=%v", ok, err)
	}
	if _, err := authority.issuer.VerifyCredential(context.Background(), credential.Token); !errors.Is(err, ErrUserSuspended) {
		t.Fatalf("VerifyCredential after user suspension error = %v, want ErrUserSuspended", err)
	}

	authority = newTestAuthority(t)
	_, credential = authority.authorize(t, "nonce-suspend-runtime")
	if _, ok, err := authority.issuer.SetRuntimeAccessState(context.Background(), authority.runtimeName, RuntimeAccessSuspended); err != nil || !ok {
		t.Fatalf("SetRuntimeAccessState ok=%v err=%v", ok, err)
	}
	if _, err := authority.issuer.VerifyCredential(context.Background(), credential.Token); !errors.Is(err, ErrRuntimeAccessSuspended) {
		t.Fatalf("VerifyCredential after runtime suspension error = %v, want ErrRuntimeAccessSuspended", err)
	}
}

func TestSetupSeedConsumptionIsSingleUse(t *testing.T) {
	authority := newTestAuthority(t)
	firstAttestation := authority.attest(t, authority.seed, "nonce-seed-single-01")
	secondAttestation := authority.attest(t, authority.seed, "nonce-seed-single-02")

	if _, _, err := authority.issuer.AuthorizeRuntimeAccess(context.Background(), AuthorizeRuntimeAccessRequest{
		DeviceID:    authority.deviceID,
		RuntimeName: authority.runtimeName,
		Attestation: firstAttestation,
	}); err != nil {
		t.Fatalf("first AuthorizeRuntimeAccess: %v", err)
	}
	if _, _, err := authority.issuer.AuthorizeRuntimeAccess(context.Background(), AuthorizeRuntimeAccessRequest{
		DeviceID:    authority.deviceID,
		RuntimeName: authority.runtimeName,
		Attestation: secondAttestation,
	}); !errors.Is(err, ErrSetupSeedConsumed) {
		t.Fatalf("second AuthorizeRuntimeAccess error = %v, want ErrSetupSeedConsumed", err)
	}
}

func TestPostRestoreStaleEpochRequiresCurrentReattestation(t *testing.T) {
	authority := newTestAuthority(t)
	staleAttestation := authority.attest(t, authority.seed, "nonce-stale-epoch-01")
	if _, ok, err := authority.issuer.BumpRuntimeEpoch(context.Background(), authority.runtimeName); err != nil || !ok {
		t.Fatalf("BumpRuntimeEpoch ok=%v err=%v", ok, err)
	}

	if _, _, err := authority.issuer.AuthorizeRuntimeAccess(context.Background(), AuthorizeRuntimeAccessRequest{
		DeviceID:    authority.deviceID,
		RuntimeName: authority.runtimeName,
		Attestation: staleAttestation,
	}); !errors.Is(err, ErrSetupSeedStale) {
		t.Fatalf("stale AuthorizeRuntimeAccess error = %v, want ErrSetupSeedStale", err)
	}

	currentSeed := authority.newSeed(t, "setup_current_epoch", 2)
	if err := authority.issuer.RegisterSetupSeed(context.Background(), currentSeed); err != nil {
		t.Fatalf("RegisterSetupSeed current: %v", err)
	}
	currentAttestation := authority.attest(t, currentSeed, "nonce-current-epoch")
	grant, credential, err := authority.issuer.AuthorizeRuntimeAccess(context.Background(), AuthorizeRuntimeAccessRequest{
		DeviceID:    authority.deviceID,
		RuntimeName: authority.runtimeName,
		Attestation: currentAttestation,
	})
	if err != nil {
		t.Fatalf("current AuthorizeRuntimeAccess: %v", err)
	}
	if grant.CredentialEpoch != 2 || credential.Claims.CredentialEpoch != 2 {
		t.Fatalf("current grant=%+v credential=%+v, want epoch 2", grant, credential.Claims)
	}
}

type testAuthority struct {
	clock       *testClock
	issuer      *Issuer
	userID      string
	deviceID    string
	runtimeName string
	seed        runtimesetup.Seed
}

func newTestAuthority(t *testing.T) *testAuthority {
	t.Helper()
	clock := &testClock{now: time.Date(2026, 7, 16, 12, 0, 0, 0, time.UTC)}
	issuer, err := NewIssuer(Config{
		Issuer:   "setta-control-plane",
		Audience: "setta-runtime",
		Clock:    clock.Now,
	})
	if err != nil {
		t.Fatalf("NewIssuer: %v", err)
	}
	runtimeName := testRuntimeName(t, "user-runtime")
	authority := &testAuthority{
		clock:       clock,
		issuer:      issuer,
		userID:      "user_123",
		deviceID:    "device_123",
		runtimeName: runtimeName,
	}
	if _, err := issuer.UpsertUser(context.Background(), authority.userID); err != nil {
		t.Fatalf("UpsertUser: %v", err)
	}
	if _, err := issuer.RegisterDevice(context.Background(), authority.userID, authority.deviceID); err != nil {
		t.Fatalf("RegisterDevice: %v", err)
	}
	if _, err := issuer.RegisterRuntime(context.Background(), authority.userID, authority.runtimeName, 1); err != nil {
		t.Fatalf("RegisterRuntime: %v", err)
	}
	authority.seed = authority.newSeed(t, "setup_initial_epoch", 1)
	if err := issuer.RegisterSetupSeed(context.Background(), authority.seed); err != nil {
		t.Fatalf("RegisterSetupSeed: %v", err)
	}
	return authority
}

func (authority *testAuthority) authorize(t *testing.T, nonce string) (RuntimeAccessGrant, RuntimeAccessCredential) {
	t.Helper()
	attestation := authority.attest(t, authority.seed, nonce)
	grant, credential, err := authority.issuer.AuthorizeRuntimeAccess(context.Background(), AuthorizeRuntimeAccessRequest{
		DeviceID:    authority.deviceID,
		RuntimeName: authority.runtimeName,
		Attestation: attestation,
	})
	if err != nil {
		t.Fatalf("AuthorizeRuntimeAccess: %v", err)
	}
	return grant, credential
}

func (authority *testAuthority) newSeed(t *testing.T, setupID string, epoch uint64) runtimesetup.Seed {
	t.Helper()
	seed, err := runtimesetup.NewSeed(runtimesetup.SeedInput{
		RuntimeName:     authority.runtimeName,
		SetupID:         setupID,
		ReleaseVersion:  "v1.2.3",
		CredentialEpoch: epoch,
		AttestationKey:  "attestation-key-credential-issuer-012345",
	}, authority.clock.Now())
	if err != nil {
		t.Fatalf("NewSeed: %v", err)
	}
	return seed
}

func (authority *testAuthority) attest(t *testing.T, seed runtimesetup.Seed, nonce string) runtimesetup.Attestation {
	t.Helper()
	store, err := runtimesetup.NewStore(t.TempDir(), runtimesetup.WithClock(authority.clock.Now))
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	if err := runtimesetup.WriteSeedFile(store.Path(), seed); err != nil {
		t.Fatalf("WriteSeedFile: %v", err)
	}
	attestation, status, err := store.CreateAttestation(context.Background(), runtimesetup.AttestationChallenge{
		BackendName:    "setta-backend",
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

func testRuntimeName(t *testing.T, owner string) string {
	t.Helper()
	identity, err := runtimeprovider.NewManagedIdentity(owner)
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	return identity.Name
}

func publishedKeyExists(keySet PublishedKeySet, keyID string) bool {
	for _, key := range keySet.Keys {
		if key.ID == keyID {
			return true
		}
	}
	return false
}

type testClock struct {
	now time.Time
}

func (clock *testClock) Now() time.Time {
	return clock.now
}

func (clock *testClock) Advance(duration time.Duration) {
	clock.now = clock.now.Add(duration)
}
