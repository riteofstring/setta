package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"time"

	"setta/internal/runtimeprovider"
	"setta/internal/sprites"
)

const operationTimeout = 10 * time.Second

type output struct {
	Found     bool      `json:"found"`
	Name      string    `json:"name,omitempty"`
	StartedAt time.Time `json:"started_at,omitempty"`
	ExpiresAt time.Time `json:"expires_at,omitempty"`
}

func main() {
	if err := run(os.Args[1:]); err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(arguments []string) error {
	if len(arguments) < 2 {
		return errors.New("usage: setta-sprite-lease-probe <acquire|renew|inspect|release> <name> [ttl]")
	}

	ctx, cancel := context.WithTimeout(context.Background(), operationTimeout)
	defer cancel()
	client := sprites.NewWorkloadLeaseClient()

	switch arguments[0] {
	case "acquire":
		ttl, err := parseTTL(arguments)
		if err != nil {
			return err
		}
		lease, err := client.Acquire(ctx, runtimeprovider.WorkloadLeaseRequest{Name: arguments[1], TTL: ttl})
		return writeLease(lease, true, err)
	case "renew":
		ttl, err := parseTTL(arguments)
		if err != nil {
			return err
		}
		lease, err := client.Renew(ctx, arguments[1], ttl)
		return writeLease(lease, true, err)
	case "inspect":
		if len(arguments) != 2 {
			return errors.New("inspect requires a name")
		}
		lease, found, err := client.Inspect(ctx, arguments[1])
		return writeLease(lease, found, err)
	case "release":
		if len(arguments) != 2 {
			return errors.New("release requires a name")
		}
		if err := client.Release(ctx, arguments[1]); err != nil {
			return err
		}
		return json.NewEncoder(os.Stdout).Encode(output{Found: false})
	default:
		return fmt.Errorf("unknown operation %q", arguments[0])
	}
}

func parseTTL(arguments []string) (time.Duration, error) {
	if len(arguments) != 3 {
		return 0, errors.New("operation requires a name and TTL")
	}
	ttl, err := time.ParseDuration(arguments[2])
	if err != nil {
		return 0, fmt.Errorf("parse TTL: %w", err)
	}
	return ttl, nil
}

func writeLease(lease runtimeprovider.WorkloadLease, found bool, err error) error {
	if err != nil {
		return err
	}
	return json.NewEncoder(os.Stdout).Encode(output{
		Found:     found,
		Name:      lease.Name,
		StartedAt: lease.StartedAt,
		ExpiresAt: lease.ExpiresAt,
	})
}
