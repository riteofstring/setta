package hostedmeasurement

import (
	"context"
	"errors"
	"fmt"

	"setta/internal/runtimeprovider"
	settasprites "setta/internal/sprites"
)

type spritesCleanupAPI interface {
	Destroy(context.Context, string) error
	Inspect(context.Context, string) (runtimeprovider.RuntimeObservation, bool, error)
}

type SpritesCleanupClient struct {
	api          spritesCleanupAPI
	expectedName string
	organization string
}

func NewSpritesCleanupClient(token []byte, organization string, expectedName string) (*SpritesCleanupClient, error) {
	if !validFlyToken(token) {
		return nil, errors.New("Sprites cleanup token must be non-empty printable ASCII")
	}
	if !organizationPattern.MatchString(organization) {
		return nil, errors.New("Sprites cleanup organization must be a provider slug")
	}
	if err := runtimeprovider.ValidateManagedName(expectedName); err != nil {
		return nil, fmt.Errorf("Sprites cleanup expected name: %w", err)
	}
	api, err := settasprites.NewAdapter(string(token))
	if err != nil {
		return nil, errors.New("create Sprites cleanup client failed")
	}
	return newSpritesCleanupClient(api, organization, expectedName), nil
}

func newSpritesCleanupClient(api spritesCleanupAPI, organization string, expectedName string) *SpritesCleanupClient {
	return &SpritesCleanupClient{api: api, organization: organization, expectedName: expectedName}
}

func (client *SpritesCleanupClient) List(ctx context.Context, organization string) ([]ProviderResource, error) {
	if organization != client.organization {
		return nil, errors.New("Sprites cleanup organization differs from authorization")
	}
	identity, err := runtimeprovider.ManagedIdentityFromName(client.expectedName)
	if err != nil {
		return nil, errors.New("Sprites cleanup identity is invalid")
	}
	observation, found, err := client.api.Inspect(ctx, client.expectedName)
	if err != nil {
		return nil, errors.New("Sprites cleanup inventory request failed")
	}
	if !found {
		return nil, nil
	}
	if observation.Name != client.expectedName || !identity.OwnsObservedLabels(observation.Labels) {
		return nil, errors.New("Sprites cleanup inventory ownership differs")
	}
	resource := ProviderResource{
		ID: observation.ProviderResourceID, Name: observation.Name, Region: observation.Placement,
	}
	if !opaqueIDPattern.MatchString(resource.ID) || resource.Region != "" && !regionPattern.MatchString(resource.Region) {
		return nil, errors.New("Sprites cleanup inventory contains an invalid provider identity")
	}
	return []ProviderResource{resource}, nil
}

func (client *SpritesCleanupClient) Destroy(ctx context.Context, organization string, id string) error {
	resources, err := client.List(ctx, organization)
	if err != nil {
		return err
	}
	if len(resources) == 0 {
		return ErrProviderNotFound
	}
	if len(resources) != 1 || resources[0].ID != id {
		return ErrAmbiguousInventory
	}
	if err := client.api.Destroy(ctx, client.expectedName); err != nil {
		return errors.New("Sprites cleanup delete failed")
	}
	return nil
}

var _ SpriteProvider = (*SpritesCleanupClient)(nil)
