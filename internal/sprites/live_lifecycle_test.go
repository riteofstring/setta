package sprites

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"setta/internal/runtimeprovider"
	"setta/internal/runtimeprovider/conformance"
)

const (
	liveStepTimeout        = 2 * time.Minute
	liveWarmIdleDelay      = 120 * time.Second
	liveRestartTimeout     = 60 * time.Second
	liveTestTimeout        = 20 * time.Minute
	maximumPressureCount   = 20
	maximumWarmHeartbeats  = 900
	remoteProbeRoot        = "/home/sprite/.setta/phase1b"
	remoteLeaseProbe       = remoteProbeRoot + "/setta-sprite-lease-probe"
	remoteServiceProbe     = remoteProbeRoot + "/service_probe.py"
	remoteMarker           = remoteProbeRoot + "/persistence-marker"
	remoteServiceCounter   = remoteProbeRoot + "/service-start-count"
	remoteServiceHeartbeat = remoteProbeRoot + "/service-heartbeat"
	remoteAgentMarker      = remoteProbeRoot + "/agent-finished"
	liveServiceName        = "setta-phase1b-service"
	livePressureService    = "setta-phase1b-pressure"
	liveLeaseName          = "setta-phase1b-agent"
)

func TestLiveLifecycle(t *testing.T) {
	environment := requireLiveLifecycleEnvironment(t)
	identity := requireLiveManagedIdentity(t, environment.runID)
	adapter := requireLiveAdapter(t, environment.token)
	initialCapacity := requireInitialLiveCapacity(t, adapter)
	registerLiveRuntimeCleanup(t, adapter, identity.Name)

	ctx, cancel := context.WithTimeout(context.Background(), liveTestTimeout)
	defer cancel()
	t.Logf("phase1b Sprite name=%s", identity.Name)
	harness := liveLifecycleHarness{
		t:                t,
		adapter:          adapter,
		leaseProbeBinary: environment.leaseProbeBinary,
		runID:            environment.runID,
		warmLimit:        initialCapacity.WarmLimit,
	}
	results := harness.suite(identity).Run(ctx)
	requireLiveConformanceResults(t, results)
	t.Log("phase1b lifecycle harness completed")
}

type liveLifecycleEnvironment struct {
	leaseProbeBinary string
	runID            string
	token            string
}

func requireLiveLifecycleEnvironment(t *testing.T) liveLifecycleEnvironment {
	t.Helper()
	if os.Getenv("SETTA_LIVE_SPRITES") != "1" {
		t.Skip("set SETTA_LIVE_SPRITES=1 to authorize destructive, billable Sprites lifecycle validation")
	}
	token := os.Getenv("SPRITE_TOKEN")
	if token == "" {
		t.Fatal("SPRITE_TOKEN is required after live Sprites validation is authorized")
	}
	leaseProbeBinary := os.Getenv("SETTA_SPRITES_LEASE_PROBE_BINARY")
	if leaseProbeBinary == "" {
		t.Fatal("SETTA_SPRITES_LEASE_PROBE_BINARY is required after live Sprites validation is authorized")
	}
	runID := os.Getenv("SETTA_SPRITES_LIVE_RUN_ID")
	if runID == "" {
		t.Fatal("SETTA_SPRITES_LIVE_RUN_ID is required after live Sprites validation is authorized")
	}
	return liveLifecycleEnvironment{leaseProbeBinary: leaseProbeBinary, runID: runID, token: token}
}

func requireLiveManagedIdentity(t *testing.T, runID string) runtimeprovider.ManagedIdentity {
	t.Helper()
	identity, err := runtimeprovider.NewManagedIdentity("phase1b-live:" + runID)
	if err != nil {
		t.Fatalf("derive managed identity: %v", err)
	}
	return identity
}

func requireLiveAdapter(t *testing.T, token string) *Adapter {
	t.Helper()
	adapter, err := NewAdapter(token)
	if err != nil {
		t.Fatalf("NewAdapter: %v", err)
	}
	return adapter
}

