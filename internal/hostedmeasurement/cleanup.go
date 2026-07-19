package hostedmeasurement

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
)

const (
	cleanupInventoryAttempts = 10
	cleanupInventoryInterval = 2 * time.Second
)

type SpriteProvider interface {
	List(context.Context, string) ([]ProviderResource, error)
	Destroy(context.Context, string, string) error
}

type CleanupCoordinator struct {
	Fly     FlyProvider
	Sprites SpriteProvider
	Now     func() time.Time
	Wait    func(context.Context, time.Duration) error
	State   *StateStore
}

func (coordinator CleanupCoordinator) Cleanup(ctx context.Context, authorization Authorization) error {
	if coordinator.Fly == nil || coordinator.Sprites == nil || coordinator.Now == nil || coordinator.Wait == nil || coordinator.State == nil {
		return errors.New("hosted measurement cleanup requires providers, clock, wait function, and durable state")
	}
	if err := coordinator.State.SetPhase(PhaseCleaning, coordinator.Now()); err != nil {
		return err
	}
	if err := coordinator.reconcileDurableIntents(ctx, authorization); err != nil {
		return err
	}
	for _, kind := range []ResourceKind{ResourceSprite, ResourceFlyMachine, ResourceFlyVolume, ResourceFlyApp} {
		if err := coordinator.cleanupRecordedKind(ctx, authorization, kind); err != nil {
			return coordinator.failCleanup(kind, err)
		}
	}
	return coordinator.State.SetPhase(PhaseClean, coordinator.Now())
}

func (coordinator CleanupCoordinator) cleanupRecordedKind(
	ctx context.Context,
	authorization Authorization,
	kind ResourceKind,
) error {
	resource, ok := resourceByKind(coordinator.State.Snapshot(), kind)
	if !ok || resource.AbsenceConfirmedAt != "" {
		return nil
	}
	switch kind {
	case ResourceSprite:
		return coordinator.cleanupSprite(ctx, authorization, resource)
	case ResourceFlyMachine:
		return coordinator.cleanupFlyResource(ctx, authorization, resource, coordinator.Fly.ListMachines, coordinator.Fly.DestroyMachine)
	case ResourceFlyVolume:
		return coordinator.cleanupFlyResource(ctx, authorization, resource, coordinator.Fly.ListVolumes, coordinator.Fly.DestroyVolume)
	case ResourceFlyApp:
		return coordinator.cleanupFlyApp(ctx, authorization, resource)
	default:
		return fmt.Errorf("unsupported cleanup resource kind %q", kind)
	}
}

func (coordinator CleanupCoordinator) reconcileDurableIntents(ctx context.Context, authorization Authorization) error {
	state := coordinator.State.Snapshot()
	apps, err := coordinator.Fly.ListApps(ctx, authorization.Manifest.FlyOrganization)
	if err != nil {
		return fmt.Errorf("reconcile Fly app cleanup intent: %w", err)
	}
	appAvailable, err := coordinator.reconcileIntentList(state, ResourceFlyApp, apps, authorization.Manifest.ResourcePrefix)
	if err != nil {
		return err
	}
	sprites, err := coordinator.Sprites.List(ctx, authorization.Manifest.SpritesOrganization)
	if err != nil {
		return fmt.Errorf("reconcile Sprite cleanup intent: %w", err)
	}
	if _, err := coordinator.reconcileIntentList(coordinator.State.Snapshot(), ResourceSprite, sprites, authorization.Manifest.ResourcePrefix); err != nil {
		return err
	}
	if !appAvailable {
		return nil
	}
	volumes, err := coordinator.Fly.ListVolumes(ctx, authorization.Manifest.FlyAppName)
	if err != nil {
		return fmt.Errorf("reconcile Fly volume cleanup intent: %w", err)
	}
	if _, err := coordinator.reconcileIntentList(coordinator.State.Snapshot(), ResourceFlyVolume, volumes, authorization.Manifest.ResourcePrefix); err != nil {
		return err
	}
	machines, err := coordinator.Fly.ListMachines(ctx, authorization.Manifest.FlyAppName)
	if err != nil {
		return fmt.Errorf("reconcile Fly machine cleanup intent: %w", err)
	}
	if _, err := coordinator.reconcileIntentList(coordinator.State.Snapshot(), ResourceFlyMachine, machines, authorization.Manifest.ResourcePrefix); err != nil {
		return err
	}
	return nil
}

func (coordinator CleanupCoordinator) reconcileIntentList(
	state State,
	kind ResourceKind,
	resources []ProviderResource,
	prefix string,
) (bool, error) {
	if recorded, ok := resourceByKind(state, kind); ok {
		present, err := exactRecordedResource(resources, prefix, recorded)
		return present, err
	}
	intent, ok := intentByKind(state, kind)
	if !ok {
		if matchingPrefix(resources, prefix) != 0 {
			return false, ErrAmbiguousInventory
		}
		return false, nil
	}
	if matchingPrefix(resources, prefix) == 0 {
		return false, nil
	}
	resource, err := exactRunResource(resources, prefix, intent.Name)
	if err != nil {
		return false, err
	}
	if err := coordinator.State.RecordResource(ResourceState{
		Kind: kind, ID: resource.ID, Name: resource.Name, ActualRegion: resource.Region,
	}, OperationCreateAdopted, coordinator.Now()); err != nil {
		return false, err
	}
	return true, nil
}

