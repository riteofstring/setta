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
		Image: &fakeHostedImage{stages: &stages}, Provisioner: &fakeHostedProvisioner{stages: &stages},
		Workload: &fakeHostedWorkload{stages: &stages}, Cleanup: &fakeHostedCleanup{stages: &stages},
		Now: func() time.Time { return testAuthorizedAt.Add(time.Minute) }, State: store,
	}
	if err := coordinator.Run(context.Background(), context.Background(), authorization, FlyImagePublishRequest{}); err != nil {
		t.Fatal(err)
	}
	want := []string{"app", "image", "provision", "workload", "cleanup"}
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
		Image: &fakeHostedImage{stages: &stages}, Provisioner: &fakeHostedProvisioner{stages: &stages, err: provisionErr},
		Workload: &fakeHostedWorkload{stages: &stages}, Cleanup: &fakeHostedCleanup{stages: &stages},
		Now: func() time.Time { return testAuthorizedAt }, State: store,
	}
	err = coordinator.Run(runCtx, context.Background(), authorization, FlyImagePublishRequest{})
	if !errors.Is(err, provisionErr) || !reflect.DeepEqual(stages, []string{"app", "image", "provision", "cleanup"}) {
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

func (fake *fakeHostedProvisioner) ProvisionFly(context.Context, Authorization, string) error {
	*fake.stages = append(*fake.stages, "provision")
	return fake.err
}

type fakeHostedWorkload struct{ stages *[]string }

func (fake *fakeHostedWorkload) Execute(context.Context, Authorization) error {
	*fake.stages = append(*fake.stages, "workload")
	return nil
}

type fakeHostedCleanup struct{ stages *[]string }

func (fake *fakeHostedCleanup) Cleanup(ctx context.Context, _ Authorization) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	*fake.stages = append(*fake.stages, "cleanup")
	return nil
}
