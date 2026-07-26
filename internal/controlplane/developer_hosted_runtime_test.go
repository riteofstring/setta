package controlplane

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"setta/internal/runtimeaccess"
)

const developerHostedTestDeviceSecret = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

func TestDeveloperHostedRuntimeSurvivesRestartAndAutomaticallyExpires(t *testing.T) {
	root := t.TempDir()
	now := time.Date(2026, 7, 27, 14, 0, 0, 0, time.UTC)
	clock := func() time.Time { return now }
	store := openTestStore(t, filepath.Join(root, "control-plane"), clock, RateLimit{})
	secrets := openDeveloperHostedTestSecrets(t, root)
	coordinator := newDeveloperHostedTestCoordinator(t, store, secrets)
	assertDeveloperHostedInitialState(t, store, coordinator, now)
	assertDeveloperHostedConnectionAndRotation(t, store, secrets, coordinator)

	if err := store.Close(); err != nil {
		t.Fatalf("close store: %v", err)
	}
	store = openTestStore(t, filepath.Join(root, "control-plane"), clock, RateLimit{})
	defer store.Close()
	coordinator = newDeveloperHostedTestCoordinator(t, store, secrets)
	assertDeveloperHostedRestart(t, coordinator)
	now = now.Add(DefaultDeveloperHostedRuntimeSessionDuration)
	assertDeveloperHostedExpiry(t, store, secrets, coordinator)
}

func assertDeveloperHostedInitialState(
	t *testing.T,
	store *Store,
	coordinator *DeveloperHostedRuntimeCoordinator,
	now time.Time,
) {
	t.Helper()
	ctx := context.Background()
	initial, err := coordinator.Ensure(ctx, EnsureDeveloperHostedRuntimeRequest{
		OperationID: "developer-ensure-one",
	})
	if err != nil {
		t.Fatalf("Ensure: %v", err)
	}
	if initial.Phase != DeveloperHostedRuntimePreparing ||
		initial.DeletionScheduledAt != timestamp(now.Add(DefaultDeveloperHostedRuntimeSessionDuration)) {
		t.Fatalf("initial status = %+v", initial)
	}
	runtime, err := store.Runtime(ctx, coordinator.runtimeName)
	if err != nil || runtime.AccessState != RuntimeAccessSuspended ||
		runtime.DeletionScheduledAt == nil {
		t.Fatalf("runtime with safe expiry = %+v, %v", runtime, err)
	}
	if _, err := coordinator.Ensure(ctx, EnsureDeveloperHostedRuntimeRequest{
		OperationID: "developer-ensure-other",
	}); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("second active ensure error = %v, want ErrIdempotencyConflict", err)
	}
}

func assertDeveloperHostedConnectionAndRotation(
	t *testing.T,
	store *Store,
	secrets MutableSecretStore,
	coordinator *DeveloperHostedRuntimeCoordinator,
) {
	t.Helper()
	ctx := context.Background()
	activateDeveloperHostedRuntime(t, store, secrets, coordinator, "developer-ensure-one")
	bootstrap, err := coordinator.Bootstrap(ctx)
	if err != nil {
		t.Fatalf("Bootstrap: %v", err)
	}
	authorization, err := store.AuthorizeClient(ctx, bootstrap.Token)
	if err != nil || authorization.Outcome != runtimeaccess.AuthorizationAllowed {
		t.Fatalf("bootstrap authorization = %+v, %v", authorization, err)
	}
	connected, err := coordinator.ConfirmConnected(ctx, "runtime-registry-one")
	if err != nil {
		t.Fatalf("ConfirmConnected: %v", err)
	}
	if connected.Phase != DeveloperHostedRuntimeConnected ||
		connected.TerminalOutcome == nil ||
		*connected.TerminalOutcome != DeveloperHostedRuntimeTerminalConnected {
		t.Fatalf("connected status = %+v", connected)
	}
	rotated, err := coordinator.RotateCredential(
		ctx,
		"device-registry-one",
		developerHostedTestDeviceSecret,
		"runtime-registry-one",
	)
	if err != nil || rotated.Token == "desktop-runtime-token" {
		t.Fatalf("RotateCredential = %+v, %v", rotated, err)
	}
	oldAuthorization, err := store.AuthorizeClient(ctx, developerHostedTestDeviceSecret)
	if err != nil || oldAuthorization.Outcome != runtimeaccess.AuthorizationUnauthorized {
		t.Fatalf("old authorization after rotation = %+v, %v", oldAuthorization, err)
	}
	newAuthorization, err := store.AuthorizeClient(ctx, rotated.Token)
	if err != nil || newAuthorization.Outcome != runtimeaccess.AuthorizationAllowed {
		t.Fatalf("new authorization after rotation = %+v, %v", newAuthorization, err)
	}
}

