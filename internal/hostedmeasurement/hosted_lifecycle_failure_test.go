package hostedmeasurement

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"setta/internal/runtimeprovider"
)

func TestSpritesCleanupFailuresExposeHostedLifecycleClassification(t *testing.T) {
	const organization = "setta-100"
	token := []byte("cleanup-token")
	name := testManagedRuntimeName()
	identity, err := runtimeprovider.ManagedIdentityFromName(name)
	if err != nil {
		t.Fatal(err)
	}
	validObservation := runtimeprovider.RuntimeIdentityObservation{
		ProviderResourceID: "sprite_123",
		Name:               name,
		Labels:             identity.Labels,
		Placement:          "yyz",
	}

	tests := []struct {
		name      string
		failure   func() error
		wantCode  string
		retryable bool
	}{
		{
			name: "token",
			failure: func() error {
				_, err := NewSpritesCleanupClient([]byte("invalid\n"), organization, name)
				return err
			},
			wantCode: hostedLifecycleConfigurationInvalidFailureCode,
		},
		{
			name: "organization slug",
			failure: func() error {
				_, err := NewSpritesCleanupClient(token, "invalid_organization", name)
				return err
			},
			wantCode: hostedLifecycleConfigurationInvalidFailureCode,
		},
		{
			name: "expected name",
			failure: func() error {
				_, err := NewSpritesCleanupClient(token, organization, "invalid-name")
				return err
			},
			wantCode: hostedLifecycleConfigurationInvalidFailureCode,
		},
		{
			name: "client creation",
			failure: func() error {
				_, err := newSpritesCleanupClientWithFactory(
					token,
					organization,
					name,
					func(string) (spritesCleanupAPI, error) {
						return nil, errors.New("provider client detail")
					},
				)
				return err
			},
			wantCode: hostedLifecycleConfigurationInvalidFailureCode,
		},
		{
			name: "authorization organization mismatch",
			failure: func() error {
				client := newSpritesCleanupClient(&fakeSpritesCleanupAPI{}, organization, name)
				_, err := client.List(t.Context(), "different-organization")
				return err
			},
			wantCode: hostedLifecycleOwnershipMismatchFailureCode,
		},
		{
			name: "invalid cleanup identity",
			failure: func() error {
				client := newSpritesCleanupClient(&fakeSpritesCleanupAPI{}, organization, "invalid-name")
				_, err := client.List(t.Context(), organization)
				return err
			},
			wantCode: hostedLifecycleConfigurationInvalidFailureCode,
		},
		{
			name: "inventory request",
			failure: func() error {
				client := newSpritesCleanupClient(
					&fakeSpritesCleanupAPI{inspectErr: errors.New("provider inventory detail")},
					organization,
					name,
				)
				_, err := client.List(t.Context(), organization)
				return err
			},
			wantCode:  hostedLifecycleProviderRequestFailureCode,
			retryable: true,
		},
		{
			name: "inventory ownership",
			failure: func() error {
				observation := validObservation
				observation.Name = name + "-foreign"
				client := newSpritesCleanupClient(
					&fakeSpritesCleanupAPI{observation: observation, found: true},
					organization,
					name,
				)
				_, err := client.List(t.Context(), organization)
				return err
			},
			wantCode: hostedLifecycleOwnershipMismatchFailureCode,
		},
		{
			name: "invalid provider identity",
			failure: func() error {
				observation := validObservation
				observation.ProviderResourceID = "invalid\nid"
				client := newSpritesCleanupClient(
					&fakeSpritesCleanupAPI{observation: observation, found: true},
					organization,
					name,
				)
				_, err := client.List(t.Context(), organization)
				return err
			},
			wantCode: hostedLifecycleProviderIdentityInvalidFailureCode,
		},
		{
			name: "delete request",
			failure: func() error {
				client := newSpritesCleanupClient(
					&fakeSpritesCleanupAPI{
						observation: validObservation,
						found:       true,
						destroyErr:  errors.New("provider delete detail"),
					},
					organization,
					name,
				)
				return client.Destroy(t.Context(), organization, validObservation.ProviderResourceID)
			},
			wantCode:  hostedLifecycleProviderRequestFailureCode,
			retryable: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			requireHostedLifecycleFailure(t, test.failure(), test.wantCode, test.retryable)
		})
	}
}

