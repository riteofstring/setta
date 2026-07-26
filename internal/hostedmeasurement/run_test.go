package hostedmeasurement

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"
)

func TestRunCoordinatorAlwaysCleansAfterOrderedSuccess(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	store, err := OpenStateStore(directory, authorization, testAuthorizedAt)
	if err != nil {
		t.Fatal(err)
	}
	stages := []string{}
	coordinator := RunCoordinator{
		Bootstrap: &fakeHostedBootstrap{stages: &stages},
		Image:     &fakeHostedImage{stages: &stages}, Provisioner: &fakeHostedProvisioner{stages: &stages},
		Runtime:  &fakeHostedRuntimePreparation{stages: &stages},
		Workload: &fakeHostedWorkload{stages: &stages}, Cleanup: &fakeHostedCleanup{stages: &stages},
		Now: func() time.Time { return testAuthorizedAt.Add(time.Minute) }, State: store,
	}
	if err := coordinator.Run(context.Background(), context.Background(), authorization, FlyImagePublishRequest{}); err != nil {
		t.Fatal(err)
	}
	want := []string{"app", "image", "runtime", "provision", "bootstrap", "workload", "cleanup"}
	if !reflect.DeepEqual(stages, want) {
		t.Fatalf("stages = %v, want %v", stages, want)
	}
}

func TestRunCoordinatorCleansWithIndependentContextAfterFailure(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	store, err := OpenStateStore(directory, authorization, testAuthorizedAt)
	if err != nil {
		t.Fatal(err)
	}
	runCtx, cancelRun := context.WithCancel(context.Background())
	cancelRun()
	stages := []string{}
	provisionErr := errors.New("injected provision failure")
	coordinator := RunCoordinator{
		Bootstrap: &fakeHostedBootstrap{stages: &stages},
		Image:     &fakeHostedImage{stages: &stages}, Provisioner: &fakeHostedProvisioner{stages: &stages, err: provisionErr},
		Runtime:  &fakeHostedRuntimePreparation{stages: &stages},
		Workload: &fakeHostedWorkload{stages: &stages}, Cleanup: &fakeHostedCleanup{stages: &stages},
		Now: func() time.Time { return testAuthorizedAt }, State: store,
	}
	err = coordinator.Run(runCtx, context.Background(), authorization, FlyImagePublishRequest{})
	if !errors.Is(err, provisionErr) || !reflect.DeepEqual(stages, []string{"app", "image", "runtime", "provision", "cleanup"}) {
		t.Fatalf("run error = %v, stages = %v", err, stages)
	}
}

type fakeHostedImage struct{ stages *[]string }

func (fake *fakeHostedImage) Publish(context.Context, FlyImagePublishRequest) (string, error) {
	*fake.stages = append(*fake.stages, "image")
	return testImageReference(), nil
}

type fakeHostedProvisioner struct {
	stages *[]string
	err    error
}

func (fake *fakeHostedProvisioner) ProvisionApp(context.Context, Authorization) error {
	*fake.stages = append(*fake.stages, "app")
	return nil
}

func (fake *fakeHostedProvisioner) ProvisionFly(_ context.Context, _ Authorization, _ string, credential []byte) error {
	*fake.stages = append(*fake.stages, "provision")
	if string(credential) != "inner-runtime-credential" {
		return errors.New("wrong inner runtime credential")
	}
	return fake.err
}

type fakeHostedWorkload struct{ stages *[]string }

func (fake *fakeHostedWorkload) Execute(
	_ context.Context,
	_ Authorization,
	runtime HostedRuntime,
	bootstrap ControlPlaneBootstrapResult,
) error {
	*fake.stages = append(*fake.stages, "workload")
	if runtime.InnerRuntimeCredential != nil {
		return errors.New("inner runtime credential was retained after Fly secret staging")
	}
	if bootstrap.ClientCredentialPath != "/private/client-credential.json" {
		return errors.New("workload received the wrong bootstrap result")
	}
	return nil
}

type fakeHostedBootstrap struct{ stages *[]string }

func (fake *fakeHostedBootstrap) Bootstrap(
	context.Context,
	Authorization,
	HostedRuntime,
) (ControlPlaneBootstrapResult, error) {
	*fake.stages = append(*fake.stages, "bootstrap")
	return ControlPlaneBootstrapResult{ClientCredentialPath: "/private/client-credential.json"}, nil
}

type fakeHostedRuntimePreparation struct{ stages *[]string }

func (fake *fakeHostedRuntimePreparation) Prepare(context.Context, Authorization) (HostedRuntime, error) {
	*fake.stages = append(*fake.stages, "runtime")
	return HostedRuntime{InnerRuntimeCredential: []byte("inner-runtime-credential")}, nil
}

type fakeHostedCleanup struct{ stages *[]string }

func (fake *fakeHostedCleanup) Cleanup(ctx context.Context, _ Authorization) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	*fake.stages = append(*fake.stages, "cleanup")
	return nil
}
