package runtimecapability

import "testing"

func TestRuntimeFeatureSetIdentityReturnsCopy(t *testing.T) {
	identity := RuntimeFeatureSetIdentity()
	if identity.Version != RuntimeFeatureSetVersion {
		t.Fatalf("feature set version = %d, want %d", identity.Version, RuntimeFeatureSetVersion)
	}
	if len(identity.Features) == 0 {
		t.Fatal("feature set is empty")
	}

	identity.Features[0] = "mutated"
	next := RuntimeFeatureSetIdentity()
	if next.Features[0] == "mutated" {
		t.Fatal("feature set identity reused mutable feature slice")
	}
	if err := ValidateRuntimeFeatureSet(next); err != nil {
		t.Fatalf("ValidateRuntimeFeatureSet: %v", err)
	}
}

func TestValidateRuntimeFeatureSetRejectsDrift(t *testing.T) {
	featureSet := RuntimeFeatureSetIdentity()
	featureSet.Features = append(featureSet.Features, "unknown")

	if err := ValidateRuntimeFeatureSet(featureSet); err == nil {
		t.Fatal("feature set with unknown feature validated")
	}
}

func TestContractValueSetsIncludeDiagnosticStatus(t *testing.T) {
	sets := ContractValueSets()
	if len(sets) != 1 {
		t.Fatalf("contract value sets = %+v, want diagnostic status set", sets)
	}
	if sets[0].Name != "DiagnosticStatus" {
		t.Fatalf("value set name = %q, want DiagnosticStatus", sets[0].Name)
	}
	if len(sets[0].Values) != len(diagnosticStatusValues) {
		t.Fatalf("diagnostic status values = %+v", sets[0].Values)
	}
}
