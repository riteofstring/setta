package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"time"

	"setta/internal/hostedmeasurement"
)

const hostedCleanupHTTPTimeout = 30 * time.Second

type cleanupFlags struct {
	FlyInventoryTokenPath string
	FlyMutationTokenPath  string
	ManifestPath          string
	SpritesTokenPath      string
}

type cleanupCompleteEvent struct {
	Event string `json:"event"`
	RunID string `json:"run_id"`
}

func runCleanup(
	ctx context.Context,
	args []string,
	stdout io.Writer,
	stderr io.Writer,
	now func() time.Time,
) int {
	flags, err := parseCleanupFlags(args, stderr)
	if err != nil {
		fmt.Fprintf(stderr, "%v\n", err)
		return 2
	}
	authorization, err := hostedmeasurement.LoadManifest(flags.ManifestPath, now(), hostedmeasurement.ValidateForCleanup)
	if err != nil {
		fmt.Fprintf(stderr, "validate hosted measurement cleanup authorization: %v\n", err)
		return 1
	}
	store, err := hostedmeasurement.OpenExistingStateStore(authorization.StateDirectory, authorization)
	if err != nil {
		fmt.Fprintf(stderr, "open hosted measurement cleanup state: %v\n", err)
		return 1
	}
	fly, sprites, err := cleanupProviders(flags, authorization, store.Snapshot())
	if err != nil {
		fmt.Fprintf(stderr, "%v\n", err)
		return 1
	}
	coordinator := hostedmeasurement.CleanupCoordinator{
		Fly: fly, Sprites: sprites, Now: now, Wait: waitForCleanupInventory, State: store,
	}
	if err := coordinator.Cleanup(ctx, authorization); err != nil {
		fmt.Fprintf(stderr, "hosted measurement cleanup failed: %v\n", err)
		return 1
	}
	event := cleanupCompleteEvent{Event: "hosted_measurement_cleanup_complete", RunID: authorization.Manifest.RunID}
	if err := json.NewEncoder(stdout).Encode(event); err != nil {
		fmt.Fprintf(stderr, "write hosted measurement cleanup result: %v\n", err)
		return 1
	}
	return 0
}

func parseCleanupFlags(args []string, stderr io.Writer) (cleanupFlags, error) {
	var config cleanupFlags
	flagSet := flag.NewFlagSet("setta-hosted-measurement cleanup", flag.ContinueOnError)
	flagSet.SetOutput(stderr)
	flagSet.StringVar(&config.ManifestPath, "manifest", "", "absolute private authorization manifest path")
	flagSet.StringVar(&config.FlyMutationTokenPath, "fly-mutation-token-file", "", "absolute private Fly mutation token file")
	flagSet.StringVar(&config.FlyInventoryTokenPath, "fly-inventory-token-file", "", "absolute private Fly inventory token file")
	flagSet.StringVar(&config.SpritesTokenPath, "sprites-token-file", "", "absolute private Sprites token file")
	if err := flagSet.Parse(args); err != nil {
		return cleanupFlags{}, err
	}
	if flagSet.NArg() != 0 {
		return cleanupFlags{}, errors.New("setta-hosted-measurement cleanup does not accept positional arguments")
	}
	if config.ManifestPath == "" {
		return cleanupFlags{}, errors.New("--manifest is required")
	}
	return config, nil
}

func cleanupProviders(
	flags cleanupFlags,
	authorization hostedmeasurement.Authorization,
	state hostedmeasurement.State,
) (hostedmeasurement.FlyProvider, hostedmeasurement.SpriteProvider, error) {
	var fly hostedmeasurement.FlyProvider
	var sprites hostedmeasurement.SpriteProvider
	if hostedmeasurement.StateRequiresFlyCleanup(state) {
		client, err := flyCleanupProvider(flags, authorization)
		if err != nil {
			return nil, nil, err
		}
		fly = client
	}
	if hostedmeasurement.StateRequiresSpriteCleanup(state) {
		client, err := spritesCleanupProvider(flags, authorization, state)
		if err != nil {
			return nil, nil, err
		}
		sprites = client
	}
	return fly, sprites, nil
}

func flyCleanupProvider(flags cleanupFlags, authorization hostedmeasurement.Authorization) (*hostedmeasurement.FlyMachinesClient, error) {
	if flags.FlyMutationTokenPath == "" || flags.FlyInventoryTokenPath == "" {
		return nil, errors.New("Fly cleanup state requires --fly-mutation-token-file and --fly-inventory-token-file")
	}
	mutationToken, err := hostedmeasurement.ReadPrivateCredentialFile(flags.FlyMutationTokenPath, authorization)
	if err != nil {
		return nil, fmt.Errorf("read Fly mutation credential: %w", err)
	}
	inventoryToken, err := hostedmeasurement.ReadPrivateCredentialFile(flags.FlyInventoryTokenPath, authorization)
	if err != nil {
		return nil, fmt.Errorf("read Fly inventory credential: %w", err)
	}
	return hostedmeasurement.NewFlyMachinesClient(hostedmeasurement.FlyMachinesClientConfig{
		BaseURL:        hostedmeasurement.DefaultFlyMachinesAPI,
		HTTPClient:     &http.Client{Timeout: hostedCleanupHTTPTimeout},
		MutationToken:  mutationToken,
		InventoryToken: inventoryToken,
	})
}

func spritesCleanupProvider(
	flags cleanupFlags,
	authorization hostedmeasurement.Authorization,
	state hostedmeasurement.State,
) (*hostedmeasurement.SpritesCleanupClient, error) {
	if flags.SpritesTokenPath == "" {
		return nil, errors.New("Sprite cleanup state requires --sprites-token-file")
	}
	token, err := hostedmeasurement.ReadPrivateCredentialFile(flags.SpritesTokenPath, authorization)
	if err != nil {
		return nil, fmt.Errorf("read Sprites cleanup credential: %w", err)
	}
	name, ok := hostedmeasurement.SpriteNameFromState(state)
	if !ok {
		return nil, errors.New("Sprite cleanup state has no durable Sprite identity")
	}
	return hostedmeasurement.NewSpritesCleanupClient(token, authorization.Manifest.SpritesOrganization, name)
}

func waitForCleanupInventory(ctx context.Context, duration time.Duration) error {
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
