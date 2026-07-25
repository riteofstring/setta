package controlplane

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"setta/internal/runtimeaccess"
	"setta/internal/runtimeprovider"

	_ "modernc.org/sqlite"
)

func TestStorePersistsAssignmentsAndCredentialsAcrossRestart(t *testing.T) {
	ctx := context.Background()
	directory := t.TempDir()
	now := time.Date(2026, 7, 20, 12, 0, 0, 0, time.UTC)
	store := openTestStore(t, directory, func() time.Time { return now }, RateLimit{})
	firstRuntime := testRuntimeName(t, "persistent-first")
	secondRuntime := testRuntimeName(t, "persistent-second")

	if _, err := store.UpsertUser(ctx, "user-persistent"); err != nil {
		t.Fatalf("UpsertUser: %v", err)
	}
	first := assignTestRuntime(t, store, "assign-first", "user-persistent", firstRuntime, "credential-first")
	replayed := assignTestRuntime(t, store, "assign-first", "user-persistent", firstRuntime, "credential-first")
	if !reflect.DeepEqual(replayed, first) {
		t.Fatalf("replayed runtime = %+v, want %+v", replayed, first)
	}
	changedReplay := testAssignment("assign-first", "user-persistent", firstRuntime, "credential-changed")
	if _, err := store.AssignRuntime(ctx, changedReplay); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("changed idempotent assignment error = %v", err)
	}
	created, err := store.CreateDeviceGrant(ctx, CreateDeviceGrantRequest{
		UserID:      "user-persistent",
		RuntimeName: firstRuntime,
		DisplayName: "Persistent phone",
	})
	if err != nil {
		t.Fatalf("CreateDeviceGrant: %v", err)
	}
	assignTestRuntime(t, store, "assign-second", "user-persistent", secondRuntime, "credential-second")
	if _, err := store.ResolveRoute(ctx, firstRuntime); !errors.Is(err, ErrNotFound) {
		t.Fatalf("ResolveRoute old runtime error = %v, want ErrNotFound", err)
	}
	var runtimeCount int
	if err := store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM runtimes WHERE user_id = ?`, "user-persistent").Scan(&runtimeCount); err != nil {
		t.Fatalf("count runtimes: %v", err)
	}
	if runtimeCount != 2 {
		t.Fatalf("runtime count = %d, want 2", runtimeCount)
	}
	if err := store.Close(); err != nil {
		t.Fatalf("close store: %v", err)
	}

	restarted := openTestStore(t, directory, func() time.Time { return now }, RateLimit{})
	defer restarted.Close()
	result, err := restarted.AuthorizeClient(ctx, created.Token)
	if err != nil {
		t.Fatalf("AuthorizeClient after restart: %v", err)
	}
	if result.Outcome != runtimeaccess.AuthorizationUnauthorized {
		t.Fatalf("authorization after reassignment = %+v, want unauthorized without a second-runtime grant", result)
	}
	secondGrant, err := restarted.CreateDeviceGrant(ctx, CreateDeviceGrantRequest{
		UserID:      "user-persistent",
		RuntimeName: secondRuntime,
		DisplayName: "Restarted phone",
	})
	if err != nil {
		t.Fatalf("CreateDeviceGrant after restart: %v", err)
	}
	result, err = restarted.AuthorizeClient(ctx, secondGrant.Token)
	if err != nil || result.Outcome != runtimeaccess.AuthorizationAllowed || result.RuntimeName != secondRuntime {
		t.Fatalf("authorization after restart = %+v, %v", result, err)
	}
}

func TestStoreRejectsUnversionedExistingSchema(t *testing.T) {
	directory := t.TempDir()
	db, err := sql.Open(sqliteDriverName, filepath.Join(directory, controlPlaneDatabaseName))
	if err != nil {
		t.Fatalf("open fixture database: %v", err)
	}
	if _, err := db.Exec("CREATE TABLE obsolete_state (id TEXT PRIMARY KEY)"); err != nil {
		t.Fatalf("create obsolete schema: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close fixture database: %v", err)
	}

	_, err = OpenStore(StoreConfig{Directory: directory})
	if err == nil || !strings.Contains(err.Error(), "unversioned control-plane database is not empty") {
		t.Fatalf("OpenStore error = %v, want unversioned schema error", err)
	}
}

func TestStoreRejectsRuntimeOwnerAndIdempotencyConflicts(t *testing.T) {
	ctx := context.Background()
	store := openTestStore(t, t.TempDir(), time.Now, RateLimit{})
	defer store.Close()
	runtimeName := testRuntimeName(t, "owner-conflict")
	for _, userID := range []string{"user-one", "user-two"} {
		if _, err := store.UpsertUser(ctx, userID); err != nil {
			t.Fatalf("UpsertUser %s: %v", userID, err)
		}
	}
	assignTestRuntime(t, store, "assignment-one", "user-one", runtimeName, "credential-one")
	request := testAssignment("assignment-two", "user-two", runtimeName, "credential-two")
	if _, err := store.AssignRuntime(ctx, request); err == nil {
		t.Fatal("AssignRuntime accepted a runtime owned by another user")
	}
	userTwo, err := store.readUserLocked(ctx, "user-two")
	if err != nil {
		t.Fatalf("read user two: %v", err)
	}
	if userTwo.ActiveRuntimeName != "" {
		t.Fatalf("user two active runtime = %q after rejected assignment", userTwo.ActiveRuntimeName)
	}
	otherRuntime := testRuntimeName(t, "idempotency-conflict")
	if _, err := store.AssignRuntime(ctx, testAssignment("assignment-one", "user-one", otherRuntime, "credential-three")); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("idempotency conflict error = %v", err)
	}
}

func TestStoreAuthorizationPushInvalidationAndDurableRateLimit(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 20, 12, 0, 0, 0, time.UTC)
	store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{
		MaximumRequests: 2,
		Window:          time.Minute,
	})
	defer store.Close()
	runtimeName := testRuntimeName(t, "authorization")
	if _, err := store.UpsertUser(ctx, "user-authorization"); err != nil {
		t.Fatalf("UpsertUser: %v", err)
	}
	assignTestRuntime(t, store, "assign-authorization", "user-authorization", runtimeName, "credential-authorization")
	created, err := store.CreateDeviceGrant(ctx, CreateDeviceGrantRequest{
		UserID:      "user-authorization",
		RuntimeName: runtimeName,
		DisplayName: "Authorization phone",
	})
	if err != nil {
		t.Fatalf("CreateDeviceGrant: %v", err)
	}
	first := requireAuthorizationOutcome(t, store, created.Token, runtimeaccess.AuthorizationAllowed)
	requireAuthorizationOutcome(t, store, created.Token, runtimeaccess.AuthorizationAllowed)
	requireAuthorizationOutcome(t, store, created.Token, runtimeaccess.AuthorizationRateLimited)
	now = now.Add(time.Minute)
	requireAuthorizationOutcome(t, store, created.Token, runtimeaccess.AuthorizationAllowed)

	if err := store.SetRuntimeAccessState(ctx, runtimeName, RuntimeAccessSuspended); err != nil {
		t.Fatalf("SetRuntimeAccessState: %v", err)
	}
	requireClosed(t, first.Invalidated, "runtime suspension")
	requireAuthorizationOutcome(t, store, created.Token, runtimeaccess.AuthorizationSuspended)
	if err := store.SetRuntimeAccessState(ctx, runtimeName, RuntimeAccessEnabled); err != nil {
		t.Fatalf("enable runtime access: %v", err)
	}
	resumed := requireAuthorizationOutcome(t, store, created.Token, runtimeaccess.AuthorizationAllowed)
	if err := store.RevokeDevice(ctx, created.Device.ID); err != nil {
		t.Fatalf("RevokeDevice: %v", err)
	}
	if err := store.RevokeDevice(ctx, created.Device.ID); err != nil {
		t.Fatalf("idempotent RevokeDevice: %v", err)
	}
	requireClosed(t, resumed.Invalidated, "device revocation")
	requireAuthorizationOutcome(t, store, created.Token, runtimeaccess.AuthorizationRevoked)
}

func TestStoreAssignmentAndCredentialEpochChangesPushInvalidateStreams(t *testing.T) {
	ctx := context.Background()
	store := openTestStore(t, t.TempDir(), time.Now, RateLimit{})
	defer store.Close()
	firstRuntime := testRuntimeName(t, "invalidation-first")
	secondRuntime := testRuntimeName(t, "invalidation-second")
	if _, err := store.UpsertUser(ctx, "user-invalidation"); err != nil {
		t.Fatalf("UpsertUser: %v", err)
	}
	assignTestRuntime(t, store, "assign-invalidation-first", "user-invalidation", firstRuntime, "credential-first")
	firstGrant, err := store.CreateDeviceGrant(ctx, CreateDeviceGrantRequest{
		UserID:      "user-invalidation",
		RuntimeName: firstRuntime,
		DisplayName: "First device",
	})
	if err != nil {
		t.Fatalf("CreateDeviceGrant: %v", err)
	}
	firstAuthorization := requireAuthorizationOutcome(t, store, firstGrant.Token, runtimeaccess.AuthorizationAllowed)
	rotated := testAssignment("rotate-invalidation-first", "user-invalidation", firstRuntime, "credential-first-rotated")
	rotated.CredentialEpoch = 2
	if _, err := store.AssignRuntime(ctx, rotated); err != nil {
		t.Fatalf("rotate runtime credential epoch: %v", err)
	}
	requireClosed(t, firstAuthorization.Invalidated, "credential epoch rotation")
	resumed := requireAuthorizationOutcome(t, store, firstGrant.Token, runtimeaccess.AuthorizationAllowed)
	assignTestRuntime(t, store, "assign-invalidation-second", "user-invalidation", secondRuntime, "credential-second")
	requireClosed(t, resumed.Invalidated, "authoritative runtime replacement")
	requireAuthorizationOutcome(t, store, firstGrant.Token, runtimeaccess.AuthorizationUnauthorized)
}

func TestControlPlaneDatabaseContainsTokenHashNotRawToken(t *testing.T) {
	ctx := context.Background()
	store := openTestStore(t, t.TempDir(), time.Now, RateLimit{})
	defer store.Close()
	runtimeName := testRuntimeName(t, "token-hash")
	if _, err := store.UpsertUser(ctx, "user-token-hash"); err != nil {
		t.Fatalf("UpsertUser: %v", err)
	}
	assignTestRuntime(t, store, "assign-token-hash", "user-token-hash", runtimeName, "credential-token-hash")
	created, err := store.CreateDeviceGrant(ctx, CreateDeviceGrantRequest{
		UserID:      "user-token-hash",
		RuntimeName: runtimeName,
		DisplayName: "Hashed token phone",
	})
	if err != nil {
		t.Fatalf("CreateDeviceGrant: %v", err)
	}
	var stored []byte
	if err := store.db.QueryRowContext(ctx, `SELECT token_hash FROM devices WHERE id = ?`, created.Device.ID).Scan(&stored); err != nil {
		t.Fatalf("read token hash: %v", err)
	}
	if string(stored) == created.Token || len(stored) != 32 {
		t.Fatalf("stored token representation is not a SHA-256 digest")
	}
	entries, err := os.ReadDir(filepath.Dir(store.Path()))
	if err != nil {
		t.Fatalf("read control-plane database directory: %v", err)
	}
	for _, entry := range entries {
		contents, err := os.ReadFile(filepath.Join(filepath.Dir(store.Path()), entry.Name()))
		if err != nil {
			t.Fatalf("read persisted control-plane file: %v", err)
		}
		if bytes.Contains(contents, []byte(created.Token)) {
			t.Fatalf("persisted control-plane file %s contains the raw client token", entry.Name())
		}
	}
}

func openTestStore(t *testing.T, directory string, clock func() time.Time, rateLimit RateLimit) *Store {
	t.Helper()
	store, err := OpenStore(StoreConfig{Clock: clock, Directory: directory, RateLimit: rateLimit})
	if err != nil {
		t.Fatalf("OpenStore: %v", err)
	}
	return store
}

func testRuntimeName(t *testing.T, key string) string {
	t.Helper()
	identity, err := runtimeprovider.NewManagedIdentity(key)
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	return identity.Name
}

func testAssignment(idempotencyKey string, userID string, runtimeName string, secretRef string) AssignRuntimeRequest {
	return AssignRuntimeRequest{
		IdempotencyKey:      idempotencyKey,
		UserID:              userID,
		RuntimeName:         runtimeName,
		Lifecycle:           RuntimeLifecycleReady,
		AccessState:         RuntimeAccessEnabled,
		HealthState:         RuntimeHealthHealthy,
		CredentialEpoch:     1,
		UpstreamAuthority:   "127.0.0.1:7345",
		CredentialSecretRef: secretRef,
		DesiredRelease:      "test-release",
		ObservedRelease:     "test-release",
	}
}

func assignTestRuntime(
	t *testing.T,
	store *Store,
	idempotencyKey string,
	userID string,
	runtimeName string,
	secretRef string,
) Runtime {
	t.Helper()
	runtime, err := store.AssignRuntime(context.Background(), testAssignment(idempotencyKey, userID, runtimeName, secretRef))
	if err != nil {
		t.Fatalf("AssignRuntime: %v", err)
	}
	return runtime
}

func requireAuthorizationOutcome(
	t *testing.T,
	store *Store,
	token string,
	want runtimeaccess.AuthorizationOutcome,
) runtimeaccess.ClientAuthorization {
	t.Helper()
	result, err := store.AuthorizeClient(context.Background(), token)
	if err != nil {
		t.Fatalf("AuthorizeClient: %v", err)
	}
	if result.Outcome != want {
		t.Fatalf("authorization outcome = %q, want %q", result.Outcome, want)
	}
	return result
}

func requireClosed(t *testing.T, channel <-chan struct{}, label string) {
	t.Helper()
	select {
	case <-channel:
	case <-time.After(time.Second):
		t.Fatalf("%s did not close the authorization channel", label)
	}
}
