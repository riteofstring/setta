package runtimeaccounting

import (
	"strings"
	"testing"
	"time"

	spritescost "setta/internal/runtimecost/sprites"
	"setta/internal/runtimeprovider"
)

func TestFinalizeEvidenceOwnsTheSharedConfigurationAndCalculationContract(t *testing.T) {
	start := time.Date(2026, 7, 14, 12, 0, 0, 0, time.UTC)
	configuration := testEvidenceConfiguration(t, start)
	ledger, err := NewLedger(start)
	if err != nil {
		t.Fatal(err)
	}
	for _, event := range testActivityEvents(start) {
		if err := ledger.Apply(event); err != nil {
			t.Fatal(err)
		}
	}
	closed, err := ledger.Close(configuration.WindowEnd)
	if err != nil {
		t.Fatal(err)
	}
	evidence, err := FinalizeEvidence(
		configuration,
		strings.Repeat("a", 64),
		spritescost.PublishedRates20260727(),
		closed,
	)
	if err != nil {
		t.Fatalf("FinalizeEvidence: %v", err)
	}
	expectedConfigHash, err := configuration.SHA256()
	if err != nil {
		t.Fatal(err)
	}
	if evidence.Version != EvidenceVersion ||
		evidence.ConfigSHA256 != expectedConfigHash ||
		evidence.RateCardVersion != spritescost.PublishedRates20260727().Version ||
		evidence.Cost.CoveredTotal != evidence.Cutoff.CurrentCoveredUSDMicros {
		t.Fatalf("evidence = %+v", evidence)
	}
	if err := ValidateEvidenceIdentity(evidence, spritescost.PublishedRates20260727().Version); err != nil {
		t.Fatalf("ValidateEvidenceIdentity: %v", err)
	}
}

func TestFinalizeEvidenceRejectsForeignWindowAndEventHash(t *testing.T) {
	start := time.Date(2026, 7, 14, 12, 0, 0, 0, time.UTC)
	configuration := testEvidenceConfiguration(t, start)
	closed := ClosedWindow{
		Window:         runtimeprovider.UsageWindow{Start: start, End: configuration.WindowEnd},
		ProviderActive: time.Hour,
	}
	if _, err := FinalizeEvidence(
		configuration,
		"invalid",
		spritescost.PublishedRates20260727(),
		closed,
	); err == nil {
		t.Fatal("FinalizeEvidence accepted an invalid event hash")
	}
	closed.Window.End = closed.Window.End.Add(time.Second)
	if _, err := FinalizeEvidence(
		configuration,
		strings.Repeat("b", 64),
		spritescost.PublishedRates20260727(),
		closed,
	); err == nil {
		t.Fatal("FinalizeEvidence accepted a foreign window")
	}
}

func testEvidenceConfiguration(t *testing.T, start time.Time) EvidenceConfiguration {
	t.Helper()
	identity, err := runtimeprovider.NewManagedIdentity("shared-evidence")
	if err != nil {
		t.Fatal(err)
	}
	return EvidenceConfiguration{
		Version: EvidenceConfigurationVersion, Provider: spritescost.Provider,
		RateCard: "sprites-public-2026-07-27", RuntimeName: identity.Name,
		WindowStart: start, WindowEnd: start.Add(time.Hour), ObservedAt: start.Add(time.Hour),
		Ceilings: ResourceCeilings{
			CPUCoreMillionths: EnforcedBound{Enforced: true, Value: 1_000_000},
			MemoryBytes:       EnforcedBound{Enforced: true, Value: 1_000_000_000},
		},
		Budget: EvidenceBudgetConfiguration{
			CoveredLimitUSDMicros:  1_000_000,
			SafetyReserveUSDMicros: 1_000,
			MaximumCutoffLag:       "1m",
			RequiredDimensions: []runtimeprovider.UsageDimension{
				runtimeprovider.UsageDimensionCPU,
				runtimeprovider.UsageDimensionMemory,
			},
		},
	}
}
