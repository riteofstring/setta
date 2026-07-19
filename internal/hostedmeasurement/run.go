package hostedmeasurement

import (
	"context"
	"errors"
	"time"
)

type HostedImagePublisher interface {
	Publish(context.Context, FlyImagePublishRequest) (string, error)
}

type HostedFlyProvisioner interface {
	ProvisionApp(context.Context, Authorization) error
	ProvisionFly(context.Context, Authorization, string) error
}

type HostedWorkload interface {
	Execute(context.Context, Authorization) error
}

type HostedCleanup interface {
	Cleanup(context.Context, Authorization) error
}

type RunCoordinator struct {
	Cleanup     HostedCleanup
	Image       HostedImagePublisher
	Now         func() time.Time
	Provisioner HostedFlyProvisioner
	State       *StateStore
	Workload    HostedWorkload
}

func (coordinator RunCoordinator) Run(
	ctx context.Context,
	cleanupCtx context.Context,
	authorization Authorization,
	publishRequest FlyImagePublishRequest,
) (returnErr error) {
	if err := coordinator.validate(); err != nil {
		return err
	}
	defer func() {
		returnErr = errors.Join(returnErr, coordinator.Cleanup.Cleanup(cleanupCtx, authorization))
	}()
	publishRequest.Authorization = authorization
	if err := coordinator.Provisioner.ProvisionApp(ctx, authorization); err != nil {
		return err
	}
	imageReference, err := coordinator.Image.Publish(ctx, publishRequest)
	if err != nil {
		return err
	}
	if err := coordinator.Provisioner.ProvisionFly(ctx, authorization, imageReference); err != nil {
		return err
	}
	if err := coordinator.State.SetPhase(PhaseMeasuring, coordinator.Now()); err != nil {
		return err
	}
	return coordinator.Workload.Execute(ctx, authorization)
}

func (coordinator RunCoordinator) validate() error {
	if coordinator.Cleanup == nil || coordinator.Image == nil || coordinator.Now == nil ||
		coordinator.Provisioner == nil || coordinator.State == nil || coordinator.Workload == nil {
		return errors.New("hosted run requires image publication, provisioning, workload, cleanup, clock, and durable state")
	}
	return nil
}
