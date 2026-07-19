package hostedmeasurement

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
)

var (
	ErrAmbiguousInventory = errors.New("hosted measurement provider inventory is ambiguous")
	ErrProviderNotFound   = errors.New("hosted measurement provider resource not found")
	flyImagePattern       = regexp.MustCompile(`^[a-z0-9][a-z0-9._:/-]{0,254}@sha256:[a-f0-9]{64}$`)
	flyDigestPattern      = regexp.MustCompile(`^sha256:[a-f0-9]{64}$`)
)

type ProviderResource struct {
	ID          string
	Name        string
	Region      string
	ImageDigest string
}

type VolumeSpec struct {
	AppName            string
	Name               string
	Region             string
	SizeGiB            int
	Encrypted          bool
	ScheduledSnapshots bool
}

type MachineSpec struct {
	AppName              string
	Name                 string
	Region               string
	ImageReference       string
	VolumeID             string
	VolumeMountPath      string
	CPUKind              string
	CPUs                 int
	MemoryMiB            int
	InternalPort         int
	ForceHTTPS           bool
	HardConcurrencyLimit int
	AutoStartMachines    bool
	AutoStopMachines     string
	MinimumMachines      int
	HealthPath           string
}

type FlyProvider interface {
	ListApps(context.Context, string) ([]ProviderResource, error)
	CreateApp(context.Context, string, string) (ProviderResource, error)
	DestroyApp(context.Context, string, string) error
	ListVolumes(context.Context, string) ([]ProviderResource, error)
	CreateVolume(context.Context, VolumeSpec) (ProviderResource, error)
	DestroyVolume(context.Context, string, string) error
	ListMachines(context.Context, string) ([]ProviderResource, error)
	CreateMachine(context.Context, MachineSpec) (ProviderResource, error)
	DestroyMachine(context.Context, string, string) error
}

type FlyAppPreparer interface {
	StageSecrets(context.Context, string) error
	EnsureSharedIPv4(context.Context, string) error
}

type Provisioner struct {
	Fly      FlyProvider
	Preparer FlyAppPreparer
	Now      func() time.Time
	State    *StateStore
}

func (provisioner Provisioner) ProvisionFly(ctx context.Context, authorization Authorization, imageReference string) error {
	if err := provisioner.validate(imageReference); err != nil {
		return err
	}
	if err := provisioner.checkCreateClock(authorization); err != nil {
		return err
	}
	if err := provisioner.State.SetPhase(PhaseDeploying, provisioner.Now()); err != nil {
		return err
	}
	return provisioner.provisionFlyResources(ctx, authorization, imageReference)
}

func (provisioner Provisioner) ProvisionApp(ctx context.Context, authorization Authorization) error {
	if provisioner.Fly == nil || provisioner.State == nil || provisioner.Now == nil {
		return errors.New("hosted measurement app provisioner requires Fly, clock, and durable state")
	}
	if err := provisioner.checkCreateClock(authorization); err != nil {
		return err
	}
	if err := provisioner.State.SetPhase(PhaseDeploying, provisioner.Now()); err != nil {
		return err
	}
	_, err := provisioner.ensureApp(ctx, authorization)
	return err
}

func (provisioner Provisioner) provisionFlyResources(
	ctx context.Context,
	authorization Authorization,
	imageReference string,
) error {
	app, err := provisioner.ensureApp(ctx, authorization)
	if err != nil {
		return err
	}
	if err := provisioner.checkCreateClock(authorization); err != nil {
		return err
	}
	volume, err := provisioner.ensureVolume(ctx, authorization, app)
	if err != nil {
		return err
	}
	if err := provisioner.checkCreateClock(authorization); err != nil {
		return err
	}
	if err := provisioner.prepareApp(ctx, authorization, app.Name); err != nil {
		return err
	}
	_, err = provisioner.ensureMachine(ctx, authorization, imageReference, app, volume)
	return err
}

