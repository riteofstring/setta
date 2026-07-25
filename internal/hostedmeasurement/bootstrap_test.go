package hostedmeasurement

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"setta/internal/controlplane"
	"setta/internal/runtimeprovider"
)

func TestControlPlaneBootstrapperJournalsCredentialAndExecutesExactMachineOnce(t *testing.T) {
	authorization, store, runtime := bootstrapTestState(t)
	executor := &fakeHostedMachineExecutor{resultFunc: func(request FlyMachineExecRequest) FlyMachineExecResult {
		return bootstrapResultForRequest(t, request, runtime.Sprite.Observation.Name)
	}}
	bootstrapper := ControlPlaneBootstrapper{
		Fly: executor, State: store, Now: func() time.Time { return testAuthorizedAt.Add(5 * time.Minute) },
	}
	result, err := bootstrapper.Bootstrap(context.Background(), authorization, runtime)
	if err != nil {
		t.Fatal(err)
	}
	if executor.calls != 1 || executor.request.AppName != authorization.Manifest.FlyAppName ||
		executor.request.MachineID != "machine_123" || executor.request.TimeoutSeconds != bootstrapMachineTimeoutSeconds {
		t.Fatalf("Machine exec = %+v, calls = %d", executor.request, executor.calls)
	}
	if strings.Contains(executor.request.Command, string(executor.request.Stdin)) || !strings.Contains(executor.request.Command, "--client-credential-stdin") {
		t.Fatal("bootstrap command exposed the client credential or omitted stdin mode")
	}
	credential, found, err := loadLocalClientCredential(result.ClientCredentialPath)
	if err != nil || !found || credential.DeviceID != result.DeviceID {
		t.Fatalf("local credential = %+v, found=%t, err=%v", credential, found, err)
	}
	info, err := os.Stat(result.ClientCredentialPath)
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("local credential permissions = %v, %v", info, err)
	}
	bootstrap := store.Snapshot().Bootstrap
	if bootstrap == nil || bootstrap.BootstrapAccepted == "" || bootstrap.DeviceID != result.DeviceID ||
		bootstrap.CredentialSHA256 != clientCredentialSHA256(credential) {
		t.Fatalf("durable bootstrap = %+v", bootstrap)
	}
	if _, err := bootstrapper.Bootstrap(context.Background(), authorization, runtime); err != nil {
		t.Fatal(err)
	}
	if executor.calls != 1 {
		t.Fatalf("accepted bootstrap re-executed Machine command: %d", executor.calls)
	}
}

func TestControlPlaneBootstrapperRetriesSameCredentialAfterAmbiguousCommand(t *testing.T) {
	authorization, store, runtime := bootstrapTestState(t)
	executor := &fakeHostedMachineExecutor{result: FlyMachineExecResult{ExitCode: 1, Stderr: []byte("provider secret detail")}}
	bootstrapper := ControlPlaneBootstrapper{
		Fly: executor, State: store, Now: func() time.Time { return testAuthorizedAt.Add(5 * time.Minute) },
	}
	err := func() error {
		_, err := bootstrapper.Bootstrap(context.Background(), authorization, runtime)
		return err
	}()
	if err == nil || strings.Contains(err.Error(), "provider secret detail") {
		t.Fatalf("contentful bootstrap error = %v", err)
	}
	firstPayload := append([]byte(nil), executor.request.Stdin...)
	if store.Snapshot().Bootstrap == nil || store.Snapshot().Bootstrap.BootstrapAccepted != "" {
		t.Fatalf("bootstrap state after failure = %+v", store.Snapshot().Bootstrap)
	}
	var credential controlplane.DeviceCredential
	if err := json.Unmarshal(firstPayload, &credential); err != nil {
		t.Fatal(err)
	}
	executor.resultFunc = func(request FlyMachineExecRequest) FlyMachineExecResult {
		return bootstrapResultForRequest(t, request, runtime.Sprite.Observation.Name)
	}
	if _, err := bootstrapper.Bootstrap(context.Background(), authorization, runtime); err != nil {
		t.Fatal(err)
	}
	if executor.calls != 2 || !bytes.Equal(firstPayload, executor.request.Stdin) {
		t.Fatal("bootstrap retry did not reuse the exact local credential")
	}
}

