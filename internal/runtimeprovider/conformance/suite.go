package conformance

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"reflect"
	"slices"
	"strconv"
	"strings"
	"time"

	"setta/internal/runtimeprovider"
)

type CheckName string

const (
	CheckCreateIdentity        CheckName = "create_identity_label_round_trip"
	CheckFilesystemServiceWarm CheckName = "filesystem_service_warm_preservation"
	CheckServiceRestart        CheckName = "service_restart_detection"
	CheckCheckpointRestore     CheckName = "checkpoint_restore_rollback"
	CheckWorkloadLease         CheckName = "workload_lease_lifecycle"
	CheckDestroyAbsence        CheckName = "destroy_verified_absence"
)

type ResultStatus string

const (
	ResultPassed  ResultStatus = "passed"
	ResultFailed  ResultStatus = "failed"
	ResultSkipped ResultStatus = "skipped"
)

type Check struct {
	Name        CheckName
	Description string
}

type Result struct {
	Name      CheckName
	Status    ResultStatus
	Reason    string
	Err       error
	StartedAt time.Time
	EndedAt   time.Time
}

type Suite struct {
	Provider     runtimeprovider.Provider
	LeaseManager runtimeprovider.WorkloadLeaseManager
	Identity     runtimeprovider.ManagedIdentity
	Config       Config
	Hooks        Hooks
	Skip         map[CheckName]string
	Now          func() time.Time
}

type Config struct {
	Paths                    Paths
	ServiceSpec              runtimeprovider.ServiceSpec
	LeaseName                string
	CheckpointComment        string
	WarmIdleDelay            time.Duration
	RestartTimeout           time.Duration
	RestartPollInterval      time.Duration
	LeaseTTL                 time.Duration
	LeaseExpiryTTL           time.Duration
	LeaseRenewWait           time.Duration
	DetachedWorkWait         time.Duration
	LeaseExpiryWait          time.Duration
	MaximumWarmHeartbeatSkew int
}

type Paths struct {
	ProbeRoot        string
	Marker           string
	ServiceCounter   string
	ServiceHeartbeat string
	AgentMarker      string
}

type Hooks struct {
	CreateRuntime             func(context.Context, runtimeprovider.ManagedIdentity) (runtimeprovider.RuntimeObservation, error)
	AfterCreate               func(context.Context, runtimeprovider.RuntimeObservation) error
	PrepareRuntime            func(context.Context, string, Paths) error
	WaitWithoutProviderClient func(context.Context, time.Duration) error
	TriggerProcessRestart     func(context.Context, string, runtimeprovider.ServiceSpec, Paths) error
	StartDetachedWork         func(context.Context, string, string) error
}

type runState struct {
	runtimeName         string
	created             bool
	warmHeartbeat       int
	filesystemWarmCheck bool
}

type skipError struct {
	reason string
}

func (err skipError) Error() string {
	return err.reason
}

func Checks() []Check {
	return []Check{
		{
			Name:        CheckCreateIdentity,
			Description: "create a runtime and verify provider identity and labels round-trip through Inspect",
		},
		{
			Name:        CheckFilesystemServiceWarm,
			Description: "prove persistent marker storage and warm-style Service process preservation",
		},
		{
			Name:        CheckServiceRestart,
			Description: "force restart pressure and detect Service memory loss without losing persistent marker storage",
		},
		{
			Name:        CheckCheckpointRestore,
			Description: "create a checkpoint and restore the persistent filesystem back to it",
		},
		{
			Name:        CheckWorkloadLease,
			Description: "acquire, renew, release, and expire a trusted in-runtime workload lease",
		},
		{
			Name:        CheckDestroyAbsence,
			Description: "destroy the runtime and verify provider absence",
		},
	}
}

