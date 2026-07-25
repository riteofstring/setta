package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/controlplane"
	"setta/internal/runtimeaccess"
	"setta/internal/runtimeaccounting"
	"setta/internal/runtimeprovider"
)

func TestConfigFromArgsRequiresDurableBoundariesAndProviderSecret(t *testing.T) {
	validEnvironment := map[string]string{
		"SETTA_CONTROL_PLANE_DATA_DIR":   filepath.Join(t.TempDir(), "data"),
		"SETTA_CONTROL_PLANE_SECRET_DIR": filepath.Join(t.TempDir(), "secrets"),
		"SPRITE_TOKEN":                   "provider-token",
	}
	config, err := configFromArgs(nil, &bytes.Buffer{}, mapEnvironment(validEnvironment))
	if err != nil {
		t.Fatalf("configFromArgs: %v", err)
	}
	if config.Host != "127.0.0.1" || config.Port != 8080 ||
		config.MaxConcurrentRequest != 64 || config.MaxRequestBytes != 1<<20 ||
		config.RuntimeTarget != "127.0.0.1:7345" ||
		config.ProviderBaseURL != "https://api.sprites.dev" {
		t.Fatalf("default config = %+v", config)
	}

	for _, name := range []string{
		"SETTA_CONTROL_PLANE_DATA_DIR",
		"SETTA_CONTROL_PLANE_SECRET_DIR",
		"SPRITE_TOKEN",
	} {
		environment := map[string]string{}
		for key, value := range validEnvironment {
			environment[key] = value
		}
		delete(environment, name)
		if _, err := configFromArgs(nil, &bytes.Buffer{}, mapEnvironment(environment)); err == nil {
			t.Fatalf("config without %s succeeded", name)
		}
	}
}

func TestConfigFromArgsAcceptsExplicitHostedCeilings(t *testing.T) {
	environment := map[string]string{
		"SETTA_CONTROL_PLANE_DATA_DIR":   filepath.Join(t.TempDir(), "data"),
		"SETTA_CONTROL_PLANE_SECRET_DIR": filepath.Join(t.TempDir(), "secrets"),
		"SPRITE_TOKEN":                   "provider-token",
	}
	config, err := configFromArgs([]string{
		"--host", "0.0.0.0",
		"--port", "9090",
		"--max-concurrent-requests", "8",
		"--max-request-bytes", "65536",
		"--sprites-api-base-url", "http://127.0.0.1:8099",
		"--shutdown-timeout", "20s",
	}, &bytes.Buffer{}, mapEnvironment(environment))
	if err != nil {
		t.Fatalf("configFromArgs: %v", err)
	}
	if config.Host != "0.0.0.0" || config.Port != 9090 ||
		config.MaxConcurrentRequest != 8 || config.MaxRequestBytes != 65536 ||
		config.ProviderBaseURL != "http://127.0.0.1:8099" ||
		config.ShutdownTimeout.String() != "20s" {
		t.Fatalf("explicit config = %+v", config)
	}
}

func TestBootstrapIsRestartSafeAndKeepsCredentialsInPrivateFiles(t *testing.T) {
	fixture := newBootstrapFixture(t)
	store, server := startBootstrapAdminServer(t, fixture.dataDirectory)
	for attempt := 0; attempt < 2; attempt++ {
		runBootstrapAttempt(t, fixture.args, fixture.runtimeName, attempt)
	}
	stopBootstrapAdminServer(t, store, server)
	verifyBootstrapState(t, fixture)
}

func TestBootstrapAcceptsOnePinnedClientCredentialFromStdinAcrossRetries(t *testing.T) {
	fixture := newBootstrapFixture(t)
	store, server := startBootstrapAdminServer(t, fixture.dataDirectory)
	defer stopBootstrapAdminServer(t, store, server)
	credential, err := controlplane.NewDeviceCredential()
	if err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(credential)
	if err != nil {
		t.Fatal(err)
	}
	args := append(append([]string(nil), fixture.args...), "--client-credential-stdin")
	for attempt := 0; attempt < 2; attempt++ {
		var stdout bytes.Buffer
		if exitCode := runBootstrap(args, bytes.NewReader(payload), &stdout, &bytes.Buffer{}, mapEnvironment(nil)); exitCode != 0 {
			t.Fatalf("stdin bootstrap attempt %d exit code = %d", attempt+1, exitCode)
		}
	}
	stored, err := os.ReadFile(fixture.clientCredentialFile)
	if err != nil {
		t.Fatal(err)
	}
	var storedCredential controlplane.DeviceCredential
	if err := json.Unmarshal(stored, &storedCredential); err != nil || storedCredential != credential {
		t.Fatalf("stored credential = %+v, %v", storedCredential, err)
	}
	different, err := controlplane.NewDeviceCredential()
	if err != nil {
		t.Fatal(err)
	}
	differentPayload, _ := json.Marshal(different)
	if exitCode := runBootstrap(args, bytes.NewReader(differentPayload), &bytes.Buffer{}, &bytes.Buffer{}, mapEnvironment(nil)); exitCode != 1 {
		t.Fatalf("mismatched stdin bootstrap exit code = %d", exitCode)
	}
}

