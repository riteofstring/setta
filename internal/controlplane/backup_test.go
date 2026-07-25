package controlplane

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/runtimeaccess"
)

func TestControlPlaneBackupRestoreRoundTrip(t *testing.T) {
	fixture := newBackupRoundTripFixture(t)
	manifest := createAndVerifyRoundTripBackup(t, fixture)
	restoreAndVerifyRoundTripBackup(t, fixture, manifest)
	if err := fixture.store.Close(); err != nil {
		t.Fatal(err)
	}
}

type backupRoundTripFixture struct {
	backupDirectory string
	grant           CreatedDeviceGrant
	intent          EnsureHostedAccessIntent
	now             time.Time
	root            string
	runtimeName     string
	secrets         *FileSecretStore
	store           *Store
}

func newBackupRoundTripFixture(t *testing.T) backupRoundTripFixture {
	t.Helper()
	root := t.TempDir()
	now := time.Date(2026, time.July, 24, 21, 0, 0, 0, time.UTC)
	store := openTestStore(t, filepath.Join(root, "data"), func() time.Time { return now }, RateLimit{})
	secrets, err := OpenFileSecretStore(filepath.Join(root, "secrets"))
	if err != nil {
		t.Fatal(err)
	}
	runtimeName := testRuntimeName(t, "backup-round-trip")
	if _, err := store.UpsertUser(t.Context(), "user-backup"); err != nil {
		t.Fatal(err)
	}
	if err := secrets.WriteSecret(t.Context(), "runtime_backup", []byte("runtime-secret-value")); err != nil {
		t.Fatal(err)
	}
	if err := secrets.WriteSecret(t.Context(), "unreferenced_secret", []byte("must-not-be-backed-up")); err != nil {
		t.Fatal(err)
	}
	if _, err := store.AssignRuntime(t.Context(), AssignRuntimeRequest{
		IdempotencyKey:      "assign-backup-runtime",
		UserID:              "user-backup",
		RuntimeName:         runtimeName,
		Lifecycle:           RuntimeLifecycleReady,
		AccessState:         RuntimeAccessEnabled,
		CredentialEpoch:     1,
		UpstreamAuthority:   "127.0.0.1:7345",
		CredentialSecretRef: "runtime_backup",
	}); err != nil {
		t.Fatal(err)
	}
	grant, err := store.CreateDeviceGrant(t.Context(), CreateDeviceGrantRequest{
		UserID:      "user-backup",
		RuntimeName: runtimeName,
		DisplayName: "Backup phone",
		GrantTTL:    time.Hour,
	})
	if err != nil {
		t.Fatal(err)
	}
	intent := testHostedAccessIntent()
	intent.IdempotencyKey = "backup-hosted-intent"
	intent.UserID = "user-backup"
	intent.Client.DeviceID = grant.Device.ID
	if _, err := store.EnsureHostedAccessIntent(t.Context(), intent); err != nil {
		t.Fatal(err)
	}
	if _, err := store.CompleteHostedAccessIntent(t.Context(), intent.IdempotencyKey, grant); err != nil {
		t.Fatal(err)
	}
	return backupRoundTripFixture{
		backupDirectory: filepath.Join(root, "backup"),
		grant:           grant,
		intent:          intent,
		now:             now,
		root:            root,
		runtimeName:     runtimeName,
		secrets:         secrets,
		store:           store,
	}
}