func (suite Suite) Run(ctx context.Context) []Result {
	suite = suite.withDefaults()
	state := &runState{}
	results := make([]Result, 0, len(Checks()))
	for _, check := range Checks() {
		result := Result{
			Name:      check.Name,
			StartedAt: suite.Now().UTC(),
		}
		if reason := strings.TrimSpace(suite.Skip[check.Name]); reason != "" {
			result.Status = ResultSkipped
			result.Reason = reason
			result.EndedAt = suite.Now().UTC()
			results = append(results, result)
			continue
		}

		err := suite.runCheck(ctx, check.Name, state)
		result.EndedAt = suite.Now().UTC()
		switch {
		case err == nil:
			result.Status = ResultPassed
		default:
			var skipped skipError
			if errors.As(err, &skipped) {
				result.Status = ResultSkipped
				result.Reason = skipped.reason
			} else {
				result.Status = ResultFailed
				result.Err = err
				result.Reason = err.Error()
			}
		}
		results = append(results, result)
	}
	return results
}

func (suite Suite) runCheck(ctx context.Context, name CheckName, state *runState) error {
	switch name {
	case CheckCreateIdentity:
		return suite.checkCreateIdentity(ctx, state)
	case CheckFilesystemServiceWarm:
		return suite.checkFilesystemServiceWarm(ctx, state)
	case CheckServiceRestart:
		return suite.checkServiceRestart(ctx, state)
	case CheckCheckpointRestore:
		return suite.checkCheckpointRestore(ctx, state)
	case CheckWorkloadLease:
		return suite.checkWorkloadLease(ctx, state)
	case CheckDestroyAbsence:
		return suite.checkDestroyAbsence(ctx, state)
	default:
		return fmt.Errorf("unknown conformance check %q", name)
	}
}

func (suite Suite) checkCreateIdentity(ctx context.Context, state *runState) error {
	if err := suite.validateCore(); err != nil {
		return err
	}
	observation, err := suite.createRuntime(ctx, suite.Identity)
	if err != nil {
		return fmt.Errorf("create runtime: %w", err)
	}
	state.runtimeName = suite.Identity.Name
	state.created = true
	if err := requireRuntimeIdentity(observation, suite.Identity); err != nil {
		return err
	}
	inspected, found, err := suite.Provider.Inspect(ctx, suite.Identity.Name)
	if err != nil {
		return fmt.Errorf("inspect created runtime: %w", err)
	}
	if !found {
		return fmt.Errorf("inspect created runtime: %s is absent", suite.Identity.Name)
	}
	if err := requireRuntimeIdentity(inspected, suite.Identity); err != nil {
		return err
	}
	if suite.Hooks.AfterCreate != nil {
		if err := suite.Hooks.AfterCreate(ctx, inspected); err != nil {
			return err
		}
	}
	return nil
}

func (suite Suite) checkFilesystemServiceWarm(ctx context.Context, state *runState) error {
	if err := state.requireRuntime(); err != nil {
		return err
	}
	if err := suite.prepareWarmService(ctx, state.runtimeName); err != nil {
		return err
	}
	heartbeatBefore, err := suite.readRemoteInteger(ctx, state.runtimeName, suite.Config.Paths.ServiceHeartbeat)
	if err != nil {
		return fmt.Errorf("read warm heartbeat before wait: %w", err)
	}
	if err := suite.waitWithoutProviderClient(ctx, suite.Config.WarmIdleDelay); err != nil {
		return fmt.Errorf("wait for warm preservation: %w", err)
	}
	heartbeatAfter, err := suite.verifyWarmState(ctx, state.runtimeName, heartbeatBefore)
	if err != nil {
		return err
	}
	state.warmHeartbeat = heartbeatAfter
	state.filesystemWarmCheck = true
	return nil
}