func TestEnsureRuntimeCommandPersistsOneRestartSafeIntent(t *testing.T) {
	root := t.TempDir()
	identity, err := runtimeprovider.NewManagedIdentity("control-plane-ensure-command")
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	args := []string{
		"--data-dir", filepath.Join(root, "data"),
		"--idempotency-key", "ensure-command-operation",
		"--runtime-name", identity.Name,
		"--runtime-release", "ensure-command-release",
		"--runtime-secret-ref", "future_runtime_credential",
		"--cpu-core-millionths", "1000000",
		"--memory-bytes", "512000000",
		"--storage-bytes", "10000000000",
		"--user-id", "user-ensure-command",
	}
	for attempt := 0; attempt < 2; attempt++ {
		var stdout bytes.Buffer
		if exitCode := runEnsureRuntime(args, &stdout, &bytes.Buffer{}, mapEnvironment(nil)); exitCode != 0 {
			t.Fatalf("ensure-runtime attempt %d exit code = %d", attempt+1, exitCode)
		}
		var event ensureRuntimeEvent
		if err := json.Unmarshal(stdout.Bytes(), &event); err != nil {
			t.Fatalf("decode ensure-runtime event: %v", err)
		}
		if event.RuntimeName != identity.Name || event.Status != controlplane.RuntimeOperationPending {
			t.Fatalf("ensure-runtime event = %+v", event)
		}
	}
	store, err := controlplane.OpenStore(controlplane.StoreConfig{Directory: filepath.Join(root, "data")})
	if err != nil {
		t.Fatalf("OpenStore: %v", err)
	}
	defer store.Close()
	operation, err := store.RuntimeOperation(context.Background(), "ensure-command-operation")
	if err != nil || operation.AttemptCount != 0 || operation.Status != controlplane.RuntimeOperationPending {
		t.Fatalf("persisted ensure-runtime operation = %+v, %v", operation, err)
	}
	runtime, err := store.Runtime(context.Background(), identity.Name)
	if err != nil ||
		runtime.Resources.CPUCoreMillionths != 1_000_000 ||
		runtime.Resources.MemoryBytes != 512_000_000 ||
		runtime.Resources.StorageBytes != 10_000_000_000 {
		t.Fatalf("persisted ensure-runtime resources = %+v, %v", runtime.Resources, err)
	}
}

func TestEnsureRuntimeCommandRejectsStorageAboveProductCeilingBeforePersistence(t *testing.T) {
	root := t.TempDir()
	dataDirectory := filepath.Join(root, "data")
	identity, err := runtimeprovider.NewManagedIdentity("control-plane-storage-ceiling")
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	var stderr bytes.Buffer
	exitCode := runEnsureRuntime([]string{
		"--data-dir", dataDirectory,
		"--idempotency-key", "storage-ceiling-operation",
		"--runtime-name", identity.Name,
		"--runtime-release", "storage-ceiling-release",
		"--runtime-secret-ref", "storage_ceiling_secret",
		"--cpu-core-millionths", "1000000",
		"--memory-bytes", "512000000",
		"--storage-bytes", "100000000001",
		"--user-id", "user-storage-ceiling",
	}, &bytes.Buffer{}, &stderr, mapEnvironment(nil))
	if exitCode != 2 || !strings.Contains(stderr.String(), "100 GB product ceiling") {
		t.Fatalf("ensure-runtime exit = %d, stderr = %q", exitCode, stderr.String())
	}
	if _, err := os.Stat(dataDirectory); !os.IsNotExist(err) {
		t.Fatalf("control-plane data directory exists after rejected ceiling: %v", err)
	}
}

