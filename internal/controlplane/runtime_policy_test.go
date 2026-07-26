package controlplane

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"setta/internal/runtimeaccess"
)

func TestRuntimePolicyStateRemainsIndependentAndSurvivesRestart(t *testing.T) {
	fixture := newRuntimePolicyFixture(t)
	verifyEntitlementPolicy(t, fixture)
	verifyReleasePolicy(t, fixture)
	verifyWakePolicy(t, fixture)
	verifyDeletionPolicy(t, fixture)
	verifyRestartedRuntimePolicy(t, fixture)
}

type runtimePolicyFixture struct {
	directory   string
	grant       CreatedDeviceGrant
	now         time.Time
	runtimeName string
	store       *Store
}

func newRuntimePolicyFixture(t *testing.T) *runtimePolicyFixture {
	t.Helper()
	ctx := context.Background()
	fixture := &runtimePolicyFixture{
		directory:   t.TempDir(),
		now:         time.Date(2026, 7, 24, 15, 0, 0, 0, time.UTC),
		runtimeName: testRuntimeName(t, "independent-policy"),
	}
	fixture.store = openTestStore(t, fixture.directory, func() time.Time {
		return fixture.now
	}, RateLimit{})
	if _, err := fixture.store.UpsertUser(ctx, "user-policy-state"); err != nil {
		t.Fatal(err)
	}
	assigned := testAssignment("assign-policy-state", "user-policy-state", fixture.runtimeName, "policy_secret")
	assigned.DesiredRelease = "release-1"
	assigned.ObservedRelease = "release-1"
	if _, err := fixture.store.AssignRuntime(ctx, assigned); err != nil {
		t.Fatal(err)
	}
	grant, err := fixture.store.CreateDeviceGrant(ctx, CreateDeviceGrantRequest{
		UserID:      "user-policy-state",
		RuntimeName: fixture.runtimeName,
		DisplayName: "Policy phone",
		GrantTTL:    4 * time.Hour,
	})
	if err != nil {
		t.Fatal(err)
	}
	fixture.grant = grant
	return fixture
}

func verifyEntitlementPolicy(t *testing.T, fixture *runtimePolicyFixture) {
	t.Helper()
	ctx := context.Background()
	entitlement, err := fixture.store.Entitlement(ctx, "user-policy-state")
	if err != nil || entitlement.State != EntitlementActive || entitlement.GraceEndsAt != nil {
		t.Fatalf("default entitlement = %+v, %v", entitlement, err)
	}
	firstAuthorization := requireAuthorizationOutcome(
		t,
		fixture.store,
		fixture.grant.Token,
		runtimeaccess.AuthorizationAllowed,
	)
	graceEndsAt := fixture.now.Add(time.Hour)
	entitlement, err = fixture.store.UpdateEntitlement(ctx, UpdateEntitlementRequest{
		UserID:      "user-policy-state",
		State:       EntitlementGrace,
		GraceEndsAt: &graceEndsAt,
	})
	if err != nil || entitlement.State != EntitlementGrace ||
		entitlement.GraceEndsAt == nil || !entitlement.GraceEndsAt.Equal(graceEndsAt) {
		t.Fatalf("grace entitlement = %+v, %v", entitlement, err)
	}
	select {
	case <-firstAuthorization.Invalidated:
	default:
		t.Fatal("entitlement change did not invalidate an active authorization")
	}
	requireAuthorizationOutcome(t, fixture.store, fixture.grant.Token, runtimeaccess.AuthorizationAllowed)
	fixture.now = graceEndsAt
	requireAuthorizationOutcome(t, fixture.store, fixture.grant.Token, runtimeaccess.AuthorizationSuspended)
	fixture.now = graceEndsAt.Add(time.Minute)
	if _, err := fixture.store.UpdateEntitlement(ctx, UpdateEntitlementRequest{
		UserID: "user-policy-state",
		State:  EntitlementActive,
	}); err != nil {
		t.Fatal(err)
	}
}

func verifyReleasePolicy(t *testing.T, fixture *runtimePolicyFixture) {
	t.Helper()
	ctx := context.Background()
	runtimeRecord, err := fixture.store.SetDesiredRuntimeRelease(ctx, fixture.runtimeName, "release-2")
	if err != nil || runtimeRecord.ReleaseStatus() != RuntimeReleaseMismatch ||
		runtimeRecord.HealthState != RuntimeHealthHealthy ||
		runtimeRecord.Lifecycle != RuntimeLifecycleReady {
		t.Fatalf("release mismatch state = %+v, %v", runtimeRecord, err)
	}
	if _, err := fixture.store.ResolveRoute(ctx, fixture.runtimeName); !errors.Is(err, ErrNotFound) {
		t.Fatalf("mismatched release route error = %v, want ErrNotFound", err)
	}
	health, err := fixture.store.RecordRuntimeHealth(ctx, RecordRuntimeHealthRequest{
		RuntimeName:     fixture.runtimeName,
		HealthState:     RuntimeHealthHealthy,
		ObservedRelease: "release-2",
	})
	runtimeRecord = health.Runtime
	if err != nil || runtimeRecord.ReleaseStatus() != RuntimeReleaseCurrent ||
		runtimeRecord.LastReadyAt == nil || !runtimeRecord.LastReadyAt.Equal(fixture.now) {
		t.Fatalf("current release health = %+v, %v", runtimeRecord, err)
	}
}

