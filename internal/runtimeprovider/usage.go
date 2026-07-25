package runtimeprovider

import (
	"context"
	"fmt"
	"slices"
	"time"
)

// UsageBasis identifies whether a usage observation came from a provider's
// billing system or from Setta's deliberately conservative accounting.
type UsageBasis string

const (
	UsageBasisProviderAuthoritative UsageBasis = "provider_authoritative"
	UsageBasisSettaConservative     UsageBasis = "setta_conservative"
)

// UsageDimension identifies an independently observed usage quantity. The
// explicit coverage list distinguishes a measured zero from an unavailable
// metric.
type UsageDimension string

const (
	UsageDimensionProviderActive    UsageDimension = "provider_active_time"
	UsageDimensionAttachedIdle      UsageDimension = "attached_idle_time"
	UsageDimensionWorkloadLease     UsageDimension = "workload_lease_time"
	UsageDimensionCPU               UsageDimension = "cpu_core_time"
	UsageDimensionMemory            UsageDimension = "memory_time"
	UsageDimensionHotStorage        UsageDimension = "hot_storage_time"
	UsageDimensionColdStorage       UsageDimension = "cold_storage_time"
	UsageDimensionCheckpointStorage UsageDimension = "checkpoint_storage_time"
	UsageDimensionEgress            UsageDimension = "egress"
)

// UsageWindow is a half-open accounting interval [Start, End). Usage observers
// report only completed windows so reporting lag has one unambiguous meaning.
type UsageWindow struct {
	Start time.Time `json:"start"`
	End   time.Time `json:"end"`
}

// UsageQuantities uses integer base units so accounting never depends on
// floating-point rounding. AttachedIdle excludes WorkloadLease time; both are
// subsets of ProviderActive.
type UsageQuantities struct {
	ProviderActive         time.Duration `json:"provider_active"`
	AttachedIdle           time.Duration `json:"attached_idle"`
	WorkloadLease          time.Duration `json:"workload_lease"`
	CPUCoreMicroseconds    uint64        `json:"cpu_core_microseconds"`
	MemoryByteSeconds      uint64        `json:"memory_byte_seconds"`
	HotStorageByteSeconds  uint64        `json:"hot_storage_byte_seconds"`
	ColdStorageByteSeconds uint64        `json:"cold_storage_byte_seconds"`
	CheckpointByteSeconds  uint64        `json:"checkpoint_byte_seconds"`
	EgressBytes            uint64        `json:"egress_bytes"`
}

// UsageRequest asks an optional provider usage observer for one completed
// runtime accounting window.
type UsageRequest struct {
	RuntimeName string      `json:"runtime_name"`
	Window      UsageWindow `json:"window"`
}

// UsageObservation is provider-neutral accounting evidence. Dimensions not in
// Coverage must remain zero; this prevents unavailable provider data from
// silently becoming a measured zero.
type UsageObservation struct {
	Provider    string           `json:"provider"`
	RuntimeName string           `json:"runtime_name"`
	Window      UsageWindow      `json:"window"`
	ObservedAt  time.Time        `json:"observed_at"`
	Basis       UsageBasis       `json:"basis"`
	Coverage    []UsageDimension `json:"coverage"`
	Quantities  UsageQuantities  `json:"quantities"`
}

// UsageObserver is deliberately separate from Provider. Lifecycle support
// does not imply that a provider exposes authoritative per-runtime billing.
type UsageObserver interface {
	ObserveUsage(context.Context, UsageRequest) (UsageObservation, error)
}

// ReportingLag returns the delay between the end of a completed usage window
// and the time its observation became available.
func (observation UsageObservation) ReportingLag() time.Duration {
	return observation.ObservedAt.Sub(observation.Window.End)
}

// Includes reports whether an observation explicitly covers a dimension.
func (observation UsageObservation) Includes(dimension UsageDimension) bool {
	return slices.Contains(observation.Coverage, dimension)
}

// Validate rejects ambiguous, incomplete, or internally inconsistent usage
// evidence before it enters cost accounting.
func (observation UsageObservation) Validate() error {
	if err := observation.validateIdentityAndWindow(); err != nil {
		return err
	}
	if err := validateUsageBasis(observation.Basis); err != nil {
		return err
	}
	if err := validateUsageCoverage(observation.Coverage); err != nil {
		return err
	}
	if err := observation.validateDurations(); err != nil {
		return err
	}
	return observation.validatePopulatedCoverage()
}

