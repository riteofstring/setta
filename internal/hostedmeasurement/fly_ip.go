package hostedmeasurement

import (
	"context"
	"encoding/json"
	"errors"
)

type FlyPublicIPPreparer struct {
	inventoryToken string
	mutationToken  string
	runner         FlyCommandRunner
}

type flyIPAddress struct {
	Address string `json:"address"`
	Type    string `json:"type"`
}

func NewFlyPublicIPPreparer(runner FlyCommandRunner, inventoryToken []byte, mutationToken []byte) (*FlyPublicIPPreparer, error) {
	if runner == nil {
		return nil, errors.New("Fly public IP preparer requires a command runner")
	}
	if err := validateFlyTokens(mutationToken, inventoryToken); err != nil {
		return nil, err
	}
	return &FlyPublicIPPreparer{runner: runner, inventoryToken: string(inventoryToken), mutationToken: string(mutationToken)}, nil
}

func (preparer *FlyPublicIPPreparer) EnsureSharedIPv4(ctx context.Context, appName string) error {
	present, err := preparer.hasExactSharedIPv4(ctx, appName)
	if err != nil || present {
		return err
	}
	if _, err := preparer.runner.Run(ctx, FlyCommand{
		Arguments:   []string{"ips", "allocate-v4", "--shared", "--yes", "--app", appName},
		Environment: map[string]string{"FLY_API_TOKEN": preparer.mutationToken, "NO_COLOR": "1"},
	}); err != nil {
		return errors.New("allocate Fly shared IPv4 failed")
	}
	present, err = preparer.hasExactSharedIPv4(ctx, appName)
	if err != nil {
		return err
	}
	if !present {
		return errors.New("Fly shared IPv4 allocation was not independently confirmed")
	}
	return nil
}

func (preparer *FlyPublicIPPreparer) hasExactSharedIPv4(ctx context.Context, appName string) (bool, error) {
	if !organizationPattern.MatchString(appName) {
		return false, errors.New("Fly public IP inventory requires a valid app name")
	}
	output, err := preparer.runner.Run(ctx, FlyCommand{
		Arguments:   []string{"ips", "list", "--app", appName, "--json"},
		Environment: map[string]string{"FLY_API_TOKEN": preparer.inventoryToken, "NO_COLOR": "1"},
	})
	if err != nil {
		return false, errors.New("inspect Fly public IP inventory failed")
	}
	var addresses []flyIPAddress
	if err := json.Unmarshal(output, &addresses); err != nil {
		return false, errors.New("decode Fly public IP inventory failed")
	}
	shared := 0
	for _, address := range addresses {
		if address.Type == "shared_v4" {
			if address.Address == "" {
				return false, errors.New("Fly shared IPv4 inventory is malformed")
			}
			shared++
		}
	}
	if shared > 1 {
		return false, ErrAmbiguousInventory
	}
	return shared == 1, nil
}