func (suite Suite) prepareWarmService(ctx context.Context, runtimeName string) error {
	if err := suite.execRequired(ctx, runtimeprovider.ExecRequest{
		RuntimeName: runtimeName,
		Path:        "/usr/bin/mkdir",
		Arguments:   []string{"-p", suite.Config.Paths.ProbeRoot},
	}); err != nil {
		return err
	}
	if suite.Hooks.PrepareRuntime != nil {
		if err := suite.Hooks.PrepareRuntime(ctx, runtimeName, suite.Config.Paths); err != nil {
			return fmt.Errorf("prepare runtime: %w", err)
		}
	}
	if err := suite.writeMarker(ctx, runtimeName, "before-warm\n"); err != nil {
		return err
	}
	service, err := suite.Provider.EnsureService(ctx, runtimeName, suite.Config.ServiceSpec)
	if err != nil {
		return fmt.Errorf("ensure service: %w", err)
	}
	if err := requireServiceObservation(service, suite.Config.ServiceSpec); err != nil {
		return err
	}
	inspected, found, err := suite.Provider.InspectService(ctx, runtimeName, suite.Config.ServiceSpec.Name)
	if err != nil {
		return fmt.Errorf("inspect service: %w", err)
	}
	if !found {
		return fmt.Errorf("inspect service: %s is absent", suite.Config.ServiceSpec.Name)
	}
	if err := requireServiceObservation(inspected, suite.Config.ServiceSpec); err != nil {
		return err
	}
	return nil
}

func (suite Suite) verifyWarmState(ctx context.Context, runtimeName string, heartbeatBefore int) (int, error) {
	marker, err := suite.readRemoteFile(ctx, runtimeName, suite.Config.Paths.Marker)
	if err != nil {
		return 0, fmt.Errorf("read warm marker: %w", err)
	}
	if string(marker) != "before-warm\n" {
		return 0, fmt.Errorf("warm persistence marker = %q, want %q", marker, "before-warm\n")
	}
	heartbeatAfter, err := suite.readRemoteInteger(ctx, runtimeName, suite.Config.Paths.ServiceHeartbeat)
	if err != nil {
		return 0, fmt.Errorf("read warm heartbeat after wait: %w", err)
	}
	if advance := heartbeatAfter - heartbeatBefore; advance >= suite.Config.MaximumWarmHeartbeatSkew {
		return 0, fmt.Errorf("service heartbeat advanced %d times during warm idle", advance)
	}
	starts, err := suite.readRemoteInteger(ctx, runtimeName, suite.Config.Paths.ServiceCounter)
	if err != nil {
		return 0, fmt.Errorf("read service start count after warm wake: %w", err)
	}
	if starts != 1 {
		return 0, fmt.Errorf("service start count after warm wake = %d, want 1", starts)
	}
	return heartbeatAfter, nil
}

func (suite Suite) checkServiceRestart(ctx context.Context, state *runState) error {
	if err := state.requireRuntime(); err != nil {
		return err
	}
	if !state.filesystemWarmCheck {
		return skipError{"warm preservation check did not complete"}
	}
	if suite.Hooks.TriggerProcessRestart == nil {
		return skipError{"provider restart trigger hook is not configured"}
	}
	if err := suite.Hooks.TriggerProcessRestart(ctx, state.runtimeName, suite.Config.ServiceSpec, suite.Config.Paths); err != nil {
		return fmt.Errorf("trigger provider restart: %w", err)
	}
	marker, err := suite.readRemoteFile(ctx, state.runtimeName, suite.Config.Paths.Marker)
	if err != nil {
		return fmt.Errorf("read restart marker: %w", err)
	}
	if string(marker) != "before-warm\n" {
		return fmt.Errorf("restart persistence marker = %q, want %q", marker, "before-warm\n")
	}
	starts, heartbeat, restarted, err := suite.waitForServiceRestart(ctx, state.runtimeName, state.warmHeartbeat)
	if err != nil {
		return err
	}
	if !restarted {
		return fmt.Errorf(
			"reported-cold wake preserved service memory: starts=%d heartbeat=%d pre-pressure-heartbeat=%d",
			starts,
			heartbeat,
			state.warmHeartbeat,
		)
	}
	return nil
}

