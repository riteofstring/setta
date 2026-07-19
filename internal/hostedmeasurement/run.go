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
	ProvisionFly(context.Context, Authorization, string, []byte) error
}

type HostedWorkload interface {
	Execute(context.Context, Authorization, HostedRuntime, ControlPlaneBootstrapResult) error
}

type HostedRuntimePreparation interface {
	Prepare(context.Context, Authorization) (HostedRuntime, error)
}

type HostedControlPlaneBootstrap interface {
	Bootstrap(context.Context, Authorization, HostedRuntime) (ControlPlaneBootstrapResult, error)
}

type HostedCleanup interface {
	Cleanup(context.Context, Authorization) error
}

type RunCoordinator struct {
	Bootstrap   HostedControlPlaneBootstrap
	Cleanup     HostedCleanup
	Image       HostedImagePublisher
	Now         func() time.Time
	Provisioner HostedFlyProvisioner
	Runtime     HostedRuntimePreparation
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
	runtime, err := coordinator.Runtime.Prepare(ctx, authorization)
	if err != nil {
		return err
	}
	defer clear(runtime.InnerRuntimeCredential)
	if err := coordinator.Provisioner.ProvisionFly(ctx, authorization, imageReference, runtime.InnerRuntimeCredential); err != nil {
		return err
	}
	clear(runtime.InnerRuntimeCredential)
	runtime.InnerRuntimeCredential = nil
	bootstrap, err := coordinator.Bootstrap.Bootstrap(ctx, authorization, runtime)
	if err != nil {
		return err
	}
	if err := coordinator.State.SetPhase(PhaseMeasuring, coordinator.Now()); err != nil {
		return err
	}
	return coordinator.Workload.Execute(ctx, authorization, runtime, bootstrap)
}

func (coordinator RunCoordinator) validate() error {
	if coordinator.Bootstrap == nil || coordinator.Cleanup == nil || coordinator.Image == nil || coordinator.Now == nil ||
		coordinator.Provisioner == nil || coordinator.Runtime == nil || coordinator.State == nil || coordinator.Workload == nil {
		return errors.New("hosted run requires image publication, runtime preparation, Fly provisioning, bootstrap, workload, cleanup, clock, and durable state")
	}
	return nil
}
