package hostedmeasurement

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"setta/internal/controlplane"
)

const (
	clientCredentialFileName       = "client-credential.json"
	maximumBootstrapEventBytes     = 16 * 1024
	bootstrapMachineTimeoutSeconds = 120
)

type HostedFlyMachineExecutor interface {
	ExecMachine(context.Context, FlyMachineExecRequest) (FlyMachineExecResult, error)
}

type ControlPlaneBootstrapper struct {
	Fly   HostedFlyMachineExecutor
	Now   func() time.Time
	State *StateStore
}

type ControlPlaneBootstrapResult struct {
	ClientCredentialPath string
	DeviceID             string
}

func (bootstrapper ControlPlaneBootstrapper) Bootstrap(
	ctx context.Context,
	authorization Authorization,
	runtime HostedRuntime,
) (ControlPlaneBootstrapResult, error) {
	if err := bootstrapper.validate(authorization); err != nil {
		return ControlPlaneBootstrapResult{}, err
	}
	machine, runtimeName, err := bootstrapResources(bootstrapper.State.Snapshot(), runtime)
	if err != nil {
		return ControlPlaneBootstrapResult{}, err
	}
	credential, credentialPath, err := bootstrapper.ensureCredential(authorization, machine.ID, runtimeName)
	if err != nil {
		return ControlPlaneBootstrapResult{}, err
	}
	if bootstrapper.State.Snapshot().Bootstrap.BootstrapAccepted != "" {
		return ControlPlaneBootstrapResult{ClientCredentialPath: credentialPath, DeviceID: credential.DeviceID}, nil
	}
	if err := bootstrapper.execute(ctx, authorization, machine.ID, runtimeName, credential); err != nil {
		return ControlPlaneBootstrapResult{}, err
	}
	if err := bootstrapper.State.RecordBootstrapAccepted(bootstrapper.Now()); err != nil {
		return ControlPlaneBootstrapResult{}, err
	}
	return ControlPlaneBootstrapResult{ClientCredentialPath: credentialPath, DeviceID: credential.DeviceID}, nil
}

func (bootstrapper ControlPlaneBootstrapper) validate(authorization Authorization) error {
	if bootstrapper.Fly == nil || bootstrapper.Now == nil || bootstrapper.State == nil {
		return errors.New("hosted control-plane bootstrap requires Fly exec, clock, and durable state")
	}
	return requireCreateWindow(bootstrapper.Now(), authorization, bootstrapper.State)
}

func (bootstrapper ControlPlaneBootstrapper) execute(
	ctx context.Context,
	authorization Authorization,
	machineID string,
	runtimeName string,
	credential controlplane.DeviceCredential,
) error {
	payload, err := json.Marshal(credential)
	if err != nil {
		return errors.New("encode hosted bootstrap credential failed")
	}
	result, err := bootstrapper.Fly.ExecMachine(ctx, FlyMachineExecRequest{
		AppName: authorization.Manifest.FlyAppName, MachineID: machineID,
		Command: bootstrapCommand(authorization.Manifest.RunID, runtimeName),
		Stdin:   payload, TimeoutSeconds: bootstrapMachineTimeoutSeconds,
	})
	if err != nil {
		return errors.New("execute hosted control-plane bootstrap failed")
	}
	return validateBootstrapExecResult(result, credential.DeviceID, runtimeName)
}

func (bootstrapper ControlPlaneBootstrapper) ensureCredential(
	authorization Authorization,
	machineID string,
	runtimeName string,
) (controlplane.DeviceCredential, string, error) {
	credentialPath := filepath.Join(authorization.StateDirectory, clientCredentialFileName)
	state := bootstrapper.State.Snapshot()
	credential, found, err := loadLocalClientCredential(credentialPath)
	if err != nil {
		return controlplane.DeviceCredential{}, "", err
	}
	if state.Bootstrap != nil && !found {
		return controlplane.DeviceCredential{}, "", errors.New("durable bootstrap intent exists but the local client credential is missing")
	}
	if !found {
		credential, err = controlplane.NewDeviceCredential()
		if err != nil {
			return controlplane.DeviceCredential{}, "", errors.New("generate hosted client credential failed")
		}
		if err := writeLocalClientCredential(credentialPath, credential); err != nil {
			return controlplane.DeviceCredential{}, "", err
		}
	}
	intent := BootstrapState{
		MachineID: machineID, RuntimeName: runtimeName, DeviceID: credential.DeviceID,
		CredentialSHA256: clientCredentialSHA256(credential),
	}
	if state.Bootstrap != nil {
		intent.BootstrapAccepted = state.Bootstrap.BootstrapAccepted
		if *state.Bootstrap != intent {
			return controlplane.DeviceCredential{}, "", errors.New("local client credential differs from durable bootstrap intent")
		}
		return credential, credentialPath, nil
	}
	if err := bootstrapper.State.RecordBootstrapIntent(intent, bootstrapper.Now()); err != nil {
		return controlplane.DeviceCredential{}, "", err
	}
	return credential, credentialPath, nil
}

