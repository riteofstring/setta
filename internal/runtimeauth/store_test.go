package runtimeauth

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/hex"
	"path/filepath"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func TestDeviceSessionTokensAreHashedAndResolvable(t *testing.T) {
	store := newTestStore(t)
	session, token, err := store.CreateDeviceSession(context.Background(), "Local desktop")
	if err != nil {
		t.Fatalf("create device session: %v", err)
	}
	assertHexLength(t, token, 64)

	db := openRuntimeAuthDB(t, store.Path())
	defer db.Close()
	var storedHash []byte
	if err := db.QueryRow("SELECT token_hash FROM device_sessions WHERE id = ?", session.ID).Scan(&storedHash); err != nil {
		t.Fatalf("read stored token hash: %v", err)
	}
	if bytes.Equal(storedHash, []byte(token)) {
		t.Fatal("stored token hash equals token text")
	}
	if !bytes.Equal(storedHash, hashTokenBytes(token)) {
		t.Fatal("stored token hash does not match SHA-256 token hash")
	}

	resolved, ok, err := store.ResolveDeviceToken(context.Background(), token)
	if err != nil {
		t.Fatalf("resolve token: %v", err)
	}
	if !ok {
		t.Fatal("resolve token returned not found")
	}
	if resolved.ID != session.ID || resolved.Scope != DeviceScopeFull {
		t.Fatalf("resolved session = %+v, want %s full scope", resolved, session.ID)
	}

	if _, ok, err := store.ResolveDeviceToken(context.Background(), "not-the-token"); err != nil || ok {
		t.Fatalf("resolve invalid token ok=%v err=%v, want not found", ok, err)
	}
}

func TestPairingTokenCompletesOnce(t *testing.T) {
	store := newTestStore(t)
	_, pairingToken, err := store.CreatePairingToken(context.Background())
	if err != nil {
		t.Fatalf("create pairing token: %v", err)
	}
	assertHexLength(t, pairingToken, 64)

	session, deviceToken, ok, err := store.CompletePairing(context.Background(), pairingToken, "Laptop")
	if err != nil {
		t.Fatalf("complete pairing: %v", err)
	}
	if !ok {
		t.Fatal("complete pairing returned not found")
	}
	if session.ID == "" || deviceToken == "" || session.DisplayName != "Laptop" {
		t.Fatalf("pairing result session=%+v token=%q", session, deviceToken)
	}

	_, _, ok, err = store.CompletePairing(context.Background(), pairingToken, "Phone")
	if err != nil {
		t.Fatalf("complete used pairing token: %v", err)
	}
	if ok {
		t.Fatal("used pairing token completed twice")
	}
}

func TestPairingTokenExpires(t *testing.T) {
	clock := newTestClock(mustParseTime(t, "2026-07-02T10:00:00Z"))
	store := newTestStore(t, WithClock(clock.Now))
	_, pairingToken, err := store.CreatePairingToken(context.Background())
	if err != nil {
		t.Fatalf("create pairing token: %v", err)
	}

	clock.Set(mustParseTime(t, "2026-07-02T10:10:01Z"))
	_, _, ok, err := store.CompletePairing(context.Background(), pairingToken, "Late client")
	if err != nil {
		t.Fatalf("complete expired pairing token: %v", err)
	}
	if ok {
		t.Fatal("expired pairing token completed")
	}
}

