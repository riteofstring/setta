package controlplane

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/runtimeaccess"
	"setta/internal/runtimeaccounting"
	"setta/internal/runtimecost"
	spritescost "setta/internal/runtimecost/sprites"
	"setta/internal/runtimeprovider"
)

func TestAdminBudgetUsageCutsOffLiveAuthorizationAndAuditsWithoutContent(t *testing.T) {
	ctx := context.Background()
	store, _, runtimeName, grant := seededControlPlane(t, ctx)
	defer store.Close()
	socketPath := filepath.Join(filepath.Dir(store.Path()), "admin.sock")
	var audit bytes.Buffer
	observer := newAdminTestObserver(t, &audit)
	server, err := StartAdminServer(AdminServerConfig{
		Observer: observer, PriceSchedule: adminTestPriceSchedule(), SocketPath: socketPath, Store: store,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer shutdownAdminTestServer(t, server)
	client := adminTestClient(socketPath)
	authorization, err := store.AuthorizeClient(ctx, grant.Token)
	if err != nil || authorization.Outcome != runtimeaccess.AuthorizationAllowed {
		t.Fatalf("authorization before budget = %+v, %v", authorization, err)
	}
	start := time.Date(2026, 7, 24, 21, 0, 0, 0, time.UTC)
	evidence := testAdminUsageEvidence(t, runtimeName, start)
	adminTestRequest(t, client, "/v1/users/budget", AdminSetUserBudgetRequest{
		UserID: "user-server", PeriodStart: start, PeriodEnd: start.Add(time.Hour),
		CoveredLimitUSDMicros:   testEvidenceCoveredLimit,
		SafetyReserveUSDMicros:  testEvidenceSafetyReserve,
		CutoffExposureUSDMicros: int64(evidence.Cutoff.CutoffExposureUSDMicros),
		MaximumCutoffLag:        time.Minute,
	}, "user_budget_set")
	adminTestRequest(t, client, "/v1/usage/record", AdminRecordUsageRequest{
		IdempotencyKey: "private-usage-key",
		UserID:         "user-server",
		Evidence:       evidence,
	}, "usage_recorded")
	requireClosed(t, authorization.Invalidated, "budget cutoff")
	requireAuthorizationOutcome(t, store, grant.Token, runtimeaccess.AuthorizationSuspended)
	requireContentFreeControlPlaneAudit(t, audit.Bytes(), []ControlPlaneAuditMeasurement{
		{Action: ControlPlaneAuditBudgetSet, State: "enforced"},
		{Action: ControlPlaneAuditUsageRecorded, State: "cutoff"},
	}, []string{
		"user-server",
		runtimeName,
		grant.Device.ID,
		grant.Token,
		"private-usage-key",
	})
}

func TestAdminRecordsRuntimeAccountingEventThroughPrivateBoundary(t *testing.T) {
	ctx := context.Background()
	store, _, runtimeName, _ := seededControlPlane(t, ctx)
	defer store.Close()
	start := time.Date(2026, 7, 24, 20, 0, 0, 0, time.UTC)
	evidence := testAdminUsageEvidence(t, runtimeName, start)
	if _, err := store.SetUserBudgetPolicy(ctx, SetUserBudgetPolicyRequest{
		UserID: "user-server", PeriodStart: start, PeriodEnd: start.Add(time.Hour),
		CoveredLimitUSDMicros: 100_000, SafetyReserveUSDMicros: testEvidenceSafetyReserve,
		CutoffExposureUSDMicros: int64(evidence.Cutoff.CutoffExposureUSDMicros),
		MaximumCutoffLag:        time.Minute,
	}); err != nil {
		t.Fatal(err)
	}
	socketPath := filepath.Join(filepath.Dir(store.Path()), "admin.sock")
	server, err := StartAdminServer(AdminServerConfig{
		Observer: newAdminTestObserver(t, io.Discard), PriceSchedule: adminTestPriceSchedule(),
		SocketPath: socketPath, Store: store,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer shutdownAdminTestServer(t, server)
	event := accountingEvent(
		1, "private-provider-begin", start,
		runtimeaccounting.ActivityProvider, runtimeaccounting.EventBegin, "",
	)
	client := adminTestClient(socketPath)
	adminTestRequest(t, client, "/v1/runtime-accounting/events",
		AdminRecordRuntimeAccountingEventRequest{
			RuntimeName: runtimeName, Transition: accountingTransition(event),
		},
		"runtime_accounting_event_recorded",
	)
	adminTestRequest(t, client, "/v1/runtime-accounting/windows/finalize",
		AdminFinalizeRuntimeAccountingWindowRequest{
			IdempotencyKey: "private-window", UserID: "user-server",
			RuntimeName: runtimeName, WindowEnd: start.Add(time.Minute),
		},
		"runtime_accounting_window_finalized",
	)
	snapshot, err := store.RuntimeAccountingSnapshot(ctx, runtimeName)
	if err != nil || snapshot.Ledger.LastSequence != 1 ||
		!snapshot.Ledger.WindowStart.Equal(start.Add(time.Minute)) {
		t.Fatalf("runtime accounting snapshot = %+v, %v", snapshot, err)
	}
}

func TestAdminServerMutatesLiveAuthorizationAndPushInvalidation(t *testing.T) {
	ctx := context.Background()
	store, _, runtimeName, first := seededControlPlane(t, ctx)
	defer store.Close()
	socketPath := filepath.Join(filepath.Dir(store.Path()), "admin.sock")
	var audit bytes.Buffer
	observer := newAdminTestObserver(t, &audit)
	server, err := StartAdminServer(AdminServerConfig{
		Observer: observer, PriceSchedule: adminTestPriceSchedule(), SocketPath: socketPath, Store: store,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer shutdownAdminTestServer(t, server)
	client := adminTestClient(socketPath)

	firstAuthorization, err := store.AuthorizeClient(ctx, first.Token)
	if err != nil || firstAuthorization.Outcome != runtimeaccess.AuthorizationAllowed {
		t.Fatalf("first authorization = %+v, %v", firstAuthorization, err)
	}
	secondCredential, err := NewDeviceCredential()
	if err != nil {
		t.Fatal(err)
	}
	adminTestRequest(t, client, "/v1/devices/ensure", AdminEnsureDeviceRequest{
		Credential: secondCredential, DisplayName: "Hosted lifecycle replacement", GrantTTL: time.Hour,
		RuntimeName: runtimeName, UserID: "user-server",
	}, "device_ensured")
	adminTestRequest(t, client, "/v1/devices/revoke", AdminRevokeDeviceRequest{DeviceID: first.Device.ID}, "device_revoked")
	requireClosed(t, firstAuthorization.Invalidated, "administrative device revocation")
	requireAuthorizationOutcome(t, store, first.Token, runtimeaccess.AuthorizationRevoked)

	secondAuthorization, err := store.AuthorizeClient(ctx, secondCredential.Token)
	if err != nil || secondAuthorization.Outcome != runtimeaccess.AuthorizationAllowed {
		t.Fatalf("second authorization = %+v, %v", secondAuthorization, err)
	}
	adminTestRequest(t, client, "/v1/users/status", AdminSetUserStatusRequest{
		Status: UserStatusSuspended, UserID: "user-server",
	}, "user_status_set")
	requireClosed(t, secondAuthorization.Invalidated, "administrative user suspension")
	requireAuthorizationOutcome(t, store, secondCredential.Token, runtimeaccess.AuthorizationSuspended)
	adminTestRequest(t, client, "/v1/users/status", AdminSetUserStatusRequest{
		Status: UserStatusActive, UserID: "user-server",
	}, "user_status_set")
	requireAuthorizationOutcome(t, store, secondCredential.Token, runtimeaccess.AuthorizationAllowed)
	requireContentFreeControlPlaneAudit(t, audit.Bytes(), []ControlPlaneAuditMeasurement{
		{Action: ControlPlaneAuditDeviceEnsured, State: "active"},
		{Action: ControlPlaneAuditDeviceRevoked, State: "revoked"},
		{Action: ControlPlaneAuditUserStatusSet, State: string(UserStatusSuspended)},
		{Action: ControlPlaneAuditUserStatusSet, State: string(UserStatusActive)},
	}, []string{
		"user-server",
		runtimeName,
		first.Device.ID,
		secondCredential.DeviceID,
		secondCredential.Token,
		"Hosted lifecycle replacement",
	})
}

func TestAdminServerAuditsRuntimeWakeAndTrustedHealthWithoutContent(t *testing.T) {
	ctx := context.Background()
	store, _, runtimeName, _ := seededControlPlane(t, ctx)
	defer store.Close()
	socketPath := filepath.Join(filepath.Dir(store.Path()), "admin.sock")
	var audit bytes.Buffer
	server, err := StartAdminServer(AdminServerConfig{
		Observer:      newAdminTestObserver(t, &audit),
		PriceSchedule: adminTestPriceSchedule(),
		SocketPath:    socketPath,
		Store:         store,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer shutdownAdminTestServer(t, server)
	client := adminTestClient(socketPath)
	adminTestRequest(t, client, "/v1/runtimes/wake", AdminRequestRuntimeWakeRequest{
		IdempotencyKey: "admin-wake-operation",
		RuntimeName:    runtimeName,
	}, "runtime_wake_requested")
	adminTestRequest(t, client, "/v1/runtimes/health", AdminRecordRuntimeHealthRequest{
		HealthState:     RuntimeHealthDegraded,
		ObservedRelease: "test-release",
		RuntimeName:     runtimeName,
	}, "runtime_health_recorded")
	events, update, err := store.RuntimeProgressAfter(ctx, "admin-wake-operation", "")
	if err != nil {
		t.Fatal(err)
	}
	requireRuntimeProgressStates(t, events, RuntimeProgressWakeRequested)
	select {
	case <-update:
		t.Fatal("degraded health completed the wake")
	default:
	}
	adminTestRequest(t, client, "/v1/runtimes/health", AdminRecordRuntimeHealthRequest{
		HealthState:     RuntimeHealthHealthy,
		ObservedRelease: "test-release",
		RuntimeName:     runtimeName,
	}, "runtime_health_recorded")
	requireClosed(t, update, "administrative wake completion")
	events, _, err = store.RuntimeProgressAfter(ctx, "admin-wake-operation", "1")
	if err != nil {
		t.Fatal(err)
	}
	requireRuntimeProgressStates(t, events, RuntimeProgressHealthy)
	requireContentFreeWakeAdministrationMeasurements(t, audit.Bytes(), []ControlPlaneAuditMeasurement{
		{Action: ControlPlaneAuditRuntimeWakeRequested, State: "requested"},
		{Action: ControlPlaneAuditRuntimeHealthRecorded, State: string(RuntimeHealthDegraded)},
		{Action: ControlPlaneAuditRuntimeWakeObserved, State: string(RuntimeHealthDegraded)},
		{Action: ControlPlaneAuditRuntimeHealthRecorded, State: string(RuntimeHealthHealthy)},
		{Action: ControlPlaneAuditRuntimeWakeObserved, State: "completed"},
	}, []string{
		"admin-wake-operation",
		runtimeName,
		"user-server",
		"test-release",
	})
}

func TestTypedHostedAccessClientStreamsReadyOnPhoneThroughPrivateBoundary(t *testing.T) {
	directory := t.TempDir()
	store := openTestStore(t, directory, time.Now, RateLimit{})
	defer store.Close()
	socketPath := filepath.Join(directory, "admin.sock")
	var measurements bytes.Buffer
	observer := newAdminTestObserver(t, &measurements)
	server, err := StartAdminServer(AdminServerConfig{
		Observer: observer, PriceSchedule: adminTestPriceSchedule(), SocketPath: socketPath, Store: store,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer shutdownAdminTestServer(t, server)
	client := adminTestClient(socketPath)
	credential, err := NewDeviceCredential()
	if err != nil {
		t.Fatal(err)
	}
	intent := testHostedAccessIntent()
	intent.Client.DeviceID = credential.DeviceID
	progress := ensureHostedAccessFromTypedClient(t, client, intent)
	requirePreparingHostedAccess(t, progress)

	stream := openHostedAccessTestStream(t, client, intent.IdempotencyKey, "")
	defer stream.Close()
	first := readHostedAccessTestEvent(t, stream)
	requirePreparingHostedAccess(t, first)

	runtimeName := testRuntimeName(t, "typed-client-ready")
	completeHostedAccessFromTypedClient(t, client, AdminCompleteHostedAccessRequest{
		Credential:           credential,
		CredentialEpoch:      1,
		DeviceDisplayName:    "Typed client phone",
		GrantTTL:             time.Hour,
		HostedAccessIntentID: intent.IdempotencyKey,
		IdempotencyKey:       "typed-client-runtime",
		ProjectID:            intent.ProjectID,
		RuntimeName:          runtimeName,
		RuntimeRelease:       "typed-client-release",
		RuntimeSecretRef:     "typed_client_secret",
		RuntimeTarget:        "127.0.0.1:7345",
		Resources:            testRuntimeResources(),
		UserID:               intent.UserID,
		WorkstreamID:         intent.WorkstreamID,
	})
	syncing := readHostedAccessTestEvent(t, stream)
	if syncing.Cursor != "2" || syncing.State != HostedAccessProgressSyncingProject {
		t.Fatalf("syncing event = %+v", syncing)
	}
	ready := readHostedAccessTestEvent(t, stream)
	requireReadyHostedAccess(t, ready, credential.DeviceID)
	if _, err := readHostedAccessEvent(stream); !errors.Is(err, io.EOF) {
		t.Fatalf("completed progress stream read error = %v, want EOF", err)
	}

	replayed := openHostedAccessTestStream(t, client, intent.IdempotencyKey, "2")
	defer replayed.Close()
	requireReadyHostedAccess(t, readHostedAccessTestEvent(t, replayed), credential.DeviceID)
	requireContentFreeHostedAccessMeasurement(t, measurements.Bytes())
}

func TestTypedHostedAccessClientReceivesDurableAssignmentFailure(t *testing.T) {
	ctx := context.Background()
	directory := t.TempDir()
	store := openTestStore(t, directory, time.Now, RateLimit{})
	defer store.Close()
	var measurements bytes.Buffer
	server, err := StartAdminServer(AdminServerConfig{
		Observer:      newAdminTestObserver(t, &measurements),
		PriceSchedule: adminTestPriceSchedule(),
		SocketPath:    filepath.Join(directory, "admin.sock"),
		Store:         store,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer shutdownAdminTestServer(t, server)
	client := adminTestClient(server.listener.Addr().String())
	credential, err := NewDeviceCredential()
	if err != nil {
		t.Fatal(err)
	}
	intent := testHostedAccessIntent()
	intent.Client.DeviceID = credential.DeviceID
	requirePreparingHostedAccess(t, ensureHostedAccessFromTypedClient(t, client, intent))
	assignTestRuntime(
		t,
		store,
		"typed-client-conflict",
		intent.UserID,
		testRuntimeName(t, "existing-runtime"),
		"existing_runtime_secret",
	)
	stream := openHostedAccessTestStream(t, client, intent.IdempotencyKey, "")
	defer stream.Close()
	requirePreparingHostedAccess(t, readHostedAccessTestEvent(t, stream))
	response := postHostedAccessCompletion(t, client, AdminCompleteHostedAccessRequest{
		Credential:           credential,
		CredentialEpoch:      1,
		DeviceDisplayName:    "Rejected phone",
		GrantTTL:             time.Hour,
		HostedAccessIntentID: intent.IdempotencyKey,
		IdempotencyKey:       "typed-client-conflict",
		ProjectID:            intent.ProjectID,
		RuntimeName:          testRuntimeName(t, "conflicting-runtime"),
		RuntimeRelease:       "typed-client-release",
		RuntimeSecretRef:     "conflicting_runtime_secret",
		RuntimeTarget:        "127.0.0.1:7345",
		Resources:            testRuntimeResources(),
		UserID:               intent.UserID,
		WorkstreamID:         intent.WorkstreamID,
	})
	defer response.Body.Close()
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("hosted access failure status = %d", response.StatusCode)
	}
	syncing := readHostedAccessTestEvent(t, stream)
	if syncing.State != HostedAccessProgressSyncingProject {
		t.Fatalf("hosted access syncing event = %+v", syncing)
	}
	failure := readHostedAccessTestEvent(t, stream)
	requireHostedAccessFailure(t, failure, HostedAccessReasonRuntimeAssignmentRejected)
	if _, err := readHostedAccessEvent(stream); !errors.Is(err, io.EOF) {
		t.Fatalf("failed progress stream read error = %v, want EOF", err)
	}
	persisted, err := store.HostedAccessProgress(ctx, intent.IdempotencyKey)
	if err != nil {
		t.Fatal(err)
	}
	requireHostedAccessFailure(t, persisted, HostedAccessReasonRuntimeAssignmentRejected)
	requireContentFreeHostedAccessFailureMeasurement(t, measurements.Bytes())
}

func TestTypedHostedAccessClientReceivesTerminalUserSuspension(t *testing.T) {
	directory := t.TempDir()
	store := openTestStore(t, directory, time.Now, RateLimit{})
	defer store.Close()
	socketPath := filepath.Join(directory, "admin.sock")
	server, err := StartAdminServer(AdminServerConfig{
		Observer: newAdminTestObserver(t, io.Discard), PriceSchedule: adminTestPriceSchedule(), SocketPath: socketPath, Store: store,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer shutdownAdminTestServer(t, server)
	client := adminTestClient(socketPath)
	intent := testHostedAccessIntent()
	requirePreparingHostedAccess(t, ensureHostedAccessFromTypedClient(t, client, intent))
	stream := openHostedAccessTestStream(t, client, intent.IdempotencyKey, "")
	defer stream.Close()
	requirePreparingHostedAccess(t, readHostedAccessTestEvent(t, stream))
	adminTestRequest(t, client, "/v1/users/status", AdminSetUserStatusRequest{
		Status: UserStatusSuspended,
		UserID: intent.UserID,
	}, "user_status_set")
	requireSuspendedHostedAccess(t, readHostedAccessTestEvent(t, stream), "2")
	if _, err := readHostedAccessEvent(stream); !errors.Is(err, io.EOF) {
		t.Fatalf("suspended progress stream read error = %v, want EOF", err)
	}
}

func adminTestPriceSchedule() runtimecost.PriceSchedule {
	return spritescost.PublishedRates20260714()
}

const (
	testEvidenceCoveredLimit  = int64(3_500)
	testEvidenceSafetyReserve = int64(500)
)

func testAdminUsageEvidence(
	t *testing.T,
	runtimeName string,
	start time.Time,
) runtimeaccounting.Evidence {
	t.Helper()
	end := start.Add(time.Minute)
	configuration := runtimeaccounting.EvidenceConfiguration{
		Version:  runtimeaccounting.EvidenceConfigurationVersion,
		Provider: spritescost.Provider, RateCard: adminTestPriceSchedule().Version,
		RuntimeName: runtimeName, WindowStart: start, WindowEnd: end, ObservedAt: end,
		Ceilings: accountingCeilings(testRuntimeResources()),
		Budget: runtimeaccounting.EvidenceBudgetConfiguration{
			CoveredLimitUSDMicros:  uint64(testEvidenceCoveredLimit),
			SafetyReserveUSDMicros: uint64(testEvidenceSafetyReserve),
			MaximumCutoffLag:       time.Minute.String(),
			RequiredDimensions:     append([]runtimeprovider.UsageDimension(nil), hardBudgetDimensions...),
		},
	}
	evidence, err := runtimeaccounting.FinalizeEvidence(
		configuration,
		strings.Repeat("1", 64),
		adminTestPriceSchedule(),
		runtimeaccounting.ClosedWindow{
			Window:         runtimeprovider.UsageWindow{Start: start, End: end},
			ProviderActive: time.Minute,
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	return evidence
}

func postHostedAccessCompletion(
	t *testing.T,
	client *http.Client,
	payload AdminCompleteHostedAccessRequest,
) *http.Response {
	t.Helper()
	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	response, err := client.Post(
		"http://unix/v1/hosted-access/complete",
		"application/json",
		bytes.NewReader(data),
	)
	if err != nil {
		t.Fatal(err)
	}
	return response
}

func requireHostedAccessFailure(
	t *testing.T,
	progress HostedAccessProgress,
	reason HostedAccessReasonCode,
) {
	t.Helper()
	if progress.State != HostedAccessProgressNeedsAttention ||
		progress.ReasonCode == nil ||
		*progress.ReasonCode != reason ||
		progress.Retryable ||
		progress.AccessGrant != nil {
		t.Fatalf("hosted access failure = %+v", progress)
	}
}

func newAdminTestObserver(t *testing.T, writer io.Writer) *JSONLinesObserver {
	t.Helper()
	observer, err := NewJSONLinesObserver(writer)
	if err != nil {
		t.Fatal(err)
	}
	return observer
}

func completeHostedAccessFromTypedClient(
	t *testing.T,
	client *http.Client,
	payload AdminCompleteHostedAccessRequest,
) {
	t.Helper()
	response := postHostedAccessCompletion(t, client, payload)
	defer response.Body.Close()
	var event BootstrapEvent
	if err := json.NewDecoder(response.Body).Decode(&event); err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusOK ||
		event.Event != BootstrapReadyEvent ||
		event.DeviceID != payload.Credential.DeviceID ||
		event.RuntimeName != payload.RuntimeName {
		t.Fatalf("hosted access complete response = %d %+v", response.StatusCode, event)
	}
}

func requireContentFreeHostedAccessMeasurement(t *testing.T, encoded []byte) {
	t.Helper()
	var measurement map[string]any
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	if err := decoder.Decode(&measurement); err != nil {
		t.Fatal(err)
	}
	wantKeys := map[string]bool{
		"completed_at":       true,
		"ensure_to_ready_ms": true,
		"ensure_to_sync_ms":  true,
		"event":              true,
		"sync_to_ready_ms":   true,
	}
	if len(measurement) != len(wantKeys) {
		t.Fatalf("hosted access measurement fields = %v", measurement)
	}
	for key := range measurement {
		if !wantKeys[key] {
			t.Fatalf("hosted access measurement contains content-bearing field %q", key)
		}
	}
	if measurement["event"] != "hosted_access_ready" {
		t.Fatalf("hosted access measurement = %v", measurement)
	}
}

func requireContentFreeHostedAccessFailureMeasurement(t *testing.T, encoded []byte) {
	t.Helper()
	var measurement map[string]any
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	if err := decoder.Decode(&measurement); err != nil {
		t.Fatal(err)
	}
	wantKeys := map[string]bool{
		"completed_at": true,
		"event":        true,
		"reason_code":  true,
		"retryable":    true,
	}
	if len(measurement) != len(wantKeys) {
		t.Fatalf("hosted access failure measurement fields = %v", measurement)
	}
	for key := range measurement {
		if !wantKeys[key] {
			t.Fatalf("hosted access failure measurement contains content-bearing field %q", key)
		}
	}
	if measurement["event"] != "hosted_access_failed" ||
		measurement["reason_code"] != string(HostedAccessReasonRuntimeAssignmentRejected) ||
		measurement["retryable"] != false {
		t.Fatalf("hosted access failure measurement = %v", measurement)
	}
}

func requireContentFreeControlPlaneAudit(
	t *testing.T,
	encoded []byte,
	want []ControlPlaneAuditMeasurement,
	forbidden []string,
) {
	t.Helper()
	text := string(encoded)
	for _, value := range forbidden {
		if strings.Contains(text, value) {
			t.Fatalf("control-plane audit exposed %q: %s", value, text)
		}
	}
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	for index, expected := range want {
		var measurement map[string]any
		if err := decoder.Decode(&measurement); err != nil {
			t.Fatalf("decode control-plane audit %d: %v", index, err)
		}
		if len(measurement) != 4 ||
			measurement["action"] != string(expected.Action) ||
			measurement["event"] != "control_plane_audit" ||
			measurement["state"] != expected.State ||
			measurement["occurred_at"] == "" {
			t.Fatalf("control-plane audit %d = %v, want %+v", index, measurement, expected)
		}
	}
	var extra map[string]any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		t.Fatalf("control-plane audit trailing data = %v, %v", extra, err)
	}
}

func requireContentFreeWakeAdministrationMeasurements(
	t *testing.T,
	encoded []byte,
	wantAudits []ControlPlaneAuditMeasurement,
	forbidden []string,
) {
	t.Helper()
	text := string(encoded)
	for _, value := range forbidden {
		if strings.Contains(text, value) {
			t.Fatalf("runtime wake measurement exposed %q: %s", value, text)
		}
	}
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	for index, expected := range wantAudits {
		var measurement map[string]any
		if err := decoder.Decode(&measurement); err != nil {
			t.Fatalf("decode control-plane audit %d: %v", index, err)
		}
		requireControlPlaneAuditMeasurement(t, index, measurement, expected)
	}
	var timing map[string]any
	if err := decoder.Decode(&timing); err != nil {
		t.Fatalf("decode runtime wake timing: %v", err)
	}
	requireRuntimeWakeTimingMeasurement(t, timing)
	var extra map[string]any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		t.Fatalf("runtime wake administration trailing data = %v, %v", extra, err)
	}
}

func requireControlPlaneAuditMeasurement(
	t *testing.T,
	index int,
	measurement map[string]any,
	expected ControlPlaneAuditMeasurement,
) {
	t.Helper()
	if len(measurement) != 4 ||
		measurement["action"] != string(expected.Action) ||
		measurement["event"] != "control_plane_audit" ||
		measurement["state"] != expected.State ||
		measurement["occurred_at"] == "" {
		t.Fatalf("control-plane audit %d = %v, want %+v", index, measurement, expected)
	}
}

func requireRuntimeWakeTimingMeasurement(t *testing.T, measurement map[string]any) {
	t.Helper()
	if len(measurement) != 4 ||
		measurement["event"] != "runtime_wake_ready" ||
		measurement["started_at"] == "" ||
		measurement["completed_at"] == "" {
		t.Fatalf("runtime wake timing = %v", measurement)
	}
	duration, ok := measurement["duration_ms"].(float64)
	if !ok || duration < 0 {
		t.Fatalf("runtime wake duration = %v", measurement["duration_ms"])
	}
}

func ensureHostedAccessFromTypedClient(
	t *testing.T,
	client *http.Client,
	intent EnsureHostedAccessIntent,
) HostedAccessProgress {
	t.Helper()
	data, err := json.Marshal(intent)
	if err != nil {
		t.Fatal(err)
	}
	response, err := client.Post("http://unix/v1/hosted-access/ensure", "application/json", bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var progress HostedAccessProgress
	decoder := json.NewDecoder(response.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&progress); err != nil || response.StatusCode != http.StatusOK {
		t.Fatalf("hosted access ensure response = %d %+v, %v", response.StatusCode, progress, err)
	}
	return progress
}

func openHostedAccessTestStream(
	t *testing.T,
	client *http.Client,
	intentID string,
	cursor string,
) *hostedAccessTestStream {
	t.Helper()
	request, err := http.NewRequest(http.MethodGet, "http://unix/v1/hosted-access/events?intentId="+intentID, nil)
	if err != nil {
		t.Fatal(err)
	}
	if cursor != "" {
		request.Header.Set("Last-Event-ID", cursor)
	}
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusOK || response.Header.Get("Content-Type") != "text/event-stream" {
		_ = response.Body.Close()
		t.Fatalf("hosted access stream response = %d %q", response.StatusCode, response.Header.Get("Content-Type"))
	}
	return &hostedAccessTestStream{body: response.Body, reader: bufio.NewReader(response.Body)}
}

type hostedAccessTestStream struct {
	body   io.ReadCloser
	reader *bufio.Reader
}

func (stream *hostedAccessTestStream) Close() error {
	return stream.body.Close()
}

func readHostedAccessTestEvent(t *testing.T, stream *hostedAccessTestStream) HostedAccessProgress {
	t.Helper()
	progress, err := readHostedAccessEvent(stream)
	if err != nil {
		t.Fatal(err)
	}
	return progress
}

func readHostedAccessEvent(stream *hostedAccessTestStream) (HostedAccessProgress, error) {
	var payload []byte
	for {
		line, err := stream.reader.ReadBytes('\n')
		if err != nil {
			return HostedAccessProgress{}, err
		}
		if bytes.HasPrefix(line, []byte("data: ")) {
			payload = bytes.TrimSpace(bytes.TrimPrefix(line, []byte("data: ")))
		}
		if bytes.Equal(line, []byte("\n")) && payload != nil {
			var progress HostedAccessProgress
			if err := json.Unmarshal(payload, &progress); err != nil {
				return HostedAccessProgress{}, fmt.Errorf("decode hosted access event: %w", err)
			}
			return progress, nil
		}
	}
}

func adminTestClient(socketPath string) *http.Client {
	transport := &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, "unix", socketPath)
	}}
	return &http.Client{Transport: transport, Timeout: time.Second}
}

func adminTestRequest(t *testing.T, client *http.Client, path string, payload any, wantEvent string) {
	t.Helper()
	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	response, err := client.Post("http://unix"+path, "application/json", bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var event AdminEvent
	if err := json.NewDecoder(response.Body).Decode(&event); err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusOK || event.Event != wantEvent {
		t.Fatalf("admin response = %d %+v", response.StatusCode, event)
	}
}

func shutdownAdminTestServer(t *testing.T, server *AdminServer) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}
	if err := server.Wait(); err != nil {
		t.Fatal(err)
	}
}
