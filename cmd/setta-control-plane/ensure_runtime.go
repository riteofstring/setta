package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"path/filepath"

	"setta/internal/controlplane"
)

type ensureRuntimeConfig struct {
	CredentialEpoch  uint64
	DataDirectory    string
	IdempotencyKey   string
	RuntimeName      string
	RuntimeRelease   string
	RuntimeSecretRef string
	RuntimeTarget    string
	UserID           string
}

type ensureRuntimeEvent struct {
	Event          string                              `json:"event"`
	IdempotencyKey string                              `json:"idempotency_key"`
	RuntimeName    string                              `json:"runtime_name"`
	Status         controlplane.RuntimeOperationStatus `json:"status"`
}

func runEnsureRuntime(
	args []string,
	stdout io.Writer,
	stderr io.Writer,
	getenv func(string) string,
) int {
	config, err := ensureRuntimeConfigFromArgs(args, stderr, getenv)
	if err != nil {
		fmt.Fprintf(stderr, "%v\n", err)
		return 2
	}
	if err := queueEnsureRuntime(context.Background(), config, stdout); err != nil {
		fmt.Fprintf(stderr, "ensure runtime: %v\n", err)
		return 1
	}
	return 0
}

func queueEnsureRuntime(
	ctx context.Context,
	config ensureRuntimeConfig,
	stdout io.Writer,
) (returnErr error) {
	store, err := controlplane.OpenStore(controlplane.StoreConfig{Directory: config.DataDirectory})
	if err != nil {
		return err
	}
	defer func() {
		if err := store.Close(); err != nil && returnErr == nil {
			returnErr = err
		}
	}()
	if _, err := store.UpsertUser(ctx, config.UserID); err != nil {
		return err
	}
	operation, err := store.EnsureRuntimeIntent(ctx, controlplane.EnsureRuntimeRequest{
		IdempotencyKey:      config.IdempotencyKey,
		UserID:              config.UserID,
		RuntimeName:         config.RuntimeName,
		CredentialEpoch:     config.CredentialEpoch,
		UpstreamAuthority:   config.RuntimeTarget,
		CredentialSecretRef: config.RuntimeSecretRef,
		DesiredRelease:      config.RuntimeRelease,
	})
	if err != nil {
		return err
	}
	return json.NewEncoder(stdout).Encode(ensureRuntimeEvent{
		Event:          "control_plane_runtime_queued",
		IdempotencyKey: operation.IdempotencyKey,
		RuntimeName:    operation.RuntimeName,
		Status:         operation.Status,
	})
}

func ensureRuntimeConfigFromArgs(
	args []string,
	stderr io.Writer,
	getenv func(string) string,
) (ensureRuntimeConfig, error) {
	config := ensureRuntimeConfig{
		CredentialEpoch: 1,
		DataDirectory:   getenv("SETTA_CONTROL_PLANE_DATA_DIR"),
		RuntimeTarget:   defaultRuntimeTarget,
	}
	flagSet := flag.NewFlagSet("setta-control-plane ensure-runtime", flag.ContinueOnError)
	flagSet.SetOutput(stderr)
	flagSet.Uint64Var(&config.CredentialEpoch, "credential-epoch", config.CredentialEpoch, "runtime credential epoch")
	flagSet.StringVar(&config.DataDirectory, "data-dir", config.DataDirectory, "absolute durable control-plane database directory")
	flagSet.StringVar(&config.IdempotencyKey, "idempotency-key", "", "unique ensure-runtime operation key")
	flagSet.StringVar(&config.RuntimeName, "runtime-name", "", "deterministic Setta-managed runtime name")
	flagSet.StringVar(&config.RuntimeRelease, "runtime-release", "", "desired Setta runtime release")
	flagSet.StringVar(&config.RuntimeSecretRef, "runtime-secret-ref", "", "future runtime credential secret reference")
	flagSet.StringVar(&config.RuntimeTarget, "runtime-target", config.RuntimeTarget, "loopback runtime HTTP target")
	flagSet.StringVar(&config.UserID, "user-id", "", "immutable Setta user identifier")
	if err := flagSet.Parse(args); err != nil {
		return ensureRuntimeConfig{}, err
	}
	if flagSet.NArg() != 0 {
		return ensureRuntimeConfig{}, errors.New("ensure-runtime does not accept positional arguments")
	}
	if config.DataDirectory == "" || !filepath.IsAbs(config.DataDirectory) {
		return ensureRuntimeConfig{}, errors.New("control-plane data directory must be absolute")
	}
	if config.CredentialEpoch == 0 || config.IdempotencyKey == "" || config.RuntimeName == "" ||
		config.RuntimeRelease == "" || config.RuntimeSecretRef == "" || config.UserID == "" {
		return ensureRuntimeConfig{}, errors.New("ensure-runtime identity, runtime, release, secret reference, epoch, and idempotency key are required")
	}
	return config, nil
}