func TestProvisionedPairingTokenUsesSeededHashAndProvisioningTTL(t *testing.T) {
	clock := newTestClock(mustParseTime(t, "2026-07-02T10:00:00Z"))
	store := newTestStore(t, WithClock(clock.Now))
	pairingToken := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	pairing, err := store.SeedProvisionedPairingToken(context.Background(), SeedProvisionedPairingTokenInput{
		PairingTokenHash: hex.EncodeToString(hashTokenBytes(pairingToken)),
		ProvisionID:      "provision_0123456789abcdef",
		AttestationKey:   "attestation-key-0123456789abcdef",
	})
	if err != nil {
		t.Fatalf("seed provisioned pairing token: %v", err)
	}
	if pairing.ExpiresAt != "2026-07-02T11:00:00Z" {
		t.Fatalf("provisioned pairing expiresAt = %q, want 60 minute TTL", pairing.ExpiresAt)
	}

	db := openRuntimeAuthDB(t, store.Path())
	defer db.Close()
	var storedHash []byte
	if err := db.QueryRow("SELECT token_hash FROM pairing_tokens WHERE id = ?", pairing.ID).Scan(&storedHash); err != nil {
		t.Fatalf("read stored pairing token hash: %v", err)
	}
	if bytes.Equal(storedHash, []byte(pairingToken)) {
		t.Fatal("stored provisioned pairing token hash equals token text")
	}
	if !bytes.Equal(storedHash, hashTokenBytes(pairingToken)) {
		t.Fatal("stored provisioned pairing token hash does not match seeded SHA-256")
	}

	clock.Set(mustParseTime(t, "2026-07-02T10:10:01Z"))
	session, _, ok, err := store.CompletePairing(context.Background(), pairingToken, "Provisioned desktop")
	if err != nil {
		t.Fatalf("complete provisioned pairing: %v", err)
	}
	if !ok || session.DisplayName != "Provisioned desktop" {
		t.Fatalf("provisioned pairing result session=%+v ok=%v, want success", session, ok)
	}
}

func TestProvisionedPairingTokenExpiresAfterProvisioningTTL(t *testing.T) {
	clock := newTestClock(mustParseTime(t, "2026-07-02T10:00:00Z"))
	store := newTestStore(t, WithClock(clock.Now))
	pairingToken := "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
	if _, err := store.SeedProvisionedPairingToken(context.Background(), SeedProvisionedPairingTokenInput{
		PairingTokenHash: hex.EncodeToString(hashTokenBytes(pairingToken)),
		ProvisionID:      "provision_expired_012345",
		AttestationKey:   "attestation-key-abcdef0123456789",
	}); err != nil {
		t.Fatalf("seed provisioned pairing token: %v", err)
	}

	clock.Set(mustParseTime(t, "2026-07-02T11:00:01Z"))
	_, _, ok, err := store.CompletePairing(context.Background(), pairingToken, "Late provisioned desktop")
	if err != nil {
		t.Fatalf("complete expired provisioned pairing token: %v", err)
	}
	if ok {
		t.Fatal("expired provisioned pairing token completed")
	}
}

func TestSetupAttestationUsesHMACRejectsReplayAndStopsAfterPairing(t *testing.T) {
	clock := newTestClock(mustParseTime(t, "2026-07-02T10:00:00Z"))
	store := newTestStore(t, WithClock(clock.Now))
	pairingToken := "1111111111111111111111111111111111111111111111111111111111111111"
	provisionID := "provision_attest_012345"
	attestationKey := "attestation-key-1111111111111111"
	if _, err := store.SeedProvisionedPairingToken(context.Background(), SeedProvisionedPairingTokenInput{
		PairingTokenHash: hex.EncodeToString(hashTokenBytes(pairingToken)),
		ProvisionID:      provisionID,
		AttestationKey:   attestationKey,
	}); err != nil {
		t.Fatalf("seed provisioned pairing token: %v", err)
	}

	challenge := SetupAttestationChallenge{
		RuntimeID:       "runtime_012345",
		ProvisionID:     provisionID,
		Nonce:           "nonce-0123456789abcdef",
		NodeFingerprint: "nodekey:0123456789abcdef",
	}
	attestation, status, err := store.CreateSetupAttestation(context.Background(), challenge)
	if err != nil {
		t.Fatalf("create setup attestation: %v", err)
	}
	if status != SetupAttestationOK {
		t.Fatalf("setup attestation status = %s, want ok", status)
	}
	expected := computeSetupAttestation([]byte(attestationKey), challenge.RuntimeID, provisionID, challenge.Nonce, challenge.NodeFingerprint)
	if attestation.Attestation != expected || attestation.Algorithm != setupAttestationAlgorithm {
		t.Fatalf("setup attestation = %+v, want hmac %s", attestation, expected)
	}

	_, status, err = store.CreateSetupAttestation(context.Background(), challenge)
	if err != nil {
		t.Fatalf("replay setup attestation: %v", err)
	}
	if status != SetupAttestationReplayedNonce {
		t.Fatalf("replay setup attestation status = %s, want replayed_nonce", status)
	}

	if _, _, ok, err := store.CompletePairing(context.Background(), pairingToken, "Provisioned desktop"); err != nil || !ok {
		t.Fatalf("complete provisioned pairing ok=%v err=%v, want success", ok, err)
	}

	challenge.Nonce = "nonce-fedcba9876543210"
	_, status, err = store.CreateSetupAttestation(context.Background(), challenge)
	if err != nil {
		t.Fatalf("attestation after pairing: %v", err)
	}
	if status != SetupAttestationAlreadyPaired {
		t.Fatalf("attestation after pairing status = %s, want already_paired", status)
	}

	db := openRuntimeAuthDB(t, store.Path())
	defer db.Close()
	var attestationKeyBytes []byte
	if err := db.QueryRow(`
SELECT attestation_key
FROM provisioned_pairing_tokens
WHERE provision_id = ?
`, provisionID).Scan(&attestationKeyBytes); err != nil {
		t.Fatalf("read provisioned attestation key: %v", err)
	}
	if attestationKeyBytes != nil {
		t.Fatal("provisioned attestation key was not cleared after pairing")
	}
}