func TestProductionServicesEmitContentFreeProviderAlerts(t *testing.T) {
	provider := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		http.Error(response, "provider unavailable", http.StatusServiceUnavailable)
	}))
	defer provider.Close()
	root := t.TempDir()
	dataDirectory := filepath.Join(root, "data")
	store, err := controlplane.OpenStore(controlplane.StoreConfig{Directory: dataDirectory})
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	identity, err := runtimeprovider.NewManagedIdentity("production-alert")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.UpsertUser(t.Context(), "user-production-alert"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.EnsureRuntimeIntent(t.Context(), controlplane.EnsureRuntimeRequest{
		CredentialSecretRef: "production_alert_secret",
		CredentialEpoch:     1,
		DesiredRelease:      "production-alert-release",
		IdempotencyKey:      "production-alert-operation",
		Resources: runtimeprovider.RuntimeResources{
			CPUCoreMillionths: 1_000_000,
			MemoryBytes:       512_000_000,
			StorageBytes:      10_000_000_000,
		},
		RuntimeName:       identity.Name,
		UpstreamAuthority: defaultRuntimeTarget,
		UserID:            "user-production-alert",
	}); err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	services, err := startControlPlaneServices(commandConfig{
		DataDirectory: dataDirectory, Host: "127.0.0.1",
		MaxConcurrentRequest: defaultMaxConcurrentRequests,
		MaxRequestBytes:      defaultMaxRequestBytes,
		Port:                 0,
		ProviderBaseURL:      provider.URL,
		ProviderToken:        "provider-token",
		RuntimeTarget:        defaultRuntimeTarget,
		SecretDirectory:      filepath.Join(root, "secrets"),
		ShutdownTimeout:      defaultShutdownTimeout,
	}, store, &output)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := services.shutdownGateway(defaultShutdownTimeout); err != nil {
			t.Fatal(err)
		}
	}()
	processed, err := services.reconciler.ReconcileOnce(t.Context())
	if err != nil || !processed {
		t.Fatalf("reconcile provider failure = %t, %v", processed, err)
	}
	var foundAlert bool
	decoder := json.NewDecoder(bytes.NewReader(output.Bytes()))
	for {
		var event map[string]any
		err := decoder.Decode(&event)
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		if event["event"] == "operational_alert" &&
			event["signal"] == "provider_error" &&
			event["severity"] == "warning" &&
			event["error_code"] == "provider_inspect" {
			foundAlert = true
		}
		for _, forbidden := range []string{
			identity.Name,
			"user-production-alert",
			"production-alert-operation",
			"provider-token",
		} {
			if strings.Contains(fmt.Sprint(event), forbidden) {
				t.Fatalf("production alert stream exposed %q: %v", forbidden, event)
			}
		}
	}
	if !foundAlert {
		t.Fatalf("production alert stream = %s", output.String())
	}
}

func TestAdminCommandsMutateTheLiveControlPlaneWithoutPrintingCredentials(t *testing.T) {
	fixture := newBootstrapFixture(t)
	store, server := startBootstrapAdminServer(t, fixture.dataDirectory)
	defer stopBootstrapAdminServer(t, store, server)
	runBootstrapAttempt(t, fixture.args, fixture.runtimeName, 0)
	credential, err := controlplane.NewDeviceCredential()
	if err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(credential)
	if err != nil {
		t.Fatal(err)
	}
	socketPath := controlplane.AdminSocketPath(fixture.dataDirectory)
	requireAdminWakeHealthWorkflow(t, store, socketPath, fixture.runtimeName)
	requireAdminRuntimeReportingCredentialWorkflow(t, store, socketPath, fixture.runtimeName)
	requireAdminRuntimeMetadataWorkflow(t, store, socketPath, fixture.runtimeName)
	requireAdminRuntimeAccessWorkflow(t, store, socketPath, fixture.runtimeName)
	requireAdminRuntimeDeletionWorkflow(t, store, socketPath, fixture.runtimeName)
	accountingTransition, err := json.Marshal(runtimeaccounting.ActivityTransition{
		EventID: "admin-provider-begin", At: time.Now().UTC(),
		Kind: runtimeaccounting.ActivityProvider, Action: runtimeaccounting.EventBegin,
	})
	if err != nil {
		t.Fatal(err)
	}
	runAdminTestCommand(t, []string{
		"record-accounting-event", "--socket", socketPath, "--runtime-name", fixture.runtimeName,
	}, accountingTransition)
	accounting, err := store.RuntimeAccountingSnapshot(context.Background(), fixture.runtimeName)
	if err != nil || accounting.Ledger.LastSequence != 1 {
		t.Fatalf("accounting after administration command = %+v, %v", accounting, err)
	}
	ensureOutput := runAdminTestCommand(t, []string{
		"ensure-device", "--socket", socketPath, "--device-name", "Hosted replacement",
		"--runtime-name", fixture.runtimeName, "--user-id", "user-bootstrap",
	}, payload)
	if bytes.Contains(ensureOutput, []byte(credential.Token)) {
		t.Fatal("administration output exposed the device token")
	}
	authorization, err := store.AuthorizeClient(context.Background(), credential.Token)
	if err != nil || authorization.Outcome != runtimeaccess.AuthorizationAllowed {
		t.Fatalf("replacement authorization = %+v, %v", authorization, err)
	}
	runAdminTestCommand(t, []string{
		"set-user-status", "--socket", socketPath, "--status", "suspended", "--user-id", "user-bootstrap",
	}, nil)
	select {
	case <-authorization.Invalidated:
	case <-time.After(time.Second):
		t.Fatal("administrative suspension did not push invalidation")
	}
	runAdminTestCommand(t, []string{
		"set-user-status", "--socket", socketPath, "--status", "active", "--user-id", "user-bootstrap",
	}, nil)
	runAdminTestCommand(t, []string{
		"revoke-device", "--socket", socketPath, "--device-id", credential.DeviceID,
	}, nil)
	authorization, err = store.AuthorizeClient(context.Background(), credential.Token)
	if err != nil || authorization.Outcome != runtimeaccess.AuthorizationRevoked {
		t.Fatalf("revoked authorization = %+v, %v", authorization, err)
	}
}

