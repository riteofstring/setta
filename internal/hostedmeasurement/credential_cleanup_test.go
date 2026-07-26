package hostedmeasurement

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/controlplane"
)

func TestHostedClientCredentialCleanerRevokesAndRemovesBothPrivateCredentials(t *testing.T) {
	authorization, store, runtime := bootstrapTestState(t)
	original := writeCleanupTestCredential(t, authorization.StateDirectory, clientCredentialFileName)
	replacement := writeCleanupTestCredential(t, authorization.StateDirectory, replacementCredentialFileName)
	if err := store.RecordBootstrapIntent(BootstrapState{
		MachineID: "machine_123", RuntimeName: runtime.Sprite.Observation.Name,
		DeviceID: original.DeviceID, CredentialSHA256: clientCredentialSHA256(original),
	}, testAuthorizedAt); err != nil {
		t.Fatal(err)
	}
	executor := &fakeHostedMachineExecutor{resultFunc: func(request FlyMachineExecRequest) FlyMachineExecResult {
		deviceID := commandArgument(request.Command, "--device-id")
		payload, err := json.Marshal(controlplane.AdminEvent{DeviceID: deviceID, Event: "device_revoked"})
		if err != nil {
			t.Fatal(err)
		}
		return FlyMachineExecResult{Stdout: append(payload, '\n')}
	}}
	cleaner := HostedClientCredentialCleaner{Fly: executor, State: store}
	if err := cleaner.CleanupCredentials(context.Background(), authorization); err != nil {
		t.Fatal(err)
	}
	if executor.calls != 2 || !strings.Contains(executor.request.Command, replacement.DeviceID) {
		t.Fatalf("credential cleanup calls = %d, last = %+v", executor.calls, executor.request)
	}
	for _, name := range []string{clientCredentialFileName, replacementCredentialFileName} {
		if _, err := os.Lstat(filepath.Join(authorization.StateDirectory, name)); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("credential %s remains: %v", name, err)
		}
	}
	if err := cleaner.CleanupCredentials(context.Background(), authorization); err != nil {
		t.Fatal(err)
	}
	if executor.calls != 2 {
		t.Fatal("idempotent credential cleanup repeated remote revocation")
	}
}

func writeCleanupTestCredential(t *testing.T, directory string, name string) controlplane.DeviceCredential {
	t.Helper()
	credential, err := controlplane.NewDeviceCredential()
	if err != nil {
		t.Fatal(err)
	}
	if err := writeLocalClientCredential(filepath.Join(directory, name), credential); err != nil {
		t.Fatal(err)
	}
	return credential
}