func assertDeveloperHostedRestart(
	t *testing.T,
	coordinator *DeveloperHostedRuntimeCoordinator,
) {
	t.Helper()
	ctx := context.Background()
	recovered, err := coordinator.Status(ctx)
	if err != nil || recovered.Phase != DeveloperHostedRuntimeConnected ||
		recovered.LastConnectedAt == nil {
		t.Fatalf("recovered status = %+v, %v", recovered, err)
	}
}

func assertDeveloperHostedExpiry(
	t *testing.T,
	store *Store,
	secrets MutableSecretStore,
	coordinator *DeveloperHostedRuntimeCoordinator,
) {
	t.Helper()
	ctx := context.Background()
	expiring, err := coordinator.Status(ctx)
	if err != nil || expiring.Phase != DeveloperHostedRuntimeDestroying ||
		expiring.OperationKind != DeveloperHostedRuntimeDestroy {
		t.Fatalf("automatic expiry status = %+v, %v", expiring, err)
	}
	claim, found, err := store.ClaimRuntimeDeletionOperation(ctx, "developer-test-worker", time.Minute)
	if err != nil || !found {
		t.Fatalf("ClaimRuntimeDeletionOperation = %+v, %t, %v", claim, found, err)
	}
	if err := store.CompleteRuntimeDeletionOperation(ctx, claim); err != nil {
		t.Fatalf("CompleteRuntimeDeletionOperation: %v", err)
	}
	removed, err := coordinator.Status(ctx)
	if err != nil || removed.Phase != DeveloperHostedRuntimeRemoved ||
		removed.TerminalOutcome == nil ||
		*removed.TerminalOutcome != DeveloperHostedRuntimeTerminalRemoved {
		t.Fatalf("removed status = %+v, %v", removed, err)
	}
	if err := coordinator.FinalizeRemoval(ctx); err != nil {
		t.Fatalf("FinalizeRemoval: %v", err)
	}
	if _, err := secrets.ReadSecret(ctx, coordinator.innerCredentialSecretRef()); !errors.Is(err, ErrNotFound) {
		t.Fatalf("inner credential after removal error = %v, want ErrNotFound", err)
	}
}

func TestDeveloperHostedRuntimeDestroyIsIdempotent(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	now := time.Date(2026, 7, 27, 15, 0, 0, 0, time.UTC)
	store := openTestStore(t, filepath.Join(root, "control-plane"), func() time.Time { return now }, RateLimit{})
	defer store.Close()
	secrets := openDeveloperHostedTestSecrets(t, root)
	coordinator := newDeveloperHostedTestCoordinator(t, store, secrets)
	if _, err := coordinator.Ensure(ctx, EnsureDeveloperHostedRuntimeRequest{
		OperationID: "developer-ensure-destroy",
	}); err != nil {
		t.Fatalf("Ensure: %v", err)
	}

	request := DestroyDeveloperHostedRuntimeRequest{OperationID: "developer-destroy-one"}
	first, err := coordinator.Destroy(ctx, request)
	if err != nil || first.Phase != DeveloperHostedRuntimeDestroying {
		t.Fatalf("first Destroy = %+v, %v", first, err)
	}
	replayed, err := coordinator.Destroy(ctx, request)
	if err != nil || replayed.OperationID != first.OperationID ||
		replayed.Cursor != first.Cursor {
		t.Fatalf("replayed Destroy = %+v, %v; want %+v", replayed, err, first)
	}
	if _, err := coordinator.Destroy(ctx, DestroyDeveloperHostedRuntimeRequest{
		OperationID: "developer-destroy-other",
	}); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("conflicting Destroy error = %v, want ErrIdempotencyConflict", err)
	}
}

func newDeveloperHostedTestCoordinator(
	t *testing.T,
	store *Store,
	secrets MutableSecretStore,
) *DeveloperHostedRuntimeCoordinator {
	t.Helper()
	coordinator, err := NewDeveloperHostedRuntimeCoordinator(
		DeveloperHostedRuntimeCoordinatorConfig{
			AutomaticDeletionWhileOffline: true,
			BudgetUSDMicros:               DefaultDeveloperHostedRuntimeBudgetUSDMicros,
			CutoffExposureUSDMicros:       100_000,
			EnvironmentID:                 "developer-test-environment",
			GatewayBaseURL:                "https://runtime.test.invalid/",
			MaximumCutoffLag:              time.Minute,
			Release:                       "developer-test-release",
			Resources:                     testRuntimeResources(),
			SafetyReserveUSDMicros:        100_000,
			Secrets:                       secrets,
			SessionDuration:               DefaultDeveloperHostedRuntimeSessionDuration,
			Store:                         store,
			UserID:                        "developer-test-user",
		},
	)
	if err != nil {
		t.Fatalf("NewDeveloperHostedRuntimeCoordinator: %v", err)
	}
	return coordinator
}