func TestControlPlaneBootstrapperRefusesMissingCredentialAfterDurableIntent(t *testing.T) {
	authorization, store, runtime := bootstrapTestState(t)
	executor := &fakeHostedMachineExecutor{result: FlyMachineExecResult{ExitCode: 1}}
	bootstrapper := ControlPlaneBootstrapper{
		Fly: executor, State: store, Now: func() time.Time { return testAuthorizedAt.Add(5 * time.Minute) },
	}
	if _, err := bootstrapper.Bootstrap(context.Background(), authorization, runtime); err == nil {
		t.Fatal("initial failing bootstrap unexpectedly succeeded")
	}
	credentialPath := authorization.StateDirectory + "/" + clientCredentialFileName
	if err := os.Remove(credentialPath); err != nil {
		t.Fatal(err)
	}
	if _, err := bootstrapper.Bootstrap(context.Background(), authorization, runtime); err == nil {
		t.Fatal("bootstrap minted a replacement after losing the journaled credential")
	}
	if executor.calls != 1 {
		t.Fatalf("missing journaled credential made another provider call: %d", executor.calls)
	}
}

func bootstrapTestState(t *testing.T) (Authorization, *StateStore, HostedRuntime) {
	t.Helper()
	authorization, directory := loadTestAuthorization(t)
	store, err := OpenStateStore(directory, authorization, testAuthorizedAt)
	if err != nil {
		t.Fatal(err)
	}
	for _, resource := range []ResourceState{
		{Kind: ResourceFlyMachine, ID: "machine_123", Name: authorization.Manifest.ResourcePrefix + "-machine", ActualRegion: "yyz"},
		{Kind: ResourceSprite, ID: "sprite_123", Name: "setta-u-0123456789abcdef0123456789abcdef", ActualRegion: "yyz"},
	} {
		if err := store.RecordResource(resource, OperationCreateAccepted, testAuthorizedAt.Add(time.Minute)); err != nil {
			t.Fatal(err)
		}
	}
	observation := runtimeprovider.RuntimeObservation{
		ProviderResourceID: "sprite_123", Name: "setta-u-0123456789abcdef0123456789abcdef", Placement: "yyz",
	}
	return authorization, store, HostedRuntime{Sprite: PreparedSprite{Observation: observation}}
}

func bootstrapResultForRequest(t *testing.T, request FlyMachineExecRequest, runtimeName string) FlyMachineExecResult {
	t.Helper()
	var credential controlplane.DeviceCredential
	if err := json.Unmarshal(request.Stdin, &credential); err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(controlplane.BootstrapEvent{
		DeviceID: credential.DeviceID, Event: controlplane.BootstrapReadyEvent, RuntimeName: runtimeName,
	})
	if err != nil {
		t.Fatal(err)
	}
	return FlyMachineExecResult{Stdout: append(payload, '\n')}
}

type fakeHostedMachineExecutor struct {
	request    FlyMachineExecRequest
	result     FlyMachineExecResult
	resultFunc func(FlyMachineExecRequest) FlyMachineExecResult
	err        error
	calls      int
}

func (executor *fakeHostedMachineExecutor) ExecMachine(
	_ context.Context,
	request FlyMachineExecRequest,
) (FlyMachineExecResult, error) {
	executor.calls++
	executor.request = request
	if executor.err != nil {
		return FlyMachineExecResult{}, errors.New("injected content-free exec failure")
	}
	if executor.resultFunc != nil {
		return executor.resultFunc(request), nil
	}
	return executor.result, nil
}