func bootstrapResources(state State, runtime HostedRuntime) (ResourceState, string, error) {
	machine, hasMachine := resourceByKind(state, ResourceFlyMachine)
	sprite, hasSprite := resourceByKind(state, ResourceSprite)
	if !hasMachine || !hasSprite || runtime.Sprite.Observation.Name != sprite.Name {
		return ResourceState{}, "", errors.New("hosted bootstrap requires exact durable Fly Machine and Sprite resources")
	}
	return machine, sprite.Name, nil
}

func loadLocalClientCredential(path string) (controlplane.DeviceCredential, bool, error) {
	data, err := readPrivateRegularFile(path, maximumBootstrapEventBytes, "hosted client credential")
	if errors.Is(err, os.ErrNotExist) {
		return controlplane.DeviceCredential{}, false, nil
	}
	if err != nil {
		return controlplane.DeviceCredential{}, false, err
	}
	if err := rejectDuplicateJSONFields(data); err != nil {
		return controlplane.DeviceCredential{}, false, errors.New("hosted client credential JSON is invalid")
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var credential controlplane.DeviceCredential
	if err := decoder.Decode(&credential); err != nil || decoder.Decode(&struct{}{}) != io.EOF {
		return controlplane.DeviceCredential{}, false, errors.New("decode hosted client credential failed")
	}
	if err := controlplane.ValidateDeviceCredential(credential); err != nil {
		return controlplane.DeviceCredential{}, false, errors.New("hosted client credential is invalid")
	}
	return credential, true, nil
}

func writeLocalClientCredential(path string, credential controlplane.DeviceCredential) error {
	directory := filepath.Dir(path)
	temporary, err := os.CreateTemp(directory, ".client-credential-*")
	if err != nil {
		return errors.New("create hosted client credential failed")
	}
	temporaryPath := temporary.Name()
	installed := false
	defer func() {
		if !installed {
			_ = temporary.Close()
			_ = os.Remove(temporaryPath)
		}
	}()
	if err := temporary.Chmod(0o600); err != nil {
		return errors.New("protect hosted client credential failed")
	}
	if err := json.NewEncoder(temporary).Encode(credential); err != nil {
		return errors.New("encode hosted client credential failed")
	}
	if err := temporary.Sync(); err != nil {
		return errors.New("sync hosted client credential failed")
	}
	if err := temporary.Close(); err != nil {
		return errors.New("close hosted client credential failed")
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		return errors.New("publish hosted client credential failed")
	}
	installed = true
	return syncPrivateDirectory(directory)
}

func clientCredentialSHA256(credential controlplane.DeviceCredential) string {
	digest := sha256.Sum256([]byte(credential.DeviceID + "\x00" + credential.Token))
	return hex.EncodeToString(digest[:])
}

func bootstrapCommand(runID string, runtimeName string) string {
	parts := []string{
		"/usr/local/bin/setta-control-plane", "bootstrap",
		"--client-credential-file", "/data/control-plane/bootstrap-client-credential.json",
		"--client-credential-stdin",
		"--credential-epoch", "1",
		"--data-dir", "/data/control-plane",
		"--device-name", "hosted-measurement-gateway",
		"--grant-ttl", "2h",
		"--hosted-access-intent-id", "hosted-access-" + runID,
		"--idempotency-key", "hosted-bootstrap-" + runID,
		"--project-id", "hosted-project-" + runID,
		"--runtime-credential-file", "/run/setta/inner-runtime-credential",
		"--runtime-name", runtimeName,
		"--runtime-secret-ref", "runtime-" + runID,
		"--runtime-target", "127.0.0.1:7345",
		"--secret-dir", "/data/runtime-secrets",
		"--user-id", "hosted-user-" + runID,
		"--workstream-id", "hosted-workstream-" + runID,
	}
	return strings.Join(parts, " ")
}

func validateBootstrapExecResult(result FlyMachineExecResult, deviceID string, runtimeName string) error {
	if result.ExitCode != 0 || len(result.Stdout) > maximumBootstrapEventBytes || len(result.Stderr) != 0 {
		return errors.New("hosted control-plane bootstrap command returned an invalid result")
	}
	if err := rejectDuplicateJSONFields(result.Stdout); err != nil {
		return errors.New("hosted control-plane bootstrap event JSON is invalid")
	}
	decoder := json.NewDecoder(bytes.NewReader(result.Stdout))
	decoder.DisallowUnknownFields()
	var event controlplane.BootstrapEvent
	if err := decoder.Decode(&event); err != nil || decoder.Decode(&struct{}{}) != io.EOF {
		return errors.New("decode hosted control-plane bootstrap event failed")
	}
	if event.Event != controlplane.BootstrapReadyEvent || event.DeviceID != deviceID || event.RuntimeName != runtimeName {
		return errors.New("hosted control-plane bootstrap event differs from the durable run identity")
	}
	return nil
}
