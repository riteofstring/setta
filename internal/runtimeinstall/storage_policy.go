package runtimeinstall

import (
	"fmt"
	"strconv"

	"setta/internal/runtimeprovider"
)

type StoragePolicy struct {
	MinimumFreeMiB int
}

func validateStoragePolicy(policy *StoragePolicy) error {
	if policy == nil {
		return nil
	}
	if policy.MinimumFreeMiB <= 0 {
		return fmt.Errorf(
			"%w: runtime minimum free storage must be positive",
			runtimeprovider.ErrInvalidContract,
		)
	}
	return nil
}

func appendStoragePolicyArguments(arguments []string, policy *StoragePolicy) []string {
	if policy == nil {
		return arguments
	}
	return append(
		arguments,
		"--minimum-disk-free-mib",
		strconv.Itoa(policy.MinimumFreeMiB),
	)
}
