package localcredissuer

import (
	"context"
	"errors"
	"testing"
	"time"

	"setta/internal/runtimeauth"
	"setta/internal/runtimeprovider"
	"setta/internal/runtimesetup"
)

func TestLocalEnrollmentAndRefreshUseShortLivedSignedCredentials(t *testing.T) {
	now := time.Date(2026, 7, 16, 12, 0, 0, 0, time.UTC)
	clock := func() time.Time { return now }
	service, pairingStore, runtimeIdentity := newLocalCredentialTestService(t, clock)
	pairingToken := createLocalCredentialPairingToken(t, pairingStore)
	enrolled := enrollLocalCredentialTestDevice(t, service, pairingToken, now)
	now = now.Add(50 * time.Second)
	refreshed := refreshLocalCredentialTestDevice(t, service, enrolled, now)
	verifyRefreshedLocalCredential(t, service, refreshed, enrolled.DeviceID, runtimeIdentity.Name)
	assertLocalCredentialPairingReplayRejected(t, service, pairingToken)
}

func newLocalCredentialTestService(
	t *testing.T,
	clock func() time.Time,
) (*Service, *runtimeauth.Store, runtimeprovider.ManagedIdentity) {
	t.Helper()
	appDataDir := t.TempDir()
	pairingStore, err := runtimeauth.NewStore(appDataDir, runtimeauth.WithClock(clock))
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	t.Cleanup(func() { _ = pairingStore.Close() })
	setupStore, err := runtimesetup.NewStore(appDataDir, runtimesetup.WithClock(clock))
	if err != nil {
		t.Fatalf("NewStore setup: %v", err)
	}
	runtimeIdentity, err := runtimeprovider.NewManagedIdentity("local-issuer-test")
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	service, err := New(Config{
		BackendName:    "setta-backend",
		Clock:          clock,
		CredentialTTL:  time.Minute,
		PairingTokens:  pairingStore,
		ReleaseVersion: "test",
		RuntimeID:      "0123456789abcdef0123456789abcdef",
		RuntimeName:    runtimeIdentity.Name,
		SetupStore:     setupStore,
		UserID:         "user-local-test",
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return service, pairingStore, runtimeIdentity
}

func createLocalCredentialPairingToken(t *testing.T, pairingStore *runtimeauth.Store) string {
	t.Helper()
	_, pairingToken, err := pairingStore.CreatePairingToken(context.Background())
	if err != nil {
		t.Fatalf("CreatePairingToken: %v", err)
	}
	return pairingToken
}

func enrollLocalCredentialTestDevice(t *testing.T, service *Service, pairingToken string, now time.Time) EnrollResponse {
	t.Helper()
	enrolled, err := service.Enroll(context.Background(), EnrollRequest{
		ClientDisplayName: "Test desktop",
		PairingToken:      pairingToken,
	}, 10)
	if err != nil {
		t.Fatalf("Enroll: %v", err)
	}
	if enrolled.UserID != "user-local-test" || enrolled.DeviceID == "" || enrolled.DeviceSecret == "" {
		t.Fatalf("enrollment identity = %+v", enrolled)
	}
	if enrolled.RuntimeCredential.ExpiresAt != now.Add(time.Minute).Format(time.RFC3339Nano) {
		t.Fatalf("first credential expiry = %s", enrolled.RuntimeCredential.ExpiresAt)
	}
	return enrolled
}

func refreshLocalCredentialTestDevice(t *testing.T, service *Service, enrolled EnrollResponse, now time.Time) RuntimeCredentialResponse {
	t.Helper()
	refreshed, err := service.Refresh(context.Background(), RefreshRequest{
		DeviceID:     enrolled.DeviceID,
		DeviceSecret: enrolled.DeviceSecret,
		RuntimeID:    enrolled.RuntimeID,
	})
	if err != nil {
		t.Fatalf("Refresh: %v", err)
	}
	if refreshed.Token == enrolled.RuntimeCredential.Token {
		t.Fatal("refresh returned the original signed credential")
	}
	if refreshed.ExpiresAt != now.Add(time.Minute).Format(time.RFC3339Nano) {
		t.Fatalf("refreshed credential expiry = %s", refreshed.ExpiresAt)
	}
	return refreshed
}

func verifyRefreshedLocalCredential(t *testing.T, service *Service, refreshed RuntimeCredentialResponse, deviceID string, runtimeName string) {
	t.Helper()
	verified, ok, err := service.VerifyRuntimeAccessCredential(context.Background(), refreshed.Token)
	if err != nil || !ok || verified.Claims.DeviceID != deviceID || verified.Claims.CredentialEpoch != 1 || verified.Claims.RuntimeName != runtimeName {
		t.Fatalf("verify refreshed credential ok=%v claims=%+v err=%v", ok, verified.Claims, err)
	}
}

func assertLocalCredentialPairingReplayRejected(t *testing.T, service *Service, pairingToken string) {
	t.Helper()
	if _, err := service.Enroll(context.Background(), EnrollRequest{ClientDisplayName: "Replay", PairingToken: pairingToken}, 10); !errors.Is(err, ErrInvalidPairingToken) {
		t.Fatalf("replayed enrollment error = %v", err)
	}
}
