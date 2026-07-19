package sprites

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"setta/internal/runtimeprovider"
)

const liveMeasurementTimeout = 45 * time.Minute

func TestLivePhase1CMeasurement(t *testing.T) {
	phase := os.Getenv("SETTA_SPRITES_PHASE1C_PHASE")
	stateDirectory := os.Getenv("SETTA_SPRITES_PHASE1C_STATE")
	repositoryRoot := os.Getenv("SETTA_REPO_ROOT")
	if phase == "" || stateDirectory == "" || repositoryRoot == "" {
		t.Skip("run through scripts/test_sprites_live_measurement.sh")
	}
	store, err := newLiveMeasurementStore(stateDirectory, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.requireOutside(repositoryRoot); err != nil {
		t.Fatal(err)
	}
	if phase == "init-manifest" {
		initializeLiveMeasurementManifest(t, store)
		return
	}
	if os.Getenv("SETTA_LIVE_SPRITES") != "1" {
		t.Fatal("SETTA_LIVE_SPRITES=1 is required after the Phase 1c manifest is initialized")
	}
	manifest, err := store.load()
	if err != nil {
		t.Fatal(err)
	}
	if phase != "cleanup" {
		validationTime := manifest.PreparedAt
		if validationTime.IsZero() {
			validationTime = time.Now().UTC()
		}
		if err := manifest.validateAuthorization(validationTime); err != nil {
			t.Fatal(err)
		}
	}
	token := os.Getenv("SPRITE_TOKEN")
	if token == "" {
		t.Fatal("SPRITE_TOKEN is required after owner authorization validates")
	}
	adapter, err := NewAdapter(token)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), liveMeasurementTimeout)
	defer cancel()
	driver := &liveMeasurementDriver{store: store, manifest: manifest, adapter: adapter, phase: phase}
	switch {
	case phase == "prepare":
		err = driver.prepare(ctx)
	case phase == "observe":
		err = driver.observe(ctx)
	case phase == "cleanup":
		err = driver.cleanup(ctx)
	case strings.HasPrefix(phase, "measure-"):
		err = driver.measure(ctx, strings.TrimPrefix(phase, "measure-"))
	default:
		err = fmt.Errorf("unsupported Phase 1c phase %q", phase)
	}
	if err != nil {
		t.Fatal(err)
	}
}

func initializeLiveMeasurementManifest(t *testing.T, store *liveMeasurementStore) {
	t.Helper()
	entries, err := os.ReadDir(store.directory)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatal("init-manifest requires an empty Phase 1c state directory")
	}
	concurrency, err := strconv.Atoi(os.Getenv("SETTA_SPRITES_PHASE1C_CONCURRENCY"))
	if err != nil || concurrency < 1 {
		t.Fatal("SETTA_SPRITES_PHASE1C_CONCURRENCY must be a positive integer")
	}
	manifest, err := newLiveMeasurementManifest(
		os.Getenv("SETTA_SPRITES_PHASE1C_RUN_ID"), time.Now(),
		os.Getenv("SETTA_SPRITES_PHASE1C_PREFIX"), concurrency,
	)
	if err != nil {
		t.Fatal(err)
	}
	manifest.Authorization.ProviderCLI = os.Getenv("SETTA_SPRITES_CLI_VERSION")
	manifest.Authorization.ProviderSDK = os.Getenv("SETTA_SPRITES_SDK_VERSION")
	manifest.Authorization.SettaCommit = os.Getenv("SETTA_COMMIT")
	if err := store.save(manifest); err != nil {
		t.Fatal(err)
	}
	t.Logf("created Phase 1c draft manifest %s; fill every authorization field and the before billing snapshot before prepare", filepath.Join(store.directory, liveMeasurementManifestName))
}

type liveMeasurementDriver struct {
	store    *liveMeasurementStore
	manifest *liveMeasurementManifest
	adapter  *Adapter
	phase    string
}

