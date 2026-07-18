package conformance

import (
	"context"
	"testing"
	"time"

	"setta/internal/runtimeprovider"
	"setta/internal/runtimeprovider/runtimetest"
)

func TestInMemoryProviderPassesConformanceSuite(t *testing.T) {
	now := time.Date(2026, 7, 16, 12, 0, 0, 0, time.UTC)
	clock := func() time.Time {
		return now
	}
	provider := runtimetest.NewProvider(runtimetest.Options{Now: clock})
	leaseManager := runtimetest.NewLeaseManager(clock)
	identity, err := runtimeprovider.NewManagedIdentity("provider-conformance:memory")
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	paths := Paths{
		ProbeRoot:        "/home/sprite/.setta/provider-conformance",
		Marker:           "/home/sprite/.setta/provider-conformance/persistence-marker",
		ServiceCounter:   "/home/sprite/.setta/provider-conformance/service-start-count",
		ServiceHeartbeat: "/home/sprite/.setta/provider-conformance/service-heartbeat",
		AgentMarker:      "/home/sprite/.setta/provider-conformance/agent-finished",
	}
	serviceSpec := runtimeprovider.ServiceSpec{
		Name:      "setta-conformance-service",
		Path:      "/bin/service-probe",
		Arguments: []string{paths.ServiceCounter, paths.ServiceHeartbeat},
		RunAs: runtimeprovider.ServiceIdentity{
			User:  "sprite",
			Group: "sprite",
		},
	}
	provider.SetServiceProbe(runtimetest.ServiceProbe{
		ServiceName:   serviceSpec.Name,
		CounterPath:   paths.ServiceCounter,
		HeartbeatPath: paths.ServiceHeartbeat,
	})

	suite := Suite{
		Provider:     provider,
		LeaseManager: leaseManager,
		Identity:     identity,
		Now:          clock,
		Config: Config{
			Paths:                    paths,
			ServiceSpec:              serviceSpec,
			LeaseName:                "setta-conformance-agent",
			CheckpointComment:        "Setta in-memory conformance checkpoint",
			WarmIdleDelay:            time.Second,
			RestartTimeout:           time.Second,
			RestartPollInterval:      10 * time.Millisecond,
			LeaseTTL:                 20 * time.Second,
			LeaseExpiryTTL:           5 * time.Second,
			LeaseRenewWait:           8 * time.Second,
			DetachedWorkWait:         8 * time.Second,
			LeaseExpiryWait:          7 * time.Second,
			MaximumWarmHeartbeatSkew: 900,
		},
		Hooks: Hooks{
			WaitWithoutProviderClient: func(_ context.Context, duration time.Duration) error {
				now = now.Add(duration)
				return nil
			},
			TriggerProcessRestart: func(_ context.Context, runtimeName string, spec runtimeprovider.ServiceSpec, _ Paths) error {
				return provider.RestartService(runtimeName, spec.Name)
			},
			StartDetachedWork: func(_ context.Context, _ string, markerPath string) error {
				provider.SetFile(markerPath, []byte("agent-finished"))
				return nil
			},
		},
	}

	results := suite.Run(context.Background())
	if len(results) != len(Checks()) {
		t.Fatalf("results = %d, want %d: %s", len(results), len(Checks()), FormatResults(results))
	}
	for _, result := range results {
		if result.Status != ResultPassed {
			t.Fatalf("conformance result %s = %s reason=%q err=%v\n%s", result.Name, result.Status, result.Reason, result.Err, FormatResults(results))
		}
	}
}

func TestSuiteSkipReturnsTypedResult(t *testing.T) {
	identity, err := runtimeprovider.NewManagedIdentity("provider-conformance:skip")
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	provider := runtimetest.NewProvider(runtimetest.Options{})
	suite := Suite{
		Provider: provider,
		Identity: identity,
		Skip: map[CheckName]string{
			CheckCreateIdentity: "provider semantic gap recorded in plan",
		},
	}

	results := suite.Run(context.Background())
	if results[0].Name != CheckCreateIdentity ||
		results[0].Status != ResultSkipped ||
		results[0].Reason != "provider semantic gap recorded in plan" {
		t.Fatalf("first result = %#v", results[0])
	}
}