func verifyWakePolicy(t *testing.T, fixture *runtimePolicyFixture) {
	t.Helper()
	ctx := context.Background()
	runtimeRecord, err := fixture.store.RequestRuntimeWake(ctx, "wake-policy-state", fixture.runtimeName)
	if err != nil || runtimeRecord.WakeRequestedAt == nil ||
		runtimeRecord.HealthState != RuntimeHealthHealthy ||
		runtimeRecord.Lifecycle != RuntimeLifecycleReady ||
		runtimeRecord.AccessState != RuntimeAccessEnabled {
		t.Fatalf("wake request state = %+v, %v", runtimeRecord, err)
	}
	replayed, err := fixture.store.RequestRuntimeWake(ctx, "wake-policy-state", fixture.runtimeName)
	if err != nil || replayed.WakeRequestedAt == nil ||
		!replayed.WakeRequestedAt.Equal(*runtimeRecord.WakeRequestedAt) {
		t.Fatalf("replayed wake request = %+v, %v", replayed, err)
	}
	if _, err := fixture.store.AssignRuntime(ctx, testAssignment(
		"wake-policy-state",
		"user-policy-state",
		fixture.runtimeName,
		"policy_secret",
	)); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("cross-kind idempotency error = %v, want ErrIdempotencyConflict", err)
	}
	fixture.now = fixture.now.Add(time.Minute)
	if _, err := fixture.store.RecordRuntimeHealth(ctx, RecordRuntimeHealthRequest{
		RuntimeName:     fixture.runtimeName,
		HealthState:     RuntimeHealthHealthy,
		ObservedRelease: "release-2",
	}); err != nil {
		t.Fatal(err)
	}
}

func verifyDeletionPolicy(t *testing.T, fixture *runtimePolicyFixture) {
	t.Helper()
	ctx := context.Background()
	deletionAt := fixture.now.Add(7 * 24 * time.Hour)
	runtimeRecord, err := fixture.store.ScheduleRuntimeDeletion(ctx, ScheduleRuntimeDeletionRequest{
		IdempotencyKey: "delete-policy-state",
		RuntimeName:    fixture.runtimeName,
		ScheduledAt:    deletionAt,
	})
	if err != nil || runtimeRecord.AccessState != RuntimeAccessEnabled ||
		runtimeRecord.DeletionScheduledAt == nil ||
		!runtimeRecord.DeletionScheduledAt.Equal(deletionAt) ||
		runtimeRecord.Lifecycle != RuntimeLifecycleReady {
		t.Fatalf("deletion schedule state = %+v, %v", runtimeRecord, err)
	}
	requireAuthorizationOutcome(t, fixture.store, fixture.grant.Token, runtimeaccess.AuthorizationAllowed)
	if err := fixture.store.SetRuntimeAccessState(
		ctx,
		fixture.runtimeName,
		RuntimeAccessEnabled,
	); err != nil {
		t.Fatalf("preserve enabled access during scheduled deletion: %v", err)
	}
	runtimeRecord, err = fixture.store.Runtime(ctx, fixture.runtimeName)
	if err != nil || runtimeRecord.DeletionScheduledAt == nil ||
		!runtimeRecord.DeletionScheduledAt.Equal(deletionAt) {
		t.Fatalf("generic access transition changed deletion schedule = %+v, %v", runtimeRecord, err)
	}
	runtimeRecord, err = fixture.store.CancelRuntimeDeletion(
		ctx,
		fixture.runtimeName,
		RuntimeAccessEnabled,
	)
	if err != nil {
		t.Fatal(err)
	}
	if runtimeRecord.DeletionScheduledAt != nil ||
		runtimeRecord.AccessState != RuntimeAccessEnabled {
		t.Fatalf("cleared deletion schedule = %+v", runtimeRecord)
	}
	requireAuthorizationOutcome(t, fixture.store, fixture.grant.Token, runtimeaccess.AuthorizationAllowed)
}