func (driver *liveMeasurementDriver) prepare(ctx context.Context) error {
	if !driver.manifest.PreparedAt.IsZero() {
		return nil
	}
	if err := driver.ingestBilling("before", true); err != nil {
		return err
	}
	snapshot, err := driver.adapter.client.OrganizationSnapshot(ctx)
	if err != nil {
		return fmt.Errorf("inspect authorized Phase 1c organization: %w", err)
	}
	authorization := driver.manifest.Authorization
	if snapshot.Info.Name != authorization.Organization {
		return fmt.Errorf("refusing organization %q; manifest authorizes %q", snapshot.Info.Name, authorization.Organization)
	}
	if snapshot.Info.Running != 0 || snapshot.Info.Warm != 0 || snapshot.Info.Cold != 0 || len(snapshot.Runtimes) != 0 {
		return fmt.Errorf("refusing non-empty Phase 1c organization: %#v", snapshot.Info)
	}
	if snapshot.Info.RunningLimit != authorization.RunningLimit || snapshot.Info.WarmLimit != authorization.WarmLimit {
		return fmt.Errorf("organization limits changed: running=%d warm=%d", snapshot.Info.RunningLimit, snapshot.Info.WarmLimit)
	}
	driver.manifest.PreparedAt = time.Now().UTC()
	if err := driver.store.appendEvidence(liveMeasurementEvidence{
		ID:   "prepare:authorized-empty-organization",
		Type: evidencePhase, Phase: driver.phase,
		Note: "owner authorization validated; organization identity, emptiness, and declared limits confirmed",
	}); err != nil {
		return err
	}
	if err := driver.appendUnavailableProviderEvidence(); err != nil {
		return err
	}
	return driver.store.save(driver.manifest)
}

func (driver *liveMeasurementDriver) appendUnavailableProviderEvidence() error {
	for _, missing := range []struct {
		id   string
		note string
	}{
		{"prepare:missing:provider-network", "provider-billed network bytes are unavailable from the pinned provider API and require bill reconciliation"},
		{"prepare:missing:checkpoint-deltas", "provider-authoritative checkpoint delta bytes are unavailable from the pinned provider API"},
		{"prepare:missing:behavioral-cold-wake", "behaviorally confirmed cold wake must be correlated with the completed independent cold-soak evidence; provider cold labels are insufficient"},
	} {
		if err := driver.store.appendEvidence(liveMeasurementEvidence{
			ID: missing.id, Type: evidenceMissingObservation, Phase: driver.phase, Note: missing.note,
		}); err != nil {
			return err
		}
	}
	return nil
}

func (driver *liveMeasurementDriver) measure(ctx context.Context, cohortName string) (returnErr error) {
	if driver.manifest.PreparedAt.IsZero() {
		return errors.New("prepare must complete before measuring a cohort")
	}
	cohort, err := driver.manifest.startCohort(cohortName, time.Now())
	if err != nil {
		return err
	}
	if err := driver.store.save(driver.manifest); err != nil {
		return err
	}
	defer func() {
		if returnErr == nil {
			return
		}
		cleanupCtx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
		defer cancel()
		cleanupErr := driver.cleanupCohort(cleanupCtx, cohort)
		cohort.State = "failed-cleaned"
		saveErr := driver.store.save(driver.manifest)
		returnErr = errors.Join(returnErr, cleanupErr, saveErr)
	}()
	for index, name := range cohort.RuntimeNames {
		if err := driver.measureRuntime(ctx, cohort, index, name); err != nil {
			return err
		}
	}
	cohort.State = "measured"
	cohort.MeasuredAt = time.Now().UTC()
	if err := driver.store.save(driver.manifest); err != nil {
		return err
	}
	return driver.cleanupCohort(ctx, cohort)
}

func (driver *liveMeasurementDriver) measureRuntime(
	ctx context.Context,
	cohort *liveMeasurementCohort,
	index int,
	name string,
) error {
	identity := runtimeprovider.ManagedIdentity{Name: name, Labels: slices.Clone(cohort.OwnershipLabels[index])}
	exposureID := cohort.Name + ":" + strconv.Itoa(index)
	possibleWake := time.Now()
	if err := driver.appendInterval(evidenceProviderExposure, exposureID+":exposure:start", cohort.Name, name, "start", exposureID, possibleWake, "possible-wake begins before create"); err != nil {
		return err
	}
	created, err := driver.adapter.Create(ctx, runtimeprovider.CreateRequest{Identity: identity})
	if err != nil {
		return err
	}
	if err := driver.appendLatency(exposureID+":create", cohort.Name, name, "create", time.Since(possibleWake), "provider create returned an owned runtime"); err != nil {
		return err
	}
	if err := driver.store.appendEvidence(liveMeasurementEvidence{
		ID: exposureID + ":provider-status:create", Type: evidenceProviderStatus, Phase: driver.phase,
		Cohort: cohort.Name, RuntimeName: name, ProviderStatus: string(created.Activity),
		Note: "supplementary provider label; not behavioral proof and not billing evidence",
	}); err != nil {
		return err
	}
	if err := driver.installProbe(ctx, name); err != nil {
		return err
	}
	before, err := driver.captureProbe(ctx, name)
	if err != nil {
		return err
	}
	if err := driver.appendStorage(exposureID+":storage:before", cohort.Name, name, "before-write", before); err != nil {
		return err
	}
	if err := driver.runCohortWork(ctx, cohort.Name, exposureID, name); err != nil {
		return err
	}
	after, err := driver.captureProbe(ctx, name)
	if err != nil {
		return err
	}
	if err := driver.appendResourceDeltas(exposureID, cohort.Name, name, before, after); err != nil {
		return err
	}
	if err := driver.appendStorage(exposureID+":storage:after", cohort.Name, name, "after-workload", after); err != nil {
		return err
	}
	if err := driver.suspendAndWarmWake(ctx, exposureID, cohort.Name, name); err != nil {
		return err
	}
	return nil
}