func createAndVerifyRoundTripBackup(t *testing.T, fixture backupRoundTripFixture) BackupManifest {
	t.Helper()
	manifest, err := CreateBackup(t.Context(), fixture.store, fixture.secrets, fixture.backupDirectory)
	if err != nil {
		t.Fatal(err)
	}
	requireBackupManifest(t, manifest, fixture.now)
	requirePrivateBackupTree(t, fixture.backupDirectory)
	if _, err := os.Lstat(filepath.Join(
		fixture.backupDirectory,
		controlPlaneBackupSecretsName,
		"unreferenced_secret.secret",
	)); !os.IsNotExist(err) {
		t.Fatalf("unreferenced secret backup error = %v", err)
	}
	manifestBytes, err := os.ReadFile(filepath.Join(fixture.backupDirectory, controlPlaneBackupManifestName))
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(manifestBytes, []byte(fixture.grant.Token)) ||
		bytes.Contains(manifestBytes, []byte("runtime-secret-value")) ||
		bytes.Contains(manifestBytes, []byte("must-not-be-backed-up")) {
		t.Fatal("control-plane backup manifest exposed credential material")
	}
	if _, err := CreateBackup(
		t.Context(),
		fixture.store,
		fixture.secrets,
		fixture.backupDirectory,
	); err == nil {
		t.Fatal("control-plane backup overwrote an existing destination")
	}
	return manifest
}

func restoreAndVerifyRoundTripBackup(
	t *testing.T,
	fixture backupRoundTripFixture,
	manifest BackupManifest,
) {
	t.Helper()
	restoredData := filepath.Join(fixture.root, "restored-data")
	restoredSecrets := filepath.Join(fixture.root, "restored-secrets")
	restoredManifest, err := RestoreBackup(
		t.Context(),
		fixture.backupDirectory,
		restoredData,
		restoredSecrets,
	)
	if err != nil {
		t.Fatal(err)
	}
	if !slicesEqualBackupManifest(restoredManifest, manifest) {
		t.Fatalf("restored manifest = %+v, want %+v", restoredManifest, manifest)
	}
	restoredStore := openTestStore(t, restoredData, func() time.Time { return fixture.now }, RateLimit{})
	defer restoredStore.Close()
	authorization, err := restoredStore.AuthorizeClient(t.Context(), fixture.grant.Token)
	if err != nil || authorization.Outcome != runtimeaccess.AuthorizationAllowed ||
		authorization.RuntimeName != fixture.runtimeName {
		t.Fatalf("restored authorization = %+v, %v", authorization, err)
	}
	progress, err := restoredStore.HostedAccessProgress(t.Context(), fixture.intent.IdempotencyKey)
	if err != nil || progress.State != HostedAccessProgressReadyOnPhone ||
		progress.AccessGrant == nil || progress.AccessGrant.DeviceID != fixture.grant.Device.ID {
		t.Fatalf("restored hosted access progress = %+v, %v", progress, err)
	}
	restoredSecretStore, err := OpenFileSecretStore(restoredSecrets)
	if err != nil {
		t.Fatal(err)
	}
	secret, err := restoredSecretStore.ReadSecret(t.Context(), "runtime_backup")
	if err != nil || string(secret) != "runtime-secret-value" {
		t.Fatalf("restored runtime secret = %q, %v", secret, err)
	}
	if _, err := restoredSecretStore.ReadSecret(t.Context(), "unreferenced_secret"); err != ErrNotFound {
		t.Fatalf("restored unreferenced secret error = %v, want ErrNotFound", err)
	}
	if _, err := RestoreBackup(
		t.Context(),
		fixture.backupDirectory,
		restoredData,
		filepath.Join(fixture.root, "another-secret-restore"),
	); err == nil {
		t.Fatal("control-plane restore overwrote an existing destination")
	}
}

