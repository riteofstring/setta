package hostedmeasurement

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"setta/internal/controlplane"
)

func TestHostedLifecycleAdminUsesExactMachineAndTypedContentFreeEvents(t *testing.T) {
	authorization, _, runtime := bootstrapTestState(t)
	credential, err := controlplane.NewDeviceCredential()
	if err != nil {
		t.Fatal(err)
	}
	executor := &fakeHostedMachineExecutor{resultFunc: func(request FlyMachineExecRequest) FlyMachineExecResult {
		return lifecycleAdminTestResult(t, request, credential, authorization.Manifest.RunID)
	}}
	admin := HostedLifecycleAdmin{
		Fly: executor, MachineID: "machine_123", RuntimeName: runtime.Sprite.Observation.Name,
	}
	if err := admin.EnsureDevice(context.Background(), authorization, credential); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(executor.request.Command, credential.Token) ||
		executor.request.MachineID != "machine_123" || executor.request.TimeoutSeconds != lifecycleAdminTimeoutSeconds {
		t.Fatalf("ensure-device exec request = %+v", executor.request)
	}
	if err := admin.RevokeDevice(context.Background(), authorization, credential.DeviceID); err != nil {
		t.Fatal(err)
	}
	if err := admin.SetUserStatus(context.Background(), authorization, controlplane.UserStatusSuspended); err != nil {
		t.Fatal(err)
	}
	if executor.calls != 3 || len(executor.request.Stdin) != 0 {
		t.Fatalf("administration calls = %d, last request = %+v", executor.calls, executor.request)
	}
}

func lifecycleAdminTestResult(
	t *testing.T,
	request FlyMachineExecRequest,
	credential controlplane.DeviceCredential,
	runID string,
) FlyMachineExecResult {
	t.Helper()
	var event controlplane.AdminEvent
	switch {
	case strings.Contains(request.Command, " ensure-device "):
		var received controlplane.DeviceCredential
		if err := json.Unmarshal(request.Stdin, &received); err != nil || received != credential {
			t.Fatalf("ensure-device credential = %+v, %v", received, err)
		}
		event = controlplane.AdminEvent{DeviceID: credential.DeviceID, Event: "device_ensured"}
	case strings.Contains(request.Command, " revoke-device "):
		event = controlplane.AdminEvent{DeviceID: credential.DeviceID, Event: "device_revoked"}
	case strings.Contains(request.Command, " set-user-status "):
		event = controlplane.AdminEvent{
			Event: "user_status_set", Status: string(controlplane.UserStatusSuspended), UserID: hostedUserID(runID),
		}
	default:
		t.Fatalf("unexpected administration command %q", request.Command)
	}
	payload, err := json.Marshal(event)
	if err != nil {
		t.Fatal(err)
	}
	return FlyMachineExecResult{Stdout: append(payload, '\n')}
}

func TestHostedLifecycleAdminExcludesMachineOutputFromErrors(t *testing.T) {
	authorization, _, runtime := bootstrapTestState(t)
	executor := &fakeHostedMachineExecutor{result: FlyMachineExecResult{
		ExitCode: 1, Stderr: []byte("provider-secret-detail"),
	}}
	admin := HostedLifecycleAdmin{Fly: executor, MachineID: "machine_123", RuntimeName: runtime.Sprite.Observation.Name}
	err := admin.RevokeDevice(context.Background(), authorization, "device_123")
	if err == nil || strings.Contains(err.Error(), "provider-secret-detail") {
		t.Fatalf("contentful administration error = %v", err)
	}
}