func (suite Suite) checkCheckpointRestore(ctx context.Context, state *runState) error {
	if err := state.requireRuntime(); err != nil {
		return err
	}
	if err := suite.writeMarker(ctx, state.runtimeName, "before-checkpoint\n"); err != nil {
		return err
	}
	checkpoint, err := suite.createAndInspectCheckpoint(ctx, state.runtimeName)
	if err != nil {
		return err
	}
	if err := suite.writeMarker(ctx, state.runtimeName, "after-checkpoint\n"); err != nil {
		return err
	}
	if err := suite.Provider.RestoreCheckpoint(ctx, state.runtimeName, checkpoint.ID); err != nil {
		return fmt.Errorf("restore checkpoint: %w", err)
	}
	restored, err := suite.readRemoteFile(ctx, state.runtimeName, suite.Config.Paths.Marker)
	if err != nil {
		return fmt.Errorf("read restored marker: %w", err)
	}
	if string(restored) != "before-checkpoint\n" {
		return fmt.Errorf("restored marker = %q, want %q", restored, "before-checkpoint\n")
	}
	return nil
}

func (suite Suite) createAndInspectCheckpoint(ctx context.Context, runtimeName string) (runtimeprovider.CheckpointObservation, error) {
	checkpoint, err := suite.Provider.CreateCheckpoint(ctx, runtimeName, suite.Config.CheckpointComment)
	if err != nil {
		return runtimeprovider.CheckpointObservation{}, fmt.Errorf("create checkpoint: %w", err)
	}
	if checkpoint.ID == "" || checkpoint.Comment != suite.Config.CheckpointComment {
		return runtimeprovider.CheckpointObservation{}, fmt.Errorf("checkpoint observation = %#v", checkpoint)
	}
	inspected, found, err := suite.Provider.InspectCheckpoint(ctx, runtimeName, checkpoint.ID)
	if err != nil {
		return runtimeprovider.CheckpointObservation{}, fmt.Errorf("inspect checkpoint: %w", err)
	}
	if !found {
		return runtimeprovider.CheckpointObservation{}, fmt.Errorf("checkpoint %s is absent after create", checkpoint.ID)
	}
	if inspected.ID != checkpoint.ID || inspected.Comment != checkpoint.Comment {
		return runtimeprovider.CheckpointObservation{}, fmt.Errorf("inspected checkpoint = %#v, want %#v", inspected, checkpoint)
	}
	return checkpoint, nil
}

func (suite Suite) checkWorkloadLease(ctx context.Context, state *runState) error {
	if err := state.requireRuntime(); err != nil {
		return err
	}
	if suite.LeaseManager == nil {
		return fmt.Errorf("%w: workload lease manager is required", runtimeprovider.ErrInvalidContract)
	}
	acquired, err := suite.acquireWorkloadLease(ctx, suite.Config.LeaseTTL)
	if err != nil {
		return err
	}
	if err := suite.runDetachedWorkAndRenewLease(ctx, state.runtimeName, acquired); err != nil {
		return err
	}
	if err := suite.LeaseManager.Release(ctx, suite.Config.LeaseName); err != nil {
		return fmt.Errorf("release workload lease: %w", err)
	}
	if err := suite.acquireExpiringWorkloadLease(ctx); err != nil {
		return err
	}
	return suite.verifyWorkloadLeaseExpiry(ctx)
}

func (suite Suite) acquireExpiringWorkloadLease(ctx context.Context) error {
	_, err := suite.LeaseManager.Acquire(ctx, runtimeprovider.WorkloadLeaseRequest{
		Name: suite.Config.LeaseName,
		TTL:  suite.Config.LeaseExpiryTTL,
	})
	if err != nil {
		return fmt.Errorf("acquire expiring workload lease: %w", err)
	}
	return nil
}

func (suite Suite) acquireWorkloadLease(ctx context.Context, ttl time.Duration) (runtimeprovider.WorkloadLease, error) {
	acquired, err := suite.LeaseManager.Acquire(ctx, runtimeprovider.WorkloadLeaseRequest{
		Name: suite.Config.LeaseName,
		TTL:  ttl,
	})
	if err != nil {
		return runtimeprovider.WorkloadLease{}, fmt.Errorf("acquire workload lease: %w", err)
	}
	if acquired.Name != suite.Config.LeaseName || acquired.ExpiresAt.Sub(acquired.StartedAt) < ttl {
		return runtimeprovider.WorkloadLease{}, fmt.Errorf("acquired workload lease = %#v", acquired)
	}
	return acquired, nil
}

