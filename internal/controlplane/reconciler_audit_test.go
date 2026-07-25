package controlplane

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"strings"
	"testing"
	"time"
)

func TestReconcilerEmitsContentFreeRuntimeAuditOutcomes(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 24, 22, 30, 0, 0, time.UTC)
	store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{})
	defer store.Close()
	request := testEnsureRuntimeRequest(t, "audit-ensure", "user-audit", "audit-runtime")
	if _, err := store.UpsertUser(ctx, request.UserID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.EnsureRuntimeIntent(ctx, request); err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	observer, err := NewJSONLinesObserver(&output)
	if err != nil {
		t.Fatal(err)
	}
	provider := newTestReconcilerProvider(request.RuntimeName)
	provider.ambiguousCreate = true
	reconciler := newObservedTestReconciler(t, store, provider, observer, 3)
	if processed, err := reconciler.ReconcileOnce(ctx); err != nil || !processed {
		t.Fatalf("retrying reconcile = %t, %v", processed, err)
	}
	operation, err := store.RuntimeOperation(ctx, request.IdempotencyKey)
	if err != nil {
		t.Fatal(err)
	}
	now = operation.NextAttemptAt
	if processed, err := reconciler.ReconcileOnce(ctx); err != nil || !processed {
		t.Fatalf("successful reconcile = %t, %v", processed, err)
	}
	scheduledAt := now.Add(time.Minute)
	if _, err := store.ScheduleRuntimeDeletion(ctx, ScheduleRuntimeDeletionRequest{
		IdempotencyKey: "audit-delete",
		RuntimeName:    request.RuntimeName,
		ScheduledAt:    scheduledAt,
	}); err != nil {
		t.Fatal(err)
	}
	now = scheduledAt
	if processed, err := reconciler.ReconcileOnce(ctx); err != nil || !processed {
		t.Fatalf("deletion reconcile = %t, %v", processed, err)
	}
	requireRuntimeAuditOutput(t, output.Bytes(), request)
}

func TestReconcilerEmitsContentFreeBudgetCutoffOutcomes(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 24, 23, 0, 0, 0, time.UTC)
	store, runtimeName, operationID := seedBudgetCutoffOperation(t, ctx, &now)
	defer store.Close()
	var output bytes.Buffer
	observer, err := NewJSONLinesObserver(&output)
	if err != nil {
		t.Fatal(err)
	}
	provider := activeBudgetTestProvider(runtimeName)
	provider.ambiguousSuspend = true
	reconciler := newObservedTestReconciler(t, store, provider, observer, 3)
	if processed, err := reconciler.ReconcileOnce(ctx); err != nil || !processed {
		t.Fatalf("retrying cutoff = %t, %v", processed, err)
	}
	operation, err := store.BudgetCutoffOperation(ctx, operationID)
	if err != nil {
		t.Fatal(err)
	}
	now = operation.NextAttemptAt
	if processed, err := reconciler.ReconcileOnce(ctx); err != nil || !processed {
		t.Fatalf("completed cutoff = %t, %v", processed, err)
	}
	text := output.String()
	for _, forbidden := range []string{runtimeName, operationID, "user-provider-budget"} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("budget cutoff audit exposed %q: %s", forbidden, text)
		}
	}
	requireBudgetCutoffAuditMeasurements(t, output.Bytes())
}

func requireBudgetCutoffAuditMeasurements(t *testing.T, payload []byte) {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(payload))
	want := []struct {
		state     RuntimeProgressState
		errorCode string
		retryable bool
	}{
		{state: RuntimeProgressRetrying, errorCode: "provider_suspend", retryable: true},
		{state: RuntimeProgressSuspended},
	}
	for index, expected := range want {
		var measurement RuntimeAuditMeasurement
		if err := decoder.Decode(&measurement); err != nil {
			t.Fatalf("decode budget cutoff audit %d: %v", index, err)
		}
		if measurement.Kind != RuntimeProgressBudgetCutoff ||
			measurement.State != expected.state ||
			measurement.ErrorCode != expected.errorCode ||
			measurement.Retryable != expected.retryable {
			t.Fatalf("budget cutoff audit %d = %+v", index, measurement)
		}
	}
	var extra RuntimeAuditMeasurement
	if err := decoder.Decode(&extra); err != io.EOF {
		t.Fatalf("budget cutoff audit trailing data = %+v, %v", extra, err)
	}
}

