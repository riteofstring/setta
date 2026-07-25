package runtimeprovider

import (
	"errors"
	"testing"
	"time"
)

func TestUsageObservationDistinguishesMeasuredZeroFromUnavailable(t *testing.T) {
	identity, err := NewManagedIdentity("usage-zero")
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	windowEnd := time.Date(2026, time.July, 14, 12, 0, 0, 0, time.UTC)
	observation := UsageObservation{
		Provider:    "example",
		RuntimeName: identity.Name,
		Window: UsageWindow{
			Start: windowEnd.Add(-time.Hour),
			End:   windowEnd,
		},
		ObservedAt: windowEnd.Add(5 * time.Minute),
		Basis:      UsageBasisProviderAuthoritative,
		Coverage:   []UsageDimension{UsageDimensionCPU},
	}

	if err := observation.Validate(); err != nil {
		t.Fatalf("Validate measured zero: %v", err)
	}
	if !observation.Includes(UsageDimensionCPU) || observation.Includes(UsageDimensionMemory) {
		t.Fatalf("unexpected coverage: %#v", observation.Coverage)
	}
	if lag := observation.ReportingLag(); lag != 5*time.Minute {
		t.Fatalf("ReportingLag = %s, want 5m", lag)
	}
}

func TestUsageObservationRejectsAmbiguousEvidence(t *testing.T) {
	identity, err := NewManagedIdentity("usage-invalid")
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	windowEnd := time.Date(2026, time.July, 14, 12, 0, 0, 0, time.UTC)
	valid := UsageObservation{
		Provider:    "example",
		RuntimeName: identity.Name,
		Window: UsageWindow{
			Start: windowEnd.Add(-time.Hour),
			End:   windowEnd,
		},
		ObservedAt: windowEnd,
		Basis:      UsageBasisSettaConservative,
		Coverage: []UsageDimension{
			UsageDimensionProviderActive,
			UsageDimensionAttachedIdle,
			UsageDimensionWorkloadLease,
		},
		Quantities: UsageQuantities{
			ProviderActive: 40 * time.Minute,
			AttachedIdle:   15 * time.Minute,
			WorkloadLease:  20 * time.Minute,
		},
	}

	tests := map[string]func(*UsageObservation){
		"unknown basis": func(observation *UsageObservation) {
			observation.Basis = "estimated-ish"
		},
		"duplicate coverage": func(observation *UsageObservation) {
			observation.Coverage = append(observation.Coverage, UsageDimensionWorkloadLease)
		},
		"uncovered value": func(observation *UsageObservation) {
			observation.Quantities.MemoryByteSeconds = 1
		},
		"overlapping classified time": func(observation *UsageObservation) {
			observation.Quantities.AttachedIdle = 25 * time.Minute
		},
		"observation before window": func(observation *UsageObservation) {
			observation.ObservedAt = windowEnd.Add(-time.Second)
		},
	}

	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			observation := valid
			observation.Coverage = append([]UsageDimension(nil), valid.Coverage...)
			mutate(&observation)
			if err := observation.Validate(); !errors.Is(err, ErrInvalidContract) {
				t.Fatalf("Validate error = %v, want ErrInvalidContract", err)
			}
		})
	}
}