func TestControlPlaneBackupRejectsMissingReferencedSecret(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	store := openTestStore(t, filepath.Join(root, "data"), time.Now, RateLimit{})
	defer store.Close()
	secrets, err := OpenFileSecretStore(filepath.Join(root, "secrets"))
	if err != nil {
		t.Fatal(err)
	}
	runtimeName := testRuntimeName(t, "backup-missing-secret")
	if _, err := store.UpsertUser(ctx, "user-missing-secret"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.AssignRuntime(ctx, AssignRuntimeRequest{
		IdempotencyKey:      "assign-missing-secret",
		UserID:              "user-missing-secret",
		RuntimeName:         runtimeName,
		Lifecycle:           RuntimeLifecycleReady,
		AccessState:         RuntimeAccessEnabled,
		CredentialEpoch:     1,
		UpstreamAuthority:   "127.0.0.1:7345",
		CredentialSecretRef: "missing_secret",
	}); err != nil {
		t.Fatal(err)
	}
	backupDirectory := filepath.Join(root, "incomplete-backup")
	if _, err := CreateBackup(ctx, store, secrets, backupDirectory); err == nil ||
		!strings.Contains(err.Error(), "missing_secret") {
		t.Fatalf("CreateBackup missing secret error = %v", err)
	}
	if _, err := os.Lstat(filepath.Join(backupDirectory, controlPlaneBackupManifestName)); !os.IsNotExist(err) {
		t.Fatalf("incomplete backup manifest error = %v", err)
	}
}

func TestControlPlaneRestoreRejectsTamperingAndDuplicateFields(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	store := openTestStore(t, filepath.Join(root, "data"), time.Now, RateLimit{})
	secrets, err := OpenFileSecretStore(filepath.Join(root, "secrets"))
	if err != nil {
		t.Fatal(err)
	}
	backupDirectory := filepath.Join(root, "backup")
	if _, err := CreateBackup(ctx, store, secrets, backupDirectory); err != nil {
		t.Fatal(err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	databasePath := filepath.Join(backupDirectory, controlPlaneDatabaseName)
	database, err := os.ReadFile(databasePath)
	if err != nil {
		t.Fatal(err)
	}
	database[len(database)-1] ^= 0xff
	if err := os.WriteFile(databasePath, database, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := RestoreBackup(
		ctx,
		backupDirectory,
		filepath.Join(root, "tampered-data"),
		filepath.Join(root, "tampered-secrets"),
	); err == nil || !strings.Contains(err.Error(), "checksum") {
		t.Fatalf("RestoreBackup tampered database error = %v", err)
	}

	duplicate := []byte(`{
		"schema_version": 1,
		"schema_version": 1,
		"control_plane_schema_version": 2,
		"created_at": "2026-07-24T21:00:00Z",
		"database_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"secrets": []
	}`)
	if err := rejectDuplicateBackupJSONFields(duplicate); err == nil ||
		!strings.Contains(err.Error(), "duplicate") {
		t.Fatalf("duplicate backup manifest error = %v", err)
	}
}

func requireBackupManifest(t *testing.T, manifest BackupManifest, now time.Time) {
	t.Helper()
	if manifest.SchemaVersion != controlPlaneBackupSchemaVersion ||
		manifest.ControlPlaneSchemaVersion != controlPlaneStoreVersion ||
		manifest.CreatedAt != now.Format(time.RFC3339Nano) ||
		!validSHA256(manifest.DatabaseSHA256) ||
		len(manifest.Secrets) != 1 ||
		manifest.Secrets[0].Reference != "runtime_backup" ||
		!validSHA256(manifest.Secrets[0].SHA256) {
		t.Fatalf("control-plane backup manifest = %+v", manifest)
	}
}

func requirePrivateBackupTree(t *testing.T, backupDirectory string) {
	t.Helper()
	for _, directory := range []string{
		backupDirectory,
		filepath.Join(backupDirectory, controlPlaneBackupSecretsName),
	} {
		info, err := os.Lstat(directory)
		if err != nil || !info.IsDir() || info.Mode().Perm() != 0o700 {
			t.Fatalf("backup directory %s = %+v, %v", directory, info, err)
		}
	}
	for _, path := range []string{
		filepath.Join(backupDirectory, controlPlaneDatabaseName),
		filepath.Join(backupDirectory, controlPlaneBackupManifestName),
		filepath.Join(backupDirectory, controlPlaneBackupSecretsName, "runtime_backup.secret"),
	} {
		info, err := os.Lstat(path)
		if err != nil || !info.Mode().IsRegular() || info.Mode().Perm() != 0o600 {
			t.Fatalf("backup file %s = %+v, %v", path, info, err)
		}
	}
}

func slicesEqualBackupManifest(first BackupManifest, second BackupManifest) bool {
	firstJSON, firstErr := json.Marshal(first)
	secondJSON, secondErr := json.Marshal(second)
	return firstErr == nil && secondErr == nil && bytes.Equal(firstJSON, secondJSON)
}
