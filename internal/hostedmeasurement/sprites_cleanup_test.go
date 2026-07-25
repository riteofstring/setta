package hostedmeasurement

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"

	"setta/internal/runtimeprovider"
)

func TestSpritesCleanupClientInspectsAndDestroysExactOwnedRuntime(t *testing.T) {
	name := testManagedRuntimeName()
	identity, err := runtimeprovider.ManagedIdentityFromName(name)
	if err != nil {
		t.Fatal(err)
	}
	api := &fakeSpritesCleanupAPI{observation: runtimeprovider.RuntimeObservation{
		ProviderResourceID: "sprite_123", Name: name, Labels: identity.Labels, Placement: "yyz",
	}, found: true}
	client := newSpritesCleanupClient(api, "setta-100", name)
	resources, err := client.List(context.Background(), "setta-100")
	if err != nil {
		t.Fatal(err)
	}
	want := []ProviderResource{{ID: "sprite_123", Name: name, Region: "yyz"}}
	if !reflect.DeepEqual(resources, want) {
		t.Fatalf("resources = %+v, want %+v", resources, want)
	}
	if err := client.Destroy(context.Background(), "setta-100", "sprite_123"); err != nil {
		t.Fatal(err)
	}
	if api.destroyedName != name {
		t.Fatalf("destroyed name = %q", api.destroyedName)
	}
}

func TestSpritesCleanupClientHandlesExactAbsenceAndRejectsUnsafeInventory(t *testing.T) {
	name := testManagedRuntimeName()
	client := newSpritesCleanupClient(&fakeSpritesCleanupAPI{}, "setta-100", name)
	resources, err := client.List(context.Background(), "setta-100")
	if err != nil || len(resources) != 0 {
		t.Fatalf("absent resources = %+v, %v", resources, err)
	}
	if err := client.Destroy(context.Background(), "setta-100", "sprite_123"); !errors.Is(err, ErrProviderNotFound) {
		t.Fatalf("absent destroy error = %v", err)
	}

	identity, _ := runtimeprovider.ManagedIdentityFromName(name)
	tests := []runtimeprovider.RuntimeObservation{
		{ProviderResourceID: "sprite_123", Name: name + "-other", Labels: identity.Labels},
		{ProviderResourceID: "sprite_123", Name: name, Labels: []string{"wrong-label"}},
		{ProviderResourceID: "bad\nid", Name: name, Labels: identity.Labels},
	}
	for _, observation := range tests {
		api := &fakeSpritesCleanupAPI{observation: observation, found: true}
		client := newSpritesCleanupClient(api, "setta-100", name)
		if _, err := client.List(context.Background(), "setta-100"); err == nil {
			t.Fatalf("unsafe observation accepted: %+v", observation)
		}
	}
}

func TestSpritesCleanupClientRedactsProviderErrorsAndRejectsWrongDeleteID(t *testing.T) {
	name := testManagedRuntimeName()
	api := &fakeSpritesCleanupAPI{inspectErr: errors.New("sprite-token-sentinel provider detail")}
	client := newSpritesCleanupClient(api, "setta-100", name)
	_, err := client.List(context.Background(), "setta-100")
	if err == nil || strings.Contains(err.Error(), "sentinel") || strings.Contains(err.Error(), "provider detail") {
		t.Fatalf("contentful inspect error = %v", err)
	}
	identity, _ := runtimeprovider.ManagedIdentityFromName(name)
	api = &fakeSpritesCleanupAPI{observation: runtimeprovider.RuntimeObservation{
		ProviderResourceID: "sprite_123", Name: name, Labels: identity.Labels,
	}, found: true}
	client = newSpritesCleanupClient(api, "setta-100", name)
	if err := client.Destroy(context.Background(), "setta-100", "wrong-id"); !errors.Is(err, ErrAmbiguousInventory) {
		t.Fatalf("wrong ID error = %v", err)
	}
	api.destroyErr = errors.New("private provider detail")
	if err := client.Destroy(context.Background(), "setta-100", "sprite_123"); err == nil || strings.Contains(err.Error(), "private") {
		t.Fatalf("contentful destroy error = %v", err)
	}
}

type fakeSpritesCleanupAPI struct {
	observation   runtimeprovider.RuntimeObservation
	found         bool
	inspectErr    error
	destroyErr    error
	destroyedName string
}

func (api *fakeSpritesCleanupAPI) Inspect(context.Context, string) (runtimeprovider.RuntimeObservation, bool, error) {
	return api.observation, api.found, api.inspectErr
}

func (api *fakeSpritesCleanupAPI) Destroy(_ context.Context, name string) error {
	api.destroyedName = name
	return api.destroyErr
}

func testManagedRuntimeName() string {
	return "setta-u-" + strings.Repeat("a", 32)
}

var _ spritesCleanupAPI = (*fakeSpritesCleanupAPI)(nil)