func requireInitialLiveCapacity(t *testing.T, adapter *Adapter) organizationCapacity {
	t.Helper()
	initialCapacity, err := adapter.organizationCapacity(context.Background())
	if err != nil {
		t.Fatalf("inspect initial organization capacity: %v", err)
	}
	if initialCapacity.Running != 0 || initialCapacity.Warm != 0 {
		t.Fatalf(
			"refusing to disturb an organization with active Sprites: %#v",
			initialCapacity,
		)
	}
	if initialCapacity.WarmLimit < 1 || initialCapacity.WarmLimit > maximumPressureCount {
		t.Fatalf("unsupported organization warm limit: %#v", initialCapacity)
	}
	t.Logf("initial organization capacity=%#v", initialCapacity)
	return initialCapacity
}

func registerLiveRuntimeCleanup(t *testing.T, adapter *Adapter, runtimeName string) {
	t.Helper()
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), liveStepTimeout)
		defer cleanupCancel()
		if cleanupErr := adapter.Destroy(cleanupCtx, runtimeName); cleanupErr != nil {
			t.Errorf("cleanup Sprite %s: %v", runtimeName, cleanupErr)
		}
	})
}

type liveLifecycleHarness struct {
	t                *testing.T
	adapter          *Adapter
	leaseProbeBinary string
	runID            string
	warmLimit        int
}

func (harness liveLifecycleHarness) suite(identity runtimeprovider.ManagedIdentity) conformance.Suite {
	paths := conformance.Paths{
		ProbeRoot:        remoteProbeRoot,
		Marker:           remoteMarker,
		ServiceCounter:   remoteServiceCounter,
		ServiceHeartbeat: remoteServiceHeartbeat,
		AgentMarker:      remoteAgentMarker,
	}
	return conformance.Suite{
		Provider: harness.adapter,
		LeaseManager: spriteLeaseProbeManager{
			adapter:     harness.adapter,
			runtimeName: identity.Name,
		},
		Identity: identity,
		Config: conformance.Config{
			Paths: paths,
			ServiceSpec: runtimeprovider.ServiceSpec{
				Name:      liveServiceName,
				Path:      "/usr/bin/python3",
				Arguments: []string{remoteServiceProbe},
				RunAs: runtimeprovider.ServiceIdentity{
					User:  "sprite",
					Group: "sprite",
				},
			},
			LeaseName:                liveLeaseName,
			CheckpointComment:        "Setta Phase 1b lifecycle checkpoint",
			WarmIdleDelay:            liveWarmIdleDelay,
			RestartTimeout:           liveRestartTimeout,
			RestartPollInterval:      time.Second,
			LeaseTTL:                 20 * time.Second,
			LeaseExpiryTTL:           5 * time.Second,
			LeaseRenewWait:           8 * time.Second,
			DetachedWorkWait:         8 * time.Second,
			LeaseExpiryWait:          7 * time.Second,
			MaximumWarmHeartbeatSkew: maximumWarmHeartbeats,
		},
		Hooks: conformance.Hooks{
			CreateRuntime:             harness.createRuntime,
			AfterCreate:               harness.afterCreate,
			PrepareRuntime:            harness.prepareRuntime,
			WaitWithoutProviderClient: harness.waitWithoutProviderClient,
			TriggerProcessRestart:     harness.triggerProcessRestart,
			StartDetachedWork:         harness.startDetachedWork,
		},
	}
}

func (harness liveLifecycleHarness) createRuntime(ctx context.Context, identity runtimeprovider.ManagedIdentity) (runtimeprovider.RuntimeObservation, error) {
	return createLiveRuntime(harness.t, ctx, harness.adapter, identity, "target"), nil
}