func requireAdminRuntimeAccessWorkflow(
	t *testing.T,
	store *controlplane.Store,
	socketPath string,
	runtimeName string,
) {
	t.Helper()
	for _, state := range []controlplane.RuntimeAccessState{
		controlplane.RuntimeAccessSuspended,
		controlplane.RuntimeAccessExportOnly,
		controlplane.RuntimeAccessEnabled,
	} {
		output := runAdminTestCommand(t, []string{
			"set-runtime-access", "--socket", socketPath,
			"--runtime-name", runtimeName,
			"--access-state", string(state),
		}, nil)
		if bytes.Contains(output, []byte(runtimeName)) {
			t.Fatalf("runtime access output exposed runtime identity: %s", output)
		}
		runtimeRecord, err := store.Runtime(context.Background(), runtimeName)
		if err != nil || runtimeRecord.AccessState != state {
			t.Fatalf("runtime access after command = %+v, %v; want %s", runtimeRecord, err, state)
		}
	}
}

func requireAdminRuntimeMetadataWorkflow(
	t *testing.T,
	store *controlplane.Store,
	socketPath string,
	runtimeName string,
) {
	t.Helper()
	before, err := store.Runtime(context.Background(), runtimeName)
	if err != nil {
		t.Fatal(err)
	}
	output := runAdminTestCommand(t, []string{
		"inspect-runtime-metadata", "--socket", socketPath,
		"--runtime-name", runtimeName,
	}, nil)
	var metadata controlplane.AdminRuntimeMetadata
	decoder := json.NewDecoder(bytes.NewReader(output))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&metadata); err != nil {
		t.Fatal(err)
	}
	requireAdminRuntimeMetadataOutput(t, output, metadata, before, runtimeName)
	after, err := store.Runtime(context.Background(), runtimeName)
	requireRuntimeUnchangedByMetadataInspection(t, before, after, err)
}

func requireAdminRuntimeMetadataOutput(
	t *testing.T,
	output []byte,
	metadata controlplane.AdminRuntimeMetadata,
	runtimeRecord controlplane.Runtime,
	runtimeName string,
) {
	t.Helper()
	if err := metadata.Validate(); err != nil {
		t.Fatal(err)
	}
	if metadata.Lifecycle != runtimeRecord.Lifecycle ||
		metadata.AccessState != runtimeRecord.AccessState ||
		metadata.HealthState != runtimeRecord.HealthState ||
		metadata.DesiredRelease != runtimeRecord.DesiredRelease ||
		metadata.ObservedRelease != runtimeRecord.ObservedRelease ||
		metadata.ReleaseStatus != runtimeRecord.ReleaseStatus() ||
		metadata.Resources != runtimeRecord.Resources ||
		!metadata.UpdatedAt.Equal(runtimeRecord.UpdatedAt) {
		t.Fatalf("runtime metadata command output = %+v, want projection of %+v", metadata, runtimeRecord)
	}
	for _, forbidden := range []string{
		runtimeName,
		runtimeRecord.UserID,
		runtimeRecord.UpstreamAuthority,
		runtimeRecord.CredentialSecretRef,
		`"runtime_name"`,
		`"user_id"`,
		`"credential_epoch"`,
		`"upstream_authority"`,
		`"credential_secret_ref"`,
	} {
		if bytes.Contains(output, []byte(forbidden)) {
			t.Fatalf("runtime metadata command exposed %q: %s", forbidden, output)
		}
	}
}