func (provisioner Provisioner) prepareApp(ctx context.Context, authorization Authorization, appName string) error {
	if err := provisioner.Preparer.StageSecrets(ctx, appName); err != nil {
		return fmt.Errorf("stage Fly app secrets before Machine create: %w", err)
	}
	if err := provisioner.checkCreateClock(authorization); err != nil {
		return err
	}
	if err := provisioner.Preparer.EnsureSharedIPv4(ctx, appName); err != nil {
		return fmt.Errorf("prepare Fly shared ingress before Machine create: %w", err)
	}
	if err := provisioner.checkCreateClock(authorization); err != nil {
		return err
	}
	return nil
}

func (provisioner Provisioner) validate(imageReference string) error {
	if provisioner.Fly == nil || provisioner.Preparer == nil || provisioner.State == nil || provisioner.Now == nil {
		return errors.New("hosted measurement provisioner requires Fly, app preparation, clock, and durable state")
	}
	if !flyImagePattern.MatchString(imageReference) {
		return errors.New("hosted measurement requires a registry image pinned by digest")
	}
	return nil
}

func (provisioner Provisioner) ensureApp(ctx context.Context, authorization Authorization) (ProviderResource, error) {
	resources, err := provisioner.Fly.ListApps(ctx, authorization.Manifest.FlyOrganization)
	if err != nil {
		return ProviderResource{}, fmt.Errorf("list Fly apps before create or resume: %w", err)
	}
	resource, err := provisioner.ensureResource(
		ResourceFlyApp,
		authorization.Manifest.ResourcePrefix,
		resources,
		func() (ProviderResource, error) { return provisioner.createApp(ctx, authorization) },
	)
	if err == nil && resource.Region != "" && resource.Region != authorization.Manifest.FlyRegion {
		return ProviderResource{}, errors.New("resumed Fly app differs from the authorized region")
	}
	return resource, err
}

func (provisioner Provisioner) ensureVolume(
	ctx context.Context,
	authorization Authorization,
	app ProviderResource,
) (ProviderResource, error) {
	resources, err := provisioner.Fly.ListVolumes(ctx, app.Name)
	if err != nil {
		return ProviderResource{}, fmt.Errorf("list Fly volumes before create or resume: %w", err)
	}
	resource, err := provisioner.ensureResource(
		ResourceFlyVolume,
		authorization.Manifest.ResourcePrefix,
		resources,
		func() (ProviderResource, error) { return provisioner.createVolume(ctx, authorization, app) },
	)
	return requireAuthorizedRegion(resource, authorization.Manifest.FlyRegion, err)
}

func (provisioner Provisioner) ensureMachine(
	ctx context.Context,
	authorization Authorization,
	imageReference string,
	app ProviderResource,
	volume ProviderResource,
) (ProviderResource, error) {
	resources, err := provisioner.Fly.ListMachines(ctx, app.Name)
	if err != nil {
		return ProviderResource{}, fmt.Errorf("list Fly machines before create or resume: %w", err)
	}
	resource, err := provisioner.ensureResource(
		ResourceFlyMachine,
		authorization.Manifest.ResourcePrefix,
		resources,
		func() (ProviderResource, error) {
			return provisioner.createMachine(ctx, authorization, imageReference, app, volume)
		},
	)
	resource, err = requireAuthorizedRegion(resource, authorization.Manifest.FlyRegion, err)
	if err != nil {
		return ProviderResource{}, err
	}
	wantDigest := imageReference[strings.LastIndex(imageReference, "@")+1:]
	if resource.ImageDigest != wantDigest {
		return ProviderResource{}, errors.New("Fly machine inventory differs from the authorized image digest")
	}
	return resource, nil
}

func requireAuthorizedRegion(resource ProviderResource, region string, providerErr error) (ProviderResource, error) {
	if providerErr != nil {
		return ProviderResource{}, providerErr
	}
	if resource.Region != region {
		return ProviderResource{}, errors.New("Fly resource differs from the authorized region")
	}
	return resource, nil
}

