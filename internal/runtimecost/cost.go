// Package runtimecost applies versioned provider rate cards to validated,
// provider-neutral usage evidence.
package runtimecost

import (
	"errors"
	"fmt"
	"math"
	"math/big"
	"time"

	"setta/internal/runtimeprovider"
)

const (
	microsecondsPerHour  = 3_600_000_000
	bytesPerDecimalGB    = 1_000_000_000
	byteSecondsPerGBHour = bytesPerDecimalGB * 3_600
)

var (
	// ErrRateUnavailable prevents a partial rate card from producing a falsely
	// complete estimate for a covered usage dimension.
	ErrRateUnavailable = errors.New("runtime cost rate unavailable")
	// ErrCostOverflow identifies an estimate that cannot be represented in the
	// integer micro-USD accounting unit.
	ErrCostOverflow = errors.New("runtime cost overflow")
)

// Rate is a price in micro-US dollars for the unit named by its PriceSchedule
// field. Available distinguishes a free unit from an unpublished price.
type Rate struct {
	Available bool
	USDMicros uint64
}

// PriceSchedule is one immutable, versioned provider rate card. Storage units
// use decimal GB because that is how the current provider cards are published.
type PriceSchedule struct {
	Provider   string
	Version    string
	ObservedAt time.Time

	CPUCoreHour       Rate
	MemoryGBHour      Rate
	HotStorageGBHour  Rate
	ColdStorageGBHour Rate
	CheckpointGBHour  Rate
	EgressGB          Rate
	BillingMinimums   BillingMinimums
}

// BillingMinimums contains provider billing floors that apply while a runtime
// is active. They are pricing rules, not proof that Setta enforces a matching
// resource ceiling. CPU uses one core = 1,000,000.
type BillingMinimums struct {
	CPUCoreMillionths uint64
	MemoryBytes       uint64
}

// Breakdown is an integer micro-USD estimate. Activity durations remain
// evidence but are not priced separately from their resource usage.
type Breakdown struct {
	CPU               uint64 `json:"cpu"`
	Memory            uint64 `json:"memory"`
	HotStorage        uint64 `json:"hot_storage"`
	ColdStorage       uint64 `json:"cold_storage"`
	CheckpointStorage uint64 `json:"checkpoint_storage"`
	Egress            uint64 `json:"egress"`
	CoveredTotal      uint64 `json:"covered_total"`
}

// Estimate applies schedule to every covered billable dimension. It refuses
// provider mismatches and missing rates instead of returning a misleading
// partial total.
func Estimate(schedule PriceSchedule, observation runtimeprovider.UsageObservation) (Breakdown, error) {
	if err := validateEstimateInputs(schedule, observation); err != nil {
		return Breakdown{}, err
	}
	quantities, err := quantitiesWithBillingMinimums(schedule, observation)
	if err != nil {
		return Breakdown{}, err
	}
	result, err := estimateCoveredDimensions(schedule, observation, quantities)
	if err != nil {
		return Breakdown{}, err
	}
	if err := sumCoveredTotal(&result); err != nil {
		return Breakdown{}, err
	}
	return result, nil
}

// ValidatePriceSchedule rejects incomplete or internally inconsistent rate
// cards before a long-running service accepts them.
func ValidatePriceSchedule(schedule PriceSchedule) error {
	return validateSchedule(schedule)
}

func validateEstimateInputs(schedule PriceSchedule, observation runtimeprovider.UsageObservation) error {
	if err := validateSchedule(schedule); err != nil {
		return err
	}
	if err := observation.Validate(); err != nil {
		return err
	}
	if schedule.Provider != observation.Provider {
		return fmt.Errorf(
			"%w: rate-card provider %q does not match usage provider %q",
			runtimeprovider.ErrInvalidContract,
			schedule.Provider,
			observation.Provider,
		)
	}
	return validateBillingMinimumCoverage(schedule, observation)
}

func validateBillingMinimumCoverage(schedule PriceSchedule, observation runtimeprovider.UsageObservation) error {
	if observation.Basis != runtimeprovider.UsageBasisSettaConservative {
		return nil
	}
	if hasCoveredBillingMinimum(schedule, observation) &&
		!observation.Includes(runtimeprovider.UsageDimensionProviderActive) {
		return fmt.Errorf(
			"%w: provider-active coverage is required to apply billing minimums",
			runtimeprovider.ErrInvalidContract,
		)
	}
	if observation.Quantities.ProviderActive <= 0 {
		return nil
	}
	if schedule.BillingMinimums.CPUCoreMillionths != 0 &&
		!observation.Includes(runtimeprovider.UsageDimensionCPU) {
		return fmt.Errorf(
			"%w: CPU coverage is required for an active-time billing minimum",
			runtimeprovider.ErrInvalidContract,
		)
	}
	if schedule.BillingMinimums.MemoryBytes != 0 &&
		!observation.Includes(runtimeprovider.UsageDimensionMemory) {
		return fmt.Errorf(
			"%w: memory coverage is required for an active-time billing minimum",
			runtimeprovider.ErrInvalidContract,
		)
	}
	return nil
}

func hasCoveredBillingMinimum(schedule PriceSchedule, observation runtimeprovider.UsageObservation) bool {
	return schedule.BillingMinimums.CPUCoreMillionths != 0 &&
		observation.Includes(runtimeprovider.UsageDimensionCPU) ||
		schedule.BillingMinimums.MemoryBytes != 0 &&
			observation.Includes(runtimeprovider.UsageDimensionMemory)
}