func requireRuntimeUnchangedByMetadataInspection(
	t *testing.T,
	before controlplane.Runtime,
	after controlplane.Runtime,
	err error,
) {
	t.Helper()
	if err != nil ||
		!after.UpdatedAt.Equal(before.UpdatedAt) ||
		after.Lifecycle != before.Lifecycle ||
		after.AccessState != before.AccessState ||
		after.HealthState != before.HealthState ||
		after.CredentialEpoch != before.CredentialEpoch ||
		after.DesiredRelease != before.DesiredRelease ||
		after.ObservedRelease != before.ObservedRelease ||
		after.DeletionScheduledAt != nil {
		t.Fatalf("runtime metadata command mutated runtime: before=%+v after=%+v err=%v", before, after, err)
	}
}

func requireAdminRuntimeDeletionWorkflow(
	t *testing.T,
	store *controlplane.Store,
	socketPath string,
	runtimeName string,
) {
	t.Helper()
	scheduledAt := time.Now().UTC().Add(time.Hour)
	scheduleOutput := runAdminTestCommand(t, []string{
		"schedule-runtime-deletion", "--socket", socketPath,
		"--idempotency-key", "admin-command-deletion",
		"--runtime-name", runtimeName,
		"--scheduled-at", scheduledAt.Format(time.RFC3339Nano),
	}, nil)
	if bytes.Contains(scheduleOutput, []byte(runtimeName)) ||
		bytes.Contains(scheduleOutput, []byte("admin-command-deletion")) {
		t.Fatalf("runtime deletion schedule output exposed private identity: %s", scheduleOutput)
	}
	scheduled, err := store.Runtime(context.Background(), runtimeName)
	if err != nil ||
		scheduled.AccessState != controlplane.RuntimeAccessDeleteScheduled ||
		scheduled.DeletionScheduledAt == nil ||
		!scheduled.DeletionScheduledAt.Equal(scheduledAt) {
		t.Fatalf("runtime after deletion command = %+v, %v", scheduled, err)
	}
	cancelOutput := runAdminTestCommand(t, []string{
		"cancel-runtime-deletion", "--socket", socketPath,
		"--runtime-name", runtimeName,
		"--access-state", string(controlplane.RuntimeAccessEnabled),
	}, nil)
	if bytes.Contains(cancelOutput, []byte(runtimeName)) {
		t.Fatalf("runtime deletion cancellation output exposed runtime identity: %s", cancelOutput)
	}
	cancelled, err := store.Runtime(context.Background(), runtimeName)
	if err != nil ||
		cancelled.AccessState != controlplane.RuntimeAccessEnabled ||
		cancelled.DeletionScheduledAt != nil {
		t.Fatalf("runtime after deletion cancellation command = %+v, %v", cancelled, err)
	}
}

func requireAdminRuntimeReportingCredentialWorkflow(
	t *testing.T,
	store *controlplane.Store,
	socketPath string,
	runtimeName string,
) {
	t.Helper()
	reportingCredential, err := controlplane.NewRuntimeReportingCredential()
	if err != nil {
		t.Fatal(err)
	}
	reportingPayload, err := json.Marshal(reportingCredential)
	if err != nil {
		t.Fatal(err)
	}
	reportingOutput := runAdminTestCommand(t, []string{
		"rotate-runtime-reporting-credential", "--socket", socketPath,
		"--runtime-name", runtimeName,
	}, reportingPayload)
	if bytes.Contains(reportingOutput, []byte(reportingCredential.Token)) ||
		bytes.Contains(reportingOutput, []byte(runtimeName)) {
		t.Fatalf("runtime reporting credential output exposed private data: %s", reportingOutput)
	}
	reportingRuntime, authorized, err := store.AuthorizeRuntimeReporter(
		context.Background(),
		reportingCredential,
	)
	if err != nil || !authorized || reportingRuntime != runtimeName {
		t.Fatalf(
			"runtime reporter authorization = %q, %t, %v",
			reportingRuntime,
			authorized,
			err,
		)
	}
}

func requireAdminWakeHealthWorkflow(
	t *testing.T,
	store *controlplane.Store,
	socketPath string,
	runtimeName string,
) {
	t.Helper()
	wakeOutput := runAdminTestCommand(t, []string{
		"request-runtime-wake", "--socket", socketPath,
		"--idempotency-key", "admin-command-wake",
		"--runtime-name", runtimeName,
	}, nil)
	if bytes.Contains(wakeOutput, []byte(runtimeName)) {
		t.Fatalf("wake command exposed runtime identity: %s", wakeOutput)
	}
	runAdminTestCommand(t, []string{
		"record-runtime-health", "--socket", socketPath,
		"--health-state", "degraded",
		"--observed-release", "bootstrap-test-release",
		"--runtime-name", runtimeName,
	}, nil)
	events, update, err := store.RuntimeProgressAfter(
		context.Background(),
		"admin-command-wake",
		"",
	)
	if err != nil || len(events) != 1 ||
		events[0].State != controlplane.RuntimeProgressWakeRequested {
		t.Fatalf("wake progress after degraded health = %+v, %v", events, err)
	}
	select {
	case <-update:
		t.Fatal("degraded administrative health completed wake progress")
	default:
	}
	runAdminTestCommand(t, []string{
		"record-runtime-health", "--socket", socketPath,
		"--health-state", "healthy",
		"--observed-release", "bootstrap-test-release",
		"--runtime-name", runtimeName,
	}, nil)
	select {
	case <-update:
	case <-time.After(time.Second):
		t.Fatal("healthy administrative health did not push wake completion")
	}
}

