package hostedmeasurement

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"strings"

	"setta/internal/controlplane"
)

const lifecycleAdminTimeoutSeconds = 30

type HostedLifecycleAdmin struct {
	Fly         HostedFlyMachineExecutor
	MachineID   string
	RuntimeName string
}

func (admin HostedLifecycleAdmin) EnsureDevice(
	ctx context.Context,
	authorization Authorization,
	credential controlplane.DeviceCredential,
) error {
	payload, err := json.Marshal(credential)
	if err != nil {
		return errors.New("encode hosted lifecycle credential failed")
	}
	defer clear(payload)
	command := lifecycleAdminCommand(
		"ensure-device",
		"--socket", controlplane.AdminSocketPath("/data/control-plane"),
		"--device-name", "hosted-measurement-replacement",
		"--grant-ttl", "2h",
		"--runtime-name", admin.RuntimeName,
		"--user-id", hostedUserID(authorization.Manifest.RunID),
	)
	event, err := admin.execute(ctx, authorization, command, payload, "device_ensured")
	if err != nil {
		return err
	}
	if event.DeviceID != credential.DeviceID || event.Status != "" || event.UserID != "" {
		return errors.New("hosted lifecycle ensure-device event differs from the requested identity")
	}
	return nil
}

func (admin HostedLifecycleAdmin) RevokeDevice(
	ctx context.Context,
	authorization Authorization,
	deviceID string,
) error {
	command := lifecycleAdminCommand(
		"revoke-device",
		"--device-id", deviceID,
		"--socket", controlplane.AdminSocketPath("/data/control-plane"),
	)
	event, err := admin.execute(ctx, authorization, command, nil, "device_revoked")
	if err != nil {
		return err
	}
	if event.DeviceID != deviceID || event.Status != "" || event.UserID != "" {
		return errors.New("hosted lifecycle revoke-device event differs from the requested identity")
	}
	return nil
}

func (admin HostedLifecycleAdmin) SetUserStatus(
	ctx context.Context,
	authorization Authorization,
	status controlplane.UserStatus,
) error {
	userID := hostedUserID(authorization.Manifest.RunID)
	command := lifecycleAdminCommand(
		"set-user-status",
		"--socket", controlplane.AdminSocketPath("/data/control-plane"),
		"--status", string(status),
		"--user-id", userID,
	)
	event, err := admin.execute(ctx, authorization, command, nil, "user_status_set")
	if err != nil {
		return err
	}
	if event.DeviceID != "" || event.Status != string(status) || event.UserID != userID {
		return errors.New("hosted lifecycle user-status event differs from the requested identity")
	}
	return nil
}

func (admin HostedLifecycleAdmin) execute(
	ctx context.Context,
	authorization Authorization,
	command string,
	stdin []byte,
	wantEvent string,
) (controlplane.AdminEvent, error) {
	if admin.Fly == nil || admin.MachineID == "" || admin.RuntimeName == "" {
		return controlplane.AdminEvent{}, errors.New("hosted lifecycle administration requires exact Fly and runtime identities")
	}
	result, err := admin.Fly.ExecMachine(ctx, FlyMachineExecRequest{
		AppName: authorization.Manifest.FlyAppName, MachineID: admin.MachineID,
		Command: command, Stdin: stdin, TimeoutSeconds: lifecycleAdminTimeoutSeconds,
	})
	if err != nil {
		return controlplane.AdminEvent{}, errors.New("execute hosted lifecycle administration failed")
	}
	return decodeLifecycleAdminEvent(result, wantEvent)
}

func lifecycleAdminCommand(operation string, arguments ...string) string {
	parts := []string{"/usr/local/bin/setta-control-plane", "admin", operation}
	parts = append(parts, arguments...)
	return strings.Join(parts, " ")
}

func hostedUserID(runID string) string {
	return "hosted-user-" + runID
}

func decodeLifecycleAdminEvent(result FlyMachineExecResult, wantEvent string) (controlplane.AdminEvent, error) {
	if result.ExitCode != 0 || len(result.Stdout) > maximumBootstrapEventBytes || len(result.Stderr) != 0 {
		return controlplane.AdminEvent{}, errors.New("hosted lifecycle administration returned an invalid result")
	}
	if err := rejectDuplicateJSONFields(result.Stdout); err != nil {
		return controlplane.AdminEvent{}, errors.New("hosted lifecycle administration event JSON is invalid")
	}
	decoder := json.NewDecoder(bytes.NewReader(result.Stdout))
	decoder.DisallowUnknownFields()
	var event controlplane.AdminEvent
	if err := decoder.Decode(&event); err != nil || decoder.Decode(&struct{}{}) != io.EOF || event.Event != wantEvent {
		return controlplane.AdminEvent{}, errors.New("decode hosted lifecycle administration event failed")
	}
	return event, nil
}