func (observation UsageObservation) validateIdentityAndWindow() error {
	if observation.Provider == "" {
		return fmt.Errorf("%w: usage provider is empty", ErrInvalidContract)
	}
	if err := ValidateManagedName(observation.RuntimeName); err != nil {
		return err
	}
	if observation.Window.Start.IsZero() || !observation.Window.End.After(observation.Window.Start) {
		return fmt.Errorf("%w: usage window is invalid", ErrInvalidContract)
	}
	if observation.ObservedAt.Before(observation.Window.End) {
		return fmt.Errorf("%w: usage observation predates its completed window", ErrInvalidContract)
	}
	return nil
}

func validateUsageBasis(basis UsageBasis) error {
	switch basis {
	case UsageBasisProviderAuthoritative, UsageBasisSettaConservative:
		return nil
	default:
		return fmt.Errorf("%w: unsupported usage basis %q", ErrInvalidContract, basis)
	}
}

func validateUsageCoverage(coverage []UsageDimension) error {
	if len(coverage) == 0 {
		return fmt.Errorf("%w: usage coverage is empty", ErrInvalidContract)
	}
	seen := make(map[UsageDimension]struct{}, len(coverage))
	for _, dimension := range coverage {
		if !isKnownUsageDimension(dimension) {
			return fmt.Errorf("%w: unsupported usage dimension %q", ErrInvalidContract, dimension)
		}
		if _, duplicate := seen[dimension]; duplicate {
			return fmt.Errorf("%w: duplicate usage dimension %q", ErrInvalidContract, dimension)
		}
		seen[dimension] = struct{}{}
	}
	return nil
}

func (observation UsageObservation) validateDurations() error {
	windowDuration := observation.Window.End.Sub(observation.Window.Start)
	quantities := observation.Quantities
	if quantities.ProviderActive < 0 || quantities.ProviderActive > windowDuration {
		return fmt.Errorf("%w: provider-active duration is outside its window", ErrInvalidContract)
	}
	if invalidActivityDurations(quantities) {
		return fmt.Errorf("%w: attached-idle and workload-lease durations exceed provider-active time", ErrInvalidContract)
	}
	if conservativeResourcesWithoutActiveTime(observation.Basis, quantities) {
		return fmt.Errorf("%w: conservative CPU or memory usage requires provider-active time", ErrInvalidContract)
	}
	return nil
}

func invalidActivityDurations(quantities UsageQuantities) bool {
	return quantities.AttachedIdle < 0 || quantities.WorkloadLease < 0 ||
		quantities.AttachedIdle > quantities.ProviderActive || quantities.WorkloadLease > quantities.ProviderActive ||
		quantities.AttachedIdle > quantities.ProviderActive-quantities.WorkloadLease
}

func conservativeResourcesWithoutActiveTime(basis UsageBasis, quantities UsageQuantities) bool {
	return basis == UsageBasisSettaConservative && quantities.ProviderActive == 0 &&
		(quantities.CPUCoreMicroseconds != 0 || quantities.MemoryByteSeconds != 0)
}

func (observation UsageObservation) validatePopulatedCoverage() error {
	quantities := observation.Quantities
	values := []struct {
		dimension UsageDimension
		populated bool
	}{
		{UsageDimensionProviderActive, quantities.ProviderActive != 0},
		{UsageDimensionAttachedIdle, quantities.AttachedIdle != 0},
		{UsageDimensionWorkloadLease, quantities.WorkloadLease != 0},
		{UsageDimensionCPU, quantities.CPUCoreMicroseconds != 0},
		{UsageDimensionMemory, quantities.MemoryByteSeconds != 0},
		{UsageDimensionHotStorage, quantities.HotStorageByteSeconds != 0},
		{UsageDimensionColdStorage, quantities.ColdStorageByteSeconds != 0},
		{UsageDimensionCheckpointStorage, quantities.CheckpointByteSeconds != 0},
		{UsageDimensionEgress, quantities.EgressBytes != 0},
	}
	for _, value := range values {
		if value.populated && !observation.Includes(value.dimension) {
			return fmt.Errorf("%w: uncovered usage dimension %q is non-zero", ErrInvalidContract, value.dimension)
		}
	}
	return nil
}

func isKnownUsageDimension(dimension UsageDimension) bool {
	switch dimension {
	case UsageDimensionProviderActive,
		UsageDimensionAttachedIdle,
		UsageDimensionWorkloadLease,
		UsageDimensionCPU,
		UsageDimensionMemory,
		UsageDimensionHotStorage,
		UsageDimensionColdStorage,
		UsageDimensionCheckpointStorage,
		UsageDimensionEgress:
		return true
	default:
		return false
	}
}