func (provisioner Provisioner) ensureResource(
	kind ResourceKind,
	prefix string,
	resources []ProviderResource,
	create func() (ProviderResource, error),
) (ProviderResource, error) {
	state := provisioner.State.Snapshot()
	if recorded, ok := resourceByKind(state, kind); ok {
		return recordedProviderResource(resources, prefix, recorded)
	}
	intent, hasIntent := intentByKind(state, kind)
	if matchingPrefix(resources, prefix) == 0 {
		return create()
	}
	if !hasIntent {
		return ProviderResource{}, ErrAmbiguousInventory
	}
	resource, err := exactRunResource(resources, prefix, intent.Name)
	if err != nil {
		return ProviderResource{}, err
	}
	if err := provisioner.State.RecordResource(ResourceState{
		Kind: kind, ID: resource.ID, Name: resource.Name, ActualRegion: resource.Region,
	}, OperationCreateAdopted, provisioner.Now()); err != nil {
		return ProviderResource{}, err
	}
	return resource, nil
}

func recordedProviderResource(resources []ProviderResource, prefix string, recorded ResourceState) (ProviderResource, error) {
	present, err := exactRecordedResource(resources, prefix, recorded)
	if err != nil || !present {
		return ProviderResource{}, errors.Join(errors.New("recorded Fly resource is not independently present"), err)
	}
	for _, resource := range resources {
		if resource.ID == recorded.ID && resource.Name == recorded.Name {
			return resource, nil
		}
	}
	return ProviderResource{}, errors.New("recorded Fly resource disappeared during inventory validation")
}

func (provisioner Provisioner) createApp(ctx context.Context, authorization Authorization) (ProviderResource, error) {
	manifest := authorization.Manifest
	if err := provisioner.State.RecordIntent(ResourceIntent{Kind: ResourceFlyApp, Name: manifest.FlyAppName}, provisioner.Now()); err != nil {
		return ProviderResource{}, err
	}
	resource, err := provisioner.Fly.CreateApp(ctx, manifest.FlyOrganization, manifest.FlyAppName)
	code := OperationCreateAccepted
	if err != nil {
		resources, listErr := provisioner.Fly.ListApps(ctx, manifest.FlyOrganization)
		if listErr != nil {
			return ProviderResource{}, errors.Join(fmt.Errorf("create Fly app: %w", err), fmt.Errorf("reconcile Fly app create: %w", listErr))
		}
		resource, listErr = exactRunResource(resources, manifest.ResourcePrefix, manifest.FlyAppName)
		if listErr != nil {
			return ProviderResource{}, errors.Join(fmt.Errorf("create Fly app: %w", err), listErr)
		}
		code = OperationCreateAdopted
	}
	if resource.Name != manifest.FlyAppName || resource.Region != "" && resource.Region != manifest.FlyRegion {
		return ProviderResource{}, errors.New("created Fly app differs from the authorized name or region")
	}
	if err := provisioner.State.RecordResource(ResourceState{
		Kind: ResourceFlyApp, ID: resource.ID, Name: resource.Name, ActualRegion: resource.Region,
	}, code, provisioner.Now()); err != nil {
		return ProviderResource{}, err
	}
	return resource, nil
}

func (provisioner Provisioner) createVolume(ctx context.Context, authorization Authorization, app ProviderResource) (ProviderResource, error) {
	manifest := authorization.Manifest
	name := manifest.ResourcePrefix + "-data"
	if err := provisioner.State.RecordIntent(ResourceIntent{Kind: ResourceFlyVolume, Name: name}, provisioner.Now()); err != nil {
		return ProviderResource{}, err
	}
	spec := VolumeSpec{
		AppName: app.Name, Name: name, Region: manifest.FlyRegion, SizeGiB: 1, Encrypted: true, ScheduledSnapshots: false,
	}
	resource, err := provisioner.Fly.CreateVolume(ctx, spec)
	code := OperationCreateAccepted
	if err != nil {
		resources, listErr := provisioner.Fly.ListVolumes(ctx, app.Name)
		if listErr != nil {
			return ProviderResource{}, errors.Join(fmt.Errorf("create Fly volume: %w", err), fmt.Errorf("reconcile Fly volume create: %w", listErr))
		}
		resource, listErr = exactRunResource(resources, manifest.ResourcePrefix, name)
		if listErr != nil {
			return ProviderResource{}, errors.Join(fmt.Errorf("create Fly volume: %w", err), listErr)
		}
		code = OperationCreateAdopted
	}
	if resource.Name != name || resource.Region != manifest.FlyRegion {
		return ProviderResource{}, errors.New("created Fly volume differs from the authorized name or region")
	}
	if err := provisioner.State.RecordResource(ResourceState{
		Kind: ResourceFlyVolume, ID: resource.ID, Name: resource.Name, ActualRegion: resource.Region,
	}, code, provisioner.Now()); err != nil {
		return ProviderResource{}, err
	}
	return resource, nil
}

