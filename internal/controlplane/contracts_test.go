package controlplane

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestEnsureHostedAccessIntentContainsOnlyProductReferences(t *testing.T) {
	encoded, err := json.Marshal(EnsureHostedAccessIntent{
		IdempotencyKey: "intent-1",
		UserID:         "user-1",
		ProjectID:      "project-1",
		WorkstreamID:   "workstream-1",
		Client: HostedAccessClient{
			DeviceID: "device-1",
			Kind:     HostedAccessClientPhone,
		},
		RequestedCapabilities: []HostedAccessCapability{
			HostedAccessCapabilityObserve,
			HostedAccessCapabilitySteer,
		},
	})
	if err != nil {
		t.Fatalf("marshal hosted access intent: %v", err)
	}
	payload := string(encoded)
	for _, providerField := range []string{
		"provider",
		"sprite",
		"runtime",
		"region",
		"machine",
		"endpoint",
		"pairing",
		"wake",
	} {
		if strings.Contains(strings.ToLower(payload), providerField) {
			t.Fatalf("hosted access intent exposed provider-facing field %q: %s", providerField, payload)
		}
	}
}

func TestControlPlaneContractRegistryOwnsHostedAccessTypes(t *testing.T) {
	got := ContractTypes()
	want := []reflect.Type{
		reflect.TypeFor[EnsureHostedAccessIntent](),
		reflect.TypeFor[HostedAccessProgress](),
		reflect.TypeFor[EnsureDeveloperHostedRuntimeRequest](),
		reflect.TypeFor[DestroyDeveloperHostedRuntimeRequest](),
		reflect.TypeFor[DeveloperHostedRuntimeStatus](),
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ContractTypes() = %v, want %v", got, want)
	}
}

func TestHostedAccessProgressReadyOnPhoneCarriesBoundedGrant(t *testing.T) {
	progress := HostedAccessProgress{
		IntentID:   "intent-1",
		Cursor:     "3",
		State:      HostedAccessProgressReadyOnPhone,
		OccurredAt: "2026-07-24T18:00:00Z",
		AccessGrant: &HostedAccessGrant{
			DeviceID:            "device-1",
			ProjectID:           "project-1",
			WorkstreamID:        "workstream-1",
			GrantedCapabilities: []HostedAccessCapability{HostedAccessCapabilityObserve},
			ExpiresAt:           "2026-07-25T18:00:00Z",
		},
	}
	encoded, err := json.Marshal(progress)
	if err != nil {
		t.Fatalf("marshal hosted access progress: %v", err)
	}
	if strings.Contains(string(encoded), "runtime") || strings.Contains(string(encoded), "provider") {
		t.Fatalf("ready progress exposed infrastructure details: %s", encoded)
	}
}
