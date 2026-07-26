package runtimecost_test

import (
	"errors"
	"math"
	"testing"
	"time"

	"setta/internal/runtimecost"
	spritescost "setta/internal/runtimecost/sprites"
	"setta/internal/runtimeprovider"
)

func TestSpritesPublishedRatesReproducePublishedSessionExample(t *testing.T) {
	observation := usageObservation(t, runtimeprovider.UsageQuantities{
		ProviderActive:         4 * time.Hour,
		CPUCoreMicroseconds:    2_400_000 * 3_600,
		MemoryByteSeconds:      6 * 1_000_000_000 * 3_600,
		HotStorageByteSeconds:  5 * 1_000_000_000 * 4 * 3_600,
		ColdStorageByteSeconds: 10 * 1_000_000_000 * 4 * 3_600,
	}, []runtimeprovider.UsageDimension{
		runtimeprovider.UsageDimensionProviderActive,
		runtimeprovider.UsageDimensionCPU,
		runtimeprovider.UsageDimensionMemory,
		runtimeprovider.UsageDimensionHotStorage,
		runtimeprovider.UsageDimensionColdStorage,
	})
	observation.Window.Start = observation.Window.End.Add(-4 * time.Hour)

	breakdown, err := runtimecost.Estimate(spritescost.PublishedRates20260727(), observation)
	if err != nil {
		t.Fatalf("Estimate: %v", err)
	}
	if breakdown.CPU != 168_000 || breakdown.Memory != 262_500 ||
		breakdown.HotStorage != 13_660 || breakdown.ColdStorage != 27_320 ||
		breakdown.CoveredTotal != 471_480 {
		t.Fatalf("Breakdown = %#v", breakdown)
	}
}

func TestSpritesPublishedRatesReproduceContinuousMinimumFloor(t *testing.T) {
	const hours = 730
	observation := usageObservation(t, runtimeprovider.UsageQuantities{
		ProviderActive:      hours * time.Hour,
		CPUCoreMicroseconds: 45_625_000 * 3_600,
		MemoryByteSeconds:   250_000_000 * hours * 3_600,
	}, []runtimeprovider.UsageDimension{
		runtimeprovider.UsageDimensionProviderActive,
		runtimeprovider.UsageDimensionCPU,
		runtimeprovider.UsageDimensionMemory,
	})
	observation.Window.Start = observation.Window.End.Add(-hours * time.Hour)

	breakdown, err := runtimecost.Estimate(spritescost.PublishedRates20260727(), observation)
	if err != nil {
		t.Fatalf("Estimate: %v", err)
	}
	if breakdown.CoveredTotal != 11_178_125 {
		t.Fatalf("CoveredTotal = %d micro-USD, want 11178125", breakdown.CoveredTotal)
	}
}

func TestEstimateRequiresProviderActiveCoverageForConservativeBillingFloors(t *testing.T) {
	observation := usageObservation(t, runtimeprovider.UsageQuantities{
		CPUCoreMicroseconds: 1,
	}, []runtimeprovider.UsageDimension{runtimeprovider.UsageDimensionCPU})
	if _, err := runtimecost.Estimate(spritescost.PublishedRates20260727(), observation); !errors.Is(err, runtimeprovider.ErrInvalidContract) {
		t.Fatalf("Estimate error = %v, want ErrInvalidContract", err)
	}
}

func TestEstimateRejectsConservativeComputeWithZeroProviderActive(t *testing.T) {
	observation := usageObservation(t, runtimeprovider.UsageQuantities{
		CPUCoreMicroseconds: 1,
	}, []runtimeprovider.UsageDimension{
		runtimeprovider.UsageDimensionProviderActive,
		runtimeprovider.UsageDimensionCPU,
	})
	if _, err := runtimecost.Estimate(spritescost.PublishedRates20260727(), observation); !errors.Is(err, runtimeprovider.ErrInvalidContract) {
		t.Fatalf("Estimate error = %v, want ErrInvalidContract", err)
	}
}

func TestEstimateRejectsActiveBillingFloorsWithoutComputeCoverage(t *testing.T) {
	for name, coverage := range map[string][]runtimeprovider.UsageDimension{
		"missing both": {runtimeprovider.UsageDimensionProviderActive},
		"missing memory": {
			runtimeprovider.UsageDimensionProviderActive,
			runtimeprovider.UsageDimensionCPU,
		},
	} {
		t.Run(name, func(t *testing.T) {
			observation := usageObservation(t, runtimeprovider.UsageQuantities{
				ProviderActive: time.Hour,
			}, coverage)
			if _, err := runtimecost.Estimate(spritescost.PublishedRates20260727(), observation); !errors.Is(err, runtimeprovider.ErrInvalidContract) {
				t.Fatalf("Estimate error = %v, want ErrInvalidContract", err)
			}
		})
	}
}