func TestAdminFinalizesStoredAccountingThroughProductionSocket(t *testing.T) {
	fixture := newBootstrapFixture(t)
	store, server := startBootstrapAdminServer(t, fixture.dataDirectory)
	defer stopBootstrapAdminServer(t, store, server)
	runBootstrapAttempt(t, fixture.args, fixture.runtimeName, 0)
	start := time.Now().UTC().Add(-time.Minute).Truncate(time.Second)
	end := start.Add(time.Minute)
	schedule := controlPlanePriceSchedule()
	configuration := runtimeaccounting.EvidenceConfiguration{
		Version:  runtimeaccounting.EvidenceConfigurationVersion,
		Provider: schedule.Provider, RateCard: schedule.Version,
		RuntimeName: fixture.runtimeName, WindowStart: start, WindowEnd: end, ObservedAt: end,
		Ceilings: runtimeaccounting.ResourceCeilings{
			CPUCoreMillionths: runtimeaccounting.EnforcedBound{Enforced: true, Value: 1_000_000},
			MemoryBytes:       runtimeaccounting.EnforcedBound{Enforced: true, Value: 512_000_000},
			HotStorageBytes:   runtimeaccounting.EnforcedBound{Enforced: true, Value: 10_000_000_000},
		},
		Budget: runtimeaccounting.EvidenceBudgetConfiguration{
			CoveredLimitUSDMicros: 100_000, SafetyReserveUSDMicros: 500,
			MaximumCutoffLag: time.Minute.String(),
			RequiredDimensions: []runtimeprovider.UsageDimension{
				runtimeprovider.UsageDimensionCPU,
				runtimeprovider.UsageDimensionMemory,
				runtimeprovider.UsageDimensionHotStorage,
			},
		},
	}
	expected, err := runtimeaccounting.FinalizeEvidence(
		configuration,
		"0000000000000000000000000000000000000000000000000000000000000000",
		schedule,
		runtimeaccounting.ClosedWindow{
			Window:         runtimeprovider.UsageWindow{Start: start, End: end},
			ProviderActive: time.Minute,
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	socketPath := controlplane.AdminSocketPath(fixture.dataDirectory)
	runAdminTestCommand(t, []string{
		"set-user-budget", "--socket", socketPath,
		"--user-id", "user-bootstrap",
		"--period-start", start.Format(time.RFC3339Nano),
		"--period-end", start.Add(time.Hour).Format(time.RFC3339Nano),
		"--limit-usd-micros", "100000",
		"--reserve-usd-micros", "500",
		"--cutoff-exposure-usd-micros", fmt.Sprint(expected.Cutoff.CutoffExposureUSDMicros),
		"--maximum-cutoff-lag", "1m",
	}, nil)
	transition, err := json.Marshal(runtimeaccounting.ActivityTransition{
		EventID: "production-provider-begin", At: start,
		Kind: runtimeaccounting.ActivityProvider, Action: runtimeaccounting.EventBegin,
	})
	if err != nil {
		t.Fatal(err)
	}
	runAdminTestCommand(t, []string{
		"record-accounting-event", "--socket", socketPath,
		"--runtime-name", fixture.runtimeName,
	}, transition)
	output := runAdminTestCommand(t, []string{
		"finalize-accounting-window", "--socket", socketPath,
		"--idempotency-key", "production-window",
		"--user-id", "user-bootstrap",
		"--runtime-name", fixture.runtimeName,
		"--window-end", end.Format(time.RFC3339Nano),
	}, nil)
	if bytes.Contains(output, []byte(fixture.runtimeName)) ||
		bytes.Contains(output, []byte("production-window")) {
		t.Fatalf("accounting finalization output exposed internal identity: %s", output)
	}
	snapshot, err := store.RuntimeAccountingSnapshot(context.Background(), fixture.runtimeName)
	if err != nil || !snapshot.Ledger.WindowStart.Equal(end) {
		t.Fatalf("accounting after finalization = %+v, %v", snapshot, err)
	}
}

func TestDecodeRuntimeAccountingEvidenceIsStrict(t *testing.T) {
	expected := runtimeaccounting.Evidence{Version: 1}
	encoded, err := json.Marshal(expected)
	if err != nil {
		t.Fatal(err)
	}
	var decoded runtimeaccounting.Evidence
	if err := decodeRuntimeAccountingEvidence(bytes.NewReader(encoded), &decoded); err != nil {
		t.Fatalf("decode evidence: %v", err)
	}
	if decoded.Version != expected.Version {
		t.Fatalf("decoded evidence = %+v", decoded)
	}
	for _, input := range [][]byte{
		[]byte(`{"version":1,"unknown":true}`),
		append(append([]byte(nil), encoded...), []byte("{}")...),
	} {
		if err := decodeRuntimeAccountingEvidence(bytes.NewReader(input), &decoded); err == nil {
			t.Fatalf("strict decoder accepted %q", input)
		}
	}
}

func TestDecodeRuntimeAccountingTransitionIsStrict(t *testing.T) {
	expected := runtimeaccounting.ActivityTransition{
		EventID:        "lease-begin",
		At:             time.Date(2026, 7, 24, 20, 0, 0, 0, time.UTC),
		Kind:           runtimeaccounting.ActivityWorkloadLease,
		Action:         runtimeaccounting.EventBegin,
		SubjectID:      "setta-agent",
		LeaseExpiresAt: time.Date(2026, 7, 24, 20, 2, 0, 0, time.UTC),
	}
	encoded, err := json.Marshal(expected)
	if err != nil {
		t.Fatal(err)
	}
	var decoded runtimeaccounting.ActivityTransition
	if err := decodeAdminStdin(bytes.NewReader(encoded), &decoded, "runtime accounting transition"); err != nil {
		t.Fatalf("decode transition: %v", err)
	}
	if decoded.EventID != expected.EventID || !decoded.LeaseExpiresAt.Equal(expected.LeaseExpiresAt) {
		t.Fatalf("decoded transition = %+v", decoded)
	}
	if err := decodeAdminStdin(
		bytes.NewReader([]byte(`{"event_id":"event","unknown":true}`)),
		&decoded,
		"runtime accounting transition",
	); err == nil {
		t.Fatal("strict decoder accepted an unknown transition field")
	}
}

func runAdminTestCommand(t *testing.T, args []string, stdin []byte) []byte {
	t.Helper()
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	if exitCode := runAdmin(args, bytes.NewReader(stdin), &stdout, &stderr); exitCode != 0 {
		t.Fatalf("admin command exit %d: %s", exitCode, stderr.String())
	}
	return stdout.Bytes()
}

type bootstrapFixture struct {
	args                 []string
	clientCredentialFile string
	dataDirectory        string
	runtimeName          string
	secretDirectory      string
}

func newBootstrapFixture(t *testing.T) bootstrapFixture {
	t.Helper()
	root := t.TempDir()
	runtimeCredentialFile := filepath.Join(root, "input", "runtime-credential")
	if err := os.MkdirAll(filepath.Dir(runtimeCredentialFile), 0o700); err != nil {
		t.Fatalf("create runtime credential directory: %v", err)
	}
	if err := os.WriteFile(runtimeCredentialFile, []byte("runtime-bootstrap-secret"), 0o600); err != nil {
		t.Fatalf("write runtime credential: %v", err)
	}
	identity, err := runtimeprovider.NewManagedIdentity("control-plane-bootstrap-test")
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	fixture := bootstrapFixture{
		clientCredentialFile: filepath.Join(root, "output", "client-credential.json"),
		dataDirectory:        filepath.Join(root, "data"),
		runtimeName:          identity.Name,
		secretDirectory:      filepath.Join(root, "secrets"),
	}
	fixture.args = []string{
		"--client-credential-file", fixture.clientCredentialFile,
		"--data-dir", fixture.dataDirectory,
		"--device-name", "Bootstrap phone",
		"--hosted-access-intent-id", "hosted-bootstrap-intent",
		"--idempotency-key", "bootstrap-operation",
		"--project-id", "project-bootstrap",
		"--runtime-credential-file", runtimeCredentialFile,
		"--runtime-name", fixture.runtimeName,
		"--runtime-release", "bootstrap-test-release",
		"--runtime-secret-ref", "runtime_bootstrap",
		"--cpu-core-millionths", "1000000",
		"--memory-bytes", "512000000",
		"--storage-bytes", "10000000000",
		"--secret-dir", fixture.secretDirectory,
		"--user-id", "user-bootstrap",
		"--workstream-id", "workstream-bootstrap",
	}
	return fixture
}

func runBootstrapAttempt(t *testing.T, args []string, runtimeName string, attempt int) {
	t.Helper()
	var stdout bytes.Buffer
	if exitCode := runBootstrap(args, &bytes.Buffer{}, &stdout, &bytes.Buffer{}, mapEnvironment(nil)); exitCode != 0 {
		t.Fatalf("bootstrap attempt %d exit code = %d", attempt+1, exitCode)
	}
	var event controlplane.BootstrapEvent
	if err := json.Unmarshal(stdout.Bytes(), &event); err != nil {
		t.Fatalf("decode bootstrap event: %v", err)
	}
	if event.Event != controlplane.BootstrapReadyEvent || event.RuntimeName != runtimeName {
		t.Fatalf("bootstrap event = %+v", event)
	}
}

func startBootstrapAdminServer(
	t *testing.T,
	dataDirectory string,
) (*controlplane.Store, *controlplane.AdminServer) {
	t.Helper()
	store, err := controlplane.OpenStore(controlplane.StoreConfig{Directory: dataDirectory})
	if err != nil {
		t.Fatal(err)
	}
	observer, err := controlplane.NewJSONLinesObserver(io.Discard)
	if err != nil {
		_ = store.Close()
		t.Fatal(err)
	}
	server, err := controlplane.StartAdminServer(controlplane.AdminServerConfig{
		Observer:      observer,
		PriceSchedule: controlPlanePriceSchedule(),
		SocketPath:    controlplane.AdminSocketPath(dataDirectory),
		Store:         store,
	})
	if err != nil {
		_ = store.Close()
		t.Fatal(err)
	}
	return store, server
}

func stopBootstrapAdminServer(
	t *testing.T,
	store *controlplane.Store,
	server *controlplane.AdminServer,
) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		t.Error(err)
	}
	if err := server.Wait(); err != nil {
		t.Error(err)
	}
	if err := store.Close(); err != nil {
		t.Error(err)
	}
}