func newObservedTestReconciler(
	t *testing.T,
	store *Store,
	provider RuntimeReconcilerProvider,
	observer RuntimeAuditObserver,
	maximumAttempts int,
) *Reconciler {
	t.Helper()
	reconciler, err := NewReconciler(ReconcilerConfig{
		LeaseDuration:    time.Minute,
		MaxAttempts:      maximumAttempts,
		OperationTimeout: 30 * time.Second,
		Observer:         observer,
		Provider:         provider,
		RetryDelay:       time.Minute,
		Store:            store,
		WorkerID:         "audit-test-worker",
	})
	if err != nil {
		t.Fatal(err)
	}
	return reconciler
}

func requireRuntimeAuditOutput(t *testing.T, payload []byte, request EnsureRuntimeRequest) {
	t.Helper()
	text := string(payload)
	for _, forbidden := range []string{
		request.IdempotencyKey,
		request.RuntimeName,
		request.UserID,
		request.CredentialSecretRef,
		request.UpstreamAuthority,
		"audit-delete",
	} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("runtime audit exposed %q: %s", forbidden, text)
		}
	}
	decoder := json.NewDecoder(bytes.NewReader(payload))
	want := []RuntimeAuditMeasurement{
		{
			AttemptCount: 1,
			ErrorCode:    "provider_create",
			Event:        "runtime_reconciliation",
			Kind:         RuntimeProgressEnsureRuntime,
			Retryable:    true,
			State:        RuntimeProgressRetrying,
		},
		{
			AttemptCount:                  2,
			Event:                         "runtime_reconciliation",
			Kind:                          RuntimeProgressEnsureRuntime,
			OperationDurationMilliseconds: float64(time.Minute / time.Millisecond),
			State:                         RuntimeProgressProvisioned,
		},
		{
			AttemptCount:                  1,
			Event:                         "runtime_reconciliation",
			Kind:                          RuntimeProgressDeleteRuntime,
			OperationDurationMilliseconds: float64(time.Minute / time.Millisecond),
			State:                         RuntimeProgressDeleted,
		},
	}
	for index, expected := range want {
		var encoded json.RawMessage
		if err := decoder.Decode(&encoded); err != nil {
			t.Fatalf("decode runtime audit payload %d: %v", index, err)
		}
		requireRuntimeAuditFields(t, index, encoded)
		var measurement RuntimeAuditMeasurement
		if err := json.Unmarshal(encoded, &measurement); err != nil {
			t.Fatalf("decode runtime audit %d: %v", index, err)
		}
		if measurement.AttemptCount != expected.AttemptCount ||
			measurement.AttemptDurationMilliseconds != expected.AttemptDurationMilliseconds ||
			measurement.CompletedAt.IsZero() ||
			measurement.ErrorCode != expected.ErrorCode ||
			measurement.Event != expected.Event ||
			measurement.Kind != expected.Kind ||
			measurement.OperationDurationMilliseconds != expected.OperationDurationMilliseconds ||
			measurement.Retryable != expected.Retryable ||
			measurement.State != expected.State ||
			measurement.StartedAt.IsZero() {
			t.Fatalf("runtime audit %d = %+v, want %+v with started_at", index, measurement, expected)
		}
	}
	var extra RuntimeAuditMeasurement
	if err := decoder.Decode(&extra); err != io.EOF {
		t.Fatalf("runtime audit trailing data = %+v, %v", extra, err)
	}
}

func requireRuntimeAuditFields(t *testing.T, index int, encoded json.RawMessage) {
	t.Helper()
	var fields map[string]any
	if err := json.Unmarshal(encoded, &fields); err != nil {
		t.Fatal(err)
	}
	want := map[string]bool{
		"attempt_count":         true,
		"attempt_duration_ms":   true,
		"completed_at":          true,
		"error_code":            true,
		"event":                 true,
		"kind":                  true,
		"operation_duration_ms": true,
		"retryable":             true,
		"started_at":            true,
		"state":                 true,
	}
	if len(fields) != len(want) {
		t.Fatalf("runtime audit %d fields = %v", index, fields)
	}
	for field := range fields {
		if !want[field] {
			t.Fatalf("runtime audit %d contains content-bearing field %q", index, field)
		}
	}
}

func TestRuntimeAuditRejectsNegativeMeasuredIntervals(t *testing.T) {
	observer, err := NewJSONLinesObserver(&bytes.Buffer{})
	if err != nil {
		t.Fatal(err)
	}
	observer.ObserveRuntimeAudit(RuntimeAuditObservation{
		AttemptDuration: -time.Nanosecond,
	})
	if observer.Err() == nil {
		t.Fatal("runtime audit accepted a negative measured interval")
	}
}