func verifyRestartedRuntimePolicy(t *testing.T, fixture *runtimePolicyFixture) {
	t.Helper()
	ctx := context.Background()
	if err := fixture.store.Close(); err != nil {
		t.Fatal(err)
	}
	fixture.store = openTestStore(t, fixture.directory, func() time.Time {
		return fixture.now
	}, RateLimit{})
	defer fixture.store.Close()
	runtimeRecord, err := fixture.store.Runtime(ctx, fixture.runtimeName)
	if err != nil || runtimeRecord.ReleaseStatus() != RuntimeReleaseCurrent ||
		runtimeRecord.HealthState != RuntimeHealthHealthy ||
		runtimeRecord.WakeRequestedAt != nil ||
		runtimeRecord.DeletionScheduledAt != nil {
		t.Fatalf("restarted runtime policy = %+v, %v", runtimeRecord, err)
	}
	entitlement, err := fixture.store.Entitlement(ctx, "user-policy-state")
	if err != nil || entitlement.State != EntitlementActive || entitlement.GraceEndsAt != nil {
		t.Fatalf("restarted entitlement = %+v, %v", entitlement, err)
	}
	requireAuthorizationOutcome(t, fixture.store, fixture.grant.Token, runtimeaccess.AuthorizationAllowed)
}

func TestRuntimePolicyRejectsInvalidTransitionsAndOldSchema(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 24, 15, 0, 0, 0, time.UTC)
	store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{})
	defer store.Close()
	runtimeName := testRuntimeName(t, "invalid-policy")
	if _, err := store.UpsertUser(ctx, "user-invalid-policy"); err != nil {
		t.Fatal(err)
	}
	invalidReady := testAssignment("invalid-ready", "user-invalid-policy", runtimeName, "invalid_secret")
	invalidReady.HealthState = RuntimeHealthUnknown
	if _, err := store.AssignRuntime(ctx, invalidReady); err == nil {
		t.Fatal("ready runtime accepted unknown health")
	}
	for _, request := range []UpdateEntitlementRequest{
		{UserID: "user-invalid-policy", State: EntitlementGrace},
		{UserID: "user-invalid-policy", State: EntitlementGrace, GraceEndsAt: &now},
		{UserID: "user-invalid-policy", State: EntitlementActive, GraceEndsAt: timePointer(now.Add(time.Hour))},
	} {
		if _, err := store.UpdateEntitlement(ctx, request); err == nil {
			t.Fatalf("invalid entitlement accepted: %+v", request)
		}
	}
	if _, err := store.ScheduleRuntimeDeletion(ctx, ScheduleRuntimeDeletionRequest{
		IdempotencyKey: "invalid-deletion",
		RuntimeName:    runtimeName,
		ScheduledAt:    now,
	}); err == nil {
		t.Fatal("non-future deletion schedule accepted")
	}
	if _, err := store.RecordRuntimeHealth(ctx, RecordRuntimeHealthRequest{
		RuntimeName: runtimeName,
		HealthState: RuntimeHealthHealthy,
	}); err == nil {
		t.Fatal("healthy observation without release accepted")
	}

	oldDirectory := t.TempDir()
	oldStore := openTestStore(t, oldDirectory, func() time.Time { return now }, RateLimit{})
	if _, err := oldStore.db.ExecContext(ctx, "PRAGMA user_version = 4"); err != nil {
		t.Fatal(err)
	}
	if err := oldStore.Close(); err != nil {
		t.Fatal(err)
	}
	if reopened, err := OpenStore(StoreConfig{Directory: filepath.Clean(oldDirectory)}); err == nil {
		reopened.Close()
		t.Fatal("version 4 control-plane database was silently migrated")
	}
}

func TestEntitlementGraceExpiryPushesAuthorizationInvalidation(t *testing.T) {
	store := openTestStore(t, t.TempDir(), time.Now, RateLimit{})
	defer store.Close()
	runtimeName := testRuntimeName(t, "grace-expiry-push")
	if _, err := store.UpsertUser(t.Context(), "user-grace-expiry"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.AssignRuntime(t.Context(), testAssignment(
		"assign-grace-expiry",
		"user-grace-expiry",
		runtimeName,
		"grace_expiry_secret",
	)); err != nil {
		t.Fatal(err)
	}
	grant, err := store.CreateDeviceGrant(t.Context(), CreateDeviceGrantRequest{
		UserID:      "user-grace-expiry",
		RuntimeName: runtimeName,
		DisplayName: "Grace expiry phone",
		GrantTTL:    time.Hour,
	})
	if err != nil {
		t.Fatal(err)
	}
	graceEndsAt := time.Now().Add(500 * time.Millisecond)
	if _, err := store.UpdateEntitlement(t.Context(), UpdateEntitlementRequest{
		UserID:      "user-grace-expiry",
		State:       EntitlementGrace,
		GraceEndsAt: &graceEndsAt,
	}); err != nil {
		t.Fatal(err)
	}
	authorization := requireAuthorizationOutcome(
		t,
		store,
		grant.Token,
		runtimeaccess.AuthorizationAllowed,
	)
	select {
	case <-authorization.Invalidated:
	case <-time.After(3 * time.Second):
		t.Fatal("grace expiry did not push authorization invalidation")
	}
	requireAuthorizationOutcome(t, store, grant.Token, runtimeaccess.AuthorizationSuspended)
}

func timePointer(value time.Time) *time.Time {
	return &value
}