type phase1cProbe struct {
	WholePath      string           `json:"whole_path"`
	ChildPath      string           `json:"child_path"`
	CPUWhole       map[string]int64 `json:"cpu_whole"`
	CPUChild       map[string]int64 `json:"cpu_child"`
	MemoryWhole    map[string]int64 `json:"memory_whole"`
	MemoryChild    map[string]int64 `json:"memory_child"`
	CPUMaximum     string           `json:"cpu_maximum"`
	MemoryMaximum  string           `json:"memory_maximum"`
	LogicalBytes   uint64           `json:"logical_bytes"`
	AllocatedBytes uint64           `json:"allocated_bytes"`
}

func (driver *liveMeasurementDriver) installProbe(ctx context.Context, name string) error {
	contents, err := os.ReadFile(filepath.Join("testdata", "phase1c_measurement_probe.py"))
	if err != nil {
		return err
	}
	result, err := driver.adapter.Exec(ctx, runtimeprovider.ExecRequest{
		RuntimeName: name, Path: "/usr/bin/dd",
		Arguments: []string{"of=/tmp/setta-phase1c-probe.py", "status=none"}, Stdin: contents,
	})
	if err != nil {
		return err
	}
	if result.ExitCode != 0 {
		return fmt.Errorf("install Phase 1c probe exited %d: %s", result.ExitCode, result.Stderr)
	}
	return nil
}

func (driver *liveMeasurementDriver) captureProbe(ctx context.Context, name string) (phase1cProbe, error) {
	result, err := driver.adapter.Exec(ctx, runtimeprovider.ExecRequest{
		RuntimeName: name, Path: "/usr/bin/python3",
		Arguments: []string{"/tmp/setta-phase1c-probe.py", "snapshot", "/home/sprite/.setta-phase1c"},
	})
	if err != nil {
		return phase1cProbe{}, err
	}
	if result.ExitCode != 0 {
		return phase1cProbe{}, fmt.Errorf("Phase 1c probe exited %d: %s", result.ExitCode, result.Stderr)
	}
	var probe phase1cProbe
	if err := json.Unmarshal(result.Stdout, &probe); err != nil {
		return phase1cProbe{}, fmt.Errorf("decode Phase 1c probe: %w", err)
	}
	if probe.WholePath == "" || probe.ChildPath == "" {
		return phase1cProbe{}, errors.New("Phase 1c probe returned incomplete cgroup paths")
	}
	return probe, nil
}

func (driver *liveMeasurementDriver) runCohortWork(ctx context.Context, cohort string, id string, name string) error {
	switch cohort {
	case "retained-filesystem":
		return driver.execMeasured(ctx, id, cohort, name, "exec", "/usr/bin/python3", "/tmp/setta-phase1c-probe.py", "write", "/home/sprite/.setta-phase1c", "1048576")
	case "attached-idle":
		return driver.runAttachedIdle(ctx, id, cohort, name)
	case "renewable-workload":
		return driver.runRenewableWorkload(ctx, id, cohort, name)
	case "terminal-build", "terminal-build-preview":
		return driver.runTerminalBuild(ctx, id, cohort, name)
	case "storage-checkpoints":
		return driver.runStorageCheckpoints(ctx, id, cohort, name)
	case "hostile-cutoff":
		return driver.execMeasured(ctx, id, cohort, name, "exec", "/usr/bin/python3", "/tmp/setta-phase1c-probe.py", "cpu", "5")
	case "beta-concurrency":
		return driver.execMeasured(ctx, id, cohort, name, "exec", "/usr/bin/python3", "/tmp/setta-phase1c-probe.py", "cpu", "2")
	default:
		return fmt.Errorf("unsupported cohort %q", cohort)
	}
}

