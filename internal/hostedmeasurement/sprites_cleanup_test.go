package hostedmeasurement

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"setta/internal/runtimeprovider"
	"setta/internal/sprites"
)

// The body below is the response the live Sprites API returned on 2026-07-26
// for the exact request the adapter sends, with identifiers replaced. It has no
// config object and no primary_region. Setta must map, own, and destroy it.
func TestLiveProviderResponseShapeMapsThroughTheAdapter(t *testing.T) {
	name := testManagedRuntimeName()
	identity, err := runtimeprovider.ManagedIdentityFromName(name)
	if err != nil {
		t.Fatal(err)
	}
	body := `{"id":"sprite-1f8be69f-0e31-4f76-ab24-905539648098","name":"` + name +
		`","status":"warm","version":null,"url":"https://` + name +
		`-bwjff.sprites.app","labels":["setta-managed","setta-owner-` +
		name[len("setta-u-"):] + `"],"url_settings":{"auth":"sprite","private_access":"admins"},` +
		`"created_at":"2026-07-26T21:17:52.291659Z","organization":"personal","last_running_at":null,` +
		`"last_warming_at":"2026-07-26T21:17:52Z","updated_at":"2026-07-26T21:17:52.291659Z",` +
		`"environment_version":null}`
	destroyCalls := 0
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch request.Method {
		case http.MethodGet:
			response.Header().Set("Content-Type", "application/json")
			if _, err := response.Write([]byte(body)); err != nil {
				t.Errorf("write runtime response: %v", err)
			}
		case http.MethodDelete:
			destroyCalls++
			response.WriteHeader(http.StatusNoContent)
		default:
			t.Fatalf("request method = %q", request.Method)
		}
	}))
	t.Cleanup(server.Close)

	adapter, err := sprites.NewAdapterWithBaseURL("provider-token", server.URL)
	if err != nil {
		t.Fatalf("NewAdapterWithBaseURL: %v", err)
	}
	observation, found, err := adapter.Inspect(context.Background(), name)
	if err != nil || !found {
		t.Fatalf("Adapter.Inspect found = %t, error = %v", found, err)
	}
	if observation.Name != name || !identity.OwnsObservedLabels(observation.Labels) {
		t.Fatalf("observation = %+v", observation)
	}
	if observation.Activity != runtimeprovider.RuntimeActivityWarm ||
		observation.URLAccess != runtimeprovider.URLAccessAuthenticated {
		t.Fatalf("observation activity = %q, access = %q", observation.Activity, observation.URLAccess)
	}
	if observation.Placement != "" {
		t.Fatalf("observation placement = %q, want empty because the API stopped reporting it", observation.Placement)
	}
	if err := adapter.Destroy(context.Background(), name); err != nil {
		t.Fatalf("Adapter.Destroy: %v", err)
	}
	if destroyCalls != 1 {
		t.Fatalf("provider destroy calls = %d, want 1", destroyCalls)
	}
}

// A live Sprite that Setta cannot fully observe is billable all the same. Here
// the provider omits URL settings, so the fuller observation cannot be mapped.
// Cleanup must still see and delete it, or the run strands a machine nobody is
// watching.
func TestRuntimeWithUnmappableObservationRemainsListableAndDestroyable(t *testing.T) {
	name := testManagedRuntimeName()
	identity, err := runtimeprovider.ManagedIdentityFromName(name)
	if err != nil {
		t.Fatal(err)
	}
	destroyCalls := 0
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/v1/sprites/"+name {
			t.Fatalf("request path = %q", request.URL.Path)
		}
		switch request.Method {
		case http.MethodGet:
			response.Header().Set("Content-Type", "application/json")
			if err := json.NewEncoder(response).Encode(map[string]any{
				"id":             "sprite_unmapped",
				"name":           name,
				"status":         "provisioning",
				"labels":         identity.Labels,
				"primary_region": "yyz",
			}); err != nil {
				t.Errorf("encode runtime response: %v", err)
			}
		case http.MethodDelete:
			destroyCalls++
			response.WriteHeader(http.StatusNoContent)
		default:
			t.Fatalf("request method = %q", request.Method)
		}
	}))
	t.Cleanup(server.Close)

	adapter, err := sprites.NewAdapterWithBaseURL("provider-token", server.URL)
	if err != nil {
		t.Fatalf("NewAdapterWithBaseURL: %v", err)
	}
	if _, _, err := adapter.Inspect(context.Background(), name); err == nil {
		t.Fatal("Adapter.Inspect accepted a runtime with no URL settings")
	}
	if err := adapter.Destroy(context.Background(), name); err != nil {
		t.Fatalf("Adapter.Destroy: %v", err)
	}

	cleanup := newSpritesCleanupClient(adapter, "setta-100", name)
	listed, err := cleanup.List(context.Background(), "setta-100")
	if err != nil {
		t.Fatalf("SpritesCleanupClient.List: %v", err)
	}
	want := []ProviderResource{{ID: "sprite_unmapped", Name: name, Region: "yyz"}}
	if !reflect.DeepEqual(listed, want) {
		t.Fatalf("SpritesCleanupClient.List resources = %+v, want %+v", listed, want)
	}
	if err := cleanup.Destroy(context.Background(), "setta-100", "sprite_unmapped"); err != nil {
		t.Fatalf("SpritesCleanupClient.Destroy: %v", err)
	}
	if destroyCalls != 2 {
		t.Fatalf("provider destroy calls = %d, want 2", destroyCalls)
	}
}

