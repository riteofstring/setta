package httpapi

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
}