func (driver *liveMeasurementDriver) runAttachedIdle(ctx context.Context, id string, cohort string, name string) error {
	if err := driver.appendInterval(evidenceAttachment, id+":gateway:open", cohort, name, "open", id+":gateway", time.Now(), "authenticated exec gateway opened"); err != nil {
		return err
	}
	if err := driver.terminalEcho(ctx, id+":terminal:first", cohort, name, "terminal_echo"); err != nil {
		return err
	}
	if err := driver.appendInterval(evidenceAttachment, id+":gateway:close", cohort, name, "close", id+":gateway", time.Now(), "authenticated TTY gateway closed"); err != nil {
		return err
	}
	if err := driver.appendInterval(evidenceAttachment, id+":gateway:reopen", cohort, name, "open", id+":gateway-reconnect", time.Now(), "new authenticated TTY gateway opened"); err != nil {
		return err
	}
	if err := driver.terminalEcho(ctx, id+":terminal:reconnect", cohort, name, "reconnect"); err != nil {
		return err
	}
	return driver.appendInterval(evidenceAttachment, id+":gateway:reclose", cohort, name, "close", id+":gateway-reconnect", time.Now(), "reconnected authenticated TTY gateway closed")
}

func (driver *liveMeasurementDriver) runRenewableWorkload(ctx context.Context, id string, cohort string, name string) error {
	if err := driver.leaseAction(ctx, id, cohort, name, "acquired"); err != nil {
		return err
	}
	if err := driver.execMeasured(ctx, id, cohort, name, "exec", "/usr/bin/python3", "/tmp/setta-phase1c-probe.py", "cpu", "2"); err != nil {
		return err
	}
	if err := driver.leaseAction(ctx, id, cohort, name, "renewed"); err != nil {
		return err
	}
	return driver.leaseAction(ctx, id, cohort, name, "released")
}

func (driver *liveMeasurementDriver) runTerminalBuild(ctx context.Context, id string, cohort string, name string) error {
	if err := driver.terminalEcho(ctx, id+":terminal", cohort, name, "terminal_echo"); err != nil {
		return err
	}
	if err := driver.execMeasured(ctx, id, cohort, name, "exec", "/usr/bin/python3", "-m", "compileall", "-q", "/tmp/setta-phase1c-probe.py"); err != nil {
		return err
	}
	if cohort != "terminal-build-preview" {
		return nil
	}
	return driver.runAuthenticatedPreview(ctx, id, cohort, name)
}

func (driver *liveMeasurementDriver) runAuthenticatedPreview(ctx context.Context, id string, cohort string, name string) error {
	if err := driver.execMeasured(ctx, id, cohort, name, "preview_start", "/usr/bin/python3", "/tmp/setta-phase1c-probe.py", "preview-start", "8080"); err != nil {
		return err
	}
	client, ok := driver.adapter.client.(*sdkClient)
	if !ok {
		return errors.New("Phase 1c preview measurement requires the production Sprites SDK client")
	}
	attachmentID := id + ":preview"
	if err := driver.appendInterval(evidenceAttachment, attachmentID+":open", cohort, name, "open", attachmentID, time.Now(), "authenticated SDK preview proxy opened"); err != nil {
		return err
	}
	started := time.Now()
	session, err := client.client.ProxyPort(ctx, name, 0, 8080)
	if err != nil {
		return err
	}
	defer session.Close()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://"+session.LocalAddr().String()+"/", nil)
	if err != nil {
		return err
	}
	response, err := (&http.Client{Timeout: 30 * time.Second}).Do(request)
	if err != nil {
		return err
	}
	body, readErr := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	closeErr := response.Body.Close()
	if readErr != nil || closeErr != nil {
		return errors.Join(readErr, closeErr)
	}
	if response.StatusCode != http.StatusOK || !strings.Contains(string(body), "phase1c-preview") {
		return fmt.Errorf("Phase 1c preview returned HTTP %d without its marker", response.StatusCode)
	}
	if err := driver.appendLatency(id+":latency:preview", cohort, name, "preview", time.Since(started), "authenticated proxy returned the exact preview marker"); err != nil {
		return err
	}
	if err := driver.store.appendEvidence(liveMeasurementEvidence{
		ID: id + ":network:preview", Type: evidenceNetwork, Phase: driver.phase,
		Cohort: cohort, RuntimeName: name,
		Network: &liveMeasurementNetwork{Boundary: "setta_preview_payload", EgressBytes: uint64(len(body)), Source: "Setta authenticated preview response byte count"},
		Note:    "proxy framing and provider-billed bytes are separate observations",
	}); err != nil {
		return err
	}
	if err := session.Close(); err != nil {
		return err
	}
	return driver.appendInterval(evidenceAttachment, attachmentID+":close", cohort, name, "close", attachmentID, time.Now(), "authenticated SDK preview proxy closed")
}