func TestSpritesCleanupClientInspectsAndDestroysExactOwnedRuntime(t *testing.T) {
	name := testManagedRuntimeName()
	identity, err := runtimeprovider.ManagedIdentityFromName(name)
	if err != nil {
		t.Fatal(err)
	}
	api := &fakeSpritesCleanupAPI{observation: runtimeprovider.RuntimeIdentityObservation{
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

func TestReorderedProviderLabelsAreAcceptedAcrossOwnershipChecks(t *testing.T) {
	name := testManagedRuntimeName()
	identity, err := runtimeprovider.ManagedIdentityFromName(name)
	if err != nil {
		t.Fatal(err)
	}
	reorderedLabels := []string{identity.Labels[1], identity.Labels[0]}

	tests := []struct {
		name  string
		check func(*testing.T) error
	}{
		{
			name: "Sprites adapter",
			check: func(t *testing.T) error {
				destroyCalls := 0
				server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
					if request.URL.Path != "/v1/sprites/"+name {
						t.Fatalf("request path = %q", request.URL.Path)
					}
					switch request.Method {
					case http.MethodGet:
						response.Header().Set("Content-Type", "application/json")
						if err := json.NewEncoder(response).Encode(map[string]any{
							"id":             "sprite_123",
							"name":           name,
							"status":         "running",
							"labels":         reorderedLabels,
							"primary_region": "yyz",
							"config": map[string]any{
								"cpus": 1, "ram_mb": 512, "storage_gb": 10,
							},
							"url_settings": map[string]any{"auth": "sprite"},
						}); err != nil {
							t.Errorf("encode runtime response: %v", err)
						}
					case http.MethodDelete:
						destroyCalls++
						response.WriteHeader(http.StatusNoContent)
					default:
						t.Fatalf("request method = %q", request.Method)
					}
				}))
				t.Cleanup(server.Close)

				adapter, err := sprites.NewAdapterWithBaseURL("provider-token", server.URL)
				if err != nil {
					t.Fatalf("NewAdapterWithBaseURL: %v", err)
				}
				if err := adapter.Destroy(context.Background(), name); err != nil {
					return err
				}
				if destroyCalls != 1 {
					t.Fatalf("provider destroy calls = %d, want 1", destroyCalls)
				}
				return nil
			},
		},
		{
			name: "provisioner",
			check: func(*testing.T) error {
				return validateSpriteObservation(identity, runtimeprovider.RuntimeObservation{
					ProviderResourceID: "sprite_123",
					Name:               name,
					Labels:             reorderedLabels,
					Placement:          "yyz",
				})
			},
		},
		{
			name: "cleanup list",
			check: func(t *testing.T) error {
				api := &fakeSpritesCleanupAPI{observation: runtimeprovider.RuntimeIdentityObservation{
					ProviderResourceID: "sprite_123",
					Name:               name,
					Labels:             reorderedLabels,
					Placement:          "yyz",
				}, found: true}
				listed, err := newSpritesCleanupClient(api, "setta-100", name).
					List(context.Background(), "setta-100")
				if err != nil {
					return err
				}
				want := []ProviderResource{{ID: "sprite_123", Name: name, Region: "yyz"}}
				if !reflect.DeepEqual(listed, want) {
					t.Fatalf("resources = %+v, want %+v", listed, want)
				}
				return nil
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := test.check(t); err != nil {
				t.Fatalf("reordered labels rejected: %v", err)
			}
		})
	}
}

func TestSpritesCleanupClientDestroysRuntimeWithReorderedOwnershipLabels(t *testing.T) {
	name := testManagedRuntimeName()
	identity, err := runtimeprovider.ManagedIdentityFromName(name)
	if err != nil {
		t.Fatal(err)
	}
	api := &fakeSpritesCleanupAPI{observation: runtimeprovider.RuntimeIdentityObservation{
		ProviderResourceID: "sprite_123",
		Name:               name,
		Labels:             []string{identity.Labels[1], identity.Labels[0]},
		Placement:          "yyz",
	}, found: true}
	client := newSpritesCleanupClient(api, "setta-100", name)

	if err := client.Destroy(context.Background(), "setta-100", "sprite_123"); err != nil {
		t.Fatalf("Destroy reordered-label Sprite: %v", err)
	}
	if api.destroyedName != name {
		t.Fatalf("destroyed name = %q, want %q", api.destroyedName, name)
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
	tests := []runtimeprovider.RuntimeIdentityObservation{
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
	api = &fakeSpritesCleanupAPI{observation: runtimeprovider.RuntimeIdentityObservation{
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
	observation   runtimeprovider.RuntimeIdentityObservation
	found         bool
	inspectErr    error
	destroyErr    error
	destroyedName string
}

func (api *fakeSpritesCleanupAPI) InspectIdentity(
	context.Context,
	string,
) (runtimeprovider.RuntimeIdentityObservation, bool, error) {
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
