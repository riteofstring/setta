package hostedmeasurement

import (
	"context"
	"errors"
	"net/http"
	"reflect"
	"strings"
	"testing"

	spritessdk "github.com/superfly/sprites-go"

	"setta/internal/runtimeprovider"
)

func TestSpritesCleanupClientListsOwnedRuntimeWithBoundedPaginationAndDestroysExactID(t *testing.T) {
	name := testManagedRuntimeName()
	identity, err := runtimeprovider.ManagedIdentityFromName(name)
	if err != nil {
		t.Fatal(err)
	}
	sprite := spritessdk.SpriteInfo{
		ID: "sprite_123", Name: name, Organization: "setta-100", Labels: identity.Labels, PrimaryRegion: "yyz",
	}
	api := &fakeSpritesCleanupAPI{pages: []*spritessdk.SpriteList{
		{HasMore: true, NextContinuationToken: "page-two"},
		{Sprites: []spritessdk.SpriteInfo{sprite}},
		{Sprites: []spritessdk.SpriteInfo{sprite}},
	}}
	client := newSpritesCleanupClient(api, "setta-100", name)
	resources, err := client.List(context.Background(), "setta-100")
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	want := []ProviderResource{{ID: "sprite_123", Name: name, Region: "yyz"}}
	if !reflect.DeepEqual(resources, want) {
		t.Fatalf("resources = %+v, want %+v", resources, want)
	}
	if err := client.Destroy(context.Background(), "setta-100", "sprite_123"); err != nil {
		t.Fatalf("Destroy: %v", err)
	}
	if api.deletedName != name {
		t.Fatalf("deleted name = %q, want %q", api.deletedName, name)
	}
	if len(api.options) != 3 || api.options[0].ContinuationToken != "" || api.options[1].ContinuationToken != "page-two" {
		t.Fatalf("list options = %+v", api.options)
	}
}

func TestSpritesCleanupClientFailsClosedOnOwnershipOrganizationAndContentfulErrors(t *testing.T) {
	name := testManagedRuntimeName()
	identity, err := runtimeprovider.ManagedIdentityFromName(name)
	if err != nil {
		t.Fatal(err)
	}
	tests := []spritessdk.SpriteInfo{
		{ID: "sprite_123", Name: name, Organization: "wrong-org", Labels: identity.Labels},
		{ID: "sprite_123", Name: name, Organization: "setta-100", Labels: []string{"wrong-label"}},
		{ID: "sprite_123", Name: name + "-other", Organization: "setta-100", Labels: identity.Labels},
	}
	for _, sprite := range tests {
		api := &fakeSpritesCleanupAPI{pages: []*spritessdk.SpriteList{{Sprites: []spritessdk.SpriteInfo{sprite}}}}
		client := newSpritesCleanupClient(api, "setta-100", name)
		if _, err := client.List(context.Background(), "setta-100"); err == nil {
			t.Fatalf("List accepted unsafe Sprite inventory: %+v", sprite)
		}
	}
	api := &fakeSpritesCleanupAPI{listErr: errors.New("sprite-token-sentinel provider detail")}
	client := newSpritesCleanupClient(api, "setta-100", name)
	_, err = client.List(context.Background(), "setta-100")
	if err == nil || strings.Contains(err.Error(), "sentinel") || strings.Contains(err.Error(), "provider detail") {
		t.Fatalf("contentful Sprite error = %v", err)
	}
}

func TestSpritesCleanupClientRejectsRepeatedPaginationAndWrongDeleteID(t *testing.T) {
	name := testManagedRuntimeName()
	api := &fakeSpritesCleanupAPI{pages: []*spritessdk.SpriteList{
		{HasMore: true, NextContinuationToken: "repeat"},
		{HasMore: true, NextContinuationToken: "repeat"},
	}}
	client := newSpritesCleanupClient(api, "setta-100", name)
	if _, err := client.List(context.Background(), "setta-100"); err == nil {
		t.Fatal("List accepted repeated pagination token")
	}
	identity, err := runtimeprovider.ManagedIdentityFromName(name)
	if err != nil {
		t.Fatal(err)
	}
	api = &fakeSpritesCleanupAPI{pages: []*spritessdk.SpriteList{{Sprites: []spritessdk.SpriteInfo{{
		ID: "sprite_123", Name: name, Organization: "setta-100", Labels: identity.Labels,
	}}}}}
	client = newSpritesCleanupClient(api, "setta-100", name)
	if err := client.Destroy(context.Background(), "setta-100", "wrong-id"); !errors.Is(err, ErrAmbiguousInventory) {
		t.Fatalf("Destroy wrong id error = %v", err)
	}
	api.pages = []*spritessdk.SpriteList{{Sprites: []spritessdk.SpriteInfo{{
		ID: "sprite_123", Name: name, Organization: "setta-100", Labels: identity.Labels,
	}}}}
	api.deleteErr = &spritessdk.APIError{StatusCode: http.StatusNotFound, Message: "contentful missing detail"}
	if err := client.Destroy(context.Background(), "setta-100", "sprite_123"); !errors.Is(err, ErrProviderNotFound) {
		t.Fatalf("Destroy missing Sprite error = %v", err)
	}
}

type fakeSpritesCleanupAPI struct {
	pages       []*spritessdk.SpriteList
	listErr     error
	deleteErr   error
	deletedName string
	options     []spritessdk.ListOptions
}

func (api *fakeSpritesCleanupAPI) ListSprites(_ context.Context, options *spritessdk.ListOptions) (*spritessdk.SpriteList, error) {
	api.options = append(api.options, *options)
	if api.listErr != nil {
		return nil, api.listErr
	}
	if len(api.pages) == 0 {
		return &spritessdk.SpriteList{}, nil
	}
	page := api.pages[0]
	api.pages = api.pages[1:]
	return page, nil
}

func (api *fakeSpritesCleanupAPI) DeleteSprite(_ context.Context, name string) error {
	api.deletedName = name
	return api.deleteErr
}

func testManagedRuntimeName() string {
	return "setta-u-" + strings.Repeat("a", 32)
}

var _ spritesCleanupAPI = (*fakeSpritesCleanupAPI)(nil)
