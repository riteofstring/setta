package controlplane

import (
	"context"
	"errors"
	"fmt"

	"setta/internal/runtimeaccounting"
	"setta/internal/runtimecost"
	"setta/internal/runtimeprovider"
)

var hardBudgetDimensions = []runtimeprovider.UsageDimension{
	runtimeprovider.UsageDimensionCPU,
	runtimeprovider.UsageDimensionMemory,
	runtimeprovider.UsageDimensionHotStorage,
}

func (store *Store) validateUsageEvidenceAuthorityLocked(
	ctx context.Context,
	request RecordUsageEvidenceRequest,
	schedule runtimecost.PriceSchedule,
) error {
	runtime, err := store.readRuntimeLocked(ctx, request.Evidence.Usage.RuntimeName)
	if err != nil {
		return err
	}
	if runtime.UserID != request.UserID {
		return errors.New("usage evidence runtime owner does not match its user")
	}
	policy, err := readUserBudgetPolicy(ctx, store.db, request.UserID)
	if err != nil {
		return err
	}
	ceilings := accountingCeilings(runtime.Resources)
	if err := validateEvidenceWithinRuntimeCeilings(request.Evidence.Usage, ceilings); err != nil {
		return err
	}
	expected, err := runtimeaccounting.EvaluateCutoff(
		schedule,
		request.Evidence.Usage,
		ceilings,
		accountingBudgetPolicy(policy),
	)
	if err != nil {
		return fmt.Errorf("recompute usage evidence cutoff: %w", err)
	}
	if request.Evidence.Cutoff != expected {
		return errors.New("submitted usage evidence cutoff does not match control-plane authority")
	}
	if expected.CutoffExposureUSDMicros != uint64(policy.CutoffExposureUSDMicros) {
		return errors.New("user budget cutoff exposure does not match the enforced runtime resources")
	}
	return nil
}

func accountingCeilings(resources runtimeprovider.RuntimeResources) runtimeaccounting.ResourceCeilings {
	return runtimeaccounting.ResourceCeilings{
		CPUCoreMillionths: runtimeaccounting.EnforcedBound{
			Enforced: true,
			Value:    resources.CPUCoreMillionths,
		},
		MemoryBytes: runtimeaccounting.EnforcedBound{
			Enforced: true,
			Value:    resources.MemoryBytes,
		},
		HotStorageBytes: runtimeaccounting.EnforcedBound{
			Enforced: true,
			Value:    resources.StorageBytes,
		},
	}
}

func accountingBudgetPolicy(policy UserBudgetPolicy) runtimeaccounting.BudgetPolicy {
	return runtimeaccounting.BudgetPolicy{
		CoveredLimitUSDMicros:  uint64(policy.CoveredLimitUSDMicros),
		SafetyReserveUSDMicros: uint64(policy.SafetyReserveUSDMicros),
		MaximumCutoffLag:       policy.MaximumCutoffLag,
		RequiredDimensions:     append([]runtimeprovider.UsageDimension(nil), hardBudgetDimensions...),
	}
}

func validateEvidenceWithinRuntimeCeilings(
	usage runtimeprovider.UsageObservation,
	ceilings runtimeaccounting.ResourceCeilings,
) error {
	maximum, err := runtimeaccounting.ConservativeObservation(
		usage.Provider,
		usage.RuntimeName,
		runtimeaccounting.ClosedWindow{
			Window:         usage.Window,
			ProviderActive: usage.Quantities.ProviderActive,
			AttachedIdle:   usage.Quantities.AttachedIdle,
			WorkloadLease:  usage.Quantities.WorkloadLease,
		},
		usage.ObservedAt,
		ceilings,
	)
	if err != nil {
		return err
	}
	if usage.Quantities.CPUCoreMicroseconds > maximum.Quantities.CPUCoreMicroseconds ||
		usage.Quantities.MemoryByteSeconds > maximum.Quantities.MemoryByteSeconds ||
		usage.Quantities.HotStorageByteSeconds > maximum.Quantities.HotStorageByteSeconds {
		return errors.New("submitted usage evidence exceeds the enforced runtime resources")
	}
	return nil
}
