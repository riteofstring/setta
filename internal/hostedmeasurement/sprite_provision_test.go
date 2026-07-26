package hostedmeasurement

import (
	"context"
	"errors"
	"testing"
	"time"

	"setta/internal/runtimeprovider"
)

func TestSpriteProvisionerCreatesDurablyAndResumesExactIdentity(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	store, err := OpenStateStore(directory, authorization, testAuthorizedAt)
	if err != nil {
		t.Fatal(err)
	}
	provider := &fakeSpriteLifecycleProvider{}
	provisioner := SpriteProvisioner{Provider: provider, State: store, Now: func() time.Time { return testAuthorizedAt.Add(time.Minute) }}
	created, err := provisioner.Ensure(context.Background(), authorization)
	if err != nil {
		t.Fatal(err)
	}
	if provider.createCalls != 1 || created.Name == "" || len(store.Snapshot().Resources) != 1 {
		t.Fatalf("created = %+v, calls = %d, state = %+v", created, provider.createCalls, store.Snapshot())
	}
	if _, err := provisioner.Ensure(context.Background(), authorization); err != nil {
		t.Fatal(err)
	}
	if provider.createCalls != 1 {
		t.Fatalf("restart repeated Sprite create: %d", provider.createCalls)
	}
}

func TestSpriteProvisionerRejectsUnjournaledAndMismatchedIdentity(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	store, err := OpenStateStore(directory, authorization, testAuthorizedAt)
	if err != nil {
		t.Fatal(err)
	}
	identity, _ := runtimeprovider.NewManagedIdentity("hosted-measurement:" + authorization.Manifest.RunID)
	provider := &fakeSpriteLifecycleProvider{
		observation: spriteObservation(identity),
	}
	provisioner := SpriteProvisioner{Provider: provider, State: store, Now: func() time.Time { return testAuthorizedAt }}
	if _, err := provisioner.Ensure(context.Background(), authorization); !errors.Is(err, ErrAmbiguousInventory) {
		t.Fatalf("unjournaled Sprite error = %v", err)
	}
	provider.observation.Labels = []string{"foreign"}
	if err := store.RecordIntent(ResourceIntent{Kind: ResourceSprite, Name: identity.Name}, testAuthorizedAt); err != nil {
		t.Fatal(err)
	}
	if _, err := provisioner.Ensure(context.Background(), authorization); err == nil {
		t.Fatal("Sprite provisioner adopted mismatched ownership labels")
	}
}

func TestSpriteProvisionerDoesNotCreateInsideCleanupReserve(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	store, err := OpenStateStore(directory, authorization, testAuthorizedAt)
	if err != nil {
		t.Fatal(err)
	}
	provider := &fakeSpriteLifecycleProvider{}
	provisioner := SpriteProvisioner{
		Provider: provider, State: store,
		Now: func() time.Time { return authorization.CleanupDeadline.Add(-10 * time.Minute) },
	}
	if _, err := provisioner.Ensure(context.Background(), authorization); err == nil {
		t.Fatal("Sprite provisioner created inside cleanup reserve")
	}
	if provider.createCalls != 0 || store.Snapshot().Phase != PhaseCleaning {
		t.Fatalf("create calls = %d, phase = %s", provider.createCalls, store.Snapshot().Phase)
	}
}

type fakeSpriteLifecycleProvider struct {
	observation runtimeprovider.RuntimeObservation
	createCalls int
}

func (provider *fakeSpriteLifecycleProvider) Inspect(_ context.Context, _ string) (runtimeprovider.RuntimeObservation, bool, error) {
	return provider.observation, provider.observation.Name != "", nil
}

func (provider *fakeSpriteLifecycleProvider) Create(_ context.Context, request runtimeprovider.CreateRequest) (runtimeprovider.RuntimeObservation, error) {
	provider.createCalls++
	provider.observation = spriteObservation(request.Identity)
	return provider.observation, nil
}

func spriteObservation(identity runtimeprovider.ManagedIdentity) runtimeprovider.RuntimeObservation {
	return runtimeprovider.RuntimeObservation{
		ProviderResourceID: "sprite_123", Name: identity.Name, Labels: identity.Labels,
		Placement: "yyz",
	}
}