func (driver *liveMeasurementDriver) runStorageCheckpoints(ctx context.Context, id string, cohort string, name string) error {
	if err := driver.execMeasured(ctx, id, cohort, name, "exec", "/usr/bin/python3", "/tmp/setta-phase1c-probe.py", "write", "/home/sprite/.setta-phase1c", "8388608"); err != nil {
		return err
	}
	afterWrite, err := driver.captureProbe(ctx, name)
	if err != nil {
		return err
	}
	if err := driver.appendStorage(id+":storage:after-write", cohort, name, "after-write", afterWrite); err != nil {
		return err
	}
	for _, scenario := range []string{"unchanged", "small-delta", "large-delta"} {
		if err := driver.createMeasuredCheckpoint(ctx, id, cohort, name, scenario); err != nil {
			return err
		}
	}
	return driver.deleteTrim(ctx, id, cohort, name)
}

func (driver *liveMeasurementDriver) createMeasuredCheckpoint(ctx context.Context, id string, cohort string, name string, scenario string) error {
	started := time.Now()
	checkpoint, err := driver.adapter.CreateCheckpoint(ctx, name, "Phase 1c "+scenario)
	if err != nil {
		return err
	}
	return driver.store.appendEvidence(liveMeasurementEvidence{
		ID: id + ":checkpoint:" + scenario, Type: evidenceCheckpoint, Phase: driver.phase,
		Cohort: cohort, RuntimeName: name,
		Checkpoint: &liveMeasurementCheckpoint{Action: "created", Scenario: scenario, CheckpointID: checkpoint.ID, CreatedAt: checkpoint.CreatedAt, LatencyNanos: time.Since(started).Nanoseconds()},
		Note:       "provider API exposes checkpoint identity but not authoritative delta bytes; filesystem deltas are recorded separately",
	})
}

func (driver *liveMeasurementDriver) deleteTrim(ctx context.Context, id string, cohort string, name string) error {
	started := time.Now()
	result, err := driver.adapter.Exec(ctx, runtimeprovider.ExecRequest{
		RuntimeName: name, Path: "/usr/bin/python3",
		Arguments: []string{"/tmp/setta-phase1c-probe.py", "delete-trim", "/home/sprite/.setta-phase1c"},
	})
	if err != nil {
		return err
	}
	if result.ExitCode != 0 {
		return fmt.Errorf("Phase 1c delete/TRIM exited %d: %s", result.ExitCode, result.Stderr)
	}
	probe, err := driver.captureProbe(ctx, name)
	if err != nil {
		return err
	}
	if err := driver.store.appendEvidence(liveMeasurementEvidence{
		ID: id + ":storage:after-delete-trim", Type: evidenceStorage, Phase: driver.phase,
		Cohort: cohort, RuntimeName: name,
		Storage: &liveMeasurementStorage{
			Boundary: "after-delete-trim", LogicalBytes: probe.LogicalBytes,
			AllocatedBytes: probe.AllocatedBytes, TrimAttempted: true,
			TrimResult: strings.TrimSpace(string(result.Stdout)),
		},
	}); err != nil {
		return err
	}
	return driver.appendLatency(id+":latency:delete-trim", cohort, name, "delete_trim", time.Since(started), "filesystem deletion completed and fstrim result was retained")
}

func (driver *liveMeasurementDriver) execMeasured(ctx context.Context, id string, cohort string, name string, operation string, path string, arguments ...string) error {
	started := time.Now()
	result, err := driver.adapter.Exec(ctx, runtimeprovider.ExecRequest{RuntimeName: name, Path: path, Arguments: arguments})
	if err != nil {
		return err
	}
	if result.ExitCode != 0 {
		return fmt.Errorf("Phase 1c %s exited %d: %s", operation, result.ExitCode, result.Stderr)
	}
	if err := driver.appendLatency(id+":latency:"+operation, cohort, name, operation, time.Since(started), "command output and exit status confirmed"); err != nil {
		return err
	}
	return driver.store.appendEvidence(liveMeasurementEvidence{
		ID: id + ":network:" + operation, Type: evidenceNetwork, Phase: driver.phase,
		Cohort: cohort, RuntimeName: name,
		Network: &liveMeasurementNetwork{
			Boundary: "setta_exec_payload", IngressBytes: uint64(len(strings.Join(arguments, "\x00"))),
			EgressBytes: uint64(len(result.Stdout) + len(result.Stderr)), Source: "Setta exec request/result byte counts",
		},
		Note: "gateway framing and provider-billed bytes are separate observations",
	})
}