func TestSpritesBillingMinimumsFloorConservativeUsage(t *testing.T) {
	observation := usageObservation(t, runtimeprovider.UsageQuantities{
		ProviderActive:      time.Hour,
		CPUCoreMicroseconds: 1,
		MemoryByteSeconds:   1,
	}, []runtimeprovider.UsageDimension{
		runtimeprovider.UsageDimensionProviderActive,
		runtimeprovider.UsageDimensionCPU,
		runtimeprovider.UsageDimensionMemory,
	})

	breakdown, err := runtimecost.Estimate(spritescost.PublishedRates20260727(), observation)
	if err != nil {
		t.Fatalf("Estimate: %v", err)
	}
	if breakdown.CPU != 4_375 || breakdown.Memory != 10_938 || breakdown.CoveredTotal != 15_313 {
		t.Fatalf("billing-floor breakdown = %#v", breakdown)
	}
}

func TestEstimateRefusesUnpublishedCoveredRate(t *testing.T) {
	observation := usageObservation(t, runtimeprovider.UsageQuantities{}, []runtimeprovider.UsageDimension{
		runtimeprovider.UsageDimensionCheckpointStorage,
	})

	_, err := runtimecost.Estimate(spritescost.PublishedRates20260727(), observation)
	if !errors.Is(err, runtimecost.ErrRateUnavailable) {
		t.Fatalf("Estimate error = %v, want ErrRateUnavailable", err)
	}
}

func TestEstimateRejectsProviderMismatchAndAmbiguousRate(t *testing.T) {
	observation := usageObservation(t, runtimeprovider.UsageQuantities{}, []runtimeprovider.UsageDimension{
		runtimeprovider.UsageDimensionCPU,
	})
	schedule := spritescost.PublishedRates20260727()
	schedule.Provider = "different-provider"
	if _, err := runtimecost.Estimate(schedule, observation); !errors.Is(err, runtimeprovider.ErrInvalidContract) {
		t.Fatalf("provider mismatch error = %v, want ErrInvalidContract", err)
	}

	schedule = spritescost.PublishedRates20260727()
	schedule.EgressGB.USDMicros = 1
	if _, err := runtimecost.Estimate(schedule, observation); !errors.Is(err, runtimeprovider.ErrInvalidContract) {
		t.Fatalf("ambiguous rate error = %v, want ErrInvalidContract", err)
	}
}

func TestEstimateRoundsUpAndDetectsOverflow(t *testing.T) {
	observation := usageObservation(t, runtimeprovider.UsageQuantities{
		ProviderActive:      time.Microsecond,
		CPUCoreMicroseconds: 1,
	}, []runtimeprovider.UsageDimension{
		runtimeprovider.UsageDimensionProviderActive,
		runtimeprovider.UsageDimensionCPU,
	})
	schedule := spritescost.PublishedRates20260727()
	schedule.BillingMinimums = runtimecost.BillingMinimums{}
	breakdown, err := runtimecost.Estimate(schedule, observation)
	if err != nil {
		t.Fatalf("Estimate one microsecond: %v", err)
	}
	if breakdown.CoveredTotal != 1 {
		t.Fatalf("rounded total = %d, want 1", breakdown.CoveredTotal)
	}

	observation.Quantities.CPUCoreMicroseconds = math.MaxUint64
	schedule.CPUCoreHour.USDMicros = math.MaxUint64
	if _, err := runtimecost.Estimate(schedule, observation); !errors.Is(err, runtimecost.ErrCostOverflow) {
		t.Fatalf("overflow error = %v, want ErrCostOverflow", err)
	}
}

func usageObservation(
	t *testing.T,
	quantities runtimeprovider.UsageQuantities,
	coverage []runtimeprovider.UsageDimension,
) runtimeprovider.UsageObservation {
	t.Helper()
	identity, err := runtimeprovider.NewManagedIdentity(t.Name())
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	windowEnd := time.Date(2026, time.July, 14, 12, 0, 0, 0, time.UTC)
	return runtimeprovider.UsageObservation{
		Provider:    spritescost.Provider,
		RuntimeName: identity.Name,
		Window: runtimeprovider.UsageWindow{
			Start: windowEnd.Add(-time.Hour),
			End:   windowEnd,
		},
		ObservedAt: windowEnd,
		Basis:      runtimeprovider.UsageBasisSettaConservative,
		Coverage:   coverage,
		Quantities: quantities,
	}
}