func (harness liveLifecycleHarness) afterCreate(ctx context.Context, observation runtimeprovider.RuntimeObservation) error {
	if observation.URL == "" {
		return fmt.Errorf("missing Sprite URL: %#v", observation)
	}
	if observation.Placement == "" {
		harness.t.Log("placement observation unavailable from the pinned API")
	}
	serverVersion, err := harness.adapter.ServerVersion(ctx, observation.Name)
	if err != nil {
		return fmt.Errorf("server version: %w", err)
	}
	harness.t.Logf("created placement=%q server_version=%s", observation.Placement, serverVersion)
	if err := harness.adapter.ConfigureURL(ctx, observation.Name, runtimeprovider.URLAccessAuthenticated); err != nil {
		return fmt.Errorf("configure authenticated URL: %w", err)
	}
	observation = inspectRequiredRuntime(harness.t, ctx, harness.adapter, observation.Name)
	if observation.URLAccess != runtimeprovider.URLAccessAuthenticated {
		return fmt.Errorf("URL access = %q", observation.URLAccess)
	}
	return harness.verifyNetworkPolicy(ctx, observation.Name)
}

func (harness liveLifecycleHarness) verifyNetworkPolicy(ctx context.Context, runtimeName string) error {
	policy := runtimeprovider.NetworkPolicy{Rules: []runtimeprovider.NetworkRule{
		{Domain: "example.com", Action: runtimeprovider.NetworkRuleAllow},
		{Domain: "*", Action: runtimeprovider.NetworkRuleDeny},
	}}
	if err := harness.adapter.ApplyNetworkPolicy(ctx, runtimeName, policy); err != nil {
		return fmt.Errorf("apply network policy: %w", err)
	}
	observedPolicy, err := harness.adapter.InspectNetworkPolicy(ctx, runtimeName)
	if err != nil {
		return fmt.Errorf("inspect network policy: %w", err)
	}
	if !slices.Equal(observedPolicy.Rules, policy.Rules) {
		return fmt.Errorf("network policy = %#v, want %#v", observedPolicy, policy)
	}
	return nil
}

func (harness liveLifecycleHarness) prepareRuntime(ctx context.Context, runtimeName string, _ conformance.Paths) error {
	uploadFile(harness.t, ctx, harness.adapter, runtimeName, harness.leaseProbeBinary, remoteLeaseProbe, true)
	uploadFile(harness.t, ctx, harness.adapter, runtimeName, filepath.Join("testdata", "service_probe.py"), remoteServiceProbe, false)
	return nil
}

func (harness liveLifecycleHarness) waitWithoutProviderClient(ctx context.Context, duration time.Duration) error {
	waitWithoutProviderClient(harness.t, ctx, duration)
	return nil
}

func (harness liveLifecycleHarness) triggerProcessRestart(ctx context.Context, _ string, _ runtimeprovider.ServiceSpec, _ conformance.Paths) error {
	fillWarmCapacity(harness.t, ctx, harness.adapter, harness.runID, harness.warmLimit)
	waitWithoutProviderClient(harness.t, ctx, liveWarmIdleDelay)
	pressureCapacity, err := harness.adapter.organizationCapacity(ctx)
	if err != nil {
		return fmt.Errorf("inspect pressure capacity: %w", err)
	}
	harness.t.Logf("organization capacity after warm pressure=%#v", pressureCapacity)
	return nil
}

func (harness liveLifecycleHarness) startDetachedWork(ctx context.Context, runtimeName string, markerPath string) error {
	mustExec(harness.t, ctx, harness.adapter, runtimeprovider.ExecRequest{
		RuntimeName: runtimeName,
		Path:        "/bin/sh",
		Arguments: []string{
			"-c",
			"nohup /bin/sh -c 'sleep 12; printf agent-finished > " + markerPath + "' >/dev/null 2>&1 &",
		},
	})
	return nil
}