func (driver *liveMeasurementDriver) terminalEcho(ctx context.Context, id string, cohort string, name string, operation string) error {
	client, ok := driver.adapter.client.(*sdkClient)
	if !ok {
		return errors.New("Phase 1c terminal measurement requires the production Sprites SDK client")
	}
	started := time.Now()
	command := client.client.Sprite(name).CommandContext(ctx, "/bin/echo", "phase1c-terminal-echo")
	command.SetTTY(true)
	output, err := command.CombinedOutput()
	if err != nil {
		return fmt.Errorf("Phase 1c terminal echo: %w", err)
	}
	if !strings.Contains(string(output), "phase1c-terminal-echo") {
		return errors.New("Phase 1c terminal echo marker was not returned")
	}
	if err := driver.appendLatency(id+":latency", cohort, name, operation, time.Since(started), "authenticated TTY returned the exact echo marker"); err != nil {
		return err
	}
	return driver.store.appendEvidence(liveMeasurementEvidence{
		ID: id + ":network", Type: evidenceNetwork, Phase: driver.phase, Cohort: cohort, RuntimeName: name,
		Network: &liveMeasurementNetwork{Boundary: "setta_terminal_payload", EgressBytes: uint64(len(output)), Source: "Setta terminal output byte count"},
		Note:    "gateway framing and provider-billed bytes are separate observations",
	})
}

func (driver *liveMeasurementDriver) suspendAndWarmWake(ctx context.Context, id string, cohort string, name string) error {
	started := time.Now()
	confirmation, err := driver.suspendForMeasurement(ctx, name)
	if err != nil {
		return err
	}
	if err := driver.appendLatency(id+":latency:suspend", cohort, name, "suspend", time.Since(started), confirmation); err != nil {
		return err
	}
	wakeStarted := time.Now()
	if err := driver.appendInterval(evidenceProviderExposure, id+":warm-wake:start", cohort, name, "start", id+":warm-wake", wakeStarted, "possible-wake begins before the post-suspend exec"); err != nil {
		return err
	}
	result, err := driver.adapter.Exec(ctx, runtimeprovider.ExecRequest{RuntimeName: name, Path: "/bin/true"})
	if err != nil {
		return err
	}
	if result.ExitCode != 0 {
		return fmt.Errorf("warm wake confirmation exited %d", result.ExitCode)
	}
	if err := driver.appendLatency(id+":latency:warm-wake", cohort, name, "warm_wake", time.Since(wakeStarted), "post-suspend command completed successfully"); err != nil {
		return err
	}
	if _, err := driver.suspendForMeasurement(ctx, name); err != nil {
		return err
	}
	return driver.appendInterval(evidenceProviderExposure, id+":warm-wake:end", cohort, name, "end", id+":warm-wake", time.Now(), "suspend endpoint acknowledged after behaviorally confirmed warm wake")
}

func (driver *liveMeasurementDriver) suspendForMeasurement(ctx context.Context, name string) (string, error) {
	client, ok := driver.adapter.client.(*sdkClient)
	if !ok {
		return "", errors.New("Phase 1c suspend measurement requires the production Sprites SDK client")
	}
	response, body, err := client.requestAPI(ctx, http.MethodPost, "/v1/sprites/"+url.PathEscape(name)+"/suspend")
	if err != nil {
		return "", err
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return "", fmt.Errorf("Phase 1c suspend returned HTTP %d: %s", response.StatusCode, body)
	}
	return fmt.Sprintf("provider suspend endpoint acknowledged HTTP %d", response.StatusCode), nil
}

func (driver *liveMeasurementDriver) leaseAction(ctx context.Context, id string, cohort string, name string, action string) error {
	result, err := driver.adapter.Exec(ctx, runtimeprovider.ExecRequest{
		RuntimeName: name, Path: "/usr/bin/python3",
		Arguments: []string{"/tmp/setta-phase1c-probe.py", "lease", action, "phase1c-agent", "60"},
	})
	if err != nil {
		return err
	}
	if result.ExitCode != 0 {
		return fmt.Errorf("Phase 1c lease %s exited %d: %s", action, result.ExitCode, result.Stderr)
	}
	confirmation := strings.TrimSpace(string(result.Stdout))
	if confirmation == "" {
		return fmt.Errorf("Phase 1c lease %s returned no authoritative response", action)
	}
	return driver.appendInterval(evidenceLease, id+":lease:"+action, cohort, name, action, id+":lease", time.Now(), confirmation)
}