func (suite Suite) runDetachedWorkAndRenewLease(ctx context.Context, runtimeName string, acquired runtimeprovider.WorkloadLease) error {
	if suite.Hooks.StartDetachedWork == nil {
		return skipError{"detached work hook is not configured"}
	}
	if err := suite.Hooks.StartDetachedWork(ctx, runtimeName, suite.Config.Paths.AgentMarker); err != nil {
		return fmt.Errorf("start detached work: %w", err)
	}
	if err := suite.waitWithoutProviderClient(ctx, suite.Config.LeaseRenewWait); err != nil {
		return fmt.Errorf("wait before lease renewal: %w", err)
	}
	renewed, err := suite.LeaseManager.Renew(ctx, suite.Config.LeaseName, suite.Config.LeaseTTL)
	if err != nil {
		return fmt.Errorf("renew workload lease: %w", err)
	}
	if renewed.Name != suite.Config.LeaseName || !renewed.ExpiresAt.After(acquired.ExpiresAt) {
		return fmt.Errorf("renewed workload lease = %#v, acquired = %#v", renewed, acquired)
	}
	if err := suite.waitWithoutProviderClient(ctx, suite.Config.DetachedWorkWait); err != nil {
		return fmt.Errorf("wait for detached work: %w", err)
	}
	agentMarker, err := suite.readRemoteFile(ctx, runtimeName, suite.Config.Paths.AgentMarker)
	if err != nil {
		return fmt.Errorf("read detached agent marker: %w", err)
	}
	if string(agentMarker) != "agent-finished" {
		return fmt.Errorf("detached agent marker = %q, want %q", agentMarker, "agent-finished")
	}
	return nil
}

func (suite Suite) verifyWorkloadLeaseExpiry(ctx context.Context) error {
	if err := suite.waitWithoutProviderClient(ctx, suite.Config.LeaseExpiryWait); err != nil {
		return fmt.Errorf("wait for workload lease expiry: %w", err)
	}
	lease, found, err := suite.LeaseManager.Inspect(ctx, suite.Config.LeaseName)
	if err != nil {
		return fmt.Errorf("inspect expired workload lease: %w", err)
	}
	if found {
		return fmt.Errorf("stale workload lease still exists after expiry: %#v", lease)
	}
	return nil
}

func (suite Suite) checkDestroyAbsence(ctx context.Context, state *runState) error {
	if err := state.requireRuntime(); err != nil {
		return err
	}
	if err := suite.Provider.Destroy(ctx, state.runtimeName); err != nil {
		return fmt.Errorf("destroy runtime: %w", err)
	}
	if _, found, err := suite.Provider.Inspect(ctx, state.runtimeName); err != nil {
		return fmt.Errorf("verify destroyed runtime: %w", err)
	} else if found {
		return fmt.Errorf("runtime %s still exists after destroy", state.runtimeName)
	}
	return nil
}

func (suite Suite) createRuntime(
	ctx context.Context,
	identity runtimeprovider.ManagedIdentity,
) (runtimeprovider.RuntimeObservation, error) {
	if suite.Hooks.CreateRuntime != nil {
		return suite.Hooks.CreateRuntime(ctx, identity)
	}
	return suite.Provider.Create(ctx, runtimeprovider.CreateRequest{Identity: identity})
}

func (suite Suite) waitForServiceRestart(
	ctx context.Context,
	runtimeName string,
	heartbeatBeforePressure int,
) (int, int, bool, error) {
	deadline := suite.Now().Add(suite.Config.RestartTimeout)
	lastStarts := 0
	lastHeartbeat := 0
	for {
		starts, startsErr := suite.readRemoteInteger(ctx, runtimeName, suite.Config.Paths.ServiceCounter)
		heartbeat, heartbeatErr := suite.readRemoteInteger(ctx, runtimeName, suite.Config.Paths.ServiceHeartbeat)
		if startsErr != nil || heartbeatErr != nil {
			return lastStarts, lastHeartbeat, false, fmt.Errorf(
				"observe service restart: starts=%v heartbeat=%v",
				startsErr,
				heartbeatErr,
			)
		}
		lastStarts = starts
		lastHeartbeat = heartbeat
		if starts >= 2 && heartbeat < heartbeatBeforePressure {
			return starts, heartbeat, true, nil
		}
		if !suite.Now().Before(deadline) {
			return lastStarts, lastHeartbeat, false, nil
		}
		if err := suite.waitWithoutProviderClient(ctx, suite.Config.RestartPollInterval); err != nil {
			return lastStarts, lastHeartbeat, false, err
		}
	}
}

