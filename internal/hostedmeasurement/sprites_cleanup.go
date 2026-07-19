package hostedmeasurement

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"slices"

	spritessdk "github.com/superfly/sprites-go"

	"setta/internal/runtimeprovider"
)

const (
	maximumSpritesInventoryPages = 10
	spritesInventoryPageSize     = 100
)

type spritesCleanupAPI interface {
	ListSprites(context.Context, *spritessdk.ListOptions) (*spritessdk.SpriteList, error)
	DeleteSprite(context.Context, string) error
}

type SpritesCleanupClient struct {
	api          spritesCleanupAPI
	expectedName string
	organization string
}

func NewSpritesCleanupClient(token []byte, organization string, expectedName string) (*SpritesCleanupClient, error) {
	if !validFlyToken(token) {
		return nil, errors.New("Sprites cleanup token must be non-empty visible ASCII")
	}
	if !organizationPattern.MatchString(organization) {
		return nil, errors.New("Sprites cleanup organization must be a provider slug")
	}
	if err := runtimeprovider.ValidateManagedName(expectedName); err != nil {
		return nil, fmt.Errorf("Sprites cleanup expected name: %w", err)
	}
	api := spritessdk.New(string(token), spritessdk.WithDisableControl())
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
	continuation := ""
	seenContinuations := make(map[string]struct{})
	resources := make([]ProviderResource, 0, 1)
	for page := 0; page < maximumSpritesInventoryPages; page++ {
		result, listErr := client.api.ListSprites(ctx, &spritessdk.ListOptions{
			Prefix: client.expectedName, MaxResults: spritesInventoryPageSize, ContinuationToken: continuation,
		})
		if listErr != nil {
			return nil, errors.New("Sprites cleanup inventory request failed")
		}
		pageResources, mapErr := client.mapPage(result, identity)
		if mapErr != nil {
			return nil, mapErr
		}
		resources = append(resources, pageResources...)
		if !result.HasMore {
			return resources, nil
		}
		continuation = result.NextContinuationToken
		if continuation == "" {
			return nil, errors.New("Sprites cleanup inventory omitted its continuation token")
		}
		if _, repeated := seenContinuations[continuation]; repeated {
			return nil, errors.New("Sprites cleanup inventory repeated its continuation token")
		}
		seenContinuations[continuation] = struct{}{}
	}
	return nil, errors.New("Sprites cleanup inventory exceeded the page limit")
}

func (client *SpritesCleanupClient) Destroy(ctx context.Context, organization string, id string) error {
	resources, err := client.List(ctx, organization)
	if err != nil {
		return err
	}
	if len(resources) == 0 {
		return ErrProviderNotFound
	}
	if len(resources) != 1 || resources[0].ID != id || resources[0].Name != client.expectedName {
		return ErrAmbiguousInventory
	}
	if err := client.api.DeleteSprite(ctx, client.expectedName); err != nil {
		var apiError *spritessdk.APIError
		if errors.As(err, &apiError) && apiError.StatusCode == http.StatusNotFound {
			return ErrProviderNotFound
		}
		return errors.New("Sprites cleanup delete failed")
	}
	return nil
}

func (client *SpritesCleanupClient) mapPage(
	page *spritessdk.SpriteList,
	identity runtimeprovider.ManagedIdentity,
) ([]ProviderResource, error) {
	if page == nil {
		return nil, errors.New("Sprites cleanup inventory returned no page")
	}
	resources := make([]ProviderResource, 0, len(page.Sprites))
	for _, sprite := range page.Sprites {
		if sprite.Name != client.expectedName || sprite.Organization != client.organization {
			return nil, ErrAmbiguousInventory
		}
		if !slices.Equal(sprite.Labels, identity.Labels) {
			return nil, errors.New("Sprites cleanup inventory ownership labels differ")
		}
		resource := ProviderResource{ID: sprite.ID, Name: sprite.Name, Region: sprite.PrimaryRegion}
		if !opaqueIDPattern.MatchString(resource.ID) || resource.Region != "" && !regionPattern.MatchString(resource.Region) {
			return nil, errors.New("Sprites cleanup inventory contains an invalid provider identity")
		}
		resources = append(resources, resource)
	}
	return resources, nil
}

var _ SpriteProvider = (*SpritesCleanupClient)(nil)