func verifyBootstrapState(t *testing.T, fixture bootstrapFixture) {
	t.Helper()
	credentialBytes, err := os.ReadFile(fixture.clientCredentialFile)
	if err != nil {
		t.Fatalf("read client credential: %v", err)
	}
	var credential controlplane.DeviceCredential
	if err := json.Unmarshal(credentialBytes, &credential); err != nil {
		t.Fatalf("decode client credential: %v", err)
	}
	store, err := controlplane.OpenStore(controlplane.StoreConfig{Directory: fixture.dataDirectory})
	if err != nil {
		t.Fatalf("OpenStore: %v", err)
	}
	defer store.Close()
	authorization, err := store.AuthorizeClient(context.Background(), credential.Token)
	if err != nil {
		t.Fatalf("AuthorizeClient: %v", err)
	}
	if authorization.Outcome != runtimeaccess.AuthorizationAllowed || authorization.RuntimeName != fixture.runtimeName {
		t.Fatalf("bootstrap authorization = %+v", authorization)
	}
	progress, err := store.HostedAccessProgress(context.Background(), "hosted-bootstrap-intent")
	if err != nil ||
		progress.State != controlplane.HostedAccessProgressReadyOnPhone ||
		progress.Cursor != "3" ||
		progress.AccessGrant == nil ||
		progress.AccessGrant.DeviceID != credential.DeviceID ||
		progress.AccessGrant.ProjectID != "project-bootstrap" ||
		progress.AccessGrant.WorkstreamID != "workstream-bootstrap" {
		t.Fatalf("hosted access progress = %+v, %v", progress, err)
	}
	secretStore, err := controlplane.OpenFileSecretStore(fixture.secretDirectory)
	if err != nil {
		t.Fatalf("OpenFileSecretStore: %v", err)
	}
	secret, err := secretStore.ReadSecret(context.Background(), "runtime_bootstrap")
	if err != nil || string(secret) != "runtime-bootstrap-secret" {
		t.Fatalf("runtime secret = %q, %v", secret, err)
	}
	info, err := os.Stat(fixture.clientCredentialFile)
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("client credential permissions = %v, %v", info, err)
	}
}

func TestRunRequiresExplicitSubcommand(t *testing.T) {
	var stderr bytes.Buffer
	if exitCode := run(nil, &bytes.Buffer{}, &bytes.Buffer{}, &stderr, mapEnvironment(nil), func(string) error { return nil }); exitCode != 2 {
		t.Fatalf("run without subcommand exit code = %d", exitCode)
	}
}

func mapEnvironment(values map[string]string) func(string) string {
	return func(name string) string { return values[name] }
}