func (suite Suite) writeMarker(ctx context.Context, runtimeName string, value string) error {
	return suite.execRequired(ctx, runtimeprovider.ExecRequest{
		RuntimeName: runtimeName,
		Path:        "/usr/bin/tee",
		Arguments:   []string{suite.Config.Paths.Marker},
		Stdin:       []byte(value),
	})
}

func (suite Suite) readRemoteFile(
	ctx context.Context,
	runtimeName string,
	remotePath string,
) ([]byte, error) {
	result, err := suite.Provider.Exec(ctx, runtimeprovider.ExecRequest{
		RuntimeName: runtimeName,
		Path:        "/usr/bin/cat",
		Arguments:   []string{remotePath},
	})
	if err != nil {
		return nil, err
	}
	if result.ExitCode != 0 {
		return nil, fmt.Errorf("cat %s exit=%d stderr=%q", remotePath, result.ExitCode, result.Stderr)
	}
	return result.Stdout, nil
}

func (suite Suite) readRemoteInteger(
	ctx context.Context,
	runtimeName string,
	remotePath string,
) (int, error) {
	data, err := suite.readRemoteFile(ctx, runtimeName, remotePath)
	if err != nil {
		return 0, err
	}
	value, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil {
		return 0, fmt.Errorf("parse %q: %w", data, err)
	}
	return value, nil
}

func (suite Suite) execRequired(ctx context.Context, request runtimeprovider.ExecRequest) error {
	result, err := suite.Provider.Exec(ctx, request)
	if err != nil {
		return fmt.Errorf("exec %s: %w", request.Path, err)
	}
	if result.ExitCode != 0 {
		return fmt.Errorf("exec %s exit=%d stderr=%q", request.Path, result.ExitCode, result.Stderr)
	}
	return nil
}

