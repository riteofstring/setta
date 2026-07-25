package main

import (
	"bytes"
	"io"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"

	"setta/internal/controlplane"
	"setta/internal/runtimeaccess"
	"setta/internal/runtimeprovider"
)

func TestBackupAndRestoreCommandsRoundTripOfflineControlPlane(t *testing.T) {
	fixture := newBackupCommandFixture(t)
	backupEvent := runBackupCommandRoundTrip(t, fixture)
	runRestoreCommandRoundTrip(t, fixture, backupEvent)
}

type backupCommandFixture struct {
	backupDirectory string
	dataDirectory   string
	grant           controlplane.CreatedDeviceGrant
	identity        runtimeprovider.ManagedIdentity
	root            string
	secretDirectory string
}

func newBackupCommandFixture(t *testing.T) backupCommandFixture {
	t.Helper()
	ctx := t.Context()
	root := t.TempDir()
	dataDirectory := filepath.Join(root, "data")
	secretDirectory := filepath.Join(root, "secrets")
	store, err := controlplane.OpenStore(controlplane.StoreConfig{Directory: dataDirectory})
	if err != nil {
		t.Fatal(err)
	}
	secrets, err := controlplane.OpenFileSecretStore(secretDirectory)
	if err != nil {
		t.Fatal(err)
	}
	identity, err := runtimeprovider.NewManagedIdentity("backup-command")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.UpsertUser(ctx, "backup-command-user"); err != nil {
		t.Fatal(err)
	}
	if err := secrets.WriteSecret(ctx, "backup_command_runtime", []byte("backup-command-secret")); err != nil {
		t.Fatal(err)
	}
	if _, err := store.AssignRuntime(ctx, controlplane.AssignRuntimeRequest{
		IdempotencyKey:      "backup-command-assignment",
		UserID:              "backup-command-user",
		RuntimeName:         identity.Name,
		Lifecycle:           controlplane.RuntimeLifecycleReady,
		AccessState:         controlplane.RuntimeAccessEnabled,
		HealthState:         controlplane.RuntimeHealthHealthy,
		CredentialEpoch:     1,
		UpstreamAuthority:   "127.0.0.1:7345",
		CredentialSecretRef: "backup_command_runtime",
		DesiredRelease:      "backup-command-release",
		ObservedRelease:     "backup-command-release",
		Resources: runtimeprovider.RuntimeResources{
			CPUCoreMillionths: 1_000_000,
			MemoryBytes:       512_000_000,
			StorageBytes:      10_000_000_000,
		},
	}); err != nil {
		t.Fatal(err)
	}
	grant, err := store.CreateDeviceGrant(ctx, controlplane.CreateDeviceGrantRequest{
		UserID:      "backup-command-user",
		RuntimeName: identity.Name,
		DisplayName: "Backup command phone",
		GrantTTL:    time.Hour,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	return backupCommandFixture{
		backupDirectory: filepath.Join(root, "backup"),
		dataDirectory:   dataDirectory,
		grant:           grant,
		identity:        identity,
		root:            root,
		secretDirectory: secretDirectory,
	}
}

func runBackupCommandRoundTrip(t *testing.T, fixture backupCommandFixture) backupCommandEvent {
	t.Helper()
	var backupOutput bytes.Buffer
	if exitCode := runBackup([]string{
		"--data-dir", fixture.dataDirectory,
		"--output-dir", fixture.backupDirectory,
		"--secret-dir", fixture.secretDirectory,
	}, &backupOutput, &bytes.Buffer{}); exitCode != 0 {
		t.Fatalf("backup exit code = %d", exitCode)
	}
	backupEvent, err := decodeBackupCommandEvent(backupOutput.Bytes())
	if err != nil || backupEvent.Event != "control_plane_backup_complete" ||
		backupEvent.CreatedAt == "" || backupEvent.SecretCount != 1 {
		t.Fatalf("backup event = %+v, %v", backupEvent, err)
	}
	return backupEvent
}

func runRestoreCommandRoundTrip(
	t *testing.T,
	fixture backupCommandFixture,
	backupEvent backupCommandEvent,
) {
	t.Helper()
	restoredData := filepath.Join(fixture.root, "restored-data")
	restoredSecrets := filepath.Join(fixture.root, "restored-secrets")
	var restoreOutput bytes.Buffer
	if exitCode := runRestore([]string{
		"--backup-dir", fixture.backupDirectory,
		"--data-dir", restoredData,
		"--secret-dir", restoredSecrets,
	}, &restoreOutput, &bytes.Buffer{}); exitCode != 0 {
		t.Fatalf("restore exit code = %d", exitCode)
	}
	restoreEvent, err := decodeBackupCommandEvent(restoreOutput.Bytes())
	if err != nil || restoreEvent.Event != "control_plane_restore_complete" ||
		restoreEvent.CreatedAt != backupEvent.CreatedAt || restoreEvent.SecretCount != 1 {
		t.Fatalf("restore event = %+v, %v", restoreEvent, err)
	}
	restoredStore, err := controlplane.OpenStore(controlplane.StoreConfig{Directory: restoredData})
	if err != nil {
		t.Fatal(err)
	}
	defer restoredStore.Close()
	authorization, err := restoredStore.AuthorizeClient(t.Context(), fixture.grant.Token)
	if err != nil || authorization.Outcome != runtimeaccess.AuthorizationAllowed ||
		authorization.RuntimeName != fixture.identity.Name {
		t.Fatalf("restored command authorization = %+v, %v", authorization, err)
	}
	restoredSecretStore, err := controlplane.OpenFileSecretStore(restoredSecrets)
	if err != nil {
		t.Fatal(err)
	}
	secret, err := restoredSecretStore.ReadSecret(t.Context(), "backup_command_runtime")
	if err != nil || string(secret) != "backup-command-secret" {
		t.Fatalf("restored command secret = %q, %v", secret, err)
	}
}

func TestBackupCommandRejectsRunningControlPlane(t *testing.T) {
	dataDirectory := t.TempDir()
	socketPath := controlplane.AdminSocketPath(dataDirectory)
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	var stderr bytes.Buffer
	exitCode := runBackup([]string{
		"--data-dir", dataDirectory,
		"--output-dir", filepath.Join(t.TempDir(), "backup"),
		"--secret-dir", t.TempDir(),
	}, &bytes.Buffer{}, &stderr)
	if exitCode != 1 || !bytes.Contains(stderr.Bytes(), []byte("serving process to be stopped")) {
		t.Fatalf("running backup exit=%d stderr=%q", exitCode, stderr.String())
	}
}

func TestBackupAndRestoreCommandsRequireAbsoluteDirectories(t *testing.T) {
	for _, test := range []struct {
		name string
		run  func([]string, io.Writer, io.Writer) int
		args []string
	}{
		{
			name: "backup",
			run:  runBackup,
			args: []string{"--data-dir", "data", "--output-dir", "backup", "--secret-dir", "secrets"},
		},
		{
			name: "restore",
			run:  runRestore,
			args: []string{"--backup-dir", "backup", "--data-dir", "data", "--secret-dir", "secrets"},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			var stderr bytes.Buffer
			if exitCode := test.run(test.args, &bytes.Buffer{}, &stderr); exitCode != 2 ||
				!bytes.Contains(stderr.Bytes(), []byte("must be absolute")) {
				t.Fatalf("exit=%d stderr=%q", exitCode, stderr.String())
			}
		})
	}
}

func TestBackupCommandDoesNotCreateMissingSourceState(t *testing.T) {
	root := t.TempDir()
	dataDirectory := filepath.Join(root, "missing-data")
	secretDirectory := filepath.Join(root, "missing-secrets")
	exitCode := runBackup([]string{
		"--data-dir", dataDirectory,
		"--output-dir", filepath.Join(root, "backup"),
		"--secret-dir", secretDirectory,
	}, &bytes.Buffer{}, &bytes.Buffer{})
	if exitCode != 1 {
		t.Fatalf("missing source backup exit = %d", exitCode)
	}
	for _, path := range []string{dataDirectory, secretDirectory, filepath.Join(root, "backup")} {
		if _, err := os.Lstat(path); !os.IsNotExist(err) {
			t.Fatalf("missing source backup created %s: %v", path, err)
		}
	}
}