func TestSpriteProvisionFailuresExposeHostedLifecycleClassification(t *testing.T) {
	authorization, _ := loadTestAuthorization(t)
	identity, err := runtimeprovider.NewManagedIdentity("hosted-measurement:" + authorization.Manifest.RunID)
	if err != nil {
		t.Fatal(err)
	}
	resources := authorization.Manifest.SpriteResources
	validObservation := spriteObservation(identity, resources)

	tests := []struct {
		name      string
		failure   func(*testing.T) error
		wantCode  string
		retryable bool
	}{
		{
			name: "missing provisioner dependencies",
			failure: func(*testing.T) error {
				_, err := (SpriteProvisioner{}).Ensure(context.Background(), authorization)
				return err
			},
			wantCode: hostedLifecycleConfigurationInvalidFailureCode,
		},
		{
			name: "inspect request",
			failure: func(t *testing.T) error {
				provisioner, fixtureAuthorization := newFailureTestSpriteProvisioner(
					t,
					&hostedLifecycleTestSpriteProvider{inspectErr: errors.New("provider inspect detail")},
				)
				_, err := provisioner.Ensure(t.Context(), fixtureAuthorization)
				return err
			},
			wantCode:  hostedLifecycleProviderRequestFailureCode,
			retryable: true,
		},
		{
			name: "create and reconciliation requests",
			failure: func(t *testing.T) error {
				provisioner, fixtureAuthorization := newFailureTestSpriteProvisioner(
					t,
					&hostedLifecycleTestSpriteProvider{createErr: errors.New("provider create detail")},
				)
				_, err := provisioner.Ensure(t.Context(), fixtureAuthorization)
				return err
			},
			wantCode:  hostedLifecycleProviderRequestFailureCode,
			retryable: true,
		},
		{
			name: "recorded resource missing",
			failure: func(t *testing.T) error {
				provisioner, fixtureAuthorization := newFailureTestSpriteProvisioner(
					t,
					&hostedLifecycleTestSpriteProvider{},
				)
				if err := provisioner.State.RecordResource(
					ResourceState{
						Kind:         ResourceSprite,
						ID:           validObservation.ProviderResourceID,
						Name:         validObservation.Name,
						ActualRegion: validObservation.Placement,
					},
					OperationCreateAccepted,
					testAuthorizedAt,
				); err != nil {
					t.Fatal(err)
				}
				_, err := provisioner.Ensure(t.Context(), fixtureAuthorization)
				return err
			},
			wantCode: hostedLifecycleRecordedResourceMissingFailureCode,
		},
		{
			name: "owned identity mismatch",
			failure: func(*testing.T) error {
				observation := validObservation
				observation.Labels = []string{"foreign"}
				return validateSpriteObservation(identity, resources, observation)
			},
			wantCode: hostedLifecycleOwnershipMismatchFailureCode,
		},
		{
			name: "authorized resource shape mismatch",
			failure: func(*testing.T) error {
				observation := validObservation
				observation.Resources.MemoryBytes++
				return validateSpriteObservation(identity, resources, observation)
			},
			wantCode: hostedLifecycleResourceShapeMismatchFailureCode,
		},
		{
			name: "invalid placement",
			failure: func(*testing.T) error {
				observation := validObservation
				observation.Placement = "invalid_placement"
				return validateSpriteObservation(identity, resources, observation)
			},
			wantCode: hostedLifecycleProviderIdentityInvalidFailureCode,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			requireHostedLifecycleFailure(t, test.failure(t), test.wantCode, test.retryable)
		})
	}
}

func TestHostedLifecycleFailuresKeepCodesAndMessagesContentFree(t *testing.T) {
	name := testManagedRuntimeName()
	tests := []struct {
		name    string
		content string
		failure func() error
	}{
		{
			name:    "token",
			content: "distinctive-token-content",
			failure: func() error {
				_, err := NewSpritesCleanupClient(
					[]byte("distinctive-token-content\n"),
					"setta-100",
					name,
				)
				return err
			},
		},
		{
			name:    "organization",
			content: "distinctive-organization-content",
			failure: func() error {
				client := newSpritesCleanupClient(
					&fakeSpritesCleanupAPI{},
					"setta-100",
					name,
				)
				_, err := client.List(t.Context(), "distinctive-organization-content")
				return err
			},
		},
		{
			name:    "provider name",
			content: "distinctive-provider-name-content",
			failure: func() error {
				_, err := NewSpritesCleanupClient(
					[]byte("cleanup-token"),
					"setta-100",
					"distinctive-provider-name-content",
				)
				return err
			},
		},
		{
			name:    "provider response",
			content: "distinctive-provider-response-content",
			failure: func() error {
				client := newSpritesCleanupClient(
					&fakeSpritesCleanupAPI{
						inspectErr: errors.New("distinctive-provider-response-content"),
					},
					"setta-100",
					name,
				)
				_, err := client.List(t.Context(), "setta-100")
				return err
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := test.failure()
			code, _, ok := HostedLifecycleFailure(err)
			if !ok {
				t.Fatalf("failure is untyped: %v", err)
			}
			if strings.Contains(code, test.content) || strings.Contains(err.Error(), test.content) {
				t.Fatalf("content %q escaped through code %q or message %q", test.content, code, err)
			}
		})
	}
}