func (driver *liveMeasurementDriver) appendResourceDeltas(id string, cohort string, name string, before phase1cProbe, after phase1cProbe) error {
	for _, measurement := range []struct {
		typeName                liveMeasurementEvidenceType
		suffix                  string
		maximum                 string
		wholeBefore, wholeAfter map[string]int64
		childBefore, childAfter map[string]int64
	}{
		{evidenceCPU, "cpu", after.CPUMaximum, before.CPUWhole, after.CPUWhole, before.CPUChild, after.CPUChild},
		{evidenceMemory, "memory", after.MemoryMaximum, before.MemoryWhole, after.MemoryWhole, before.MemoryChild, after.MemoryChild},
	} {
		if err := driver.store.appendEvidence(liveMeasurementEvidence{
			ID: id + ":" + measurement.suffix, Type: measurement.typeName, Phase: driver.phase,
			Cohort: cohort, RuntimeName: name,
			ResourceDelta: &liveMeasurementResourceDelta{
				WholePath: before.WholePath, ChildPath: before.ChildPath,
				WholeBefore: measurement.wholeBefore, WholeAfter: measurement.wholeAfter,
				WholeDelta:  subtractCounters(measurement.wholeAfter, measurement.wholeBefore),
				ChildBefore: measurement.childBefore, ChildAfter: measurement.childAfter,
				ChildDelta:  subtractCounters(measurement.childAfter, measurement.childBefore),
				EnforcedMax: measurement.maximum,
			},
		}); err != nil {
			return err
		}
	}
	return nil
}

func subtractCounters(after map[string]int64, before map[string]int64) map[string]int64 {
	delta := make(map[string]int64, len(after))
	for name, value := range after {
		delta[name] = value - before[name]
	}
	return delta
}

func (driver *liveMeasurementDriver) appendStorage(id string, cohort string, name string, boundary string, probe phase1cProbe) error {
	return driver.store.appendEvidence(liveMeasurementEvidence{
		ID: id, Type: evidenceStorage, Phase: driver.phase, Cohort: cohort, RuntimeName: name,
		Storage: &liveMeasurementStorage{Boundary: boundary, LogicalBytes: probe.LogicalBytes, AllocatedBytes: probe.AllocatedBytes},
	})
}

func (driver *liveMeasurementDriver) appendLatency(id string, cohort string, name string, operation string, duration time.Duration, proof string) error {
	return driver.store.appendEvidence(liveMeasurementEvidence{
		ID: id, Type: evidenceLatency, Phase: driver.phase, Cohort: cohort, RuntimeName: name,
		Latency: &liveMeasurementLatency{Operation: operation, DurationNanos: duration.Nanoseconds(), BehavioralProof: proof},
	})
}

func (driver *liveMeasurementDriver) appendInterval(kind liveMeasurementEvidenceType, id string, cohort string, name string, action string, intervalID string, at time.Time, confirmation string) error {
	return driver.store.appendEvidence(liveMeasurementEvidence{
		ID: id, Type: kind, Phase: driver.phase, Cohort: cohort, RuntimeName: name,
		Interval: &liveMeasurementInterval{Action: action, IntervalID: intervalID, At: at.UTC(), Confirmation: confirmation},
	})
}

func (driver *liveMeasurementDriver) cleanupCohort(ctx context.Context, cohort *liveMeasurementCohort) error {
	for index, name := range cohort.RuntimeNames {
		observation, found, err := driver.adapter.Inspect(ctx, name)
		if err != nil {
			return err
		}
		hadExposure := found || !cohort.StartedAt.IsZero()
		if found {
			identity := runtimeprovider.ManagedIdentity{Name: name, Labels: cohort.OwnershipLabels[index]}
			if err := requireLabels(identity, observation.Labels); err != nil {
				return err
			}
			started := time.Now()
			if err := driver.adapter.Destroy(ctx, name); err != nil {
				return err
			}
			operation := "cleanup_destroy"
			if cohort.Name == "hostile-cutoff" {
				operation = "budget_cutoff"
			}
			if err := driver.appendLatency(cohort.Name+":"+strconv.Itoa(index)+":"+operation, cohort.Name, name, operation, time.Since(started), "destructive cutoff used; runtime absence verified next"); err != nil {
				return err
			}
		}
		_, found, err = driver.adapter.Inspect(ctx, name)
		if err != nil {
			return err
		}
		if found {
			return fmt.Errorf("runtime %s remains after cleanup", name)
		}
		if hadExposure {
			if err := driver.appendInterval(evidenceProviderExposure, cohort.Name+":"+strconv.Itoa(index)+":exposure:end", cohort.Name, name, "end", cohort.Name+":"+strconv.Itoa(index), time.Now(), "owned runtime and its checkpoints are absent after destroy"); err != nil {
				return err
			}
		}
		if err := driver.appendCheckpointDeletions(cohort.Name, name, time.Now()); err != nil {
			return err
		}
	}
	cohort.State = "cleaned"
	cohort.CleanupVerifiedAt = time.Now().UTC()
	return driver.store.save(driver.manifest)
}