func openDeveloperHostedTestSecrets(t *testing.T, root string) *FileSecretStore {
	t.Helper()
	secrets, err := OpenFileSecretStore(filepath.Join(root, "secrets"))
	if err != nil {
		t.Fatalf("OpenFileSecretStore: %v", err)
	}
	return secrets
}

func activateDeveloperHostedRuntime(
	t *testing.T,
	store *Store,
	secrets MutableSecretStore,
	coordinator *DeveloperHostedRuntimeCoordinator,
	operationID string,
) {
	t.Helper()
	ctx := context.Background()
	claim, found, err := store.ClaimRuntimeOperation(ctx, "developer-test-worker", time.Minute)
	if err != nil || !found {
		t.Fatalf("ClaimRuntimeOperation = %+v, %t, %v", claim, found, err)
	}
	if err := store.appendClaimedRuntimeProgress(ctx, claim, RuntimeProgressInstalling); err != nil {
		t.Fatalf("append installing progress: %v", err)
	}
	runtime, err := store.Runtime(ctx, coordinator.runtimeName)
	if err != nil {
		t.Fatalf("Runtime: %v", err)
	}
	if err := secrets.WriteSecret(ctx, runtime.CredentialSecretRef, []byte("inner-token")); err != nil {
		t.Fatalf("write inner credential: %v", err)
	}
	if _, err := store.AssignRuntime(ctx, AssignRuntimeRequest{
		IdempotencyKey:      "developer-activate-test",
		UserID:              coordinator.userID,
		RuntimeName:         coordinator.runtimeName,
		Lifecycle:           RuntimeLifecycleReady,
		AccessState:         RuntimeAccessEnabled,
		HealthState:         RuntimeHealthHealthy,
		CredentialEpoch:     1,
		UpstreamAuthority:   "127.0.0.1:7345",
		CredentialSecretRef: runtime.CredentialSecretRef,
		DesiredRelease:      coordinator.release,
		ObservedRelease:     coordinator.release,
		Resources:           coordinator.resources,
	}); err != nil {
		t.Fatalf("AssignRuntime: %v", err)
	}
	created, err := store.EnsureDeviceGrant(ctx, EnsureDeviceGrantRequest{
		Credential: DeviceCredential{
			DeviceID: "device-registry-one",
			Token:    developerHostedTestDeviceSecret,
		},
		UserID:      coordinator.userID,
		RuntimeName: coordinator.runtimeName,
		DisplayName: "Developer hosted test desktop",
		GrantTTL:    time.Hour,
	})
	if err != nil {
		t.Fatalf("EnsureDeviceGrant: %v", err)
	}
	bootstrap := DeveloperHostedRuntimeBootstrap{
		BaseURL:         coordinator.gatewayBaseURL,
		DeviceID:        "device-registry-one",
		DeviceSecret:    developerHostedTestDeviceSecret,
		ExpiresAt:       timestamp(store.clock().UTC().Add(time.Hour)),
		ProtocolVersion: 1,
		RuntimeID:       "runtime-registry-one",
		Token:           created.Token,
		UserID:          coordinator.userID,
	}
	encoded, err := json.Marshal(bootstrap)
	if err != nil {
		t.Fatalf("marshal bootstrap: %v", err)
	}
	const bootstrapSecretRef = "developer-hosted-test-bootstrap"
	if err := secrets.WriteSecret(ctx, bootstrapSecretRef, encoded); err != nil {
		t.Fatalf("write bootstrap: %v", err)
	}
	if err := store.RecordDeveloperHostedRuntimeActivation(
		ctx,
		coordinator.environmentID,
		bootstrap.RuntimeID,
		bootstrapSecretRef,
		bootstrap.DeviceID,
		bootstrap.DeviceSecret,
	); err != nil {
		t.Fatalf("RecordDeveloperHostedRuntimeActivation: %v", err)
	}
	if err := store.completeRuntimeOperation(
		ctx,
		claim,
		authenticatedTestObservation(t, coordinator.runtimeName),
		RuntimeProgressConnecting,
	); err != nil {
		t.Fatalf("complete connecting operation: %v", err)
	}
	status, err := coordinator.Status(ctx)
	if err != nil || status.OperationID != operationID ||
		status.Phase != DeveloperHostedRuntimeConnecting {
		t.Fatalf("connecting status = %+v, %v", status, err)
	}
}
