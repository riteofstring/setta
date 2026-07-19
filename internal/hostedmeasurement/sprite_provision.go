package hostedmeasurement

import (
	"context"
	"errors"
	"slices"
	"time"

	"setta/internal/runtimeprovider"
)

type SpriteLifecycleProvider interface {
	Create(context.Context, runtimeprovider.CreateRequest) (runtimeprovider.RuntimeObservation, error)
	Inspect(context.Context, string) (runtimeprovider.RuntimeObservation, bool, error)
}

type SpriteProvisioner struct {
	Now      func() time.Time
	Provider SpriteLifecycleProvider
	State    *StateStore
}

func (provisioner SpriteProvisioner) Ensure(ctx context.Context, authorization Authorization) (runtimeprovider.RuntimeObservation, error) {
	if provisioner.Now == nil || provisioner.Provider == nil || provisioner.State == nil {
		return runtimeprovider.RuntimeObservation{}, errors.New("Sprite provisioner requires provider, clock, and durable state")
	}
	if err := requireCreateWindow(provisioner.Now(), authorization, provisioner.State); err != nil {
		return runtimeprovider.RuntimeObservation{}, err
	}
	identity, err := runtimeprovider.NewManagedIdentity("hosted-measurement:" + authorization.Manifest.RunID)
	if err != nil {
		return runtimeprovider.RuntimeObservation{}, err
	}
	observation, found, err := provisioner.Provider.Inspect(ctx, identity.Name)
	if err != nil {
		return runtimeprovider.RuntimeObservation{}, errors.New("inspect hosted Sprite identity failed")
	}
	return provisioner.ensureObserved(ctx, identity, observation, found)
}

func (provisioner SpriteProvisioner) ensureObserved(
	ctx context.Context,
	identity runtimeprovider.ManagedIdentity,
	observation runtimeprovider.RuntimeObservation,
	found bool,
) (runtimeprovider.RuntimeObservation, error) {
	state := provisioner.State.Snapshot()
	if recorded, ok := resourceByKind(state, ResourceSprite); ok {
		return requireRecordedSprite(identity, recorded, observation, found)
	}
	if _, hasIntent := intentByKind(state, ResourceSprite); found && !hasIntent {
		return runtimeprovider.RuntimeObservation{}, ErrAmbiguousInventory
	}
	if found {
		return provisioner.adopt(identity, observation)
	}
	return provisioner.create(ctx, identity)
}

func (provisioner SpriteProvisioner) create(
	ctx context.Context,
	identity runtimeprovider.ManagedIdentity,
) (runtimeprovider.RuntimeObservation, error) {
	if err := provisioner.State.RecordIntent(ResourceIntent{Kind: ResourceSprite, Name: identity.Name}, provisioner.Now()); err != nil {
		return runtimeprovider.RuntimeObservation{}, err
	}
	observation, err := provisioner.Provider.Create(ctx, runtimeprovider.CreateRequest{Identity: identity})
	if err != nil {
		return provisioner.reconcileCreate(ctx, identity, err)
	}
	return provisioner.record(identity, observation, OperationCreateAccepted)
}

func (provisioner SpriteProvisioner) reconcileCreate(
	ctx context.Context,
	identity runtimeprovider.ManagedIdentity,
	createErr error,
) (runtimeprovider.RuntimeObservation, error) {
	observation, found, err := provisioner.Provider.Inspect(ctx, identity.Name)
	if err != nil || !found {
		return runtimeprovider.RuntimeObservation{}, errors.Join(errors.New("create hosted Sprite failed"), createErr)
	}
	return provisioner.record(identity, observation, OperationCreateAdopted)
}

func (provisioner SpriteProvisioner) adopt(
	identity runtimeprovider.ManagedIdentity,
	observation runtimeprovider.RuntimeObservation,
) (runtimeprovider.RuntimeObservation, error) {
	return provisioner.record(identity, observation, OperationCreateAdopted)
}

func (provisioner SpriteProvisioner) record(
	identity runtimeprovider.ManagedIdentity,
	observation runtimeprovider.RuntimeObservation,
	code OperationCode,
) (runtimeprovider.RuntimeObservation, error) {
	if err := validateSpriteObservation(identity, observation); err != nil {
		return runtimeprovider.RuntimeObservation{}, err
	}
	if err := provisioner.State.RecordResource(ResourceState{
		Kind: ResourceSprite, ID: observation.ProviderResourceID, Name: observation.Name, ActualRegion: observation.Placement,
	}, code, provisioner.Now()); err != nil {
		return runtimeprovider.RuntimeObservation{}, err
	}
	return observation, nil
}

func requireRecordedSprite(
	identity runtimeprovider.ManagedIdentity,
	recorded ResourceState,
	observation runtimeprovider.RuntimeObservation,
	found bool,
) (runtimeprovider.RuntimeObservation, error) {
	if !found {
		return runtimeprovider.RuntimeObservation{}, errors.New("recorded hosted Sprite is not independently present")
	}
	if err := validateSpriteObservation(identity, observation); err != nil {
		return runtimeprovider.RuntimeObservation{}, err
	}
	if recorded.ID != observation.ProviderResourceID || recorded.Name != observation.Name ||
		recorded.ActualRegion != observation.Placement {
		return runtimeprovider.RuntimeObservation{}, ErrAmbiguousInventory
	}
	return observation, nil
}

func validateSpriteObservation(identity runtimeprovider.ManagedIdentity, observation runtimeprovider.RuntimeObservation) error {
	if observation.ProviderResourceID == "" || observation.Name != identity.Name || !slices.Equal(observation.Labels, identity.Labels) {
		return errors.New("hosted Sprite observation differs from the deterministic owned identity")
	}
	if observation.Placement != "" && !regionPattern.MatchString(observation.Placement) {
		return errors.New("hosted Sprite observation has an invalid placement")
	}
	return nil
}