func (provisioner Provisioner) createMachine(
	ctx context.Context,
	authorization Authorization,
	imageReference string,
	app ProviderResource,
	volume ProviderResource,
) (ProviderResource, error) {
	manifest := authorization.Manifest
	name := manifest.ResourcePrefix + "-machine"
	if err := provisioner.State.RecordIntent(ResourceIntent{Kind: ResourceFlyMachine, Name: name}, provisioner.Now()); err != nil {
		return ProviderResource{}, err
	}
	resource, err := provisioner.Fly.CreateMachine(ctx, MachineSpec{
		AppName: app.Name, Name: name, Region: manifest.FlyRegion, ImageReference: imageReference, VolumeID: volume.ID,
		VolumeMountPath: "/data", CPUKind: "shared", CPUs: 1, MemoryMiB: 256, InternalPort: 8080,
		ForceHTTPS: true, HardConcurrencyLimit: 64, AutoStartMachines: true, AutoStopMachines: "stop",
		MinimumMachines: 0, HealthPath: "/healthz",
	})
	code := OperationCreateAccepted
	if err != nil {
		resources, listErr := provisioner.Fly.ListMachines(ctx, app.Name)
		if listErr != nil {
			return ProviderResource{}, errors.Join(fmt.Errorf("create Fly machine: %w", err), fmt.Errorf("reconcile Fly machine create: %w", listErr))
		}
		resource, listErr = exactRunResource(resources, manifest.ResourcePrefix, name)
		if listErr != nil {
			return ProviderResource{}, errors.Join(fmt.Errorf("create Fly machine: %w", err), listErr)
		}
		code = OperationCreateAdopted
	}
	if resource.Name != name || resource.Region != manifest.FlyRegion {
		return ProviderResource{}, errors.New("created Fly machine differs from the authorized name or region")
	}
	if err := provisioner.State.RecordResource(ResourceState{
		Kind: ResourceFlyMachine, ID: resource.ID, Name: resource.Name, ActualRegion: resource.Region,
	}, code, provisioner.Now()); err != nil {
		return ProviderResource{}, err
	}
	return resource, nil
}

func (provisioner Provisioner) checkCreateClock(authorization Authorization) error {
	return requireCreateWindow(provisioner.Now(), authorization, provisioner.State)
}

func requireCreateWindow(now time.Time, authorization Authorization, state *StateStore) error {
	if now.After(authorization.StartDeadline) || !now.Add(cleanupReserve).Before(authorization.CleanupDeadline) {
		if setErr := state.SetPhase(PhaseCleaning, now); setErr != nil {
			return errors.Join(errors.New("hosted measurement create window has closed"), setErr)
		}
		return errors.New("hosted measurement create window has closed; cleanup is required")
	}
	return nil
}

func exactRunResource(resources []ProviderResource, prefix string, name string) (ProviderResource, error) {
	var exact []ProviderResource
	for _, resource := range resources {
		if strings.HasPrefix(resource.Name, prefix) {
			if resource.Name != name {
				return ProviderResource{}, ErrAmbiguousInventory
			}
			exact = append(exact, resource)
		}
	}
	if len(exact) != 1 {
		return ProviderResource{}, ErrAmbiguousInventory
	}
	return exact[0], nil
}

func matchingPrefix(resources []ProviderResource, prefix string) int {
	count := 0
	for _, resource := range resources {
		if strings.HasPrefix(resource.Name, prefix) {
			count++
		}
	}
	return count
}

func intentByKind(state State, kind ResourceKind) (ResourceIntent, bool) {
	for _, intent := range state.Intents {
		if intent.Kind == kind {
			return intent, true
		}
	}
	return ResourceIntent{}, false
}