func (driver *liveMeasurementDriver) appendCheckpointDeletions(cohort string, runtimeName string, deletedAt time.Time) error {
	file, err := os.Open(filepath.Join(driver.store.directory, liveMeasurementEvidenceName))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	defer file.Close()
	_, records, err := replayLiveMeasurementEvidence(file)
	if err != nil {
		return err
	}
	for _, record := range records {
		if record.Type != evidenceCheckpoint || record.RuntimeName != runtimeName || record.Checkpoint.Action != "created" {
			continue
		}
		checkpoint := *record.Checkpoint
		checkpoint.Action = "deleted"
		checkpoint.RetentionNanos = deletedAt.Sub(checkpoint.CreatedAt).Nanoseconds()
		checkpoint.DeletedAt = deletedAt.UTC()
		if err := driver.store.appendEvidence(liveMeasurementEvidence{
			ID: record.ID + ":deleted", Type: evidenceCheckpoint, Phase: driver.phase,
			Cohort: cohort, RuntimeName: runtimeName, Checkpoint: &checkpoint,
			Note: "checkpoint absence follows owned runtime destruction",
		}); err != nil {
			return err
		}
	}
	return nil
}

func (driver *liveMeasurementDriver) observe(ctx context.Context) error {
	if err := driver.ingestBilling("first-visible", false); err != nil {
		return err
	}
	if err := driver.ingestBilling("final-settled", false); err != nil {
		return err
	}
	for _, cohort := range driver.manifest.Cohorts {
		for _, name := range cohort.RuntimeNames {
			observation, found, err := driver.adapter.Inspect(ctx, name)
			if err != nil {
				return err
			}
			status := "absent"
			if found {
				status = string(observation.Activity)
			}
			if err := driver.store.appendEvidence(liveMeasurementEvidence{
				ID: "observe:" + name + ":" + status, Type: evidenceProviderStatus, Phase: driver.phase,
				Cohort: cohort.Name, RuntimeName: name, ProviderStatus: status,
				Note: "supplementary management-plane label only",
			}); err != nil {
				return err
			}
		}
	}
	return driver.store.save(driver.manifest)
}

func (driver *liveMeasurementDriver) ingestBilling(stage string, required bool) error {
	index := slices.IndexFunc(driver.manifest.Billing, func(snapshot liveMeasurementBillingPlaceholder) bool { return snapshot.Stage == stage })
	if index < 0 {
		return fmt.Errorf("missing billing placeholder %s", stage)
	}
	placeholder := &driver.manifest.Billing[index]
	if placeholder.Recorded {
		return nil
	}
	if placeholder.Source == "" || placeholder.ObservedAt.IsZero() || placeholder.Artifact == "" {
		if required {
			return fmt.Errorf("fill billing snapshot %s source, observed_at, and artifact before this phase", stage)
		}
		return nil
	}
	if err := driver.store.appendEvidence(liveMeasurementEvidence{
		ID: "billing:" + stage, Type: evidenceBilling, Phase: driver.phase,
		Billing: &liveMeasurementBilling{Stage: stage, Source: placeholder.Source, ObservedAt: placeholder.ObservedAt, Artifact: placeholder.Artifact, Note: placeholder.Note},
	}); err != nil {
		return err
	}
	placeholder.Recorded = true
	return nil
}

func (driver *liveMeasurementDriver) cleanup(ctx context.Context) error {
	driver.manifest.CleanupAttempts = append(driver.manifest.CleanupAttempts, time.Now().UTC())
	for index := range driver.manifest.Cohorts {
		if err := driver.cleanupCohort(ctx, &driver.manifest.Cohorts[index]); err != nil {
			return err
		}
	}
	driver.manifest.CleanupComplete = time.Now().UTC()
	if err := driver.store.appendEvidence(liveMeasurementEvidence{
		ID: "cleanup:complete", Type: evidenceCleanup, Phase: driver.phase,
		Note: "every deterministic runtime and runtime-owned checkpoint is absent",
	}); err != nil {
		return err
	}
	return driver.store.save(driver.manifest)
}