func quantitiesWithBillingMinimums(
	schedule PriceSchedule,
	observation runtimeprovider.UsageObservation,
) (runtimeprovider.UsageQuantities, error) {
	quantities := observation.Quantities
	if observation.Basis != runtimeprovider.UsageBasisSettaConservative {
		return quantities, nil
	}
	minimumCPU, err := roundedUpProduct(
		uint64(quantities.ProviderActive),
		schedule.BillingMinimums.CPUCoreMillionths,
		uint64(time.Second),
	)
	if err != nil {
		return runtimeprovider.UsageQuantities{}, fmt.Errorf("%w: provider CPU billing minimum", err)
	}
	minimumMemory, err := roundedUpProduct(
		uint64(quantities.ProviderActive),
		schedule.BillingMinimums.MemoryBytes,
		uint64(time.Second),
	)
	if err != nil {
		return runtimeprovider.UsageQuantities{}, fmt.Errorf("%w: provider memory billing minimum", err)
	}
	quantities.CPUCoreMicroseconds = max(quantities.CPUCoreMicroseconds, minimumCPU)
	quantities.MemoryByteSeconds = max(quantities.MemoryByteSeconds, minimumMemory)
	return quantities, nil
}

func estimateCoveredDimensions(
	schedule PriceSchedule,
	observation runtimeprovider.UsageObservation,
	quantities runtimeprovider.UsageQuantities,
) (Breakdown, error) {
	var result Breakdown
	lines := []struct {
		dimension   runtimeprovider.UsageDimension
		quantity    uint64
		denominator uint64
		rate        Rate
		destination *uint64
	}{
		{runtimeprovider.UsageDimensionCPU, quantities.CPUCoreMicroseconds, microsecondsPerHour, schedule.CPUCoreHour, &result.CPU},
		{runtimeprovider.UsageDimensionMemory, quantities.MemoryByteSeconds, byteSecondsPerGBHour, schedule.MemoryGBHour, &result.Memory},
		{runtimeprovider.UsageDimensionHotStorage, quantities.HotStorageByteSeconds, byteSecondsPerGBHour, schedule.HotStorageGBHour, &result.HotStorage},
		{runtimeprovider.UsageDimensionColdStorage, quantities.ColdStorageByteSeconds, byteSecondsPerGBHour, schedule.ColdStorageGBHour, &result.ColdStorage},
		{runtimeprovider.UsageDimensionCheckpointStorage, quantities.CheckpointByteSeconds, byteSecondsPerGBHour, schedule.CheckpointGBHour, &result.CheckpointStorage},
		{runtimeprovider.UsageDimensionEgress, quantities.EgressBytes, bytesPerDecimalGB, schedule.EgressGB, &result.Egress},
	}
	for _, line := range lines {
		if !observation.Includes(line.dimension) {
			continue
		}
		if !line.rate.Available {
			return Breakdown{}, fmt.Errorf("%w: %s", ErrRateUnavailable, line.dimension)
		}
		cost, err := roundedUpCost(line.quantity, line.rate.USDMicros, line.denominator)
		if err != nil {
			return Breakdown{}, fmt.Errorf("%w: %s", err, line.dimension)
		}
		*line.destination = cost
	}
	return result, nil
}

func sumCoveredTotal(result *Breakdown) error {
	for _, cost := range []uint64{
		result.CPU,
		result.Memory,
		result.HotStorage,
		result.ColdStorage,
		result.CheckpointStorage,
		result.Egress,
	} {
		if result.CoveredTotal > math.MaxUint64-cost {
			return ErrCostOverflow
		}
		result.CoveredTotal += cost
	}
	return nil
}

func validateSchedule(schedule PriceSchedule) error {
	if schedule.Provider == "" || schedule.Version == "" || schedule.ObservedAt.IsZero() {
		return fmt.Errorf("%w: incomplete runtime price schedule", runtimeprovider.ErrInvalidContract)
	}
	for _, rate := range []Rate{
		schedule.CPUCoreHour,
		schedule.MemoryGBHour,
		schedule.HotStorageGBHour,
		schedule.ColdStorageGBHour,
		schedule.CheckpointGBHour,
		schedule.EgressGB,
	} {
		if !rate.Available && rate.USDMicros != 0 {
			return fmt.Errorf("%w: unavailable runtime price is non-zero", runtimeprovider.ErrInvalidContract)
		}
	}
	return nil
}

func roundedUpCost(quantity uint64, rate uint64, denominator uint64) (uint64, error) {
	return roundedUpProduct(quantity, rate, denominator)
}

func roundedUpProduct(first uint64, second uint64, denominator uint64) (uint64, error) {
	if first == 0 || second == 0 {
		return 0, nil
	}
	numerator := new(big.Int).Mul(new(big.Int).SetUint64(first), new(big.Int).SetUint64(second))
	divisor := new(big.Int).SetUint64(denominator)
	quotient, remainder := new(big.Int).QuoRem(numerator, divisor, new(big.Int))
	if remainder.Sign() != 0 {
		quotient.Add(quotient, big.NewInt(1))
	}
	if !quotient.IsUint64() {
		return 0, ErrCostOverflow
	}
	return quotient.Uint64(), nil
}