func TestSetupAttestationExpiresWithProvisioningTTL(t *testing.T) {
	clock := newTestClock(mustParseTime(t, "2026-07-02T10:00:00Z"))
	store := newTestStore(t, WithClock(clock.Now))
	if _, err := store.SeedProvisionedPairingToken(context.Background(), SeedProvisionedPairingTokenInput{
		PairingTokenHash: hex.EncodeToString(hashTokenBytes("2222222222222222222222222222222222222222222222222222222222222222")),
		ProvisionID:      "provision_attest_expired",
		AttestationKey:   "attestation-key-2222222222222222",
	}); err != nil {
		t.Fatalf("seed provisioned pairing token: %v", err)
	}

	clock.Set(mustParseTime(t, "2026-07-02T11:00:01Z"))
	_, status, err := store.CreateSetupAttestation(context.Background(), SetupAttestationChallenge{
		RuntimeID:       "runtime_012345",
		ProvisionID:     "provision_attest_expired",
		Nonce:           "nonce-2222222222222222",
		NodeFingerprint: "nodekey:2222222222222222",
	})
	if err != nil {
		t.Fatalf("expired setup attestation: %v", err)
	}
	if status != SetupAttestationExpired {
		t.Fatalf("expired setup attestation status = %s, want expired", status)
	}
}

func TestRevokedDeviceSessionStopsResolving(t *testing.T) {
	store := newTestStore(t)
	session, token, err := store.CreateDeviceSession(context.Background(), "Local desktop")
	if err != nil {
		t.Fatalf("create device session: %v", err)
	}
	revoked, ok, err := store.RevokeDeviceSession(context.Background(), session.ID)
	if err != nil {
		t.Fatalf("revoke device session: %v", err)
	}
	if !ok || revoked.RevokedAt == nil {
		t.Fatalf("revoked session = %+v ok=%v, want revoked", revoked, ok)
	}
	isRevoked, err := store.IsDeviceSessionRevoked(context.Background(), session.ID)
	if err != nil {
		t.Fatalf("read revocation: %v", err)
	}
	if !isRevoked {
		t.Fatal("session is not marked revoked")
	}
	if _, ok, err := store.ResolveDeviceToken(context.Background(), token); err != nil || ok {
		t.Fatalf("resolve revoked token ok=%v err=%v, want not found", ok, err)
	}
	if touched, err := store.TouchDeviceSession(context.Background(), session.ID); err != nil || touched {
		t.Fatalf("touch revoked session touched=%v err=%v, want false", touched, err)
	}
}