func requireLiveConformanceResults(t *testing.T, results []conformance.Result) {
	t.Helper()
	failed := false
	for _, result := range results {
		switch result.Status {
		case conformance.ResultPassed:
			t.Logf("conformance %s passed", result.Name)
		case conformance.ResultSkipped:
			failed = true
			t.Errorf("conformance %s skipped: %s", result.Name, result.Reason)
		case conformance.ResultFailed:
			failed = true
			t.Errorf("conformance %s failed: %s", result.Name, result.Reason)
		default:
			failed = true
			t.Errorf("conformance %s returned unknown status %q", result.Name, result.Status)
		}
	}
	if failed {
		t.Fatalf("Sprites lifecycle conformance failed:\n%s", conformance.FormatResults(results))
	}
}

func inspectRequiredRuntime(
	t *testing.T,
	ctx context.Context,
	adapter *Adapter,
	name string,
) runtimeprovider.RuntimeObservation {
	t.Helper()
	observation, found, err := adapter.Inspect(ctx, name)
	if err != nil {
		t.Fatalf("inspect Sprite: %v", err)
	}
	if !found {
		t.Fatalf("Sprite %s is absent", name)
	}
	return observation
}

func mustExec(
	t *testing.T,
	ctx context.Context,
	adapter *Adapter,
	request runtimeprovider.ExecRequest,
) runtimeprovider.ExecResult {
	t.Helper()
	result, err := adapter.Exec(ctx, request)
	if err != nil {
		t.Fatalf("exec %s: %v", request.Path, err)
	}
	if result.ExitCode != 0 {
		t.Fatalf("exec %s exit=%d stderr=%q", request.Path, result.ExitCode, result.Stderr)
	}
	return result
}

func uploadFile(
	t *testing.T,
	ctx context.Context,
	adapter *Adapter,
	runtimeName string,
	localPath string,
	remotePath string,
	executable bool,
) {
	t.Helper()
	contents, err := os.ReadFile(localPath)
	if err != nil {
		t.Fatalf("read upload %s: %v", localPath, err)
	}
	mustExec(t, ctx, adapter, runtimeprovider.ExecRequest{
		RuntimeName: runtimeName,
		Path:        "/usr/bin/dd",
		Arguments:   []string{"of=" + remotePath, "status=none"},
		Stdin:       contents,
	})
	if executable {
		mustExec(t, ctx, adapter, runtimeprovider.ExecRequest{
			RuntimeName: runtimeName,
			Path:        "/usr/bin/chmod",
			Arguments:   []string{"0755", remotePath},
		})
	}
}

type spriteLeaseProbeManager struct {
	adapter     *Adapter
	runtimeName string
}

func (manager spriteLeaseProbeManager) Acquire(
	ctx context.Context,
	request runtimeprovider.WorkloadLeaseRequest,
) (runtimeprovider.WorkloadLease, error) {
	output, err := manager.run(ctx, "acquire", request.Name, request.TTL.String())
	return leaseFromProbeOutput(output, err)
}

func (manager spriteLeaseProbeManager) Renew(
	ctx context.Context,
	name string,
	ttl time.Duration,
) (runtimeprovider.WorkloadLease, error) {
	output, err := manager.run(ctx, "renew", name, ttl.String())
	return leaseFromProbeOutput(output, err)
}

func (manager spriteLeaseProbeManager) Inspect(
	ctx context.Context,
	name string,
) (runtimeprovider.WorkloadLease, bool, error) {
	output, err := manager.run(ctx, "inspect", name)
	if err != nil {
		return runtimeprovider.WorkloadLease{}, false, err
	}
	return runtimeprovider.WorkloadLease{
		Name:      output.Name,
		StartedAt: output.StartedAt,
		ExpiresAt: output.ExpiresAt,
	}, output.Found, nil
}

func (manager spriteLeaseProbeManager) Release(ctx context.Context, name string) error {
	_, err := manager.run(ctx, "release", name)
	return err
}