func (coordinator CleanupCoordinator) cleanupSprite(ctx context.Context, authorization Authorization, resource ResourceState) error {
	list := func(ctx context.Context, _ string) ([]ProviderResource, error) {
		return coordinator.Sprites.List(ctx, authorization.Manifest.SpritesOrganization)
	}
	destroy := func(ctx context.Context, _ string, id string) error {
		return coordinator.Sprites.Destroy(ctx, authorization.Manifest.SpritesOrganization, id)
	}
	return coordinator.cleanupListedResource(ctx, authorization.Manifest.ResourcePrefix, "", resource, list, destroy)
}

func (coordinator CleanupCoordinator) cleanupFlyResource(
	ctx context.Context,
	authorization Authorization,
	resource ResourceState,
	list func(context.Context, string) ([]ProviderResource, error),
	destroy func(context.Context, string, string) error,
) error {
	return coordinator.cleanupListedResource(ctx, authorization.Manifest.ResourcePrefix, authorization.Manifest.FlyAppName, resource, list, destroy)
}

func (coordinator CleanupCoordinator) cleanupFlyApp(ctx context.Context, authorization Authorization, resource ResourceState) error {
	list := func(ctx context.Context, _ string) ([]ProviderResource, error) {
		return coordinator.Fly.ListApps(ctx, authorization.Manifest.FlyOrganization)
	}
	destroy := func(ctx context.Context, _ string, id string) error {
		return coordinator.Fly.DestroyApp(ctx, authorization.Manifest.FlyOrganization, id)
	}
	return coordinator.cleanupListedResource(ctx, authorization.Manifest.ResourcePrefix, "", resource, list, destroy)
}

func (coordinator CleanupCoordinator) cleanupListedResource(
	ctx context.Context,
	prefix string,
	parent string,
	resource ResourceState,
	list func(context.Context, string) ([]ProviderResource, error),
	destroy func(context.Context, string, string) error,
) error {
	resources, err := list(ctx, parent)
	if err != nil {
		return fmt.Errorf("inspect %s before cleanup: %w", resource.Kind, err)
	}
	present, err := exactRecordedResource(resources, prefix, resource)
	if err != nil {
		return err
	}
	if !present {
		return coordinator.State.RecordDeletion(resource.Kind, OperationAbsenceConfirmed, coordinator.Now())
	}
	if err := destroy(ctx, parent, resource.ID); err != nil && !errors.Is(err, ErrProviderNotFound) {
		return fmt.Errorf("destroy exact %s: %w", resource.Kind, err)
	}
	if err := coordinator.State.RecordDeletion(resource.Kind, OperationDeleteAccepted, coordinator.Now()); err != nil {
		return err
	}
	return coordinator.confirmResourceAbsent(ctx, prefix, parent, resource, list)
}

func (coordinator CleanupCoordinator) confirmResourceAbsent(
	ctx context.Context,
	prefix string,
	parent string,
	resource ResourceState,
	list func(context.Context, string) ([]ProviderResource, error),
) error {
	for attempt := 0; attempt < cleanupInventoryAttempts; attempt++ {
		resources, err := list(ctx, parent)
		if err != nil {
			return fmt.Errorf("confirm %s cleanup: %w", resource.Kind, err)
		}
		present, err := exactRecordedResource(resources, prefix, resource)
		if err != nil {
			return err
		}
		if !present {
			return coordinator.State.RecordDeletion(resource.Kind, OperationAbsenceConfirmed, coordinator.Now())
		}
		if attempt+1 < cleanupInventoryAttempts {
			if err := coordinator.Wait(ctx, cleanupInventoryInterval); err != nil {
				return fmt.Errorf("wait for %s cleanup inventory: %w", resource.Kind, err)
			}
		}
	}
	return fmt.Errorf("%s remains present after %d independent inventory checks", resource.Kind, cleanupInventoryAttempts)
}

func (coordinator CleanupCoordinator) failCleanup(kind ResourceKind, cleanupErr error) error {
	recordErr := coordinator.State.RecordDeletion(kind, OperationCleanupFailed, coordinator.Now())
	return errors.Join(cleanupErr, recordErr)
}

func exactRecordedResource(resources []ProviderResource, prefix string, recorded ResourceState) (bool, error) {
	present := false
	for _, resource := range resources {
		if !strings.HasPrefix(resource.Name, prefix) {
			continue
		}
		if resource.ID != recorded.ID || resource.Name != recorded.Name {
			return false, ErrAmbiguousInventory
		}
		if present {
			return false, ErrAmbiguousInventory
		}
		present = true
	}
	return present, nil
}

func resourceByKind(state State, kind ResourceKind) (ResourceState, bool) {
	for _, resource := range state.Resources {
		if resource.Kind == kind {
			return resource, true
		}
	}
	return ResourceState{}, false
}