func TestHostedLifecycleFailureDistinguishesRetryableFromOperatorFailures(t *testing.T) {
	name := testManagedRuntimeName()
	retryableClient := newSpritesCleanupClient(
		&fakeSpritesCleanupAPI{inspectErr: errors.New("provider unavailable")},
		"setta-100",
		name,
	)
	_, retryableErr := retryableClient.List(t.Context(), "setta-100")
	requireHostedLifecycleFailure(
		t,
		retryableErr,
		hostedLifecycleProviderRequestFailureCode,
		true,
	)

	operatorClient := newSpritesCleanupClient(&fakeSpritesCleanupAPI{}, "setta-100", name)
	_, operatorErr := operatorClient.List(t.Context(), "different-organization")
	requireHostedLifecycleFailure(
		t,
		operatorErr,
		hostedLifecycleOwnershipMismatchFailureCode,
		false,
	)
}

func TestHostedLifecycleFailuresPreserveWrappingAndCleanupSentinels(t *testing.T) {
	_, wrapped := NewSpritesCleanupClient(
		[]byte("cleanup-token"),
		"setta-100",
		"invalid-name",
	)
	if !errors.Is(wrapped, runtimeprovider.ErrInvalidContract) {
		t.Fatalf("expected-name failure no longer wraps ErrInvalidContract: %v", wrapped)
	}

	name := testManagedRuntimeName()
	client := newSpritesCleanupClient(&fakeSpritesCleanupAPI{}, "setta-100", name)
	if err := client.Destroy(t.Context(), "setta-100", "sprite_123"); !errors.Is(err, ErrProviderNotFound) {
		t.Fatalf("absent Sprite error = %v, want ErrProviderNotFound", err)
	}

	authorization, directory := loadTestAuthorization(t)
	store, err := OpenStateStore(directory, authorization, testAuthorizedAt)
	if err != nil {
		t.Fatal(err)
	}
	resource := ResourceState{
		Kind: ResourceSprite,
		ID:   "sprite_123",
		Name: authorization.Manifest.ResourcePrefix + "-sprite",
	}
	if err := store.RecordResource(resource, OperationCreateAccepted, testAuthorizedAt); err != nil {
		t.Fatal(err)
	}
	listCalls := 0
	list := func(context.Context, string) ([]ProviderResource, error) {
		listCalls++
		if listCalls == 1 {
			return []ProviderResource{{ID: resource.ID, Name: resource.Name}}, nil
		}
		return nil, nil
	}
	destroy := func(context.Context, string, string) error {
		return ErrProviderNotFound
	}
	coordinator := CleanupCoordinator{
		Now:   func() time.Time { return testAuthorizedAt.Add(time.Minute) },
		State: store,
		Wait:  func(context.Context, time.Duration) error { return nil },
	}
	if err := coordinator.cleanupListedResource(
		t.Context(),
		authorization.Manifest.ResourcePrefix,
		"",
		resource,
		list,
		destroy,
	); err != nil {
		t.Fatalf("cleanup did not preserve ErrProviderNotFound handling: %v", err)
	}
}

func requireHostedLifecycleFailure(t *testing.T, err error, wantCode string, wantRetryable bool) {
	t.Helper()
	if err == nil {
		t.Fatal("expected hosted lifecycle failure")
	}
	code, retryable, ok := HostedLifecycleFailure(err)
	if !ok || code != wantCode || retryable != wantRetryable {
		t.Fatalf(
			"hosted lifecycle failure = %q, %t, %t from %v; want %q, %t, true",
			code,
			retryable,
			ok,
			err,
			wantCode,
			wantRetryable,
		)
	}
}

func newFailureTestSpriteProvisioner(
	t *testing.T,
	provider SpriteLifecycleProvider,
) (SpriteProvisioner, Authorization) {
	t.Helper()
	authorization, directory := loadTestAuthorization(t)
	store, err := OpenStateStore(directory, authorization, testAuthorizedAt)
	if err != nil {
		t.Fatal(err)
	}
	return SpriteProvisioner{
		Now:      func() time.Time { return testAuthorizedAt },
		Provider: provider,
		State:    store,
	}, authorization
}

type hostedLifecycleTestSpriteProvider struct {
	inspectErr  error
	createErr   error
	observation runtimeprovider.RuntimeObservation
	found       bool
}

func (provider *hostedLifecycleTestSpriteProvider) Inspect(
	context.Context,
	string,
) (runtimeprovider.RuntimeObservation, bool, error) {
	return provider.observation, provider.found, provider.inspectErr
}

func (provider *hostedLifecycleTestSpriteProvider) Create(
	context.Context,
	runtimeprovider.CreateRequest,
) (runtimeprovider.RuntimeObservation, error) {
	return provider.observation, provider.createErr
}