func TestBootstrapDeviceSessionRevokesOnlyPreviousBootstrapSessions(t *testing.T) {
	clock := newTestClock(mustParseTime(t, "2026-07-02T10:00:00Z"))
	store := newTestStore(t, WithClock(clock.Now))

	firstBootstrap, firstToken, err := store.CreateBootstrapDeviceSession(context.Background(), "Setta Desktop")
	if err != nil {
		t.Fatalf("create first bootstrap session: %v", err)
	}
	paired, pairedToken, err := store.CreateDeviceSession(context.Background(), "Paired laptop")
	if err != nil {
		t.Fatalf("create paired session: %v", err)
	}

	clock.Set(mustParseTime(t, "2026-07-02T10:01:00Z"))
	secondBootstrap, secondToken, err := store.CreateBootstrapDeviceSession(context.Background(), "Setta Desktop")
	if err != nil {
		t.Fatalf("create second bootstrap session: %v", err)
	}

	sessions, err := store.ListDeviceSessions(context.Background())
	if err != nil {
		t.Fatalf("list sessions: %v", err)
	}
	byID := map[string]DeviceSession{}
	for _, session := range sessions {
		byID[session.ID] = session
	}
	if !byID[firstBootstrap.ID].IsBootstrap || byID[firstBootstrap.ID].RevokedAt == nil {
		t.Fatalf("first bootstrap session = %+v, want marked and revoked", byID[firstBootstrap.ID])
	}
	if byID[paired.ID].IsBootstrap || byID[paired.ID].RevokedAt != nil {
		t.Fatalf("paired session = %+v, want unmarked and unrevoked", byID[paired.ID])
	}
	if !byID[secondBootstrap.ID].IsBootstrap || byID[secondBootstrap.ID].RevokedAt != nil {
		t.Fatalf("second bootstrap session = %+v, want marked and unrevoked", byID[secondBootstrap.ID])
	}

	if _, ok, err := store.ResolveDeviceToken(context.Background(), firstToken); err != nil || ok {
		t.Fatalf("resolve first bootstrap token ok=%v err=%v, want revoked", ok, err)
	}
	if _, ok, err := store.ResolveDeviceToken(context.Background(), pairedToken); err != nil || !ok {
		t.Fatalf("resolve paired token ok=%v err=%v, want valid", ok, err)
	}
	resolvedBootstrap, ok, err := store.ResolveDeviceToken(context.Background(), secondToken)
	if err != nil || !ok {
		t.Fatalf("resolve second bootstrap token ok=%v err=%v, want valid", ok, err)
	}
	if !resolvedBootstrap.IsBootstrap {
		t.Fatalf("resolved bootstrap session = %+v, want bootstrap marker", resolvedBootstrap)
	}
}

func newTestStore(t *testing.T, options ...StoreOption) *Store {
	t.Helper()
	store, err := NewStore(t.TempDir(), options...)
	if err != nil {
		t.Fatalf("new runtime auth store: %v", err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Fatalf("close runtime auth store: %v", err)
		}
	})
	return store
}

func openRuntimeAuthDB(t *testing.T, path string) *sql.DB {
	t.Helper()
	if filepath.Base(path) != runtimeAuthDatabaseName {
		t.Fatalf("runtime auth db path = %s, want %s", path, runtimeAuthDatabaseName)
	}
	db, err := sql.Open(sqliteDriverName, path)
	if err != nil {
		t.Fatalf("open runtime auth db: %v", err)
	}
	return db
}

func assertHexLength(t *testing.T, value string, want int) {
	t.Helper()
	if len(value) != want {
		t.Fatalf("token length = %d, want %d", len(value), want)
	}
	if _, err := hex.DecodeString(value); err != nil {
		t.Fatalf("token is not hex: %v", err)
	}
}

type testClock struct {
	now time.Time
}

func newTestClock(now time.Time) *testClock {
	return &testClock{now: now}
}

func (clock *testClock) Now() time.Time {
	return clock.now
}

func (clock *testClock) Set(now time.Time) {
	clock.now = now
}

func mustParseTime(t *testing.T, value string) time.Time {
	t.Helper()
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		t.Fatalf("parse time: %v", err)
	}
	return parsed
}