func (manager spriteLeaseProbeManager) run(
	ctx context.Context,
	arguments ...string,
) (leaseProbeOutput, error) {
	result, err := manager.adapter.Exec(ctx, runtimeprovider.ExecRequest{
		RuntimeName: manager.runtimeName,
		Path:        remoteLeaseProbe,
		Arguments:   arguments,
	})
	if err != nil {
		return leaseProbeOutput{}, err
	}
	if result.ExitCode != 0 {
		return leaseProbeOutput{}, fmt.Errorf("lease probe exit=%d stderr=%q", result.ExitCode, result.Stderr)
	}
	var output leaseProbeOutput
	if err := json.Unmarshal(result.Stdout, &output); err != nil {
		return leaseProbeOutput{}, fmt.Errorf("decode lease probe output: %w", err)
	}
	return output, nil
}

func leaseFromProbeOutput(
	output leaseProbeOutput,
	err error,
) (runtimeprovider.WorkloadLease, error) {
	if err != nil {
		return runtimeprovider.WorkloadLease{}, err
	}
	if !output.Found {
		return runtimeprovider.WorkloadLease{}, errors.New("workload lease mutation returned no lease")
	}
	return runtimeprovider.WorkloadLease{
		Name:      output.Name,
		StartedAt: output.StartedAt,
		ExpiresAt: output.ExpiresAt,
	}, nil
}

type leaseProbeOutput struct {
	Found     bool      `json:"found"`
	Name      string    `json:"name"`
	StartedAt time.Time `json:"started_at"`
	ExpiresAt time.Time `json:"expires_at"`
}

func waitWithoutProviderClient(t *testing.T, ctx context.Context, duration time.Duration) {
	t.Helper()
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		t.Fatalf("wait without provider client: %v", context.Cause(ctx))
	case <-timer.C:
	}
}

func fillWarmCapacity(
	t *testing.T,
	ctx context.Context,
	adapter *Adapter,
	runID string,
	count int,
) {
	t.Helper()
	for index := range count {
		identity, err := runtimeprovider.NewManagedIdentity(
			fmt.Sprintf("phase1b-cold-pressure:%s:%d", runID, index),
		)
		if err != nil {
			t.Fatalf("derive pressure identity %d: %v", index, err)
		}
		createLiveRuntime(t, ctx, adapter, identity, fmt.Sprintf("pressure %d", index))
		name := identity.Name
		t.Cleanup(func() {
			cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), liveStepTimeout)
			defer cleanupCancel()
			if cleanupErr := adapter.Destroy(cleanupCtx, name); cleanupErr != nil {
				t.Errorf("cleanup pressure Sprite %s: %v", name, cleanupErr)
			}
		})
		service, err := adapter.EnsureService(ctx, name, runtimeprovider.ServiceSpec{
			Name:      livePressureService,
			Path:      "/bin/sleep",
			Arguments: []string{"3600"},
		})
		if err != nil {
			t.Fatalf("start pressure Sprite %d Service: %v", index, err)
		}
		if service.State != runtimeprovider.ServiceStateRunning {
			t.Fatalf("pressure Sprite %d Service = %#v", index, service)
		}
	}
}

func createLiveRuntime(
	t *testing.T,
	ctx context.Context,
	adapter *Adapter,
	identity runtimeprovider.ManagedIdentity,
	description string,
) runtimeprovider.RuntimeObservation {
	t.Helper()
	for {
		observation, err := adapter.Create(ctx, runtimeprovider.CreateRequest{Identity: identity})
		if err == nil {
			return observation
		} else {
			var operationErr *OperationError
			if !errors.As(err, &operationErr) ||
				operationErr.StatusCode != http.StatusTooManyRequests ||
				operationErr.RetryAfter < 1 {
				t.Fatalf("create %s Sprite: %v", description, err)
			}
			t.Logf(
				"%s Sprite creation rate-limited; retrying after %ds",
				description,
				operationErr.RetryAfter,
			)
			waitWithoutProviderClient(t, ctx, time.Duration(operationErr.RetryAfter)*time.Second)
		}
	}
}