func (suite Suite) waitWithoutProviderClient(ctx context.Context, duration time.Duration) error {
	if duration <= 0 {
		return nil
	}
	if suite.Hooks.WaitWithoutProviderClient != nil {
		return suite.Hooks.WaitWithoutProviderClient(ctx, duration)
	}
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func (suite Suite) validateCore() error {
	if suite.Provider == nil {
		return fmt.Errorf("%w: provider is required", runtimeprovider.ErrInvalidContract)
	}
	if err := suite.Identity.Validate(); err != nil {
		return err
	}
	if err := suite.Config.ServiceSpec.Validate(); err != nil {
		return err
	}
	if strings.TrimSpace(suite.Config.LeaseName) == "" {
		return fmt.Errorf("%w: lease name is required", runtimeprovider.ErrInvalidContract)
	}
	paths := suite.Config.Paths
	for label, value := range map[string]string{
		"probe root":        paths.ProbeRoot,
		"marker":            paths.Marker,
		"service counter":   paths.ServiceCounter,
		"service heartbeat": paths.ServiceHeartbeat,
		"agent marker":      paths.AgentMarker,
	} {
		if !strings.HasPrefix(value, "/") {
			return fmt.Errorf("%w: %s path must be absolute", runtimeprovider.ErrInvalidContract, label)
		}
	}
	return nil
}

func (suite Suite) withDefaults() Suite {
	if suite.Now == nil {
		suite.Now = time.Now
	}
	suite.Config = configWithStructuralDefaults(suite.Config)
	suite.Config = configWithTimingDefaults(suite.Config)
	return suite
}

func configWithStructuralDefaults(config Config) Config {
	if config.Paths == (Paths{}) {
		config.Paths = Paths{
			ProbeRoot:        "/home/sprite/.setta/provider-conformance",
			Marker:           "/home/sprite/.setta/provider-conformance/persistence-marker",
			ServiceCounter:   "/home/sprite/.setta/provider-conformance/service-start-count",
			ServiceHeartbeat: "/home/sprite/.setta/provider-conformance/service-heartbeat",
			AgentMarker:      "/home/sprite/.setta/provider-conformance/agent-finished",
		}
	}
	if config.ServiceSpec.Name == "" {
		config.ServiceSpec = runtimeprovider.ServiceSpec{
			Name:      "setta-conformance-service",
			Path:      "/bin/service-probe",
			Arguments: []string{config.Paths.ServiceCounter, config.Paths.ServiceHeartbeat},
			RunAs: runtimeprovider.ServiceIdentity{
				User:  "sprite",
				Group: "sprite",
			},
		}
	}
	if config.LeaseName == "" {
		config.LeaseName = "setta-conformance-agent"
	}
	if config.CheckpointComment == "" {
		config.CheckpointComment = "Setta provider conformance checkpoint"
	}
	return config
}

func configWithTimingDefaults(config Config) Config {
	if config.WarmIdleDelay == 0 {
		config.WarmIdleDelay = 120 * time.Second
	}
	if config.RestartTimeout == 0 {
		config.RestartTimeout = time.Minute
	}
	if config.RestartPollInterval == 0 {
		config.RestartPollInterval = time.Second
	}
	if config.LeaseTTL == 0 {
		config.LeaseTTL = 20 * time.Second
	}
	if config.LeaseExpiryTTL == 0 {
		config.LeaseExpiryTTL = 5 * time.Second
	}
	if config.LeaseRenewWait == 0 {
		config.LeaseRenewWait = 8 * time.Second
	}
	if config.DetachedWorkWait == 0 {
		config.DetachedWorkWait = 8 * time.Second
	}
	if config.LeaseExpiryWait == 0 {
		config.LeaseExpiryWait = 7 * time.Second
	}
	if config.MaximumWarmHeartbeatSkew == 0 {
		config.MaximumWarmHeartbeatSkew = 900
	}
	return config
}

func (state *runState) requireRuntime() error {
	if !state.created || state.runtimeName == "" {
		return skipError{"runtime was not created"}
	}
	return nil
}

func requireRuntimeIdentity(
	observation runtimeprovider.RuntimeObservation,
	identity runtimeprovider.ManagedIdentity,
) error {
	if observation.Name != identity.Name || !sameStrings(observation.Labels, identity.Labels) {
		return fmt.Errorf("runtime identity = %#v, want %#v", observation, identity)
	}
	return nil
}

func requireServiceObservation(
	observation runtimeprovider.ServiceObservation,
	want runtimeprovider.ServiceSpec,
) error {
	if observation.State != runtimeprovider.ServiceStateRunning {
		return fmt.Errorf("service = %#v", observation)
	}
	if !serviceSpecEqual(observation.Spec, want) {
		return fmt.Errorf("service spec = %#v, want %#v", observation.Spec, want)
	}
	return nil
}

func serviceSpecEqual(left runtimeprovider.ServiceSpec, right runtimeprovider.ServiceSpec) bool {
	if left.HTTPPort != nil && right.HTTPPort != nil && *left.HTTPPort != *right.HTTPPort {
		return false
	}
	if (left.HTTPPort == nil) != (right.HTTPPort == nil) {
		return false
	}
	left.HTTPPort = nil
	right.HTTPPort = nil
	return reflect.DeepEqual(left, right)
}

func sameStrings(left []string, right []string) bool {
	left = slices.Clone(left)
	right = slices.Clone(right)
	slices.Sort(left)
	slices.Sort(right)
	return slices.Equal(left, right)
}

func FormatResults(results []Result) string {
	var buffer bytes.Buffer
	for _, result := range results {
		if buffer.Len() > 0 {
			buffer.WriteByte('\n')
		}
		buffer.WriteString(string(result.Name))
		buffer.WriteString(": ")
		buffer.WriteString(string(result.Status))
		if result.Reason != "" {
			buffer.WriteString(": ")
			buffer.WriteString(result.Reason)
		}
	}
	return buffer.String()
}
